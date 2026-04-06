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

// DELETE /:id — soft delete (set is_active = 0)
lookupRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE lookup_values SET is_active = 0 WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export { lookupRoutes };
