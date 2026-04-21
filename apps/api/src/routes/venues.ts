import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const venueRoutes = new Hono<{ Bindings: Env }>();

// List all venues
venueRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM venue_rinks vr WHERE vr.venue_id = v.id) as rink_count
    FROM venues v WHERE v.is_active = 1 ORDER BY v.name ASC
  `).all();
  return c.json({ success: true, data: result.results });
});

// Get rinks for a venue (used by schedule builder)
venueRoutes.get('/:id/rinks', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const rinks = await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ? ORDER BY name ASC').bind(id).all();
  return c.json({ success: true, data: rinks.results });
});

// Get venue with rinks
venueRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const venue = await db.prepare('SELECT * FROM venues WHERE id = ?').bind(id).first();
  if (!venue) return c.json({ success: false, error: 'Venue not found' }, 404);
  const rinks = await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ?').bind(id).all();
  return c.json({ success: true, data: { ...venue, rinks: rinks.results } });
});

// Create venue
const createVenueSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string(),
  state: z.string(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  numRinks: z.number().default(1),
  cityId: z.string().optional(),
  rinks: z.array(z.object({
    name: z.string(),
    surfaceSize: z.string().optional(),
    capacity: z.number().optional(),
  })).optional(),
});

venueRoutes.post('/', authMiddleware, requireRole('admin'), zValidator('json', createVenueSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const venueId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO venues (id, name, address, city, state, zip, phone, website, num_rinks, city_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(venueId, data.name, data.address || null, data.city, data.state,
    data.zip || null, data.phone || null, data.website || null, data.numRinks,
    data.cityId || null
  ).run();

  if (data.rinks?.length) {
    for (const rink of data.rinks) {
      await db.prepare(`
        INSERT INTO venue_rinks (id, venue_id, name, surface_size, capacity)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID().replace(/-/g, ''), venueId, rink.name,
        rink.surfaceSize || null, rink.capacity || null
      ).run();
    }
  }

  return c.json({ success: true, data: { id: venueId } }, 201);
});

// Update venue
const updateVenueSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  cityId: z.string().optional(),
});

venueRoutes.put('/:id', authMiddleware, requireRole('admin'), zValidator('json', updateVenueSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  await db.prepare(`
    UPDATE venues SET
      name = COALESCE(?, name),
      address = COALESCE(?, address),
      city_id = COALESCE(?, city_id),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(data.name || null, data.address || null, data.cityId || null, id).run();

  return c.json({ success: true });
});

// Add a rink to a venue
const addRinkSchema = z.object({
  name: z.string().min(1),
  surface_size: z.string().optional(),
  capacity: z.number().optional(),
});

venueRoutes.post('/:id/rinks', authMiddleware, requireRole('admin'), zValidator('json', addRinkSchema), async (c) => {
  const venueId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO venue_rinks (id, venue_id, name, surface_size, capacity)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, venueId, data.name, data.surface_size || null, data.capacity || null).run();

  // Update num_rinks count on venue
  await db.prepare(`UPDATE venues SET num_rinks = (SELECT COUNT(*) FROM venue_rinks WHERE venue_id = ?) WHERE id = ?`).bind(venueId, venueId).run();

  const rink = await db.prepare('SELECT * FROM venue_rinks WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: rink });
});

// Delete a rink from a venue
venueRoutes.delete('/:venueId/rinks/:rinkId', authMiddleware, requireRole('admin'), async (c) => {
  const { venueId, rinkId } = c.req.param();
  const db = c.env.DB;

  await db.prepare('DELETE FROM venue_rinks WHERE id = ? AND venue_id = ?').bind(rinkId, venueId).run();
  await db.prepare(`UPDATE venues SET num_rinks = (SELECT COUNT(*) FROM venue_rinks WHERE venue_id = ?) WHERE id = ?`).bind(venueId, venueId).run();

  return c.json({ success: true });
});

// Soft delete venue
venueRoutes.delete('/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  await db.prepare('UPDATE venues SET is_active = 0 WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});
