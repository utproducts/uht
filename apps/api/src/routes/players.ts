import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const playerRoutes = new Hono<{ Bindings: Env }>();

// Parent/Player: Get my player profiles and stats
playerRoutes.get('/my-players', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const players = await db.prepare(`
    SELECT p.*,
      (SELECT GROUP_CONCAT(t.name, ', ') FROM team_players tp JOIN teams t ON t.id = tp.team_id WHERE tp.player_id = p.id AND tp.status = 'active') as team_names
    FROM players p
    JOIN player_guardians pg ON pg.player_id = p.id
    WHERE pg.user_id = ?
  `).bind(user.id).all();

  return c.json({ success: true, data: players.results });
});

// Get player stats across all events
playerRoutes.get('/:id/stats', async (c) => {
  const playerId = c.req.param('id');
  const db = c.env.DB;

  const player = await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
  if (!player) return c.json({ success: false, error: 'Player not found' }, 404);

  // Aggregate stats from game_events
  const goals = await db.prepare(`
    SELECT COUNT(*) as total FROM game_events WHERE player_id = ? AND event_type = 'goal'
  `).bind(playerId).first<{ total: number }>();

  const assists = await db.prepare(`
    SELECT COUNT(*) as total FROM game_events
    WHERE (assist1_player_id = ? OR assist2_player_id = ?) AND event_type = 'goal'
  `).bind(playerId, playerId).first<{ total: number }>();

  const penalties = await db.prepare(`
    SELECT COUNT(*) as total, COALESCE(SUM(penalty_minutes), 0) as total_minutes
    FROM game_events WHERE player_id = ? AND event_type = 'penalty'
  `).bind(playerId).first<{ total: number; total_minutes: number }>();

  // Games played
  const gamesPlayed = await db.prepare(`
    SELECT COUNT(DISTINCT ge.game_id) as total
    FROM game_events ge WHERE ge.player_id = ? OR ge.assist1_player_id = ? OR ge.assist2_player_id = ?
  `).bind(playerId, playerId, playerId).first<{ total: number }>();

  // Event history
  const events = await db.prepare(`
    SELECT DISTINCT e.id, e.name, e.start_date, e.end_date, e.city, e.state, e.logo_url,
      t.name as team_name, ed.age_group, ed.division_level
    FROM registration_rosters rr
    JOIN registrations r ON r.id = rr.registration_id
    JOIN events e ON e.id = r.event_id
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE rr.player_id = ?
    ORDER BY e.start_date DESC
  `).bind(playerId).all();

  return c.json({
    success: true,
    data: {
      player,
      stats: {
        gamesPlayed: gamesPlayed?.total || 0,
        goals: goals?.total || 0,
        assists: assists?.total || 0,
        points: (goals?.total || 0) + (assists?.total || 0),
        penalties: penalties?.total || 0,
        penaltyMinutes: penalties?.total_minutes || 0,
      },
      eventHistory: events.results,
    },
  });
});
