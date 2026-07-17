import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

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
// PAYMENT INFO (loads registration details for the /pay page)
// ==================
stripeRoutes.get('/payment-info', async (c) => {
  const db = c.env.DB;
  const ids = (c.req.query('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (ids.length === 0) {
    return c.json({ success: false, error: 'No registration IDs provided' }, 400);
  }

  const registrations: any[] = [];

  for (const regId of ids) {
    // Try event_registrations first, then registrations (same order as create-payment-intent)
    let reg = await db.prepare(
      `SELECT er.id, er.team_name, er.age_group, er.payment_status,
              e.name as event_name, e.city as event_city, e.state as event_state,
              e.slug as event_slug, e.start_date, e.end_date,
              e.price_cents as event_price_cents, e.deposit_cents as event_deposit_cents,
              ed.price_cents as division_price_cents
       FROM event_registrations er
       JOIN events e ON e.id = er.event_id
       LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
       WHERE er.id = ?`
    ).bind(regId).first<any>();

    if (!reg) {
      reg = await db.prepare(
        `SELECT r.id, t.name as team_name, ed.age_group, r.payment_status, r.amount_cents,
                e.name as event_name, e.city as event_city, e.state as event_state,
                e.slug as event_slug, e.start_date, e.end_date,
                e.price_cents as event_price_cents, e.deposit_cents as event_deposit_cents,
                ed.price_cents as division_price_cents
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         LEFT JOIN teams t ON t.id = r.team_id
         LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
         WHERE r.id = ?`
      ).bind(regId).first<any>();
    }

    if (!reg) continue;

    // Price priority must match create-payment-intent so the displayed amount equals the charge
    const priceCents = reg.division_price_cents || reg.amount_cents || reg.event_price_cents || 0;
    const depositCents = reg.event_deposit_cents || Math.round(priceCents * 0.25);

    registrations.push({
      id: reg.id,
      team_name: reg.team_name || 'Team',
      event_name: reg.event_name,
      event_city: reg.event_city,
      event_state: reg.event_state,
      event_slug: reg.event_slug,
      start_date: reg.start_date,
      end_date: reg.end_date,
      age_group: reg.age_group || '',
      price_cents: priceCents,
      deposit_cents: depositCents,
      already_paid: reg.payment_status === 'paid',
    });
  }

  if (registrations.length === 0) {
    return c.json({ success: false, error: 'Registrations not found. The link may be invalid or expired.' }, 404);
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

// Internal discount codes (percent off). Codes are normalized to uppercase.
const DISCOUNT_CODES: Record<string, number> = {
  'UHT-TEST-99': 99, // internal testing — 99% off
};

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

  if (totalCents <= 0) {
    return c.json({ success: false, error: 'Total amount must be greater than $0' }, 400);
  }

  // Apply discount code if provided.
  // Internal codes (DISCOUNT_CODES map) reduce the charge here. Issued event codes
  // (discount_codes table) are validated/redeemed by the register flow separately —
  // unknown codes are IGNORED rather than rejected so they never block a payment.
  let discountApplied = '';
  let discountedCents = 0;
  if (data.discountCode) {
    const code = data.discountCode.trim().toUpperCase();
    const percentOff = DISCOUNT_CODES[code];
    if (percentOff) {
      discountApplied = code;
      const newTotal = Math.round(totalCents * (1 - percentOff / 100));
      discountedCents = totalCents - newTotal;
      totalCents = newTotal;
    }
  }

  // Fully discounted: no charge needed — mark registrations paid immediately
  if (discountApplied && totalCents <= 0) {
    const paymentStatus = data.paymentChoice === 'pay_deposit' ? 'partial' : 'paid';
    for (const regId of data.registrationIds) {
      await db.prepare(
        `UPDATE event_registrations SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END, payment_status = ?, payment_amount_cents = 0, payment_method = 'discount', stripe_payment_id = ? WHERE id = ?`
      ).bind(paymentStatus, `discount:${discountApplied}`, regId).run().catch(() => {});
      await db.prepare(
        `UPDATE registrations SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END, payment_status = ?, amount_cents = 0, payment_method = 'discount', stripe_payment_id = ? WHERE id = ?`
      ).bind(paymentStatus, `discount:${discountApplied}`, regId).run().catch(() => {});
    }
    return c.json({ success: true, data: { fullyDiscounted: true, totalCents: 0, discountApplied: discountedCents } });
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
      'description': `${data.eventName} — ${descriptions.join(', ')}${discountApplied ? ` (discount ${discountApplied})` : ''}`,
      'receipt_email': data.email,
      'metadata[registration_ids]': data.registrationIds.join(','),
      'metadata[payment_choice]': data.paymentChoice,
      'metadata[event_name]': data.eventName,
      ...(discountApplied ? { 'metadata[discount_code]': discountApplied } : {}),
    };

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
