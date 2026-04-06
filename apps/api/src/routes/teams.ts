import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const teamRoutes = new Hono<{ Bindings: Env }>();

// ==================
// ADMIN: List all teams with filters
// ==================
teamRoutes.get('/admin/list', async (c) => {
  const db = c.env.DB;
  const { search, state, age_group, active } = c.req.query();

  let query = `
    SELECT t.*, o.name as organization_name,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (search) {
    query += ` AND (t.name LIKE ? OR t.city LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (state) {
    query += ` AND t.state = ?`;
    params.push(state);
  }
  if (age_group) {
    query += ` AND t.age_group = ?`;
    params.push(age_group);
  }
  if (active !== undefined) {
    query += ` AND t.is_active = ?`;
    params.push(active);
  }

  query += ` ORDER BY t.name ASC`;

  const result = await db.prepare(query).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Bulk import teams
// ==================
teamRoutes.post('/admin/bulk-import', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const teams = body.teams; // Array of [team_name, coach_name, phone, event_count]

  if (!Array.isArray(teams)) {
    return c.json({ success: false, error: 'teams must be an array' }, 400);
  }

  let inserted = 0;
  let skipped = 0;

  for (const t of teams) {
    const name = t[0]?.trim();
    const coach = t[1]?.trim() || null;
    const phone = t[2]?.trim() || null;
    const eventCount = t[3] || 0;

    if (!name) { skipped++; continue; }

    // Check for exact duplicate
    const existing = await db.prepare(`SELECT id FROM teams WHERE name = ?`).bind(name).first();
    if (existing) { skipped++; continue; }

    const teamId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO teams (id, name, age_group, city, state, is_active)
      VALUES (?, ?, 'Unknown', NULL, NULL, 1)
    `).bind(teamId, name).run();
    inserted++;
  }

  return c.json({ success: true, inserted, skipped, total: teams.length });
});

// ==================
// ADMIN: Update team
// ==================
teamRoutes.patch('/admin/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json();

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = ['name', 'age_group', 'division_level', 'city', 'state', 'organization_id', 'usa_hockey_team_id', 'logo_url', 'is_active'];
  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      fields.push(`${f} = ?`);
      params.push(body[f]);
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  fields.push(`updated_at = datetime('now')`);
  params.push(id);

  await db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==================
// ADMIN: Delete team (soft)
// ==================
teamRoutes.delete('/admin/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare(`UPDATE teams SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// ==================
// ADMIN: Deduplicate teams (single SQL)
// ==================
teamRoutes.post('/admin/dedup', async (c) => {
  const db = c.env.DB;

  // Single SQL: delete all rows where there's another row with the same name and a smaller rowid
  const result = await db.prepare(`
    DELETE FROM teams WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM teams GROUP BY name
    )
  `).run();

  const remaining = await db.prepare(`SELECT COUNT(*) as cnt FROM teams`).first();

  return c.json({ success: true, deleted: result.meta.changes, remaining: (remaining as any)?.cnt });
});

// ==================
// Get teams by IDs (for coach/manager dashboard with localStorage team IDs)
// ==================
teamRoutes.get('/by-ids', async (c) => {
  const db = c.env.DB;
  const idsParam = c.req.query('ids');
  if (!idsParam) return c.json({ success: true, data: [] });

  const ids = idsParam.split(',').slice(0, 50); // max 50
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT id, name, age_group, division_level, city, state, head_coach_name, head_coach_email,
           manager_name, usa_hockey_team_id, website, hometown_league, team_type, season_record,
           created_at
    FROM teams WHERE id IN (${placeholders}) AND is_active = 1
    ORDER BY name ASC
  `).bind(...ids).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// Get teams for current user (coach/manager/org)
// ==================
teamRoutes.get('/my-teams', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  // Get teams where user is coach, manager, or org owner
  const result = await db.prepare(`
    SELECT DISTINCT t.*, o.name as organization_name,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.team_id = t.id AND r.status IN ('pending', 'approved')) as active_registrations
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    LEFT JOIN team_coaches tc ON tc.team_id = t.id
    LEFT JOIN team_managers tm ON tm.team_id = t.id
    LEFT JOIN organizations org ON org.id = t.organization_id AND org.owner_id = ?
    WHERE tc.user_id = ? OR tm.user_id = ? OR org.owner_id = ?
    ORDER BY t.age_group ASC, t.name ASC
  `).bind(user.id, user.id, user.id, user.id).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// Get single team with roster
// ==================
teamRoutes.get('/:id', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;

  const team = await db.prepare(`
    SELECT t.*, o.name as organization_name
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ?
  `).bind(teamId).first();

  if (!team) {
    return c.json({ success: false, error: 'Team not found' }, 404);
  }

  // Get players
  const players = await db.prepare(`
    SELECT p.*, tp.status, tp.added_at
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ?
    ORDER BY p.last_name ASC
  `).bind(teamId).all();

  // Get coaches
  const coaches = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone, tc.role
    FROM users u
    JOIN team_coaches tc ON tc.user_id = u.id
    WHERE tc.team_id = ?
  `).bind(teamId).all();

  // Get managers
  const managers = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone
    FROM users u
    JOIN team_managers tm ON tm.user_id = u.id
    WHERE tm.team_id = ?
  `).bind(teamId).all();

  // Get registration history
  const registrations = await db.prepare(`
    SELECT r.*, e.name as event_name, e.start_date, e.end_date, ed.age_group, ed.division_level
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE r.team_id = ?
    ORDER BY e.start_date DESC
  `).bind(teamId).all();

  return c.json({
    success: true,
    data: {
      ...team,
      players: players.results,
      coaches: coaches.results,
      managers: managers.results,
      registrations: registrations.results,
    },
  });
});

// ==================
// Create team (full — with coach/manager/league info)
// ==================
const createTeamSchema = z.object({
  name: z.string().min(1),
  ageGroup: z.string(),
  divisionLevel: z.string().optional(),
  organizationId: z.string().optional(),
  usaHockeyTeamId: z.string().optional(),
  usaHockeyRosterUrl: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  website: z.string().optional(),
  hometownLeague: z.string().optional(),
  teamType: z.string().optional(),
  seasonRecord: z.string().optional(),
  headCoachName: z.string().optional(),
  headCoachEmail: z.string().optional(),
  headCoachPhone: z.string().optional(),
  managerName: z.string().optional(),
  managerEmail: z.string().optional(),
  managerPhone: z.string().optional(),
});

teamRoutes.post('/', zValidator('json', createTeamSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  const teamId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO teams (id, organization_id, name, age_group, division_level,
      usa_hockey_team_id, usa_hockey_roster_url, city, state,
      website, hometown_league, team_type, season_record,
      head_coach_name, head_coach_email, head_coach_phone,
      manager_name, manager_email, manager_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    teamId, data.organizationId || null, data.name, data.ageGroup,
    data.divisionLevel || null, data.usaHockeyTeamId || null,
    data.usaHockeyRosterUrl || null, data.city || null, data.state || null,
    data.website || null, data.hometownLeague || null,
    data.teamType || null, data.seasonRecord || null,
    data.headCoachName || null, data.headCoachEmail || null, data.headCoachPhone || null,
    data.managerName || null, data.managerEmail || null, data.managerPhone || null
  ).run();

  return c.json({ success: true, data: { id: teamId } }, 201);
});

// ==================
// Add player to team
// ==================
const addPlayerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  usaHockeyNumber: z.string().optional(),
  jerseyNumber: z.string().optional(),
  position: z.enum(['forward', 'defense', 'goalie']).optional(),
  shoots: z.enum(['left', 'right']).optional(),
});

teamRoutes.post('/:id/players', authMiddleware, requireRole('admin', 'organization', 'coach', 'manager'), zValidator('json', addPlayerSchema), async (c) => {
  const teamId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const playerId = crypto.randomUUID().replace(/-/g, '');

  // Create player
  await db.prepare(`
    INSERT INTO players (id, first_name, last_name, date_of_birth, usa_hockey_number, jersey_number, position, shoots)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    playerId, data.firstName, data.lastName, data.dateOfBirth || null,
    data.usaHockeyNumber || null, data.jerseyNumber || null,
    data.position || null, data.shoots || null
  ).run();

  // Link to team
  await db.prepare(`
    INSERT INTO team_players (id, team_id, player_id, status)
    VALUES (?, ?, ?, 'active')
  `).bind(crypto.randomUUID().replace(/-/g, ''), teamId, playerId).run();

  return c.json({ success: true, data: { id: playerId } }, 201);
});

// ==================
// Remove player from team
// ==================
teamRoutes.delete('/:teamId/players/:playerId', authMiddleware, requireRole('admin', 'organization', 'coach'), async (c) => {
  const { teamId, playerId } = c.req.param();
  const db = c.env.DB;

  await db.prepare(`
    UPDATE team_players SET status = 'inactive' WHERE team_id = ? AND player_id = ?
  `).bind(teamId, playerId).run();

  return c.json({ success: true, message: 'Player removed from team' });
});
