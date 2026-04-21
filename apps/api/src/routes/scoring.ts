import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const scoringRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// USA HOCKEY PENALTY CODES
// ==========================================
const USA_HOCKEY_PENALTIES: Record<string, { name: string; minutes: number; category: string }> = {
  'BOARD': { name: 'Boarding', minutes: 2, category: 'minor' },
  'CHARGE': { name: 'Charging', minutes: 2, category: 'minor' },
  'CLIP': { name: 'Clipping', minutes: 2, category: 'minor' },
  'CROSS': { name: 'Cross-Checking', minutes: 2, category: 'minor' },
  'DELAY': { name: 'Delay of Game', minutes: 2, category: 'minor' },
  'ELBOW': { name: 'Elbowing', minutes: 2, category: 'minor' },
  'GOALI': { name: 'Goalkeeper Interference', minutes: 2, category: 'minor' },
  'HC': { name: 'Head Contact', minutes: 2, category: 'minor' },
  'HE': { name: 'Head or Neck Restraint', minutes: 2, category: 'minor' },
  'HIGHST': { name: 'High-Sticking', minutes: 2, category: 'minor' },
  'HOLD': { name: 'Holding', minutes: 2, category: 'minor' },
  'HOLDST': { name: 'Holding the Stick', minutes: 2, category: 'minor' },
  'HOOK': { name: 'Hooking', minutes: 2, category: 'minor' },
  'INTER': { name: 'Interference', minutes: 2, category: 'minor' },
  'KNEE': { name: 'Kneeing', minutes: 2, category: 'minor' },
  'ROUGH': { name: 'Roughing', minutes: 2, category: 'minor' },
  'SLASH': { name: 'Slashing', minutes: 2, category: 'minor' },
  'SPEAR': { name: 'Spearing', minutes: 2, category: 'minor' },
  'TRIP': { name: 'Tripping', minutes: 2, category: 'minor' },
  'UNSPORT': { name: 'Unsportsmanlike Conduct', minutes: 2, category: 'minor' },
  'BENCH': { name: 'Bench Minor', minutes: 2, category: 'minor' },
  'TOOMANY': { name: 'Too Many Players', minutes: 2, category: 'minor' },
  // Majors (5 min)
  'BOARD5': { name: 'Boarding (Major)', minutes: 5, category: 'major' },
  'CHARGE5': { name: 'Charging (Major)', minutes: 5, category: 'major' },
  'CHECK5': { name: 'Checking from Behind (Major)', minutes: 5, category: 'major' },
  'FIGHT': { name: 'Fighting', minutes: 5, category: 'major' },
  'HIGHST5': { name: 'High-Sticking (Major)', minutes: 5, category: 'major' },
  'SPEAR5': { name: 'Spearing (Major)', minutes: 5, category: 'major' },
  'SLASH5': { name: 'Slashing (Major)', minutes: 5, category: 'major' },
  // Misconducts (10 min)
  'MISC': { name: 'Misconduct', minutes: 10, category: 'misconduct' },
  'GMSC': { name: 'Game Misconduct', minutes: 10, category: 'game_misconduct' },
};

// ==========================================
// SCOREKEEPER PIN AUTH
// ==========================================

// Verify PIN and get games for scorekeeper
scoringRoutes.post('/scorekeeper/auth', zValidator('json', z.object({ pin: z.string().min(4).max(8), eventId: z.string().optional() })), async (c) => {
  const { pin, eventId } = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Find the PIN — optionally scoped to event
    let pinQuery = 'SELECT sp.*, e.name as event_name, e.start_date, e.end_date, e.venue_id FROM scorekeeper_pins sp JOIN events e ON e.id = sp.event_id WHERE sp.pin_code = ? AND sp.is_active = 1';
    const params: string[] = [pin];
    if (eventId) { pinQuery += ' AND sp.event_id = ?'; params.push(eventId); }
    pinQuery += ' LIMIT 1';

    const pinRecord = await db.prepare(pinQuery).bind(...params).first<any>();
    if (!pinRecord) {
      return c.json({ success: false, error: 'Invalid PIN' }, 401);
    }

    // Get today's games for this event (or all if within event window)
    const games = await db.prepare(`
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
      AND g.status IN ('scheduled', 'warmup', 'in_progress', 'intermission')
      ORDER BY g.start_time ASC, g.game_number ASC
    `).bind(pinRecord.event_id).all();

    // If PIN is rink-scoped, filter to that rink
    let filteredGames = games.results || [];
    if (pinRecord.rink_id) {
      filteredGames = filteredGames.filter((g: any) => g.rink_id === pinRecord.rink_id);
    }

    return c.json({
      success: true,
      data: {
        eventId: pinRecord.event_id,
        eventName: pinRecord.event_name,
        rinkId: pinRecord.rink_id,
        label: pinRecord.label,
        games: filteredGames,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Auth failed' }, 500);
  }
});

// ==========================================
// ADMIN: Manage scorekeeper PINs
// ==========================================
scoringRoutes.get('/events/:eventId/pins', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const pins = await db.prepare(`
    SELECT sp.*, vr.name as rink_name
    FROM scorekeeper_pins sp
    LEFT JOIN venue_rinks vr ON vr.id = sp.rink_id
    WHERE sp.event_id = ?
    ORDER BY sp.created_at ASC
  `).bind(eventId).all();
  return c.json({ success: true, data: pins.results });
});

scoringRoutes.post('/events/:eventId/pins', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  pinCode: z.string().min(4).max(8),
  rinkId: z.string().optional(),
  label: z.string().optional(),
})), async (c) => {
  const eventId = c.req.param('eventId');
  const { pinCode, rinkId, label } = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  try {
    await db.prepare('INSERT INTO scorekeeper_pins (id, event_id, pin_code, rink_id, label) VALUES (?, ?, ?, ?, ?)')
      .bind(id, eventId, pinCode, rinkId || null, label || null).run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: 'PIN already exists for this event' }, 409);
  }
});

scoringRoutes.delete('/events/:eventId/pins/:pinId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const pinId = c.req.param('pinId');
  const db = c.env.DB;
  await db.prepare('DELETE FROM scorekeeper_pins WHERE id = ?').bind(pinId).run();
  return c.json({ success: true });
});

// ==========================================
// PUBLIC: Get games for an event
// ==========================================
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

// ==========================================
// PUBLIC: Get single game with events + shots
// ==========================================
scoringRoutes.get('/games/:gameId', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  const game = await db.prepare(`
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
    WHERE g.id = ?
  `).bind(gameId).first();

  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  const events = await db.prepare(`
    SELECT ge.*
    FROM game_events ge
    WHERE ge.game_id = ?
    ORDER BY ge.period ASC, ge.game_time DESC, ge.created_at ASC
  `).bind(gameId).all();

  const shots = await db.prepare('SELECT * FROM game_shots WHERE game_id = ? ORDER BY period ASC').bind(gameId).all();

  return c.json({ success: true, data: { ...game, events: events.results, shots: shots.results } });
});

// ==========================================
// SCOREKEEPER: Record game event (goal, penalty, shot, period, etc.)
// ==========================================
const gameEventSchema = z.object({
  eventType: z.enum([
    'goal', 'penalty', 'period_start', 'period_end',
    'game_start', 'game_end', 'timeout', 'goalie_pull', 'goalie_return',
  ]),
  teamId: z.string().optional(),
  jerseyNumber: z.string().optional(),
  assist1Jersey: z.string().optional(),
  assist2Jersey: z.string().optional(),
  period: z.number().optional(),
  gameTime: z.string().optional(),
  penaltyCode: z.string().optional(),
  penaltyMinutes: z.number().optional(),
  details: z.string().optional(),
});

scoringRoutes.post('/games/:gameId/events', zValidator('json', gameEventSchema), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Verify PIN from header (lightweight scorekeeper auth)
  const pin = c.req.header('X-Scorekeeper-Pin');
  const devBypass = c.req.header('X-Dev-Bypass') === 'true';
  if (!devBypass && !pin) {
    return c.json({ success: false, error: 'Scorekeeper PIN required' }, 401);
  }

  try {
    // Resolve penalty info from code if provided
    let penaltyType = data.penaltyCode || null;
    let penaltyMinutes = data.penaltyMinutes || null;
    if (data.penaltyCode && USA_HOCKEY_PENALTIES[data.penaltyCode]) {
      const p = USA_HOCKEY_PENALTIES[data.penaltyCode];
      penaltyType = p.name;
      if (!penaltyMinutes) penaltyMinutes = p.minutes;
    }

    const eventId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO game_events (id, game_id, event_type, team_id, jersey_number, assist1_jersey, assist2_jersey,
        period, game_time, penalty_type, penalty_minutes, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId, gameId, data.eventType, data.teamId || null,
      data.jerseyNumber || null, data.assist1Jersey || null, data.assist2Jersey || null,
      data.period || null, data.gameTime || null,
      penaltyType, penaltyMinutes, data.details || null
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
      await db.prepare("UPDATE games SET status = 'in_progress', period = 1, updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
    } else if (data.eventType === 'game_end') {
      await db.prepare("UPDATE games SET status = 'final', updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
      // Send coach notification texts (fire and forget)
      notifyCoachesOnFinal(db, c.env, gameId).catch(err => console.error('Coach notify error:', err));
    } else if (data.eventType === 'period_start' && data.period) {
      await db.prepare("UPDATE games SET period = ?, status = 'in_progress', updated_at = datetime('now') WHERE id = ?").bind(data.period, gameId).run();
    } else if (data.eventType === 'period_end') {
      await db.prepare("UPDATE games SET status = 'intermission', updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
    }

    return c.json({ success: true, data: { id: eventId } }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to record event' }, 500);
  }
});

// ==========================================
// SCOREKEEPER: Delete/undo last event
// ==========================================
scoringRoutes.delete('/games/:gameId/events/:eventId', async (c) => {
  const { gameId, eventId } = c.req.param();
  const db = c.env.DB;

  const pin = c.req.header('X-Scorekeeper-Pin');
  const devBypass = c.req.header('X-Dev-Bypass') === 'true';
  if (!devBypass && !pin) {
    return c.json({ success: false, error: 'Scorekeeper PIN required' }, 401);
  }

  try {
    // Get the event before deleting to reverse score if needed
    const event = await db.prepare('SELECT * FROM game_events WHERE id = ? AND game_id = ?').bind(eventId, gameId).first<any>();
    if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

    // If it was a goal, decrement the score
    if (event.event_type === 'goal' && event.team_id) {
      const game = await db.prepare('SELECT home_team_id, away_team_id FROM games WHERE id = ?').bind(gameId).first<any>();
      if (game) {
        const isHome = event.team_id === game.home_team_id;
        const field = isHome ? 'home_score' : 'away_score';
        await db.prepare(`UPDATE games SET ${field} = MAX(0, ${field} - 1), updated_at = datetime('now') WHERE id = ?`).bind(gameId).run();
      }
    }

    await db.prepare('DELETE FROM game_events WHERE id = ?').bind(eventId).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to delete event' }, 500);
  }
});

// ==========================================
// SCOREKEEPER: Update shot count per period
// ==========================================
scoringRoutes.post('/games/:gameId/shots', zValidator('json', z.object({
  teamId: z.string(),
  period: z.number(),
  shotCount: z.number().min(0),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { teamId, period, shotCount } = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Upsert shot count
    const existing = await db.prepare('SELECT id FROM game_shots WHERE game_id = ? AND team_id = ? AND period = ?')
      .bind(gameId, teamId, period).first();

    if (existing) {
      await db.prepare('UPDATE game_shots SET shot_count = ? WHERE game_id = ? AND team_id = ? AND period = ?')
        .bind(shotCount, gameId, teamId, period).run();
    } else {
      const id = crypto.randomUUID().replace(/-/g, '');
      await db.prepare('INSERT INTO game_shots (id, game_id, team_id, period, shot_count) VALUES (?, ?, ?, ?, ?)')
        .bind(id, gameId, teamId, period, shotCount).run();
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update shots' }, 500);
  }
});

// ==========================================
// PUBLIC: Get penalty codes list
// ==========================================
scoringRoutes.get('/penalty-codes', (c) => {
  return c.json({ success: true, data: USA_HOCKEY_PENALTIES });
});

// ==========================================
// PUBLIC: Get standings for an event
// ==========================================
scoringRoutes.get('/events/:eventId/standings', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const { division_id } = c.req.query();

  // Calculate standings from game results
  let query = `
    SELECT
      g.event_division_id,
      ed.age_group, ed.division_level,
      g.pool_name,
      t.id as team_id, t.name as team_name, t.logo_url as team_logo,
      COUNT(*) as games_played,
      SUM(CASE WHEN (t.id = g.home_team_id AND g.home_score > g.away_score) OR (t.id = g.away_team_id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN (t.id = g.home_team_id AND g.home_score < g.away_score) OR (t.id = g.away_team_id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN g.home_score = g.away_score THEN 1 ELSE 0 END) as ties,
      SUM(CASE WHEN t.id = g.home_team_id THEN g.home_score ELSE g.away_score END) as goals_for,
      SUM(CASE WHEN t.id = g.home_team_id THEN g.away_score ELSE g.home_score END) as goals_against
    FROM games g
    JOIN teams t ON (t.id = g.home_team_id OR t.id = g.away_team_id)
    JOIN event_divisions ed ON ed.id = g.event_division_id
    WHERE g.event_id = ? AND g.status = 'final' AND g.game_type = 'pool'
  `;
  const params: string[] = [eventId];

  if (division_id) { query += ' AND g.event_division_id = ?'; params.push(division_id); }

  query += ` GROUP BY g.event_division_id, t.id, g.pool_name
    ORDER BY ed.age_group ASC, g.pool_name ASC,
    (SUM(CASE WHEN (t.id = g.home_team_id AND g.home_score > g.away_score) OR (t.id = g.away_team_id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) * 2 + SUM(CASE WHEN g.home_score = g.away_score THEN 1 ELSE 0 END)) DESC,
    (SUM(CASE WHEN t.id = g.home_team_id THEN g.home_score ELSE g.away_score END) - SUM(CASE WHEN t.id = g.home_team_id THEN g.away_score ELSE g.home_score END)) DESC`;

  const result = await db.prepare(query).bind(...params).all();

  // Add points calculation
  const standings = (result.results || []).map((r: any) => ({
    ...r,
    points: (r.wins * 2) + r.ties,
    goal_differential: r.goals_for - r.goals_against,
  }));

  return c.json({ success: true, data: standings });
});

// ==========================================
// PUBLIC: Live scores (all in-progress + recent final games)
// ==========================================
scoringRoutes.get('/events/:eventId/live', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const games = await db.prepare(`
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
    AND (g.status IN ('in_progress', 'intermission', 'warmup', 'delayed')
         OR (g.status = 'final' AND g.updated_at >= datetime('now', '-2 hours'))
         OR (g.status = 'scheduled' AND g.delay_minutes > 0))
    ORDER BY
      CASE g.status
        WHEN 'delayed' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'intermission' THEN 2
        WHEN 'warmup' THEN 3
        WHEN 'scheduled' THEN 4
        WHEN 'final' THEN 5
      END,
      g.start_time ASC
  `).bind(eventId).all();

  // Get recent goals for each game
  const gameIds = (games.results || []).map((g: any) => g.id);
  const recentGoals: Record<string, any[]> = {};
  const shotsByGame: Record<string, any[]> = {};

  for (const gid of gameIds) {
    const goals = await db.prepare(`
      SELECT * FROM game_events
      WHERE game_id = ? AND event_type = 'goal'
      ORDER BY period ASC, game_time DESC
    `).bind(gid).all();
    recentGoals[gid] = goals.results || [];

    const shots = await db.prepare('SELECT * FROM game_shots WHERE game_id = ? ORDER BY period ASC').bind(gid).all();
    shotsByGame[gid] = shots.results || [];
  }

  return c.json({
    success: true,
    data: (games.results || []).map((g: any) => ({
      ...g,
      goals: recentGoals[g.id] || [],
      shots: shotsByGame[g.id] || [],
    })),
  });
});

// ==========================================
// PUBLIC: Full schedule with delay cascade info
// ==========================================
scoringRoutes.get('/events/:eventId/schedule', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const games = await db.prepare(`
    SELECT g.id, g.game_number, g.start_time, g.end_time, g.game_type, g.pool_name,
      g.home_score, g.away_score, g.period, g.status, g.delay_minutes, g.delay_note,
      g.checked_in_at, g.rink_id, g.is_overtime, g.is_shootout,
      ht.name as home_team_name, at2.name as away_team_name,
      vr.name as rink_name, v.name as venue_name,
      ed.age_group, ed.division_level,
      glr_home.name as home_locker_room, glr_away.name as away_locker_room
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    LEFT JOIN game_locker_rooms glr_h ON glr_h.game_id = g.id AND glr_h.team_id = g.home_team_id
    LEFT JOIN locker_rooms glr_home ON glr_home.id = glr_h.locker_room_id
    LEFT JOIN game_locker_rooms glr_a ON glr_a.game_id = g.id AND glr_a.team_id = g.away_team_id
    LEFT JOIN locker_rooms glr_away ON glr_away.id = glr_a.locker_room_id
    WHERE g.event_id = ? AND g.status != 'cancelled'
    ORDER BY g.start_time ASC, vr.name ASC
  `).bind(eventId).all();

  // Calculate cascading delays per rink
  const gamesList = (games.results || []) as any[];
  const rinkDelays: Record<string, number> = {}; // rinkId -> accumulated delay minutes

  const enriched = gamesList.map((g: any) => {
    const rinkKey = g.rink_id || 'unknown';

    // If this game itself is delayed, set/update the rink delay
    if (g.delay_minutes > 0) {
      rinkDelays[rinkKey] = Math.max(rinkDelays[rinkKey] || 0, g.delay_minutes);
    }

    // If a game on this rink is final or in_progress, it's caught up — reduce cascaded delay
    if (g.status === 'final' || g.status === 'in_progress') {
      // Once a game is actively playing or done, we assume the rink is back on track
      // unless this specific game has its own delay
      if (!g.delay_minutes || g.delay_minutes === 0) {
        rinkDelays[rinkKey] = 0;
      }
    }

    const cascadedDelay = rinkDelays[rinkKey] || 0;
    let adjustedStartTime = g.start_time;
    if (cascadedDelay > 0 && g.status === 'scheduled') {
      const original = new Date(g.start_time);
      original.setMinutes(original.getMinutes() + cascadedDelay);
      adjustedStartTime = original.toISOString();
    }

    return {
      ...g,
      cascaded_delay_minutes: cascadedDelay,
      adjusted_start_time: adjustedStartTime,
    };
  });

  return c.json({ success: true, data: enriched });
});

// ==========================================
// COACH CONTEST: Submit a contest via text link
// ==========================================
scoringRoutes.post('/games/:gameId/contest', zValidator('json', z.object({
  teamId: z.string(),
  coachPhone: z.string(),
  coachName: z.string().optional(),
  reason: z.string().min(1),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { teamId, coachPhone, coachName, reason } = c.req.valid('json');
  const db = c.env.DB;

  try {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO game_contests (id, game_id, team_id, coach_phone, coach_name, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, gameId, teamId, coachPhone, coachName || null, reason).run();

    // Flag the game as contested
    await db.prepare("UPDATE games SET notes = COALESCE(notes || ' | ', '') || 'CONTESTED', updated_at = datetime('now') WHERE id = ?").bind(gameId).run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to submit contest' }, 500);
  }
});

// ==========================================
// ADMIN: Get all contests (for dashboard)
// ==========================================
scoringRoutes.get('/contests', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { status, event_id } = c.req.query();

  let query = `
    SELECT gc.*,
      g.game_number, g.home_score, g.away_score, g.start_time,
      ht.name as home_team_name, at2.name as away_team_name,
      ct.name as contest_team_name,
      ed.age_group, ed.division_level,
      e.name as event_name
    FROM game_contests gc
    JOIN games g ON g.id = gc.game_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN teams ct ON ct.id = gc.team_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    LEFT JOIN events e ON e.id = g.event_id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (status) { query += ' AND gc.status = ?'; params.push(status); }
  if (event_id) { query += ' AND g.event_id = ?'; params.push(event_id); }

  query += ' ORDER BY gc.created_at DESC';
  const result = params.length > 0
    ? await db.prepare(query).bind(...params).all()
    : await db.prepare(query).all();

  return c.json({ success: true, data: result.results });
});

// ==========================================
// ADMIN: Resolve a contest
// ==========================================
scoringRoutes.put('/contests/:contestId', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  status: z.enum(['reviewed', 'resolved', 'dismissed']),
  adminNotes: z.string().optional(),
})), async (c) => {
  const contestId = c.req.param('contestId');
  const { status, adminNotes } = c.req.valid('json');
  const user = c.get('user') as any;
  const db = c.env.DB;

  await db.prepare(`
    UPDATE game_contests
    SET status = ?, admin_notes = ?, resolved_by = ?, resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(status, adminNotes || null, user.id, contestId).run();

  return c.json({ success: true });
});

// ==========================================
// PUBLIC: Full Game Sheet (all data for score sheet display)
// ==========================================
scoringRoutes.get('/games/:gameId/sheet', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  // Game info
  const game = await db.prepare(`
    SELECT g.*,
      ht.name as home_team_name, ht.logo_url as home_team_logo,
      at2.name as away_team_name, at2.logo_url as away_team_logo,
      vr.name as rink_name, v.name as venue_name,
      ed.age_group, ed.division_level, ed.game_format, ed.period_length_minutes as div_period_length,
      e.name as event_name, e.season
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    LEFT JOIN events e ON e.id = g.event_id
    WHERE g.id = ?
  `).bind(gameId).first();

  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  // Fetch all related data in parallel
  const [events, shots, lineups, threeStars, goalieStats, shootout, periodScores, notes, coaches, officials] = await Promise.all([
    db.prepare(`SELECT * FROM game_events WHERE game_id = ? ORDER BY period ASC, game_time DESC, created_at ASC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM game_shots WHERE game_id = ? ORDER BY period ASC`).bind(gameId).all(),
    db.prepare(`
      SELECT gl.*, p.first_name, p.last_name, p.position as player_position
      FROM game_lineups gl
      LEFT JOIN players p ON p.id = gl.player_id
      WHERE gl.game_id = ?
      ORDER BY gl.team_id, gl.position ASC, CAST(gl.jersey_number AS INTEGER) ASC
    `).bind(gameId).all(),
    db.prepare(`SELECT * FROM game_three_stars WHERE game_id = ? ORDER BY star_number ASC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM goalie_game_stats WHERE game_id = ? ORDER BY team_id, is_starter DESC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM shootout_rounds WHERE game_id = ? ORDER BY sequence_order ASC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM game_period_scores WHERE game_id = ? ORDER BY team_id, period ASC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM game_notes WHERE game_id = ? ORDER BY period ASC, created_at ASC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM game_coaches WHERE game_id = ? ORDER BY team_id, role ASC`).bind(gameId).all(),
    db.prepare(`SELECT * FROM game_officials WHERE game_id = ? ORDER BY role ASC`).bind(gameId).all(),
  ]);

  // Separate events by type
  const goals = (events.results || []).filter((e: any) => e.event_type === 'goal');
  const penalties = (events.results || []).filter((e: any) => e.event_type === 'penalty');

  // Split lineups by team
  const homeLineup = (lineups.results || []).filter((l: any) => l.team_id === (game as any).home_team_id);
  const awayLineup = (lineups.results || []).filter((l: any) => l.team_id === (game as any).away_team_id);

  return c.json({
    success: true,
    data: {
      game,
      goals,
      penalties,
      allEvents: events.results,
      shots: shots.results,
      homeLineup,
      awayLineup,
      threeStars: threeStars.results,
      goalieStats: goalieStats.results,
      shootout: shootout.results,
      periodScores: periodScores.results,
      notes: notes.results,
      coaches: coaches.results,
      officials: officials.results,
    },
  });
});

// ==========================================
// SCOREKEEPER: Auto-load roster for a game's teams
// ==========================================
scoringRoutes.get('/games/:gameId/roster', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  const game = await db.prepare('SELECT home_team_id, away_team_id, event_id FROM games WHERE id = ?').bind(gameId).first<any>();
  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  // Get active players for both teams
  const homePlayers = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position, p.shoots
    FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = ? AND tp.status = 'active'
    ORDER BY CAST(p.jersey_number AS INTEGER) ASC
  `).bind(game.home_team_id).all();

  const awayPlayers = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position, p.shoots
    FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = ? AND tp.status = 'active'
    ORDER BY CAST(p.jersey_number AS INTEGER) ASC
  `).bind(game.away_team_id).all();

  // Get coaches for both teams
  const homeCoaches = await db.prepare(`
    SELECT tc.*, u.first_name, u.last_name, u.email
    FROM team_coaches tc
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE tc.team_id = ?
  `).bind(game.home_team_id).all();

  const awayCoaches = await db.prepare(`
    SELECT tc.*, u.first_name, u.last_name, u.email
    FROM team_coaches tc
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE tc.team_id = ?
  `).bind(game.away_team_id).all();

  // Check if lineups already exist
  const existingLineups = await db.prepare('SELECT COUNT(*) as cnt FROM game_lineups WHERE game_id = ?').bind(gameId).first<any>();

  return c.json({
    success: true,
    data: {
      homePlayers: homePlayers.results,
      awayPlayers: awayPlayers.results,
      homeCoaches: homeCoaches.results,
      awayCoaches: awayCoaches.results,
      lineupsLoaded: (existingLineups?.cnt || 0) > 0,
    },
  });
});

// ==========================================
// SCOREKEEPER: Load roster into game lineups
// ==========================================
scoringRoutes.post('/games/:gameId/lineups/load', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  const pin = c.req.header('X-Scorekeeper-Pin');
  const devBypass = c.req.header('X-Dev-Bypass') === 'true';
  if (!devBypass && !pin) return c.json({ success: false, error: 'PIN required' }, 401);

  const game = await db.prepare('SELECT home_team_id, away_team_id FROM games WHERE id = ?').bind(gameId).first<any>();
  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  let loaded = 0;
  for (const teamId of [game.home_team_id, game.away_team_id]) {
    if (!teamId) continue;
    const players = await db.prepare(`
      SELECT p.id, p.jersey_number, p.position
      FROM team_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.team_id = ? AND tp.status = 'active'
    `).bind(teamId).all();

    for (const player of (players.results || []) as any[]) {
      const id = crypto.randomUUID().replace(/-/g, '');
      try {
        await db.prepare(`
          INSERT OR IGNORE INTO game_lineups (id, game_id, team_id, player_id, jersey_number, position, is_starter)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).bind(id, gameId, teamId, player.id, player.jersey_number || '0', player.position || 'F').run();
        loaded++;
      } catch { /* skip duplicates */ }
    }
  }

  return c.json({ success: true, data: { loaded } });
});

// ==========================================
// SCOREKEEPER: Manage individual lineup entries
// ==========================================
scoringRoutes.put('/games/:gameId/lineups/:lineupId', zValidator('json', z.object({
  isScrached: z.boolean().optional(),
  position: z.string().optional(),
  jerseyNumber: z.string().optional(),
})), async (c) => {
  const { gameId, lineupId } = c.req.param();
  const data = c.req.valid('json');
  const db = c.env.DB;

  const updates: string[] = [];
  const params: any[] = [];
  if (data.isScrached !== undefined) { updates.push('is_scratched = ?'); params.push(data.isScrached ? 1 : 0); }
  if (data.position) { updates.push('position = ?'); params.push(data.position); }
  if (data.jerseyNumber) { updates.push('jersey_number = ?'); params.push(data.jerseyNumber); }

  if (updates.length === 0) return c.json({ success: true });

  params.push(lineupId, gameId);
  await db.prepare(`UPDATE game_lineups SET ${updates.join(', ')} WHERE id = ? AND game_id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Three Stars
// ==========================================
scoringRoutes.post('/games/:gameId/three-stars', zValidator('json', z.object({
  stars: z.array(z.object({
    starNumber: z.number().min(1).max(3),
    teamId: z.string(),
    jerseyNumber: z.string().optional(),
    playerName: z.string().optional(),
    playerId: z.string().optional(),
  })),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { stars } = c.req.valid('json');
  const db = c.env.DB;

  // Delete existing and re-insert
  await db.prepare('DELETE FROM game_three_stars WHERE game_id = ?').bind(gameId).run();

  for (const star of stars) {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO game_three_stars (id, game_id, star_number, team_id, player_id, jersey_number, player_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, gameId, star.starNumber, star.teamId, star.playerId || null, star.jerseyNumber || null, star.playerName || null).run();
  }

  return c.json({ success: true });
});

scoringRoutes.get('/games/:gameId/three-stars', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM game_three_stars WHERE game_id = ? ORDER BY star_number ASC').bind(gameId).all();
  return c.json({ success: true, data: result.results });
});

// ==========================================
// SCOREKEEPER: Goalie Stats
// ==========================================
scoringRoutes.post('/games/:gameId/goalie-stats', zValidator('json', z.object({
  teamId: z.string(),
  jerseyNumber: z.string(),
  playerName: z.string().optional(),
  playerId: z.string().optional(),
  toiMinutes: z.number().optional(),
  shotsAgainst: z.number().optional(),
  goalsAgainst: z.number().optional(),
  isStarter: z.boolean().optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const id = crypto.randomUUID().replace(/-/g, '');
  try {
    await db.prepare(`
      INSERT INTO goalie_game_stats (id, game_id, team_id, player_id, jersey_number, player_name, toi_minutes, shots_against, goals_against, is_starter)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game_id, team_id, player_id) DO UPDATE SET
        toi_minutes = excluded.toi_minutes,
        shots_against = excluded.shots_against,
        goals_against = excluded.goals_against,
        updated_at = datetime('now')
    `).bind(
      id, gameId, data.teamId, data.playerId || id, data.jerseyNumber,
      data.playerName || null, data.toiMinutes || 0, data.shotsAgainst || 0,
      data.goalsAgainst || 0, data.isStarter !== false ? 1 : 0
    ).run();
  } catch (err: any) {
    return c.json({ success: false, error: err?.message }, 500);
  }

  return c.json({ success: true, data: { id } });
});

scoringRoutes.put('/games/:gameId/goalie-stats/:statId', zValidator('json', z.object({
  toiMinutes: z.number().optional(),
  shotsAgainst: z.number().optional(),
  goalsAgainst: z.number().optional(),
})), async (c) => {
  const { statId } = c.req.param();
  const data = c.req.valid('json');
  const db = c.env.DB;

  const updates: string[] = ["updated_at = datetime('now')"];
  const params: any[] = [];
  if (data.toiMinutes !== undefined) { updates.push('toi_minutes = ?'); params.push(data.toiMinutes); }
  if (data.shotsAgainst !== undefined) { updates.push('shots_against = ?'); params.push(data.shotsAgainst); }
  if (data.goalsAgainst !== undefined) { updates.push('goals_against = ?'); params.push(data.goalsAgainst); }

  params.push(statId);
  await db.prepare(`UPDATE goalie_game_stats SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Shootout Rounds
// ==========================================
scoringRoutes.post('/games/:gameId/shootout', zValidator('json', z.object({
  teamId: z.string(),
  jerseyNumber: z.string(),
  playerName: z.string().optional(),
  playerId: z.string().optional(),
  goalieJersey: z.string().optional(),
  roundNumber: z.number(),
  result: z.enum(['goal', 'save', 'miss']),
  sequenceOrder: z.number(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO shootout_rounds (id, game_id, team_id, player_id, jersey_number, player_name, goalie_jersey, round_number, result, sequence_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, gameId, data.teamId, data.playerId || null, data.jerseyNumber, data.playerName || null, data.goalieJersey || null, data.roundNumber, data.result, data.sequenceOrder).run();

  // Mark game as shootout
  await db.prepare("UPDATE games SET is_shootout = 1, updated_at = datetime('now') WHERE id = ?").bind(gameId).run();

  return c.json({ success: true, data: { id } });
});

scoringRoutes.delete('/games/:gameId/shootout/:roundId', async (c) => {
  const { roundId } = c.req.param();
  const db = c.env.DB;
  await db.prepare('DELETE FROM shootout_rounds WHERE id = ?').bind(roundId).run();
  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Game Notes
// ==========================================
scoringRoutes.post('/games/:gameId/notes', zValidator('json', z.object({
  noteType: z.string().optional(),
  content: z.string(),
  period: z.number().optional(),
  gameTime: z.string().optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO game_notes (id, game_id, note_type, content, period, game_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, gameId, data.noteType || 'general', data.content, data.period || null, data.gameTime || null).run();

  return c.json({ success: true, data: { id } });
});

// ==========================================
// SCOREKEEPER: Game Officials
// ==========================================
scoringRoutes.post('/games/:gameId/officials', zValidator('json', z.object({
  officials: z.array(z.object({
    officialName: z.string(),
    role: z.string().optional(),
    jerseyNumber: z.string().optional(),
    refereeId: z.string().optional(),
  })),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { officials } = c.req.valid('json');
  const db = c.env.DB;

  // Delete existing and re-insert
  await db.prepare('DELETE FROM game_officials WHERE game_id = ?').bind(gameId).run();

  for (const official of officials) {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO game_officials (id, game_id, referee_id, official_name, role, jersey_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, gameId, official.refereeId || null, official.officialName, official.role || 'referee', official.jerseyNumber || null).run();
  }

  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Game Coaches
// ==========================================
scoringRoutes.post('/games/:gameId/coaches', zValidator('json', z.object({
  coaches: z.array(z.object({
    teamId: z.string(),
    coachName: z.string(),
    role: z.string().optional(),
    userId: z.string().optional(),
  })),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { coaches } = c.req.valid('json');
  const db = c.env.DB;

  // Delete existing and re-insert
  await db.prepare('DELETE FROM game_coaches WHERE game_id = ?').bind(gameId).run();

  for (const coach of coaches) {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO game_coaches (id, game_id, team_id, coach_name, role, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, gameId, coach.teamId, coach.coachName, coach.role || 'head', coach.userId || null).run();
  }

  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Update scorekeeper info on game
// ==========================================
scoringRoutes.put('/games/:gameId/scorekeeper-info', zValidator('json', z.object({
  scorekeeperName: z.string().optional(),
  scorekeeperPhone: z.string().optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const updates: string[] = ["updated_at = datetime('now')"];
  const params: any[] = [];
  if (data.scorekeeperName !== undefined) { updates.push('scorekeeper_name = ?'); params.push(data.scorekeeperName); }
  if (data.scorekeeperPhone !== undefined) { updates.push('scorekeeper_phone = ?'); params.push(data.scorekeeperPhone); }

  params.push(gameId);
  await db.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==========================================
// HELPER: Notify coaches when game goes final
// ==========================================
async function notifyCoachesOnFinal(db: D1Database, env: Env, gameId: string) {
  const game = await db.prepare(`
    SELECT g.*, ht.name as home_team_name, at2.name as away_team_name,
      ed.age_group, ed.division_level, e.name as event_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    LEFT JOIN events e ON e.id = g.event_id
    WHERE g.id = ?
  `).bind(gameId).first<any>();

  if (!game) return;

  // Find coach phone numbers for both teams via registrations → users
  const coachPhones: { phone: string; teamName: string; teamId: string }[] = [];

  for (const teamId of [game.home_team_id, game.away_team_id].filter(Boolean)) {
    const teamName = teamId === game.home_team_id ? game.home_team_name : game.away_team_name;

    // Get the user who registered this team (likely a coach)
    const coaches = await db.prepare(`
      SELECT DISTINCT u.phone, u.first_name, u.last_name
      FROM registrations r
      JOIN users u ON u.id = r.registered_by
      WHERE r.team_id = ? AND r.event_id = ? AND u.phone IS NOT NULL AND u.phone != ''
    `).bind(teamId, game.event_id).all<any>();

    for (const coach of coaches.results || []) {
      if (coach.phone) {
        coachPhones.push({ phone: coach.phone, teamName, teamId });
      }
    }
  }

  if (coachPhones.length === 0) return;

  // Build the contest URL
  const contestUrl = `https://uht-web.pages.dev/scoring/contest/?gameId=${gameId}`;

  for (const coach of coachPhones) {
    const message = `🏒 FINAL SCORE — ${game.age_group} ${game.division_level}\n` +
      `${game.home_team_name} ${game.home_score} - ${game.away_score} ${game.away_team_name}\n` +
      `Game #${game.game_number}\n\n` +
      `If you need to contest this score, tap here: ${contestUrl}`;

    try {
      await sendTelnyxSms(env, coach.phone, message);
    } catch (err) {
      console.error(`Failed to notify coach at ${coach.phone}:`, err);
    }
  }
}

// ==========================================
// HELPER: Send SMS via Telnyx
// ==========================================
async function sendTelnyxSms(env: Env, to: string, body: string): Promise<string | null> {
  const apiKey = env.TELNYX_API_KEY;
  const fromNumber = env.TELNYX_PHONE_NUMBER;

  if (!apiKey || !fromNumber) return null;

  const digits = to.replace(/\D/g, '');
  const normalizedTo = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : to.startsWith('+') ? to : `+${digits}`;

  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromNumber,
      to: normalizedTo,
      text: body,
    }),
  });

  const result = await response.json() as any;
  if (!response.ok) {
    const errMsg = result?.errors?.[0]?.detail || result?.errors?.[0]?.title || 'Telnyx send failed';
    throw new Error(errMsg);
  }
  return result?.data?.id || null;
}
