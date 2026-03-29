import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const teamRoutes = new Hono<{ Bindings: Env }>();

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
// Create team
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
});

teamRoutes.post('/', authMiddleware, requireRole('admin', 'organization', 'coach', 'manager'), zValidator('json', createTeamSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  const teamId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO teams (id, organization_id, name, age_group, division_level, usa_hockey_team_id, usa_hockey_roster_url, city, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    teamId, data.organizationId || null, data.name, data.ageGroup,
    data.divisionLevel || null, data.usaHockeyTeamId || null,
    data.usaHockeyRosterUrl || null, data.city || null, data.state || null
  ).run();

  // Auto-assign creator as coach or manager based on role
  if (user.roles.includes('coach')) {
    await db.prepare(`
      INSERT INTO team_coaches (id, team_id, user_id, role, assigned_by)
      VALUES (?, ?, ?, 'head', ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), teamId, user.id, user.id).run();
  } else if (user.roles.includes('manager')) {
    await db.prepare(`
      INSERT INTO team_managers (id, team_id, user_id)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), teamId, user.id).run();
  }

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
