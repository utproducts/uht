import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const cityInviteRoutes = new Hono<{ Bindings: Env }>();

// Public endpoint — no auth required
const cityInviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  city: z.string().min(1),
  state: z.string().min(1),
  role: z.string().optional(),
  arenas: z.string().optional(),
  message: z.string().optional(),
});

cityInviteRoutes.post('/', zValidator('json', cityInviteSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO city_invites (id, name, email, city, state, role, arenas, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.name,
    data.email,
    data.city,
    data.state,
    data.role || 'other',
    data.arenas || null,
    data.message || null,
  ).run();

  // Also add to contacts table for marketing
  try {
    const contactId = crypto.randomUUID().replace(/-/g, '');
    const nameParts = data.name.split(' ');
    await db.prepare(`
      INSERT OR IGNORE INTO contacts (id, email, first_name, last_name, city, state, source, tags)
      VALUES (?, ?, ?, ?, ?, ?, 'city_invite', '["city-invite"]')
    `).bind(
      contactId,
      data.email,
      nameParts[0] || null,
      nameParts.slice(1).join(' ') || null,
      data.city,
      data.state,
    ).run();
  } catch {
    // Ignore duplicate contact errors
  }

  return c.json({ success: true, data: { id } }, 201);
});

// Admin: list all city invites
cityInviteRoutes.get('/', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(
    'SELECT * FROM city_invites ORDER BY created_at DESC'
  ).all();
  return c.json({ success: true, data: result.results });
});
