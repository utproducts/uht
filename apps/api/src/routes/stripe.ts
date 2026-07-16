import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';

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

    const priceCents = reg.division_price_cents || reg.amount_cents || reg.event_price_cents || 0;
    const depositCents = reg.deposit_cents || Math.round(priceCents * 0.25);

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
      already_paid: reg.payment_status === 'paid',
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

  // Look up registrations and compute total
  let totalCents = 0;
  const descriptions: string[] = [];

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
    const chargeAmount = data.paymentChoice === 'pay_deposit' ? depositCents : priceCents;

    if (chargeAmount <= 0) {
      return c.json({ success: false, error: `No price set for registration (${teamName})` }, 400);
    }

    totalCents += chargeAmount;
    descriptions.push(`${teamName}${data.paymentChoice === 'pay_deposit' ? ' (Deposit)' : ''}`);
  }

  // Apply discount code if provided (single-use reward codes)
  let discountCents = 0;
  let discountCode = '';
  if (data.discountCode) {
    const reward = await db.prepare(
      'SELECT id, code, amount, redeemed FROM meeting_rewards WHERE UPPER(code) = UPPER(?)'
    ).bind(data.discountCode.trim()).first() as any;

    if (!reward) {
      return c.json({ success: false, error: 'Invalid discount code' }, 400);
    }
    if (reward.redeemed === 1) {
      return c.json({ success: false, error: 'This code has already been used' }, 409);
    }

    discountCents = (reward.amount || 0) * 100; // amount is in dollars, convert to cents
    discountCode = reward.code;

    // Mark as redeemed immediately to prevent double-use
    await db.prepare(
      "UPDATE meeting_rewards SET redeemed = 1, redeemed_at = datetime('now'), redeemed_event_id = ? WHERE id = ?"
    ).bind(data.email, reward.id).run();
  }

  totalCents = Math.max(0, totalCents - discountCents);

  if (totalCents <= 0) {
    // Fully covered by discount — no charge needed, just update registrations
    for (const regId of data.registrationIds) {
      await db.prepare(
        `UPDATE event_registrations SET payment_status = 'paid', amount_paid_cents = 0, discount_code = ?, discount_cents = ? WHERE id = ?`
      ).bind(discountCode, discountCents, regId).run().catch(() => {});
      await db.prepare(
        `UPDATE registrations SET payment_status = 'paid', amount_paid_cents = 0, discount_code = ?, discount_cents = ? WHERE id = ?`
      ).bind(discountCode, discountCents, regId).run().catch(() => {});
    }
    return c.json({
      success: true,
      data: { clientSecret: null, paymentIntentId: null, totalCents: 0, discountApplied: discountCents, fullyDiscounted: true },
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
      'metadata[registration_ids]': data.registrationIds.join(','),
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
    for (const regId of data.registrationIds) {
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
          `UPDATE event_registrations SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END, payment_status = ?, payment_amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
        ).bind(paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});

        await db.prepare(
          `UPDATE registrations SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END, payment_status = ?, amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
        ).bind(paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});
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
            });
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
    const pi = body.data?.object;
    if (!pi) return c.json({ received: true });

    const regIds = (pi.metadata?.registration_ids || '').split(',').filter(Boolean);
    const paymentChoice = pi.metadata?.payment_choice || 'pay_now';
    const amountCents = pi.amount || 0;
    const perRegAmount = regIds.length > 0 ? Math.round(amountCents / regIds.length) : amountCents;

    for (const regId of regIds) {
      const paymentStatus = paymentChoice === 'pay_deposit' ? 'partial' : 'paid';

      // Promote status from 'awaiting_payment' to 'pending' on successful payment
      await db.prepare(
        `UPDATE event_registrations SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END, payment_status = ?, payment_amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
      ).bind(paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});

      await db.prepare(
        `UPDATE registrations SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END, payment_status = ?, amount_cents = ?, payment_method = 'stripe', stripe_payment_id = ? WHERE id = ?`
      ).bind(paymentStatus, perRegAmount, pi.id, regId).run().catch(() => {});
    }
  }

  return c.json({ received: true });
});
