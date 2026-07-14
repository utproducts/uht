import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

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
           COALESCE(t.logo_url, o.logo_url) as logo_url,
           o.name as org_name, o.name as organization_name
    FROM user_follows uf
    JOIN teams t ON t.id = uf.team_id
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE uf.user_id = ?
    ORDER BY t.name ASC
  `).bind(user.id).all();

  // Enrich each followed team with registered events
  const teams = result.results as any[];
  for (const team of teams) {
    const teamEvents: any[] = [];
    const seenEventIds = new Set<string>();

    // From registrations table (team_id match)
    try {
      const regs = await db.prepare(`
        SELECT r.status, e.id as event_id, e.name as event_name, e.slug, e.city, e.state,
               e.start_date, e.end_date, e.logo_url
        FROM registrations r
        JOIN events e ON e.id = r.event_id
        WHERE r.team_id = ? AND r.status NOT IN ('withdrawn','denied','rejected','cancelled')
        ORDER BY e.start_date ASC
      `).bind(team.team_id).all();
      for (const r of (regs.results || [])) {
        if (!seenEventIds.has((r as any).event_id)) {
          seenEventIds.add((r as any).event_id);
          teamEvents.push(r);
        }
      }
    } catch {}

    // From event_registrations table (team_name match)
    try {
      const legacyRegs = await db.prepare(`
        SELECT er.status, e.id as event_id, e.name as event_name, e.slug, e.city, e.state,
               e.start_date, e.end_date, e.logo_url
        FROM event_registrations er
        JOIN events e ON e.id = er.event_id
        WHERE er.team_name = ? AND er.status NOT IN ('withdrawn','denied','rejected','cancelled')
        ORDER BY e.start_date ASC
      `).bind(team.team_name).all();
      for (const r of (legacyRegs.results || [])) {
        if (!seenEventIds.has((r as any).event_id)) {
          seenEventIds.add((r as any).event_id);
          teamEvents.push(r);
        }
      }
    } catch {}

    team.registered_events = teamEvents;
  }

  return c.json({ success: true, data: teams });
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
// POST /by-code — Follow a team using invite code (auth required)
// ==================
const followByCodeSchema = z.object({
  inviteCode: z.string().min(4).max(10),
});

followRoutes.post('/by-code', authMiddleware, zValidator('json', followByCodeSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { inviteCode } = c.req.valid('json');
  const code = inviteCode.toUpperCase().trim();

  // Find team by parent invite code OR coach invite code (parents can use either)
  const team = await db.prepare(
    `SELECT id, name, age_group FROM teams WHERE (parent_invite_code = ? OR invite_code = ?) AND is_active = 1`
  ).bind(code, code).first<{ id: string; name: string; age_group: string }>();

  if (!team) {
    return c.json({ success: false, error: 'Invalid team code. Please check and try again.' }, 404);
  }

  // Check for existing follow
  const existing = await db.prepare(
    `SELECT id FROM user_follows WHERE user_id = ? AND team_id = ?`
  ).bind(user.id, team.id).first();

  if (!existing) {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(
      `INSERT INTO user_follows (id, user_id, team_id) VALUES (?, ?, ?)`
    ).bind(id, user.id, team.id).run();
  }

  return c.json({ success: true, data: { teamId: team.id, teamName: team.name, ageGroup: team.age_group } });
});

// ==================
// POST /migrate — Create user_follows table
// ==================
followRoutes.post('/migrate', authMiddleware, requireRole('admin'), async (c) => {
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
