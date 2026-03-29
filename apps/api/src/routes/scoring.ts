import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const scoringRoutes = new Hono<{ Bindings: Env }>();

// ==================
// Get games for an event (public)
// ==================
scoringRoutes.get('/events/:eventId/games', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const { division_id, status, date } = c.req.query();

  let query = `
    SELECT g.*,
      ht.name as home_team_name, ht.logo_url as home_team_logo,
      at2.name as away_team_name, at2.logo_url as away_team_logo,
      vr.name as rink_name, v.name as venue_name,
      ed.age_group, ed.division_level
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    WHERE g.event_id = ?
  `;
  const params: string[] = [eventId];

  if (division_id) { query += ' AND g.event_division_id = ?'; params.push(division_id); }
  if (status) { query += ' AND g.status = ?'; params.push(status); }
  if (date) { query += ' AND DATE(g.start_time) = ?'; params.push(date); }

  query += ' ORDER BY g.start_time ASC, g.game_number ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// Get single game with full detail + events log
// ==================
scoringRoutes.get('/games/:gameId', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  const game = await db.prepare(`
    SELECT g.*,
      ht.name as home_team_name, ht.logo_url as home_team_logo,
      at2.name as away_team_name, at2.logo_url as away_team_logo,
      vr.name as rink_name, v.name as venue_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    WHERE g.id = ?
  `).bind(gameId).first();

  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  const events = await db.prepare(`
    SELECT ge.*,
      p.first_name as player_first, p.last_name as player_last, p.jersey_number,
      a1.first_name as assist1_first, a1.last_name as assist1_last,
      a2.first_name as assist2_first, a2.last_name as assist2_last
    FROM game_events ge
    LEFT JOIN players p ON p.id = ge.player_id
    LEFT JOIN players a1 ON a1.id = ge.assist1_player_id
    LEFT JOIN players a2 ON a2.id = ge.assist2_player_id
    WHERE ge.game_id = ?
    ORDER BY ge.period ASC, ge.game_time DESC
  `).bind(gameId).all();

  return c.json({ success: true, data: { ...game, events: events.results } });
});

// ==================
// SCOREKEEPER: Record game event (goal, penalty, etc.)
// ==================
const gameEventSchema = z.object({
  eventType: z.enum(['goal', 'assist', 'penalty', 'shot', 'period_start', 'period_end', 'game_start', 'game_end', 'timeout', 'goalie_pull', 'goalie_return']),
  teamId: z.string().optional(),
  playerId: z.string().optional(),
  assist1PlayerId: z.string().optional(),
  assist2PlayerId: z.string().optional(),
  period: z.number().optional(),
  gameTime: z.string().optional(),
  penaltyType: z.string().optional(),
  penaltyMinutes: z.number().optional(),
  details: z.string().optional(),
});

scoringRoutes.post('/games/:gameId/events', authMiddleware, requireRole('admin', 'director', 'scorekeeper'), zValidator('json', gameEventSchema), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const eventId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO game_events (id, game_id, event_type, team_id, player_id, assist1_player_id, assist2_player_id,
      period, game_time, penalty_type, penalty_minutes, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, gameId, data.eventType, data.teamId || null, data.playerId || null,
    data.assist1PlayerId || null, data.assist2PlayerId || null,
    data.period || null, data.gameTime || null,
    data.penaltyType || null, data.penaltyMinutes || null, data.details || null
  ).run();

  // If it's a goal, update the game score
  if (data.eventType === 'goal' && data.teamId) {
    const game = await db.prepare('SELECT home_team_id, away_team_id FROM games WHERE id = ?').bind(gameId).first<any>();
    if (game) {
      const isHome = data.teamId === game.home_team_id;
      const field = isHome ? 'home_score' : 'away_score';
      await db.prepare(`UPDATE games SET ${field} = ${field} + 1, updated_at = datetime('now') WHERE id = ?`).bind(gameId).run();
    }
  }

  // Update game status for period/game events
  if (data.eventType === 'game_start') {
    await db.prepare(`UPDATE games SET status = 'in_progress', period = 1, updated_at = datetime('now') WHERE id = ?`).bind(gameId).run();
  } else if (data.eventType === 'game_end') {
    await db.prepare(`UPDATE games SET status = 'final', updated_at = datetime('now') WHERE id = ?`).bind(gameId).run();
  } else if (data.eventType === 'period_start' && data.period) {
    await db.prepare(`UPDATE games SET period = ?, status = 'in_progress', updated_at = datetime('now') WHERE id = ?`).bind(data.period, gameId).run();
  } else if (data.eventType === 'period_end') {
    await db.prepare(`UPDATE games SET status = 'intermission', updated_at = datetime('now') WHERE id = ?`).bind(gameId).run();
  }

  return c.json({ success: true, data: { id: eventId } }, 201);
});

// ==================
// Get standings for an event division
// ==================
scoringRoutes.get('/events/:eventId/standings', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const { division_id } = c.req.query();

  let query = `
    SELECT ps.*, t.name as team_name, t.logo_url as team_logo,
      ed.age_group, ed.division_level
    FROM pool_standings ps
    JOIN teams t ON t.id = ps.team_id
    JOIN event_divisions ed ON ed.id = ps.event_division_id
    WHERE ps.event_id = ?
  `;
  const params: string[] = [eventId];

  if (division_id) { query += ' AND ps.event_division_id = ?'; params.push(division_id); }

  query += ' ORDER BY ps.pool_name ASC, ps.points DESC, ps.goal_differential DESC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});
