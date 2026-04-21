import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';

const lookupRoutes = new Hono<{ Bindings: Env }>();

// GET / — list all lookup values, optionally filtered by category
lookupRoutes.get('/', async (c) => {
  const category = c.req.query('category');
  const activeOnly = c.req.query('active') !== 'false'; // default: only active

  let sql = 'SELECT * FROM lookup_values';
  const params: string[] = [];

  const conditions: string[] = [];
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (activeOnly) {
    conditions.push('is_active = 1');
  }
  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY category, sort_order, value';

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// POST / — create a new lookup value
const createSchema = z.object({
  category: z.enum(['age_group', 'division', 'league', 'team_type']),
  value: z.string().min(1),
  sortOrder: z.number().optional(),
});

lookupRoutes.post('/', zValidator('json', createSchema), async (c) => {
  const { category, value, sortOrder } = c.req.valid('json');
  const id = `${category.slice(0, 2)}-${Date.now().toString(36)}`;

  // Get max sort_order if not provided
  let order = sortOrder;
  if (order === undefined) {
    const max = await c.env.DB.prepare(
      'SELECT MAX(sort_order) as mx FROM lookup_values WHERE category = ?'
    ).bind(category).first<{ mx: number | null }>();
    order = (max?.mx ?? 0) + 1;
  }

  await c.env.DB.prepare(
    'INSERT INTO lookup_values (id, category, value, sort_order) VALUES (?, ?, ?, ?)'
  ).bind(id, category, value, order).run();

  return c.json({ success: true, data: { id, category, value, sort_order: order } }, 201);
});

// PUT /:id — update a lookup value
const updateSchema = z.object({
  value: z.string().min(1).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

lookupRoutes.put('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const sets: string[] = [];
  const params: string[] = [];

  if (body.value !== undefined) { sets.push('value = ?'); params.push(body.value); }
  if (body.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(String(body.sortOrder)); }
  if (body.isActive !== undefined) { sets.push('is_active = ?'); params.push(body.isActive ? '1' : '0'); }

  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  params.push(id);
  await c.env.DB.prepare(`UPDATE lookup_values SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  return c.json({ success: true });
});

// DELETE /:id — hard delete (removes permanently)
lookupRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM lookup_values WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ==========================================
// STATE DIVISION LEVELS
// ==========================================

// Auto-create table on first use
async function ensureStateDivLevels(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS state_division_levels (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        state TEXT NOT NULL,
        level_name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(state, level_name)
      )
    `).run();
  } catch (_) {}
}

// GET /state-divisions — list all, optionally filtered by state
lookupRoutes.get('/state-divisions', async (c) => {
  const db = c.env.DB;
  await ensureStateDivLevels(db);
  const state = c.req.query('state');
  if (state) {
    const result = await db.prepare('SELECT * FROM state_division_levels WHERE state = ? ORDER BY sort_order, level_name').bind(state).all();
    return c.json({ success: true, data: result.results });
  }
  const result = await db.prepare('SELECT * FROM state_division_levels ORDER BY state, sort_order, level_name').all();
  return c.json({ success: true, data: result.results });
});

// GET /state-divisions/states — list all states that have levels
lookupRoutes.get('/state-divisions/states', async (c) => {
  const db = c.env.DB;
  await ensureStateDivLevels(db);
  const result = await db.prepare('SELECT DISTINCT state FROM state_division_levels ORDER BY state').all();
  return c.json({ success: true, data: (result.results as any[]).map(r => r.state) });
});

// POST /state-divisions — add a level to a state
lookupRoutes.post('/state-divisions', zValidator('json', z.object({
  state: z.string().min(1).max(3),
  levelName: z.string().min(1),
  sortOrder: z.number().optional(),
})), async (c) => {
  const db = c.env.DB;
  await ensureStateDivLevels(db);
  const { state, levelName, sortOrder } = c.req.valid('json');
  const id = `sdl-${Date.now().toString(36)}`;
  const order = sortOrder ?? 0;
  try {
    await db.prepare('INSERT INTO state_division_levels (id, state, level_name, sort_order) VALUES (?, ?, ?, ?)').bind(id, state.toUpperCase(), levelName, order).run();
    return c.json({ success: true, data: { id, state: state.toUpperCase(), level_name: levelName, sort_order: order } }, 201);
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) return c.json({ success: false, error: 'That level already exists for this state' }, 409);
    throw e;
  }
});

// PUT /state-divisions/:id — update a level
lookupRoutes.put('/state-divisions/:id', zValidator('json', z.object({
  levelName: z.string().min(1).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
})), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const db = c.env.DB;
  const sets: string[] = [];
  const params: any[] = [];
  if (body.levelName !== undefined) { sets.push('level_name = ?'); params.push(body.levelName); }
  if (body.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(body.sortOrder); }
  if (body.isActive !== undefined) { sets.push('is_active = ?'); params.push(body.isActive ? 1 : 0); }
  if (sets.length === 0) return c.json({ error: 'No fields' }, 400);
  params.push(id);
  await db.prepare(`UPDATE state_division_levels SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// DELETE /state-divisions/:id — hard delete
lookupRoutes.delete('/state-divisions/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM state_division_levels WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export { lookupRoutes };
