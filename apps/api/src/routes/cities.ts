import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const cityRoutes = new Hono<{ Bindings: Env }>();

// List all active cities with venue count
cityRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM venues v WHERE v.city_id = c.id AND v.is_active = 1) as venue_count
    FROM cities c WHERE c.is_active = 1 ORDER BY c.name ASC
  `).all();
  return c.json({ success: true, data: result.results });
});

// Get venues for a city
cityRoutes.get('/:id/venues', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const venues = await db.prepare(`
    SELECT v.*, (SELECT COUNT(*) FROM venue_rinks vr WHERE vr.venue_id = v.id) as rink_count
    FROM venues v WHERE v.city_id = ? AND v.is_active = 1 ORDER BY v.name ASC
  `).bind(id).all();
  return c.json({ success: true, data: venues.results });
});

// Get city with venues
cityRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const city = await db.prepare('SELECT * FROM cities WHERE id = ?').bind(id).first();
  if (!city) return c.json({ success: false, error: 'City not found' }, 404);
  const venues = await db.prepare(`
    SELECT v.*, (SELECT COUNT(*) FROM venue_rinks vr WHERE vr.venue_id = v.id) as rink_count
    FROM venues v WHERE v.city_id = ? AND v.is_active = 1 ORDER BY v.name ASC
  `).bind(id).all();
  return c.json({ success: true, data: { ...city, venues: venues.results } });
});

// Create city
const createCitySchema = z.object({
  name: z.string().min(1),
  state: z.string().min(1),
  notes: z.string().optional(),
});

cityRoutes.post('/', authMiddleware, requireRole('admin'), zValidator('json', createCitySchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const cityId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO cities (id, name, state, notes)
    VALUES (?, ?, ?, ?)
  `).bind(cityId, data.name, data.state, data.notes || null).run();

  return c.json({ success: true, data: { id: cityId } }, 201);
});

// Update city
const updateCitySchema = z.object({
  name: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),
});

cityRoutes.put('/:id', authMiddleware, requireRole('admin'), zValidator('json', updateCitySchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  await db.prepare(`
    UPDATE cities SET
      name = COALESCE(?, name),
      state = COALESCE(?, state),
      notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(data.name || null, data.state || null, data.notes || null, id).run();

  return c.json({ success: true });
});

// Soft delete city
cityRoutes.delete('/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  await db.prepare('UPDATE cities SET is_active = 0 WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// One-time migration: seed cities from venues table
cityRoutes.post('/seed-from-venues', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  // Get all unique city/state pairs from venues
  const uniquePairs = await db.prepare(`
    SELECT DISTINCT city, state FROM venues WHERE city IS NOT NULL AND state IS NOT NULL
  `).all();

  let citiesCreated = 0;

  // For each pair, INSERT OR IGNORE into cities
  for (const pair of uniquePairs.results as Array<{ city: string; state: string }>) {
    const cityId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT OR IGNORE INTO cities (id, name, state)
      VALUES (?, ?, ?)
    `).bind(cityId, pair.city, pair.state).run();
    citiesCreated++;
  }

  // For each venue, UPDATE venues SET city_id where it matches city/state
  for (const pair of uniquePairs.results as Array<{ city: string; state: string }>) {
    await db.prepare(`
      UPDATE venues SET city_id = (SELECT id FROM cities WHERE name = ? AND state = ?)
      WHERE city = ? AND state = ? AND city_id IS NULL
    `).bind(pair.city, pair.state, pair.city, pair.state).run();
  }

  return c.json({ success: true, data: { citiesCreated } }, 201);
});
