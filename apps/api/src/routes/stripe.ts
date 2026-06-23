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
// CREATE PAYMENT INTENT (for embedded Stripe Elements)
// ==================
const paymentIntentSchema = z.object({
  registrationIds: z.array(z.string()).min(1),
  paymentChoice: z.enum(['pay_now', 'pay_deposit']),
  email: z.string().email(),
  eventName: z.string(),
  teamNames: z.array(z.string()).min(1),
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

  if (totalCents <= 0) {
    return c.json({ success: false, error: 'Total amount must be greater than $0' }, 400);
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
      'description': `${data.eventName} — ${descriptions.join(', ')}`,
      'receipt_email': data.email,
      'metadata[registration_ids]': data.registrationIds.join(','),
      'metadata[payment_choice]': data.paymentChoice,
      'metadata[event_name]': data.eventName,
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
