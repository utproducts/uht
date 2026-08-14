import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';
import { getResolvedFields } from '../lib/template-overrides';

export const stripeRoutes = new Hono<{ Bindings: Env }>();

const STRIPE_API = 'https://api.stripe.com/v1';

// Helper: call Stripe API (POST with form-encoded body)
async function stripeRequest(path: string, secretKey: string, body: Record<string, string>) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  return res.json() as Promise<any>;
}

async function stripeGet(path: string, secretKey: string) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  return res.json() as Promise<any>;
}

// Helper: what a registration still owes. Accounts for previous card charges
// AND admin-recorded manual payments (Venmo/check/…), so a deposit-paid team is
// only ever charged the remainder — never the full price again.
// Returns null when the registration doesn't exist.
async function getRegBalance(db: D1Database, regId: string): Promise<{
  expected: number; alreadyPaid: number; remaining: number; depositCents: number;
} | null> {
  let reg = await db.prepare(
    `SELECT er.id, er.stripe_payment_id, er.payment_amount_cents as charged_cents, er.card_paid_cents,
            e.price_cents as event_price_cents, e.deposit_cents as event_deposit_cents,
            ed.price_cents as division_price_cents
     FROM event_registrations er
     JOIN events e ON e.id = er.event_id
     LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
     WHERE er.id = ?`
  ).bind(regId).first<any>();
  if (!reg) {
    reg = await db.prepare(
      `SELECT r.id, r.stripe_payment_id, r.amount_cents as charged_cents, r.card_paid_cents,
              e.price_cents as event_price_cents, e.deposit_cents as event_deposit_cents,
              ed.price_cents as division_price_cents
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
       WHERE r.id = ?`
    ).bind(regId).first<any>();
  }
  if (!reg) return null;

  let manualCents = 0;
  try {
    const m = await db.prepare(
      'SELECT COALESCE(SUM(amount_cents), 0) as total FROM registration_payments WHERE registration_id = ?'
    ).bind(regId).first<{ total: number }>();
    manualCents = m?.total || 0;
  } catch {}

  // Card money = the dedicated accumulator (falls back to the last charge for
  // rows predating it); manual money = the recorded payments. Never mixed.
  const stripeCents = reg.card_paid_cents ?? (reg.stripe_payment_id ? (reg.charged_cents || 0) : 0);
  const alreadyPaid = stripeCents + manualCents;
  const expected = reg.division_price_cents || reg.event_price_cents || reg.charged_cents || 0;
  const depositCents = reg.event_deposit_cents || Math.round(expected * 0.25);
  // Unknown price + nothing paid → remaining unknowable; callers fall back to legacy amounts
  const remaining = expected > 0 ? Math.max(0, expected - alreadyPaid) : (alreadyPaid > 0 ? 0 : -1);
  return { expected, alreadyPaid, remaining, depositCents };
}

// Helper: Super Saver auto-credit. When a promo window is active and a team has
// registered for 2+ distinct events during the window — at least one of them a
// featured promo event with a hotel selection — apply the promo credit to the
// payment. One credit per team per promo. Fully isolated: any error here means
// "no credit" and the payment proceeds untouched.
async function computeSuperSaverCredit(
  db: D1Database,
  payingRegIds: string[],
  totalCents: number
): Promise<{ credit: number; promoId: string } | null> {
  try {
    // Active + recently-ended promos (registrations must fall inside the window)
    const promos = await db.prepare(
      "SELECT id, discount_cents, starts_at, ends_at, event_ids, min_event_start FROM super_saver_promos WHERE is_active = 1"
    ).all<any>();
    if (!promos.results?.length) return null;

    // Identify the paying registration(s) and their team
    const payingRegs: any[] = [];
    for (const regId of payingRegIds) {
      let reg = await db.prepare(
        `SELECT id, event_id, team_id, team_name, created_at, status,
                COALESCE(needs_hotel, 0) as needs_hotel, hotel_choice_1
         FROM event_registrations WHERE id = ?`
      ).bind(regId).first<any>();
      if (!reg) {
        reg = await db.prepare(
          `SELECT r.id, r.event_id, r.team_id, t.name as team_name, r.created_at, r.status,
                  COALESCE(r.needs_hotel, 0) as needs_hotel, NULL as hotel_choice_1
           FROM registrations r LEFT JOIN teams t ON t.id = r.team_id WHERE r.id = ?`
        ).bind(regId).first<any>();
      }
      if (reg) payingRegs.push(reg);
    }
    if (!payingRegs.length) return null;
    const teamId = payingRegs[0].team_id || null;
    const teamName = (payingRegs[0].team_name || '').trim();
    if (!teamId && !teamName) return null;
    const teamKey = teamId || teamName.toLowerCase();

    const hotelOk = (r: any) =>
      r.needs_hotel === 1 ||
      (r.hotel_choice_1 && String(r.hotel_choice_1).trim() !== '' && String(r.hotel_choice_1).trim().toLowerCase() !== 'hotels coming soon');

    for (const promo of promos.results as any[]) {
      let featuredIds: string[] = [];
      try { featuredIds = JSON.parse(promo.event_ids || '[]'); } catch {}
      if (!featuredIds.length) continue;

      // The registration being paid must have been created during the window
      const inWindow = (createdAt: string) => createdAt >= promo.starts_at && createdAt <= promo.ends_at;
      if (!payingRegs.some(r => inWindow(r.created_at))) continue;

      // One credit per team per promo (confirmed = redeemed)
      const existing = await db.prepare(
        'SELECT confirmed FROM super_saver_credits WHERE promo_id = ? AND team_key = ?'
      ).bind(promo.id, teamKey).first<{ confirmed: number }>();
      if (existing?.confirmed === 1) continue;

      // All of this team's active registrations created during the window
      const teamRegs: any[] = [...payingRegs.filter(r => inWindow(r.created_at))];
      const er = await db.prepare(
        `SELECT id, event_id, created_at, COALESCE(needs_hotel, 0) as needs_hotel, hotel_choice_1
         FROM event_registrations
         WHERE (team_id = ? OR LOWER(team_name) = LOWER(?))
           AND created_at >= ? AND created_at <= ?
           AND status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')`
      ).bind(teamId || '', teamName, promo.starts_at, promo.ends_at).all<any>();
      for (const r of (er.results || [])) {
        if (!teamRegs.some(x => x.id === r.id)) teamRegs.push(r);
      }
      try {
        if (teamId) {
          const rr = await db.prepare(
            `SELECT id, event_id, created_at, COALESCE(needs_hotel, 0) as needs_hotel, NULL as hotel_choice_1
             FROM registrations
             WHERE team_id = ? AND created_at >= ? AND created_at <= ?
               AND status NOT IN ('rejected', 'withdrawn')`
          ).bind(teamId, promo.starts_at, promo.ends_at).all<any>();
          for (const r of (rr.results || [])) {
            if (!teamRegs.some(x => x.id === r.id)) teamRegs.push(r);
          }
        }
      } catch {}

      const distinctEvents = new Set(teamRegs.map(r => r.event_id));
      if (distinctEvents.size < 2) continue;

      const qualifying = teamRegs.find(r => featuredIds.includes(r.event_id) && hotelOk(r));
      if (!qualifying) continue;

      // When the promo restricts WHICH event gets the credit (e.g. register in
      // 2026, credit applies to events starting Jan 1 2027+), the payment being
      // discounted must include an event on/after that start date.
      if (promo.min_event_start) {
        let eligible = false;
        for (const r of payingRegs) {
          const ev = await db.prepare('SELECT start_date FROM events WHERE id = ?')
            .bind(r.event_id).first<{ start_date: string }>();
          if (ev?.start_date && ev.start_date >= promo.min_event_start) { eligible = true; break; }
        }
        if (!eligible) continue;
      }

      const credit = Math.min(promo.discount_cents || 40000, totalCents);
      if (credit <= 0) continue;

      // Record (or refresh) the pending credit for this team
      await db.prepare(`
        INSERT INTO super_saver_credits (promo_id, team_key, qualifying_reg_id, applied_reg_id, amount_cents, confirmed)
        VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(promo_id, team_key) DO UPDATE SET
          qualifying_reg_id = excluded.qualifying_reg_id,
          applied_reg_id = excluded.applied_reg_id,
          amount_cents = excluded.amount_cents
        WHERE confirmed = 0
      `).bind(promo.id, teamKey, qualifying.id, payingRegIds[0], credit).run();

      return { credit, promoId: promo.id };
    }
  } catch (err: any) {
    console.error('Super Saver credit check failed (payment unaffected):', err?.message || String(err));
  }
  return null;
}

// Helper: after a registration is paid, withdraw any OTHER abandoned-checkout
// rows for the same team + event so they don't linger as duplicate participants.
// (Re-registering while a prior attempt sits at 'awaiting_payment' creates a new
// row by design; only one of them ever gets paid.)
async function withdrawAbandonedDuplicates(db: D1Database, paidRegId: string) {
  try {
    const er = await db.prepare(
      'SELECT event_id, team_name FROM event_registrations WHERE id = ?'
    ).bind(paidRegId).first<{ event_id: string; team_name: string }>();
    if (er) {
      await db.prepare(
        `UPDATE event_registrations
         SET status = 'withdrawn', notes = COALESCE(notes || ' | ', '') || 'Auto-withdrawn: duplicate abandoned checkout, superseded by paid registration ' || ?
         WHERE event_id = ? AND team_name = ? AND id != ? AND status = 'awaiting_payment'`
      ).bind(paidRegId, er.event_id, er.team_name, paidRegId).run();
    }
  } catch {}
  try {
    const r = await db.prepare(
      'SELECT event_id, team_id FROM registrations WHERE id = ?'
    ).bind(paidRegId).first<{ event_id: string; team_id: string }>();
    if (r && r.team_id) {
      await db.prepare(
        `UPDATE registrations
         SET status = 'withdrawn'
         WHERE event_id = ? AND team_id = ? AND id != ? AND status = 'awaiting_payment'`
      ).bind(r.event_id, r.team_id, paidRegId).run();
    }
  } catch {}
}

// ==================
// PAYMENT INFO LOOKUP (no auth — accessed via shared payment links)
// ==================
stripeRoutes.get('/payment-info', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) return c.json({ success: false, error: 'ids parameter required' }, 400);

  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 20) {
    return c.json({ success: false, error: 'Provide 1-20 registration IDs' }, 400);
  }

  const db = c.env.DB;
  const registrations: any[] = [];

  for (const regId of ids) {
    // Try event_registrations first
    let reg = await db.prepare(`
      SELECT er.id, er.team_id, er.event_id, er.status, er.payment_status,
             er.event_division_id, er.age_group,
             e.name as event_name, e.slug, e.city, e.state, e.start_date, e.end_date,
             e.price_cents as event_price_cents, e.deposit_cents,
             ed.price_cents as division_price_cents, ed.age_group as div_age_group,
             t.name as team_name, t.head_coach_name, t.head_coach_email
      FROM event_registrations er
      JOIN events e ON e.id = er.event_id
      LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
      LEFT JOIN teams t ON t.id = er.team_id
      WHERE er.id = ?
    `).bind(regId).first<any>();

    if (!reg) {
      reg = await db.prepare(`
        SELECT r.id, r.team_id, r.event_id, r.status, r.payment_status,
               r.event_division_id, r.amount_cents,
               e.name as event_name, e.slug, e.city, e.state, e.start_date, e.end_date,
               e.price_cents as event_price_cents, e.deposit_cents,
               ed.price_cents as division_price_cents, ed.age_group as div_age_group,
               t.name as team_name, t.head_coach_name, t.head_coach_email
        FROM registrations r
        JOIN events e ON e.id = r.event_id
        LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
        LEFT JOIN teams t ON t.id = r.team_id
        WHERE r.id = ?
      `).bind(regId).first<any>();
    }

    if (!reg) continue;

    let priceCents = reg.division_price_cents || reg.amount_cents || reg.event_price_cents || 0;
    let depositCents = reg.deposit_cents || Math.round(priceCents * 0.25);

    // Show the BALANCE when part of the price is already covered
    // (card deposit and/or admin-recorded Venmo/check payments)
    let paidCents = 0;
    const balance = await getRegBalance(db, regId).catch(() => null);
    if (balance && balance.alreadyPaid > 0 && balance.remaining >= 0) {
      paidCents = balance.alreadyPaid;
      priceCents = balance.remaining;
      depositCents = Math.min(depositCents, balance.remaining);
    }

    registrations.push({
      id: reg.id,
      team_name: reg.team_name || 'Unknown Team',
      age_group: reg.div_age_group || reg.age_group || '',
      event_name: reg.event_name,
      event_slug: reg.slug,
      event_city: reg.city,
      event_state: reg.state,
      start_date: reg.start_date,
      end_date: reg.end_date,
      status: reg.status,
      payment_status: reg.payment_status,
      price_cents: priceCents,
      deposit_cents: depositCents,
      paid_cents: paidCents,
      already_paid: reg.payment_status === 'paid' || (balance ? balance.remaining === 0 && balance.alreadyPaid > 0 : false),
    });
  }

  if (registrations.length === 0) {
    return c.json({ success: false, error: 'No registrations found' }, 404);
  }

  return c.json({ success: true, data: { registrations } });
});

// ==================
// CREATE PAYMENT INTENT (for embedded Stripe Elements)
// ==================
const paymentIntentSchema = z.object({
  registrationIds: z.array(z.string()).min(1),
  paymentChoice: z.enum(['pay_now', 'pay_deposit']),
  email: z.string().email(),
  eventName: z.string(),
  teamNames: z.array(z.string()).min(1),
  discountCode: z.string().optional(),
});

stripeRoutes.post('/create-payment-intent', zValidator('json', paymentIntentSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const stripeKey = c.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return c.json({ success: false, error: 'Payment processing not configured' }, 500);
  }

  // Look up registrations and compute total. Each registration is charged what
  // it still OWES — prior card charges and admin-recorded payments (Venmo,
  // check, …) are deducted so nobody can overpay.
  let totalCents = 0;
  const descriptions: string[] = [];
  const chargedRegIds: string[] = [];
  let skippedAlreadyPaid = 0;

  for (let i = 0; i < data.registrationIds.length; i++) {
    const regId = data.registrationIds[i];
    const teamName = data.teamNames[i] || 'Team';

    // Try event_registrations first, then registrations
    let reg = await db.prepare(
      `SELECT er.id, er.event_id, er.age_group, er.event_division_id,
              e.name as event_name, e.price_cents, e.deposit_cents,
              ed.price_cents as division_price_cents
       FROM event_registrations er
       JOIN events e ON e.id = er.event_id
       LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
       WHERE er.id = ?`
    ).bind(regId).first<any>();

    if (!reg) {
      reg = await db.prepare(
        `SELECT r.id, r.event_id, r.event_division_id, r.amount_cents,
                e.name as event_name, e.price_cents, e.deposit_cents,
                ed.price_cents as division_price_cents
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
         WHERE r.id = ?`
      ).bind(regId).first<any>();
    }

    if (!reg) {
      return c.json({ success: false, error: `Registration ${regId} not found` }, 404);
    }

    // Price priority: division price > registration amount > event price
    const priceCents = reg.division_price_cents || reg.amount_cents || reg.price_cents || 0;
    const depositCents = reg.deposit_cents || Math.round(priceCents * 0.25);
    let chargeAmount = data.paymentChoice === 'pay_deposit' ? depositCents : priceCents;

    // Deduct what's already been paid (card + manual records)
    const balance = await getRegBalance(db, regId).catch(() => null);
    if (balance && balance.alreadyPaid > 0 && balance.remaining >= 0) {
      chargeAmount = data.paymentChoice === 'pay_deposit'
        ? Math.min(depositCents, balance.remaining)
        : balance.remaining;
      if (chargeAmount <= 0) {
        // Nothing left to pay on this registration
        skippedAlreadyPaid++;
        continue;
      }
      descriptions.push(`${teamName} (Balance)`);
    } else {
      if (chargeAmount <= 0) {
        return c.json({ success: false, error: `No price set for registration (${teamName})` }, 400);
      }
      descriptions.push(`${teamName}${data.paymentChoice === 'pay_deposit' ? ' (Deposit)' : ''}`);
    }

    totalCents += chargeAmount;
    chargedRegIds.push(regId);
  }

  // Everything already covered — no charge to make
  if (chargedRegIds.length === 0 && skippedAlreadyPaid > 0) {
    return c.json({
      success: true,
      data: { clientSecret: null, paymentIntentId: null, totalCents: 0, discountApplied: 0, fullyDiscounted: true, alreadyPaid: true },
    });
  }

  // Apply discount code if provided (reward codes OR coupon codes)
  let discountCents = 0;
  let discountCode = '';
  if (data.discountCode) {
    const codeTrimmed = data.discountCode.trim();

    // 1) Check meeting_rewards table first (single-use reward codes)
    const reward = await db.prepare(
      'SELECT id, code, amount, redeemed FROM meeting_rewards WHERE UPPER(code) = UPPER(?)'
    ).bind(codeTrimmed).first() as any;

    if (reward) {
      if (reward.redeemed === 1) {
        return c.json({ success: false, error: 'This code has already been used' }, 409);
      }
      discountCents = (reward.amount || 0) * 100; // amount is in dollars, convert to cents
      discountCode = reward.code;
      // Mark as redeemed immediately to prevent double-use
      await db.prepare(
        "UPDATE meeting_rewards SET redeemed = 1, redeemed_at = datetime('now'), redeemed_event_id = ? WHERE id = ?"
      ).bind(data.email, reward.id).run();
    } else {
      // 2) Check discount_codes (UHT-XXXXXX next-event reward codes earned at registration)
      const dc = await db.prepare(
        'SELECT * FROM discount_codes WHERE UPPER(code) = UPPER(?)'
      ).bind(codeTrimmed).first() as any;

      if (dc) {
        if (dc.is_used) {
          return c.json({ success: false, error: 'This code has already been used' }, 409);
        }
        // The reward is for the team's NEXT event — not the registration that
        // earned it, and not any other registration for that same event
        const reg0 = await db.prepare(
          'SELECT event_id, hotel_choice, hotel_choice_1 FROM event_registrations WHERE id = ?'
        ).bind(chargedRegIds[0]).first() as any;
        if (chargedRegIds.includes(dc.registration_id) || (reg0?.event_id && reg0.event_id === dc.event_id)) {
          return c.json({ success: false, error: 'This code was earned from this event — it applies when you register for your next event.' }, 400);
        }
        // $200 off when staying at a partner hotel, $100 off for local teams
        const hasHotel = reg0?.hotel_choice_1 && reg0.hotel_choice_1 !== 'Local Team';
        discountCents = hasHotel ? (dc.discount_hotel_cents || 20000) : (dc.discount_local_cents || 10000);
        discountCode = dc.code;
        await db.prepare(
          "UPDATE discount_codes SET is_used = 1, used_registration_id = ?, used_at = datetime('now') WHERE id = ?"
        ).bind(chargedRegIds[0], dc.id).run();
      } else {

      // 3) Check coupon_codes table (admin-created coupon codes)
      const coupon = await db.prepare(
        'SELECT * FROM coupon_codes WHERE UPPER(code) = UPPER(?)'
      ).bind(codeTrimmed).first() as any;

      if (!coupon) {
        return c.json({ success: false, error: 'Invalid discount code' }, 400);
      }
      if (!coupon.is_active) {
        return c.json({ success: false, error: 'This coupon code is no longer active' }, 400);
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return c.json({ success: false, error: 'This coupon code has expired' }, 400);
      }
      if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
        return c.json({ success: false, error: 'This coupon code has reached its usage limit' }, 400);
      }
      // Check event restriction — get the event ID from registrations
      if (coupon.event_id) {
        // Look up the event for these registrations
        const regCheck = await db.prepare(
          'SELECT event_id FROM event_registrations WHERE id = ?'
        ).bind(chargedRegIds[0]).first() as any;
        const regEventId = regCheck?.event_id;
        if (regEventId && coupon.event_id !== regEventId) {
          return c.json({ success: false, error: 'This coupon code is not valid for this event' }, 400);
        }
      }

      // Calculate discount
      if (coupon.discount_type === 'percent') {
        discountCents = Math.round(totalCents * (coupon.discount_amount / 100));
      } else {
        // Fixed amount — discount_amount is stored in cents
        discountCents = coupon.discount_amount;
      }
      discountCode = coupon.code;

      // Increment usage counter
      await db.prepare(
        'UPDATE coupon_codes SET current_uses = current_uses + 1 WHERE id = ?'
      ).bind(coupon.id).run();
      }
    }
  }

  // Super Saver auto-credit — applies only to full payments with no other code,
  // and never blocks the payment if anything goes wrong.
  let superSaverCents = 0;
  if (!discountCode && data.paymentChoice === 'pay_now') {
    const ss = await computeSuperSaverCredit(db, chargedRegIds, totalCents);
    if (ss) {
      superSaverCents = ss.credit;
      discountCents += ss.credit;
      discountCode = 'SUPER SAVER';
    }
  }

  totalCents = Math.max(0, totalCents - discountCents);

  if (totalCents <= 0) {
    // Fully covered by discount — no charge needed, just update registrations
    for (const regId of chargedRegIds) {
      await db.prepare(
        `UPDATE event_registrations SET payment_status = 'paid', amount_paid_cents = 0, discount_code = ?, discount_cents = ? WHERE id = ?`
      ).bind(discountCode, discountCents, regId).run().catch(() => {});
      await db.prepare(
        `UPDATE registrations SET payment_status = 'paid', amount_paid_cents = 0, discount_code = ?, discount_cents = ? WHERE id = ?`
      ).bind(discountCode, discountCents, regId).run().catch(() => {});
    }
    if (superSaverCents > 0) {
      await db.prepare('UPDATE super_saver_credits SET confirmed = 1 WHERE applied_reg_id = ?')
        .bind(chargedRegIds[0]).run().catch(() => {});
    }
    return c.json({
      success: true,
      data: { clientSecret: null, paymentIntentId: null, totalCents: 0, discountApplied: discountCents, superSaverCents, fullyDiscounted: true },
    });
  }

  // Minimum Stripe amount is 50 cents
  if (totalCents < 50) {
    totalCents = 50;
  }

  try {
    const params: Record<string, string> = {
      'amount': String(totalCents),
      'currency': 'usd',
      'automatic_payment_methods[enabled]': 'true',
      'description': `${data.eventName} — ${descriptions.join(', ')}${discountCode ? ` (discount: ${discountCode})` : ''}`,
      'receipt_email': data.email,
      'metadata[registration_ids]': chargedRegIds.join(','),
      'metadata[payment_choice]': data.paymentChoice,
      'metadata[event_name]': data.eventName,
    };
    if (discountCode) {
      params['metadata[discount_code]'] = discountCode;
      params['metadata[discount_cents]'] = String(discountCents);
    }

    const paymentIntent = await stripeRequest('/payment_intents', stripeKey, params);

    if (paymentIntent.error) {
      console.error('Stripe PaymentIntent error:', paymentIntent.error);
      return c.json({ success: false, error: paymentIntent.error.message || 'Payment setup failed' }, 500);
    }

    // Store the PaymentIntent ID on the registrations
    for (const regId of chargedRegIds) {
      await db.prepare(
        `UPDATE event_registrations SET payment_status = 'pending_payment', stripe_session_id = ? WHERE id = ?`
      ).bind(paymentIntent.id, regId).run().catch(() => {});
      await db.prepare(
        `UPDATE registrations SET payment_status = 'pending_payment', stripe_session_id = ? WHERE id = ?`
      ).bind(paymentIntent.id, regId).run().catch(() => {});
    }

    return c.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        totalCents,
        discountApplied: discountCents,
        superSaverCents,
      },
    });
  } catch (err: any) {
    console.error('Stripe PaymentIntent error:', err);
    return c.json({ success: false, error: 'Failed to create payment' }, 500);
  }
});

// ==================
// CONFIRM PAYMENT (called after successful Stripe Elements payment)
// ==================
stripeRoutes.post('/confirm-payment', async (c) => {
  const db = c.env.DB;
  const stripeKey = c.env.STRIPE_SECRET_KEY;
  const { paymentIntentId } = await c.req.json() as { paymentIntentId: string };

  if (!stripeKey || !paymentIntentId) {
    return c.json({ success: false, error: 'Missing data' }, 400);
  }

  try {
    const pi = await stripeGet(`/payment_intents/${paymentIntentId}`, stripeKey);

    if (pi.error) {
      return c.json({ success: false, error: 'Invalid payment' }, 400);
    }

    if (pi.status === 'succeeded') {
      const regIds = (pi.metadata?.registration_ids || '').split(',').filter(Boolean);
      const paymentChoice = pi.metadata?.payment_choice || 'pay_now';
      const amountCents = pi.amount || 0;
      const perRegAmount = regIds.length > 0 ? Math.round(amountCents / regIds.length) : amountCents;

      for (const regId of regIds) {
        const paymentStatus = paymentChoice === 'pay_deposit' ? 'partial' : 'paid';

        // Update payment info AND promote status from 'awaiting_payment' to 'pending' (registered, awaiting admin review)
        await db.prepare(
          `UPDATE event_registrations SET
            status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END,
            card_paid_cents = CASE WHEN stripe_payment_id = ? THEN COALESCE(card_paid_cents, ?)
              ELSE COALESCE(card_paid_cents, CASE WHEN stripe_payment_id IS NOT NULL THEN COALESCE(payment_amount_cents, 0) ELSE 0 END) + ? END,
            payment_status = ?, payment_amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
        ).bind(pi.id, perRegAmount, perRegAmount, paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});
        await db.prepare(
          `UPDATE event_registrations SET amount_paid_cents = COALESCE(card_paid_cents, 0) +
            (SELECT COALESCE(SUM(rp.amount_cents), 0) FROM registration_payments rp WHERE rp.registration_id = event_registrations.id)
           WHERE id = ?`
        ).bind(regId).run().catch(() => {});

        await db.prepare(
          `UPDATE registrations SET
            status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END,
            card_paid_cents = CASE WHEN stripe_payment_id = ? THEN COALESCE(card_paid_cents, ?)
              ELSE COALESCE(card_paid_cents, CASE WHEN stripe_payment_id IS NOT NULL THEN COALESCE(amount_cents, 0) ELSE 0 END) + ? END,
            payment_status = ?, amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
        ).bind(pi.id, perRegAmount, perRegAmount, paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});
        await db.prepare(
          `UPDATE registrations SET amount_paid_cents = COALESCE(card_paid_cents, 0) +
            (SELECT COALESCE(SUM(rp.amount_cents), 0) FROM registration_payments rp WHERE rp.registration_id = registrations.id)
           WHERE id = ?`
        ).bind(regId).run().catch(() => {});

        await withdrawAbandonedDuplicates(db, regId);
        // Redeem any Super Saver credit tied to this registration's payment
        await db.prepare('UPDATE super_saver_credits SET confirmed = 1 WHERE applied_reg_id = ?')
          .bind(regId).run().catch(() => {});
      }

      // Send confirmation email now that payment has succeeded
      for (const regId of regIds) {
        try {
          const reg = await db.prepare(
            `SELECT er.team_name, er.age_group, er.division, er.email1, er.manager_first_name, er.manager_last_name,
                    e.name as event_name, e.start_date, e.end_date, e.city, e.state, e.price_cents, e.deposit_cents, e.logo_url
             FROM event_registrations er
             JOIN events e ON e.id = er.event_id
             WHERE er.id = ?`
          ).bind(regId).first() as any;

          if (reg && reg.email1) {
            const startDate = new Date(reg.start_date + 'T12:00:00');
            const endDate = new Date(reg.end_date + 'T12:00:00');
            const eventDateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

            await sendRegistrationConfirmationEmail(c.env, {
              recipientEmail: reg.email1,
              recipientName: reg.manager_first_name
                ? `${reg.manager_first_name} ${reg.manager_last_name || ''}`.trim()
                : reg.team_name,
              teamName: reg.team_name,
              ageGroup: reg.age_group,
              division: reg.division || undefined,
              eventName: reg.event_name,
              eventDate: eventDateStr,
              eventCity: `${reg.city}, ${reg.state}`,
              priceCents: reg.price_cents || undefined,
              depositCents: reg.deposit_cents || undefined,
              eventLogoUrl: reg.logo_url || undefined,
              _overrides: await getResolvedFields(db, 'registration_confirmation'),
            } as any);
          }
        } catch (emailErr) {
          console.error('Post-payment confirmation email error:', emailErr);
        }
      }

      return c.json({
        success: true,
        data: { paid: true, amountCents, paymentChoice, registrationIds: regIds },
      });
    }

    return c.json({
      success: true,
      data: { paid: false, status: pi.status },
    });
  } catch (err: any) {
    console.error('Confirm payment error:', err);
    return c.json({ success: false, error: 'Failed to confirm payment' }, 500);
  }
});

// ==================
// STRIPE WEBHOOK (backup — processes payment_intent.succeeded)
// ==================
stripeRoutes.post('/webhook', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json() as any;

  if (body.type === 'payment_intent.succeeded') {
    const claimed = body.data?.object;
    if (!claimed?.id) return c.json({ received: true });

    // Never trust the webhook payload directly — re-fetch the PaymentIntent from
    // Stripe and confirm it actually succeeded before marking anything paid.
    // (Payloads are unauthenticated without signature verification.)
    const stripeKey = c.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return c.json({ received: true });
    const pi = await stripeGet(`/payment_intents/${claimed.id}`, stripeKey);
    if (pi.error || pi.status !== 'succeeded') {
      return c.json({ received: true });
    }

    const regIds = (pi.metadata?.registration_ids || '').split(',').filter(Boolean);
    const paymentChoice = pi.metadata?.payment_choice || 'pay_now';
    const amountCents = pi.amount || 0;
    const perRegAmount = regIds.length > 0 ? Math.round(amountCents / regIds.length) : amountCents;

    for (const regId of regIds) {
      const paymentStatus = paymentChoice === 'pay_deposit' ? 'partial' : 'paid';

      // Promote status from 'awaiting_payment' to 'pending' on successful payment
      await db.prepare(
          `UPDATE event_registrations SET
            status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END,
            card_paid_cents = CASE WHEN stripe_payment_id = ? THEN COALESCE(card_paid_cents, ?)
              ELSE COALESCE(card_paid_cents, CASE WHEN stripe_payment_id IS NOT NULL THEN COALESCE(payment_amount_cents, 0) ELSE 0 END) + ? END,
            payment_status = ?, payment_amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
        ).bind(pi.id, perRegAmount, perRegAmount, paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});
        await db.prepare(
          `UPDATE event_registrations SET amount_paid_cents = COALESCE(card_paid_cents, 0) +
            (SELECT COALESCE(SUM(rp.amount_cents), 0) FROM registration_payments rp WHERE rp.registration_id = event_registrations.id)
           WHERE id = ?`
        ).bind(regId).run().catch(() => {});

      await db.prepare(
          `UPDATE registrations SET
            status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END,
            card_paid_cents = CASE WHEN stripe_payment_id = ? THEN COALESCE(card_paid_cents, ?)
              ELSE COALESCE(card_paid_cents, CASE WHEN stripe_payment_id IS NOT NULL THEN COALESCE(amount_cents, 0) ELSE 0 END) + ? END,
            payment_status = ?, amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
        ).bind(pi.id, perRegAmount, perRegAmount, paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});
        await db.prepare(
          `UPDATE registrations SET amount_paid_cents = COALESCE(card_paid_cents, 0) +
            (SELECT COALESCE(SUM(rp.amount_cents), 0) FROM registration_payments rp WHERE rp.registration_id = registrations.id)
           WHERE id = ?`
        ).bind(regId).run().catch(() => {});

      await withdrawAbandonedDuplicates(db, regId);
      await db.prepare('UPDATE super_saver_credits SET confirmed = 1 WHERE applied_reg_id = ?')
        .bind(regId).run().catch(() => {});
    }
  }

  return c.json({ received: true });
});
