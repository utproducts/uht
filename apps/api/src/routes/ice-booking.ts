import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const iceBookingRoutes = new Hono<{ Bindings: Env }>();

// Public: Get available ice slots (calendar view)
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
  else { query += ' AND is2.status = \'available\''; }

  query += ' ORDER BY is2.date ASC, is2.start_time ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// Public: Book an ice slot
const bookSlotSchema = z.object({
  slotId: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  notes: z.string().optional(),
});

iceBookingRoutes.post('/book', zValidator('json', bookSlotSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check slot is still available
  const slot = await db.prepare('SELECT * FROM ice_slots WHERE id = ? AND status = \'available\'').bind(data.slotId).first<any>();
  if (!slot) {
    return c.json({ success: false, error: 'This time slot is no longer available' }, 409);
  }

  // Hold the slot
  await db.prepare(`
    UPDATE ice_slots SET status = 'held', booked_by_name = ?, booked_by_email = ?, booked_by_phone = ?,
    notes = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(data.name, data.email, data.phone, data.notes || null, data.slotId).run();

  // TODO: Create Stripe payment intent and return client secret
  // For now, just hold and confirm
  // const paymentIntent = await createStripePaymentIntent(c.env, slot.price_cents);

  // Also create/update contact record
  const existingContact = await db.prepare('SELECT id FROM contacts WHERE email = ?').bind(data.email.toLowerCase()).first();
  if (!existingContact) {
    await db.prepare(`
      INSERT INTO contacts (id, email, phone, first_name, source, tags)
      VALUES (?, ?, ?, ?, 'ice_booking', '["ice_booking"]')
    `).bind(crypto.randomUUID().replace(/-/g, ''), data.email.toLowerCase(), data.phone, data.name).run();
  }

  return c.json({
    success: true,
    data: {
      slotId: data.slotId,
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      priceCents: slot.price_cents,
      status: 'held',
      message: 'Ice time held. Complete payment to confirm booking.',
    },
  });
});

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

iceBookingRoutes.post('/slots', authMiddleware, requireRole('admin'), zValidator('json', createSlotsSchema), async (c) => {
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
