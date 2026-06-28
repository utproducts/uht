import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

export const followRoutes = new Hono<{ Bindings: Env }>();

// ==================
// POST / — Follow a team (auth required)
// ==================
const followSchema = z.object({
  team_id: z.string().min(1),
});

followRoutes.post('/', authMiddleware, zValidator('json', followSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { team_id } = c.req.valid('json');

  // Validate team exists and is active
  const team = await db.prepare(
    `SELECT id, name FROM teams WHERE id = ? AND is_active = 1`
  ).bind(team_id).first();

  if (!team) {
    return c.json({ success: false, error: 'Team not found or inactive' }, 404);
  }

  // Check for existing follow
  const existing = await db.prepare(
    `SELECT id FROM user_follows WHERE user_id = ? AND team_id = ?`
  ).bind(user.id, team_id).first();

  if (existing) {
    return c.json({ success: true, data: existing, message: 'Already following this team' });
  }

  // Insert follow
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(
    `INSERT INTO user_follows (id, user_id, team_id) VALUES (?, ?, ?)`
  ).bind(id, user.id, team_id).run();

  const follow = await db.prepare(
    `SELECT id, user_id, team_id, created_at FROM user_follows WHERE id = ?`
  ).bind(id).first();

  return c.json({ success: true, data: follow });
});

// ==================
// GET / — Get followed teams (auth required)
// ==================
followRoutes.get('/', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };

  const result = await db.prepare(`
    SELECT uf.id as follow_id, uf.created_at as followed_at,
           t.id, t.id as team_id, t.name as team_name, t.age_group, t.city, t.state,
           o.name as org_name, o.name as organization_name
    FROM user_follows uf
    JOIN teams t ON t.id = uf.team_id
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE uf.user_id = ?
    ORDER BY t.name ASC
  `).bind(user.id).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// DELETE /:teamId — Unfollow a team (auth required)
// ==================
followRoutes.delete('/:teamId', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const teamId = c.req.param('teamId');

  await db.prepare(
    `DELETE FROM user_follows WHERE user_id = ? AND team_id = ?`
  ).bind(user.id, teamId).run();

  return c.json({ success: true, message: 'Unfollowed successfully' });
});

// ==================
// POST /migrate — Create user_follows table
// ==================
followRoutes.post('/migrate', async (c) => {
  const db = c.env.DB;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_follows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, team_id)
    )
  `).run();

  return c.json({ success: true, message: 'user_follows table created' });
});
