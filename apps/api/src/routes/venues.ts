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
    INSERT INTO venues (id, name, address, city, state, zip, phone, website, num_rinks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(venueId, data.name, data.address || null, data.city, data.state,
    data.zip || null, data.phone || null, data.website || null, data.numRinks
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
