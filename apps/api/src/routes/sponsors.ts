import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const sponsorRoutes = new Hono<{ Bindings: Env }>();

// Public: Get sponsorship packages
sponsorRoutes.get('/packages', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM sponsorship_packages WHERE is_active = 1 ORDER BY price_cents DESC').all();
  return c.json({ success: true, data: result.results });
});

// Public: Get sponsors for an event (for display on event page)
sponsorRoutes.get('/event/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT s.name, s.logo_url, s.website, sp.tier, es.season
    FROM event_sponsorships es
    JOIN sponsors s ON s.id = es.sponsor_id
    JOIN sponsorship_packages sp ON sp.id = es.package_id
    WHERE (es.event_id = ? OR es.event_id IS NULL) AND es.status = 'active'
    ORDER BY sp.price_cents DESC
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// Admin: Create sponsor
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

// Admin: Create sponsorship (assign sponsor to event/season)
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
