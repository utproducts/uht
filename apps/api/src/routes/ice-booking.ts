import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const iceBookingRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

// Get available ice slots (calendar view)
iceBookingRoutes.get('/slots', async (c) => {
  const db = c.env.DB;
  const { venue_id, start_date, end_date, status } = c.req.query();

  let query = `
    SELECT is2.*, v.name as venue_name, vr.name as rink_name
    FROM ice_slots is2
    LEFT JOIN venues v ON v.id = is2.venue_id
    LEFT JOIN venue_rinks vr ON vr.id = is2.rink_id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (venue_id) { query += ' AND is2.venue_id = ?'; params.push(venue_id); }
  if (start_date) { query += ' AND is2.date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND is2.date <= ?'; params.push(end_date); }
  if (status) { query += ' AND is2.status = ?'; params.push(status); }
  else { query += " AND is2.status = 'available'"; }

  query += ' ORDER BY is2.date ASC, is2.start_time ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// Get slot counts by date (for calendar highlighting)
iceBookingRoutes.get('/slots/counts', async (c) => {
  const db = c.env.DB;
  const { start_date, end_date } = c.req.query();

  let query = `
    SELECT date, COUNT(*) as available_count
    FROM ice_slots
    WHERE status = 'available'
  `;
  const params: string[] = [];

  if (start_date) { query += ' AND date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND date <= ?'; params.push(end_date); }

  query += ' GROUP BY date ORDER BY date ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// Initiate a booking -> creates Stripe Checkout Session
const bookSlotSchema = z.object({
  slotId: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  reason: z.string().min(1),
});

iceBookingRoutes.post('/book', zValidator('json', bookSlotSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check slot is still available
  const slot = await db.prepare(
    "SELECT * FROM ice_slots WHERE id = ? AND status = 'available'"
  ).bind(data.slotId).first<any>();

  if (!slot) {
    return c.json({ success: false, error: 'This time slot is no longer available' }, 409);
  }

  // Hold the slot and store booker info
  await db.prepare(`
    UPDATE ice_slots SET status = 'held', booked_by_name = ?, booked_by_email = ?,
    booked_by_phone = ?, notes = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(data.name, data.email, data.phone, data.reason, data.slotId).run();

  // Create Stripe Checkout Session
  const priceInCents = slot.price_cents;
  const origin = c.req.header('origin') || 'https://uht-web.pages.dev';

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'payment',
      'success_url': `${origin}/book-ice/confirmation?session_id={CHECKOUT_SESSION_ID}&slot_id=${data.slotId}`,
      'cancel_url': `${origin}/book-ice?cancelled=true`,
      'customer_email': data.email,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(priceInCents),
      'line_items[0][price_data][product_data][name]': `Ice Time - Rosemont Outdoor Rink`,
      'line_items[0][price_data][product_data][description]': `${slot.date} | ${slot.start_time} - ${slot.end_time} (1 hour)`,
      'line_items[0][quantity]': '1',
      'metadata[slot_id]': data.slotId,
      'metadata[booker_name]': data.name,
      'metadata[booker_phone]': data.phone,
      'metadata[reason]': data.reason,
      'payment_intent_data[metadata][slot_id]': data.slotId,
    }).toString(),
  });

  const session = await stripeResponse.json() as any;

  if (!stripeResponse.ok) {
    // Release the hold if Stripe fails
    await db.prepare(
      "UPDATE ice_slots SET status = 'available', updated_at = datetime('now') WHERE id = ?"
    ).bind(data.slotId).run();
    return c.json({ success: false, error: 'Payment setup failed. Please try again.' }, 500);
  }

  // Store the Stripe session ID on the slot
  await db.prepare(
    "UPDATE ice_slots SET stripe_payment_intent_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(session.id, data.slotId).run();

  // Create/update contact record
  const existingContact = await db.prepare(
    'SELECT id FROM contacts WHERE email = ?'
  ).bind(data.email.toLowerCase()).first();

  if (!existingContact) {
    await db.prepare(`
      INSERT INTO contacts (id, email, phone, first_name, source, tags)
      VALUES (?, ?, ?, ?, 'ice_booking', '["ice_booking"]')
    `).bind(
      crypto.randomUUID().replace(/-/g, ''),
      data.email.toLowerCase(), data.phone, data.name
    ).run();
  }

  return c.json({
    success: true,
    data: {
      checkoutUrl: session.url,
      sessionId: session.id,
      slotId: data.slotId,
    },
  });
});

// Get booking details (post-payment confirmation)
iceBookingRoutes.get('/booking/:slotId', async (c) => {
  const slotId = c.req.param('slotId');
  const sessionId = c.req.query('session_id');
  const db = c.env.DB;

  const slot = await db.prepare(`
    SELECT is2.*, v.name as venue_name, vr.name as rink_name
    FROM ice_slots is2
    LEFT JOIN venues v ON v.id = is2.venue_id
    LEFT JOIN venue_rinks vr ON vr.id = is2.rink_id
    WHERE is2.id = ?
  `).bind(slotId).first<any>();

  if (!slot) {
    return c.json({ success: false, error: 'Booking not found' }, 404);
  }

  return c.json({ success: true, data: slot });
});

// ==========================================
// STRIPE WEBHOOK
// ==========================================

iceBookingRoutes.post('/webhooks/stripe', async (c) => {
  const db = c.env.DB;
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');

  // Verify webhook signature
  if (c.env.STRIPE_WEBHOOK_SECRET && sig) {
    // In production, verify the signature. For now, we parse the event.
    // Full signature verification requires crypto.subtle which is available in Workers.
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const slotId = session.metadata?.slot_id;

    if (slotId) {
      // Mark slot as booked
      await db.prepare(`
        UPDATE ice_slots SET status = 'booked', stripe_payment_intent_id = ?,
        updated_at = datetime('now') WHERE id = ?
      `).bind(session.payment_intent || session.id, slotId).run();
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const slotId = session.metadata?.slot_id;

    if (slotId) {
      // Release the hold - slot becomes available again
      const slot = await db.prepare(
        "SELECT status FROM ice_slots WHERE id = ?"
      ).bind(slotId).first<any>();

      if (slot?.status === 'held') {
        await db.prepare(`
          UPDATE ice_slots SET status = 'available', booked_by_name = NULL,
          booked_by_email = NULL, booked_by_phone = NULL, notes = NULL,
          stripe_payment_intent_id = NULL, updated_at = datetime('now') WHERE id = ?
        `).bind(slotId).run();
      }
    }
  }

  return c.json({ received: true });
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// Admin: Create ice slots (bulk)
const createSlotsSchema = z.object({
  venueId: z.string(),
  rinkId: z.string().optional(),
  slots: z.array(z.object({
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    durationMinutes: z.number(),
    priceCents: z.number(),
  })),
});

iceBookingRoutes.post('/slots',
  zValidator('json', createSlotsSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  let created = 0;
  for (const slot of data.slots) {
    await db.prepare(`
      INSERT INTO ice_slots (id, venue_id, rink_id, date, start_time, end_time, duration_minutes, price_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().replace(/-/g, ''), data.venueId, data.rinkId || null,
      slot.date, slot.startTime, slot.endTime, slot.durationMinutes, slot.priceCents
    ).run();
    created++;
  }

  return c.json({ success: true, data: { created } }, 201);
});

// Admin: Generate slots for a date range
const generateSlotsSchema = z.object({
  venueId: z.string(),
  rinkId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  dailyStartTime: z.string(),
  dailyEndTime: z.string(),
  slotDurationMinutes: z.number().default(60),
  bufferMinutes: z.number().default(15),
  priceCents: z.number().default(39500),
});

iceBookingRoutes.post('/slots/generate',
  zValidator('json', generateSlotsSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  const startDate = new Date(data.startDate + 'T00:00:00');
  const endDate = new Date(data.endDate + 'T00:00:00');
  const [startHour, startMin] = data.dailyStartTime.split(':').map(Number);
  const [endHour, endMin] = data.dailyEndTime.split(':').map(Number);
  const slotSpacing = data.slotDurationMinutes + data.bufferMinutes;

  let created = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    let minutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (minutes + data.slotDurationMinutes <= endMinutes) {
      const slotStartH = String(Math.floor(minutes / 60)).padStart(2, '0');
      const slotStartM = String(minutes % 60).padStart(2, '0');
      const slotEndMinutes = minutes + data.slotDurationMinutes;
      const slotEndH = String(Math.floor(slotEndMinutes / 60)).padStart(2, '0');
      const slotEndM = String(slotEndMinutes % 60).padStart(2, '0');

      await db.prepare(`
        INSERT INTO ice_slots (id, venue_id, rink_id, date, start_time, end_time, duration_minutes, price_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().replace(/-/g, ''), data.venueId, data.rinkId || null,
        dateStr, `${slotStartH}:${slotStartM}`, `${slotEndH}:${slotEndM}`,
        data.slotDurationMinutes, data.priceCents
      ).run();
      created++;
      minutes += slotSpacing;
    }
    current.setDate(current.getDate() + 1);
  }

  return c.json({ success: true, data: { created } }, 201);
});

// Admin: Get all slots (including non-available)
iceBookingRoutes.get('/admin/slots', async (c) => {
  const db = c.env.DB;
  const { start_date, end_date, status } = c.req.query();

  let query = `
    SELECT is2.*, v.name as venue_name
    FROM ice_slots is2
    LEFT JOIN venues v ON v.id = is2.venue_id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (start_date) { query += ' AND is2.date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND is2.date <= ?'; params.push(end_date); }
  if (status) { query += ' AND is2.status = ?'; params.push(status); }

  query += ' ORDER BY is2.date ASC, is2.start_time ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// Admin: Delete a slot (only if available)
iceBookingRoutes.delete('/slots/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const slot = await db.prepare(
    "SELECT status FROM ice_slots WHERE id = ?"
  ).bind(id).first<any>();

  if (!slot) {
    return c.json({ success: false, error: 'Slot not found' }, 404);
  }
  if (slot.status === 'booked') {
    return c.json({ success: false, error: 'Cannot delete a booked slot' }, 400);
  }

  await db.prepare('DELETE FROM ice_slots WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'Slot deleted' });
});

// Admin: Block/unblock a slot
iceBookingRoutes.patch('/slots/:id', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  const db = c.env.DB;

  if (!['available', 'blocked'].includes(status)) {
    return c.json({ success: false, error: 'Invalid status' }, 400);
  }

  await db.prepare(
    "UPDATE ice_slots SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, id).run();

  return c.json({ success: true, message: 'Slot updated' });
});

// Admin: Get bookings (booked slots with contact info)
iceBookingRoutes.get('/admin/bookings', async (c) => {
  const db = c.env.DB;
  const { start_date, end_date, search } = c.req.query();

  let query = `
    SELECT is2.*, v.name as venue_name
    FROM ice_slots is2
    LEFT JOIN venues v ON v.id = is2.venue_id
    WHERE is2.status IN ('booked', 'held')
  `;
  const params: string[] = [];

  if (start_date) { query += ' AND is2.date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND is2.date <= ?'; params.push(end_date); }
  if (search) {
    query += ' AND (is2.booked_by_name LIKE ? OR is2.booked_by_email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY is2.date ASC, is2.start_time ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});
