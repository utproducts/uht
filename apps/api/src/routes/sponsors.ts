import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const sponsorRoutes = new Hono<{ Bindings: Env }>();

// ==================
// PUBLIC: Get sponsorship packages
// ==================
sponsorRoutes.get('/packages', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM sponsorship_packages WHERE is_active = 1 ORDER BY price_cents DESC').all();
  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get sponsors for an event (for display on event page)
// ==================
sponsorRoutes.get('/event/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT s.name, s.logo_url, s.website, sp.tier, sp.name as package_name, es.season
    FROM event_sponsorships es
    JOIN sponsors s ON s.id = es.sponsor_id
    JOIN sponsorship_packages sp ON sp.id = es.package_id
    WHERE (es.event_id = ? OR es.event_id IS NULL) AND es.status = 'active'
    ORDER BY sp.price_cents DESC
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get all active sponsors (for sponsors page)
// ==================
sponsorRoutes.get('/all', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT s.id, s.name, s.logo_url, s.website,
      sp.tier, sp.name as package_name,
      es.season, es.event_id,
      e.name as event_name
    FROM event_sponsorships es
    JOIN sponsors s ON s.id = es.sponsor_id
    JOIN sponsorship_packages sp ON sp.id = es.package_id
    LEFT JOIN events e ON e.id = es.event_id
    WHERE es.status = 'active' AND s.is_active = 1
    ORDER BY sp.price_cents DESC, s.name ASC
  `).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: List all sponsors with their sponsorship details
// ==================
sponsorRoutes.get('/admin/list', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM event_sponsorships es WHERE es.sponsor_id = s.id) as sponsorship_count,
      (SELECT SUM(es2.amount_cents) FROM event_sponsorships es2 WHERE es2.sponsor_id = s.id AND es2.payment_status = 'paid') as total_paid_cents,
      (SELECT GROUP_CONCAT(sp.tier) FROM event_sponsorships es3 JOIN sponsorship_packages sp ON sp.id = es3.package_id WHERE es3.sponsor_id = s.id AND es3.status = 'active') as active_tiers
    FROM sponsors s
    ORDER BY s.name ASC
  `).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Get sponsor detail with all sponsorships
// ==================
sponsorRoutes.get('/admin/detail/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const sponsor = await db.prepare('SELECT * FROM sponsors WHERE id = ?').bind(id).first();
  if (!sponsor) return c.json({ success: false, error: 'Sponsor not found' }, 404);

  const sponsorships = await db.prepare(`
    SELECT es.*, sp.name as package_name, sp.tier, e.name as event_name, e.start_date, e.end_date
    FROM event_sponsorships es
    JOIN sponsorship_packages sp ON sp.id = es.package_id
    LEFT JOIN events e ON e.id = es.event_id
    WHERE es.sponsor_id = ?
    ORDER BY es.created_at DESC
  `).bind(id).all();

  return c.json({ success: true, data: { ...sponsor, sponsorships: sponsorships.results } });
});

// ==================
// ADMIN: List all sponsorships (for overview)
// ==================
sponsorRoutes.get('/admin/sponsorships', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT es.*, s.name as sponsor_name, s.logo_url, s.website,
      sp.name as package_name, sp.tier, sp.price_cents as package_price_cents,
      e.name as event_name, e.start_date, e.city, e.state
    FROM event_sponsorships es
    JOIN sponsors s ON s.id = es.sponsor_id
    JOIN sponsorship_packages sp ON sp.id = es.package_id
    LEFT JOIN events e ON e.id = es.event_id
    ORDER BY es.created_at DESC
  `).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Create sponsor
// ==================
const createSponsorSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
});

sponsorRoutes.post('/', authMiddleware, requireRole('admin'), zValidator('json', createSponsorSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO sponsors (id, name, website, contact_name, contact_email, contact_phone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.name, data.website || null, data.contactName || null,
    data.contactEmail || null, data.contactPhone || null, data.notes || null
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ==================
// ADMIN: Update sponsor
// ==================
const updateSponsorSchema = z.object({
  name: z.string().min(1).optional(),
  website: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.number().optional(),
});

sponsorRoutes.patch('/admin/:id', zValidator('json', updateSponsorSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(val as any);
    }
  }
  if (setClauses.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  await db.prepare(`UPDATE sponsors SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await db.prepare('SELECT * FROM sponsors WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: updated });
});

// ==================
// ADMIN: Update sponsorship status/payment
// ==================
const updateSponsorshipSchema = z.object({
  status: z.enum(['active', 'pending', 'expired', 'cancelled']).optional(),
  payment_status: z.enum(['paid', 'unpaid', 'partial', 'refunded']).optional(),
  amount_cents: z.number().nullable().optional(),
});

sponsorRoutes.patch('/admin/sponsorship/:id', zValidator('json', updateSponsorshipSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(val as any);
    }
  }
  if (setClauses.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  await db.prepare(`UPDATE event_sponsorships SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==================
// ADMIN: Create sponsorship (assign sponsor to event/season)
// ==================
const createSponsorshipSchema = z.object({
  sponsorId: z.string(),
  eventId: z.string().optional(),
  packageId: z.string(),
  season: z.string().optional(),
});

sponsorRoutes.post('/sponsorships', authMiddleware, requireRole('admin'), zValidator('json', createSponsorshipSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  const pkg = await db.prepare('SELECT price_cents FROM sponsorship_packages WHERE id = ?').bind(data.packageId).first<{ price_cents: number }>();

  await db.prepare(`
    INSERT INTO event_sponsorships (id, sponsor_id, event_id, package_id, season, amount_cents, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).bind(id, data.sponsorId, data.eventId || null, data.packageId, data.season || null, pkg?.price_cents || 0).run();

  return c.json({ success: true, data: { id } }, 201);
});
