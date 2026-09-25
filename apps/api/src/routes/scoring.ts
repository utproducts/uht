import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { verifyGameWriteAccess, verifySheetReadAccess } from '../lib/game-access';
import { computeStandings, resolveBracketGames } from '../lib/standings';
import { notifyGameFinalPush, notifyGameDelayPush, notifyGameStartPush, notifyScoresheetPush, notifyThreeStarsPush } from '../lib/push';
import { autoAssignThreeStars } from '../lib/three-stars';

export const scoringRoutes = new Hono<{ Bindings: Env }>();

// Gate for score-writing endpoints: validated event PIN, or a JWT whose user
// holds admin/director/scorekeeper (fresh from DB). See lib/game-access.ts.
// Workers terminates floating promises when the response returns — background
// work (bracket resolution, coach SMS) must go through executionCtx.waitUntil.
function keepAlive(c: any, p: Promise<any>) {
  const guarded = p.catch((err: any) => console.error('Background task error:', err));
  try { c.executionCtx.waitUntil(guarded); } catch { /* non-Workers env — let it float */ }
}

const scorekeeperOrStaff = async (c: any, next: any) => {
  const access = await verifyGameWriteAccess(c, c.req.param('gameId'));
  if (!access.ok) {
    return c.json({ success: false, error: access.error }, (access.status || 401) as any);
  }
  await next();
};

// ==========================================
// USA HOCKEY PENALTY CODES
// ==========================================
const USA_HOCKEY_PENALTIES: Record<string, { name: string; minutes: number; category: string }> = {
  // Minors (2 min)
  'BOARD': { name: 'Boarding', minutes: 2, category: 'minor' },
  'BODYCHK': { name: 'Body Checking (Non-Check)', minutes: 2, category: 'minor' },
  'BRKSTK': { name: 'Broken Stick', minutes: 2, category: 'minor' },
  'CHARGE': { name: 'Charging', minutes: 2, category: 'minor' },
  'CLIP': { name: 'Clipping', minutes: 2, category: 'minor' },
  'CROSS': { name: 'Cross-Checking', minutes: 2, category: 'minor' },
  'DELAY': { name: 'Delay of Game', minutes: 2, category: 'minor' },
  'DIVE': { name: 'Diving / Embellishment', minutes: 2, category: 'minor' },
  'ELBOW': { name: 'Elbowing', minutes: 2, category: 'minor' },
  'EQUIP': { name: 'Equipment Violation', minutes: 2, category: 'minor' },
  'FACEMASK': { name: 'Holding the Facemask', minutes: 2, category: 'minor' },
  'GOALI': { name: 'Goalkeeper Interference', minutes: 2, category: 'minor' },
  'HANDPUCK': { name: 'Closing Hand on Puck', minutes: 2, category: 'minor' },
  'HC': { name: 'Head Contact', minutes: 2, category: 'minor' },
  'HE': { name: 'Head or Neck Restraint', minutes: 2, category: 'minor' },
  'HIGHST': { name: 'High-Sticking', minutes: 2, category: 'minor' },
  'HOLD': { name: 'Holding', minutes: 2, category: 'minor' },
  'HOLDST': { name: 'Holding the Stick', minutes: 2, category: 'minor' },
  'HOOK': { name: 'Hooking', minutes: 2, category: 'minor' },
  'INTER': { name: 'Interference', minutes: 2, category: 'minor' },
  'KNEE': { name: 'Kneeing', minutes: 2, category: 'minor' },
  'LATEHIT': { name: 'Late Hit', minutes: 2, category: 'minor' },
  'LEAVEBENCH': { name: 'Leaving the Bench', minutes: 2, category: 'minor' },
  'ROUGH': { name: 'Roughing', minutes: 2, category: 'minor' },
  'SLASH': { name: 'Slashing', minutes: 2, category: 'minor' },
  'SLEW': { name: 'Slew Footing', minutes: 2, category: 'minor' },
  'SPEAR': { name: 'Spearing', minutes: 2, category: 'minor' },
  'THROWSTK': { name: 'Throwing Stick', minutes: 2, category: 'minor' },
  'TRIP': { name: 'Tripping', minutes: 2, category: 'minor' },
  'UNSPORT': { name: 'Unsportsmanlike Conduct', minutes: 2, category: 'minor' },
  'BENCH': { name: 'Bench Minor', minutes: 2, category: 'minor' },
  'TOOMANY': { name: 'Too Many Players', minutes: 2, category: 'minor' },
  // Double minors (4 min)
  'HC4': { name: 'Head Contact (Double)', minutes: 4, category: 'double' },
  'HIGHST4': { name: 'High-Sticking (Double)', minutes: 4, category: 'double' },
  'BUTT4': { name: 'Butt-Ending (Double)', minutes: 4, category: 'double' },
  'SPEAR4': { name: 'Spearing (Double)', minutes: 4, category: 'double' },
  // Majors (5 min)
  'BOARD5': { name: 'Boarding (Major)', minutes: 5, category: 'major' },
  'CHARGE5': { name: 'Charging (Major)', minutes: 5, category: 'major' },
  'CHECK5': { name: 'Checking from Behind (Major)', minutes: 5, category: 'major' },
  'CLIP5': { name: 'Clipping (Major)', minutes: 5, category: 'major' },
  'CROSS5': { name: 'Cross-Checking (Major)', minutes: 5, category: 'major' },
  'ELBOW5': { name: 'Elbowing (Major)', minutes: 5, category: 'major' },
  'FIGHT': { name: 'Fighting', minutes: 5, category: 'major' },
  'FACEMASK5': { name: 'Grabbing Facemask (Major)', minutes: 5, category: 'major' },
  'HIGHST5': { name: 'High-Sticking (Major)', minutes: 5, category: 'major' },
  'INTER5': { name: 'Interference (Major)', minutes: 5, category: 'major' },
  'KNEE5': { name: 'Kneeing (Major)', minutes: 5, category: 'major' },
  'ROUGH5': { name: 'Roughing (Major)', minutes: 5, category: 'major' },
  'SLASH5': { name: 'Slashing (Major)', minutes: 5, category: 'major' },
  'SPEAR5': { name: 'Spearing (Major)', minutes: 5, category: 'major' },
  // Misconducts (10 min)
  'MISC': { name: 'Misconduct', minutes: 10, category: 'misconduct' },
  'UNSPORTM': { name: 'Unsportsmanlike Misconduct', minutes: 10, category: 'misconduct' },
  'ABUSE': { name: 'Abuse of Officials', minutes: 10, category: 'misconduct' },
  'HCM': { name: 'Head Contact Misconduct', minutes: 10, category: 'misconduct' },
  // Game misconducts
  'GMSC': { name: 'Game Misconduct', minutes: 10, category: 'game_misconduct' },
  'ABUSEGM': { name: 'Abuse of Officials (Game)', minutes: 10, category: 'game_misconduct' },
  'CHECKGM': { name: 'Checking from Behind (Game)', minutes: 10, category: 'game_misconduct' },
  // Match penalties (ejection)
  'MATCH': { name: 'Match - Attempt to Injure', minutes: 5, category: 'match' },
  'HEADBUTT': { name: 'Head-Butting (Match)', minutes: 5, category: 'match' },
  'KICK': { name: 'Kicking (Match)', minutes: 5, category: 'match' },
  'BUTTM': { name: 'Butt-Ending (Match)', minutes: 5, category: 'match' },
  'SPEARM': { name: 'Spearing (Match)', minutes: 5, category: 'match' },
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
        COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
        COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
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
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
      COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
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
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
      COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
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
  // .nullable() everywhere: the web console sends explicit nulls for skipped
  // fields (assists especially), and plain .optional() rejected them - every
  // console goal without both assists 400'd silently (found 9/21 with Johnny)
  teamId: z.string().nullable().optional(),
  jerseyNumber: z.string().nullable().optional(),
  assist1Jersey: z.string().nullable().optional(),
  assist2Jersey: z.string().nullable().optional(),
  period: z.number().nullable().optional(),
  gameTime: z.string().nullable().optional(),
  penaltyCode: z.string().nullable().optional(),
  penaltyMinutes: z.number().nullable().optional(),
  details: z.string().nullable().optional(),
  goalieJersey: z.string().nullable().optional(), // goalie the goal was scored on; 'EN' = empty net
});

scoringRoutes.post('/games/:gameId/events', zValidator('json', gameEventSchema), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Verify auth: PIN header, JWT Bearer token, or dev bypass
  const access = await verifyGameWriteAccess(c, gameId);
  if (!access.ok) {
    return c.json({ success: false, error: access.error }, (access.status || 401) as any);
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
        period, game_time, penalty_type, penalty_minutes, details, goalie_jersey)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId, gameId, data.eventType, data.teamId || null,
      data.jerseyNumber || null, data.assist1Jersey || null, data.assist2Jersey || null,
      data.period || null, data.gameTime || null,
      penaltyType, penaltyMinutes, data.details || null, data.goalieJersey || null
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
      // "Starting now" push to both teams' followers (idempotent)
      keepAlive(c, notifyGameStartPush(db, gameId));
    } else if (data.eventType === 'game_end') {
      await db.prepare("UPDATE games SET status = 'final', updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
      // Coach texts + bracket auto-advance, kept alive past the response
      keepAlive(c, notifyCoachesOnFinal(db, c.env, gameId));
      keepAlive(c, db.prepare('SELECT event_id FROM games WHERE id = ?').bind(gameId).first<any>()
        .then((g: any) => g && resolveBracketGames(db, g.event_id)));
      keepAlive(c, notifyGameFinalPush(db, gameId));
      keepAlive(c, notifyScoresheetPush(db, gameId));
      keepAlive(c, autoAssignThreeStars(db, gameId).then(() => notifyThreeStarsPush(db, gameId)));
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
// SCOREKEEPER: Edit a recorded goal/penalty line
// ==========================================
scoringRoutes.put('/games/:gameId/events/:eventId', zValidator('json', z.object({
  jerseyNumber: z.string().nullable().optional(),
  assist1Jersey: z.string().nullable().optional(),
  assist2Jersey: z.string().nullable().optional(),
  period: z.number().nullable().optional(),
  gameTime: z.string().nullable().optional(),
  penaltyCode: z.string().nullable().optional(),
  penaltyMinutes: z.number().nullable().optional(),
  goalieJersey: z.string().nullable().optional(),
})), async (c) => {
  const { gameId, eventId } = c.req.param();
  const data = c.req.valid('json');
  const db = c.env.DB;

  const access = await verifyGameWriteAccess(c, gameId);
  if (!access.ok) {
    return c.json({ success: false, error: access.error }, (access.status || 401) as any);
  }

  const updates: string[] = [];
  const params: any[] = [];
  const set = (col: string, val: any) => { updates.push(`${col} = ?`); params.push(val); };
  if (data.jerseyNumber !== undefined) set('jersey_number', data.jerseyNumber);
  if (data.assist1Jersey !== undefined) set('assist1_jersey', data.assist1Jersey);
  if (data.assist2Jersey !== undefined) set('assist2_jersey', data.assist2Jersey);
  if (data.period !== undefined && data.period !== null) set('period', data.period);
  if (data.gameTime !== undefined) set('game_time', data.gameTime);
  if (data.goalieJersey !== undefined) set('goalie_jersey', data.goalieJersey);
  if (data.penaltyCode !== undefined && data.penaltyCode) {
    const p = USA_HOCKEY_PENALTIES[data.penaltyCode];
    set('penalty_type', p ? p.name : data.penaltyCode);
    set('penalty_minutes', data.penaltyMinutes ?? (p ? p.minutes : null));
  } else if (data.penaltyMinutes !== undefined) {
    set('penalty_minutes', data.penaltyMinutes);
  }
  if (updates.length === 0) return c.json({ success: true });

  params.push(eventId, gameId);
  await db.prepare(`UPDATE game_events SET ${updates.join(', ')} WHERE id = ? AND game_id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Delete/undo last event
// ==========================================
scoringRoutes.delete('/games/:gameId/events/:eventId', async (c) => {
  const { gameId, eventId } = c.req.param();
  const db = c.env.DB;

  const access = await verifyGameWriteAccess(c, gameId);
  if (!access.ok) {
    return c.json({ success: false, error: access.error }, (access.status || 401) as any);
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
scoringRoutes.post('/games/:gameId/shots', scorekeeperOrStaff, zValidator('json', z.object({
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

  // Tiebreaker-aware standings (lib/standings.ts): points, head-to-head,
  // wins, goal diff, fewest GA, most GF. Teams with no finals yet appear
  // with zeros so pre-tournament standings aren't empty. Response keeps the
  // legacy flat-array field names the web and app clients already read.
  try {
    const { standings } = await computeStandings(db, eventId, division_id || undefined);
    return c.json({ success: true, data: standings });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to compute standings' }, 500);
  }
});

// ==========================================
// ADMIN: Force bracket resolution (also runs automatically on every final)
// ==========================================
scoringRoutes.post('/events/:eventId/resolve-bracket', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const body = await c.req.json().catch(() => ({})) as { force?: boolean };
  try {
    const result = await resolveBracketGames(c.env.DB, eventId as string, { force: !!body.force });
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to resolve bracket' }, 500);
  }
});

// ==========================================
// PUBLIC: Live scores (all in-progress + recent final games)
// ==========================================
scoringRoutes.get('/events/:eventId/live', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const games = await db.prepare(`
    SELECT g.*,
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
      COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
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
      g.delay_status, g.delay_reason,
      g.checked_in_at, g.rink_id, g.is_overtime, g.is_shootout,
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name,
      ht.logo_url as home_team_logo, at2.logo_url as away_team_logo,
      vr.name as rink_name, v.name as venue_name,
      ed.age_group, ed.division_level,
      COALESCE(glr_home.name, g.home_locker_room) as home_locker_room,
      COALESCE(glr_away.name, g.away_locker_room) as away_locker_room
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
// ADMIN: Set game delay status
// ==========================================
scoringRoutes.put('/games/:gameId/delay', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  delayStatus: z.enum(['delayed', 'on_time']).nullable(),
  delayReason: z.string().optional().nullable(),
  delayMinutes: z.number().min(0).optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { delayStatus, delayReason, delayMinutes } = c.req.valid('json');
  const db = c.env.DB;

  try {
    const game = await db.prepare('SELECT id FROM games WHERE id = ?').bind(gameId).first();
    if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

    const updates: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    // Update delay_status column
    updates.push('delay_status = ?');
    params.push(delayStatus || null);

    // Update delay_reason column
    updates.push('delay_reason = ?');
    params.push(delayReason || null);

    // Update legacy delay_note with the reason too
    updates.push('delay_note = ?');
    params.push(delayReason || null);

    // Update delay_minutes if provided
    if (delayMinutes !== undefined) {
      updates.push('delay_minutes = ?');
      params.push(delayMinutes);
    } else if (delayStatus === 'delayed') {
      // Default to 15 min delay if not specified
      updates.push('delay_minutes = ?');
      params.push(15);
    } else if (!delayStatus || delayStatus === 'on_time') {
      updates.push('delay_minutes = ?');
      params.push(0);
    }

    // If marking delayed, also update game status
    if (delayStatus === 'delayed') {
      updates.push('status = ?');
      params.push('delayed');
    } else if (delayStatus === 'on_time') {
      // Only reset status if currently delayed
      const currentGame = await db.prepare('SELECT status FROM games WHERE id = ?').bind(gameId).first<any>();
      if (currentGame?.status === 'delayed') {
        updates.push('status = ?');
        params.push('scheduled');
      }
    }

    params.push(gameId);
    await db.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

    keepAlive(c, notifyGameDelayPush(db, gameId));
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update delay' }, 500);
  }
});

// ==========================================
// ADMIN: Set game locker rooms (direct column update)
// ==========================================
scoringRoutes.put('/games/:gameId/locker-rooms', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  homeLockerRoom: z.string().optional().nullable(),
  awayLockerRoom: z.string().optional().nullable(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { homeLockerRoom, awayLockerRoom } = c.req.valid('json');
  const db = c.env.DB;

  try {
    const game = await db.prepare('SELECT id FROM games WHERE id = ?').bind(gameId).first();
    if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

    await db.prepare(`
      UPDATE games SET home_locker_room = ?, away_locker_room = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(homeLockerRoom || null, awayLockerRoom || null, gameId).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update locker rooms' }, 500);
  }
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
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name,
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
// DIRECTOR: Edit game score directly
// ==========================================
scoringRoutes.put('/games/:gameId/score', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  homeScore: z.number().min(0),
  awayScore: z.number().min(0),
  status: z.enum(['scheduled', 'in_progress', 'intermission', 'final']).optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { homeScore, awayScore, status } = c.req.valid('json');
  const db = c.env.DB;

  try {
    const game = await db.prepare('SELECT id FROM games WHERE id = ?').bind(gameId).first();
    if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

    let query = `UPDATE games SET home_score = ?, away_score = ?, updated_at = datetime('now')`;
    const params: (string | number)[] = [homeScore, awayScore];
    if (status) {
      query += `, status = ?`;
      params.push(status);
    }
    query += ` WHERE id = ?`;
    params.push(gameId);

    await db.prepare(query).bind(...params).run();

    // If status changed to final, notify coaches and advance brackets.
    // Score corrections on already-final games also re-run resolution so
    // seeding stays right (only fills empty slots / unstarted games).
    if (status === 'final') {
      keepAlive(c, notifyCoachesOnFinal(db, c.env, gameId));
      keepAlive(c, notifyGameFinalPush(db, gameId));
      keepAlive(c, notifyScoresheetPush(db, gameId));
      keepAlive(c, autoAssignThreeStars(db, gameId).then(() => notifyThreeStarsPush(db, gameId)));
    }
    keepAlive(c, db.prepare('SELECT event_id FROM games WHERE id = ?').bind(gameId).first<any>()
      .then((g: any) => g && resolveBracketGames(db, g.event_id)));

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update score' }, 500);
  }
});

// ==========================================
// DIRECTOR: Get all games for an event (with scores, for director dashboard)
// ==========================================
scoringRoutes.get('/events/:eventId/director-games', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const games = await db.prepare(`
    SELECT g.id, g.game_number, g.start_time, g.status, g.home_score, g.away_score,
      g.period, g.game_type, g.home_team_id, g.away_team_id,
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name,
      ht.logo_url as home_team_logo, at2.logo_url as away_team_logo,
      vr.name as rink_name, ed.age_group, ed.division_level
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    WHERE g.event_id = ?
    ORDER BY g.start_time ASC, g.game_number ASC
  `).bind(eventId).all();

  return c.json({ success: true, data: games.results });
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
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
      COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
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

  // Scoresheets are coach/manager/staff-only - not for every team follower
  const sheetAccess = await verifySheetReadAccess(c, game as any);
  if (!sheetAccess.ok) {
    return c.json({ success: false, error: sheetAccess.error }, (sheetAccess.status || 403) as any);
  }
  // Coaches/managers/staff get a share link to send to players and families
  let shareUrl: string | null = null;
  if (sheetAccess.canShare) {
    let token = (game as any).share_token as string | null;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, '');
      await db.prepare('UPDATE games SET share_token = ? WHERE id = ?').bind(token, gameId).run();
    }
    shareUrl = `https://ultimatetournaments.com/scores/game?gameId=${gameId}&share=${token}`;
  }

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
      share_url: shareUrl,
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

  const access = await verifyGameWriteAccess(c, gameId);
  if (!access.ok) {
    return c.json({ success: false, error: access.error }, (access.status || 401) as any);
  }

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
scoringRoutes.put('/games/:gameId/lineups/:lineupId', scorekeeperOrStaff, zValidator('json', z.object({
  isScrached: z.boolean().optional(),
  position: z.string().optional(),
  jerseyNumber: z.string().optional(),
  status: z.enum(['playing', 'not_playing', 'suspended']).optional(),
  isStartingGoalie: z.boolean().optional(),
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
})), async (c) => {
  const { gameId, lineupId } = c.req.param();
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Name/number fixes flow through to the player record so the team roster
  // and stats stay right, not just this one game
  if (data.firstName || data.lastName || data.jerseyNumber || data.position) {
    const row = await db.prepare('SELECT player_id FROM game_lineups WHERE id = ? AND game_id = ?').bind(lineupId, gameId).first<any>();
    if (row?.player_id) {
      const pu: string[] = [];
      const pp: any[] = [];
      if (data.firstName) { pu.push('first_name = ?'); pp.push(data.firstName.trim()); }
      if (data.lastName) { pu.push('last_name = ?'); pp.push(data.lastName.trim()); }
      if (data.jerseyNumber) { pu.push('jersey_number = ?'); pp.push(data.jerseyNumber); }
      if (data.position) { pu.push('position = ?'); pp.push(toPlayerPosition(data.position)); }
      if (pu.length) {
        pp.push(row.player_id);
        await db.prepare(`UPDATE players SET ${pu.join(', ')} WHERE id = ?`).bind(...pp).run();
      }
    }
  }

  const updates: string[] = [];
  const params: any[] = [];
  if (data.isScrached !== undefined) { updates.push('is_scratched = ?'); params.push(data.isScrached ? 1 : 0); }
  if (data.position) { updates.push('position = ?'); params.push(data.position); }
  if (data.jerseyNumber) { updates.push('jersey_number = ?'); params.push(data.jerseyNumber); }
  if (data.status) {
    updates.push('status = ?'); params.push(data.status);
    // Keep the legacy scratch flag in sync — anything not Playing sits out
    updates.push('is_scratched = ?'); params.push(data.status === 'playing' ? 0 : 1);
  }
  if (data.isStartingGoalie !== undefined) {
    if (data.isStartingGoalie) {
      // Only one starting goalie per team per game
      const row = await db.prepare('SELECT team_id FROM game_lineups WHERE id = ? AND game_id = ?').bind(lineupId, gameId).first<any>();
      if (row) {
        await db.prepare('UPDATE game_lineups SET is_starting_goalie = 0 WHERE game_id = ? AND team_id = ?').bind(gameId, row.team_id).run();
      }
    }
    updates.push('is_starting_goalie = ?'); params.push(data.isStartingGoalie ? 1 : 0);
  }

  if (updates.length === 0) return c.json({ success: true });

  params.push(lineupId, gameId);
  await db.prepare(`UPDATE game_lineups SET ${updates.join(', ')} WHERE id = ? AND game_id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==========================================
// GameSheet-style console: full lineup state for both teams
// (players with status + starting goalie, team coaches, sign-offs)
// ==========================================
scoringRoutes.get('/games/:gameId/lineup-state', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  const game = await db.prepare(
    'SELECT id, home_team_id, away_team_id, status, officials_signed_by, officials_signed_at, officials_signed_number FROM games WHERE id = ?'
  ).bind(gameId).first<any>();
  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  const [lineups, coaches, signoffs, officials] = await Promise.all([
    db.prepare(`
      SELECT gl.id, gl.team_id, gl.player_id, gl.jersey_number, gl.position,
        gl.status, gl.is_starting_goalie, gl.is_scratched,
        p.first_name, p.last_name
      FROM game_lineups gl
      LEFT JOIN players p ON p.id = gl.player_id
      WHERE gl.game_id = ?
      ORDER BY CAST(gl.jersey_number AS INTEGER) ASC
    `).bind(gameId).all(),
    db.prepare(`
      SELECT tc.team_id, COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.email) as name, tc.role
      FROM team_coaches tc
      LEFT JOIN users u ON u.id = tc.user_id
      WHERE tc.team_id IN (?, ?)
    `).bind(game.home_team_id || '', game.away_team_id || '').all(),
    db.prepare(`
      SELECT team_id, coach_name, signed_off_at, signature_data FROM game_coaches
      WHERE game_id = ? AND role = 'roster_signoff'
    `).bind(gameId).all(),
    db.prepare('SELECT id, official_name, role, jersey_number FROM game_officials WHERE game_id = ? ORDER BY role ASC').bind(gameId).all(),
  ]);

  const side = (teamId: string | null) => ({
    teamId,
    players: (lineups.results || []).filter((l: any) => l.team_id === teamId),
    coaches: (coaches.results || []).filter((tc: any) => tc.team_id === teamId),
    signoff: (signoffs.results || []).find((s: any) => s.team_id === teamId) || null,
  });

  return c.json({
    success: true,
    data: {
      home: side(game.home_team_id),
      away: side(game.away_team_id),
      officials: officials.results || [],
      officialsSignoff: game.officials_signed_by
        ? { name: game.officials_signed_by, at: game.officials_signed_at, usa_hockey_number: game.officials_signed_number }
        : null,
      gameStatus: game.status,
    },
  });
});

// ==========================================
// Coach roster sign-off — required before every game
// ==========================================
scoringRoutes.post('/games/:gameId/teams/:teamId/roster-signoff', scorekeeperOrStaff, zValidator('json', z.object({
  name: z.string().min(2).max(80),
  signature: z.string().max(200000).nullable().optional(), // PNG data URL from the finger-signature pad
})), async (c) => {
  const { gameId, teamId } = c.req.param();
  const { name, signature } = c.req.valid('json');
  const db = c.env.DB;

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO game_coaches (id, game_id, team_id, coach_name, role, signature_data, signed_off_at)
    VALUES (?, ?, ?, ?, 'roster_signoff', ?, datetime('now'))
    ON CONFLICT (game_id, team_id, role) DO UPDATE SET
      coach_name = excluded.coach_name,
      signature_data = excluded.signature_data,
      signed_off_at = excluded.signed_off_at
  `).bind(id, gameId, teamId, name.trim(), signature || name.trim()).run();

  return c.json({ success: true, data: { name: name.trim() } });
});

// ==========================================
// Add a player at the table: creates the player on the TEAM roster
// (so stats follow them) and drops them into this game's lineup
// ==========================================

// players.position is CHECK-constrained (forward|defense|goalie|NULL);
// lineups use short codes. Map lineup-style input to the long form.
function toPlayerPosition(pos?: string | null): string | null {
  const p = (pos || '').trim().toLowerCase();
  if (p.startsWith('g')) return 'goalie';
  if (p.startsWith('d')) return 'defense';
  if (p.startsWith('f') || p === 'c' || p === 'lw' || p === 'rw') return 'forward';
  return null;
}

scoringRoutes.post('/games/:gameId/lineups', scorekeeperOrStaff, zValidator('json', z.object({
  teamId: z.string().min(1),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  jerseyNumber: z.string().min(1).max(4),
  position: z.string().max(20).optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const playerId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO players (id, first_name, last_name, jersey_number, position)
    VALUES (?, ?, ?, ?, ?)
  `).bind(playerId, data.firstName.trim(), data.lastName.trim(), data.jerseyNumber, toPlayerPosition(data.position)).run();
  await db.prepare(`
    INSERT INTO team_players (team_id, player_id, status) VALUES (?, ?, 'active')
  `).bind(data.teamId, playerId).run();

  const lineupId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO game_lineups (id, game_id, team_id, player_id, jersey_number, position, is_starter)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).bind(lineupId, gameId, data.teamId, playerId, data.jerseyNumber, data.position || 'F').run();

  return c.json({ success: true, data: { lineupId, playerId } });
});

// Remove a player from THIS game's lineup only (team roster untouched)
scoringRoutes.delete('/games/:gameId/lineups/:lineupId', scorekeeperOrStaff, async (c) => {
  const { gameId, lineupId } = c.req.param();
  await c.env.DB.prepare('DELETE FROM game_lineups WHERE id = ? AND game_id = ?').bind(lineupId, gameId).run();
  return c.json({ success: true });
});

// ==========================================
// Officials post-game sign-off
// ==========================================
scoringRoutes.post('/games/:gameId/officials-signoff', scorekeeperOrStaff, zValidator('json', z.object({
  name: z.string().min(2).max(80),
  usaHockeyNumber: z.string().max(30).nullable().optional(),
})), async (c) => {
  const gameId = c.req.param('gameId');
  const { name, usaHockeyNumber } = c.req.valid('json');
  const db = c.env.DB;

  await db.prepare(
    "UPDATE games SET officials_signed_by = ?, officials_signed_number = ?, officials_signed_at = datetime('now') WHERE id = ?"
  ).bind(name.trim(), (usaHockeyNumber || '').trim() || null, gameId).run();

  return c.json({ success: true, data: { name: name.trim() } });
});

// ==========================================
// SCOREKEEPER: Three Stars
// ==========================================
scoringRoutes.post('/games/:gameId/three-stars', scorekeeperOrStaff, zValidator('json', z.object({
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
scoringRoutes.post('/games/:gameId/goalie-stats', scorekeeperOrStaff, zValidator('json', z.object({
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

scoringRoutes.put('/games/:gameId/goalie-stats/:statId', scorekeeperOrStaff, zValidator('json', z.object({
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
scoringRoutes.post('/games/:gameId/shootout', scorekeeperOrStaff, zValidator('json', z.object({
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

scoringRoutes.delete('/games/:gameId/shootout/:roundId', scorekeeperOrStaff, async (c) => {
  const { roundId } = c.req.param();
  const db = c.env.DB;
  await db.prepare('DELETE FROM shootout_rounds WHERE id = ?').bind(roundId).run();
  return c.json({ success: true });
});

// ==========================================
// SCOREKEEPER: Game Notes
// ==========================================
scoringRoutes.post('/games/:gameId/notes', scorekeeperOrStaff, zValidator('json', z.object({
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
scoringRoutes.post('/games/:gameId/officials', scorekeeperOrStaff, zValidator('json', z.object({
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
scoringRoutes.post('/games/:gameId/coaches', scorekeeperOrStaff, zValidator('json', z.object({
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
scoringRoutes.put('/games/:gameId/scorekeeper-info', scorekeeperOrStaff, zValidator('json', z.object({
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
    SELECT g.*, COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name,
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
  const siteBase = env.SITE_URL || 'https://ultimatetournaments.com';
  const contestUrl = `${siteBase}/scoring/contest/?gameId=${gameId}`;

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

// ==========================================
// SCOREKEEPER DASHBOARD: My assigned events
// ==========================================
scoringRoutes.get('/my-events', authMiddleware, async (c) => {
  const user = c.get('user') as any;
  const db = c.env.DB;

  try {
    // Find events where this user has games assigned OR is an event-level scorekeeper
    const events = await db.prepare(`
      SELECT DISTINCT e.id, e.name, e.start_date, e.end_date, e.city, e.state,
        e.venue_id, v.name as venue_name,
        CASE WHEN es.user_id IS NOT NULL
          THEN (SELECT COUNT(*) FROM games g2 WHERE g2.event_id = e.id)
          ELSE (SELECT COUNT(*) FROM games g2 WHERE g2.event_id = e.id AND g2.scorekeeper_id = ?)
        END as game_count,
        CASE WHEN es.user_id IS NOT NULL
          THEN (SELECT COUNT(*) FROM games g3 WHERE g3.event_id = e.id AND g3.status IN ('scheduled', 'warmup', 'in_progress', 'intermission'))
          ELSE (SELECT COUNT(*) FROM games g3 WHERE g3.event_id = e.id AND g3.scorekeeper_id = ? AND g3.status IN ('scheduled', 'warmup', 'in_progress', 'intermission'))
        END as active_games,
        CASE WHEN es.user_id IS NOT NULL THEN 1 ELSE 0 END as is_event_scorekeeper
      FROM events e
      LEFT JOIN event_scorekeepers es ON es.event_id = e.id AND es.user_id = ?
      LEFT JOIN games g ON g.event_id = e.id AND g.scorekeeper_id = ?
      LEFT JOIN venues v ON v.id = e.venue_id
      WHERE es.user_id IS NOT NULL OR g.scorekeeper_id IS NOT NULL
      GROUP BY e.id
      ORDER BY e.start_date DESC
    `).bind(user.id, user.id, user.id, user.id).all();

    return c.json({ success: true, data: events.results });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to fetch events' }, 500);
  }
});

// ==========================================
// SCOREKEEPER DASHBOARD: My games for an event
// ==========================================
scoringRoutes.get('/my-events/:eventId/games', authMiddleware, async (c) => {
  const user = c.get('user') as any;
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  try {
    // Check if user is an event-level scorekeeper (sees ALL games)
    const eventSk = await db.prepare(`
      SELECT user_id FROM event_scorekeepers WHERE event_id = ? AND user_id = ?
    `).bind(eventId, user.id).first();

    let games;
    if (eventSk) {
      // Event-level scorekeeper — show ALL games
      games = await db.prepare(`
        SELECT g.*,
          COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
          COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
          vr.name as rink_name, v.name as venue_name,
          ed.age_group, ed.division_level
        FROM games g
        LEFT JOIN teams ht ON ht.id = g.home_team_id
        LEFT JOIN teams at2 ON at2.id = g.away_team_id
        LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
        LEFT JOIN venues v ON v.id = g.venue_id
        LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
        WHERE g.event_id = ?
        ORDER BY g.start_time ASC, g.game_number ASC
      `).bind(eventId).all();
    } else {
      // Game-level scorekeeper — show only assigned games
      games = await db.prepare(`
        SELECT g.*,
          COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END, g.home_placeholder) as home_team_name, ht.logo_url as home_team_logo,
          COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END, g.away_placeholder) as away_team_name, at2.logo_url as away_team_logo,
          vr.name as rink_name, v.name as venue_name,
          ed.age_group, ed.division_level
        FROM games g
        LEFT JOIN teams ht ON ht.id = g.home_team_id
        LEFT JOIN teams at2 ON at2.id = g.away_team_id
        LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
        LEFT JOIN venues v ON v.id = g.venue_id
        LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
        WHERE g.event_id = ? AND g.scorekeeper_id = ?
        ORDER BY g.start_time ASC, g.game_number ASC
      `).bind(eventId, user.id).all();
    }

    return c.json({ success: true, data: games.results });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to fetch games' }, 500);
  }
});

// ==========================================
// ADMIN: Bulk assign scorekeeper to games
// ==========================================
scoringRoutes.put('/events/:eventId/bulk-assign', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  gameIds: z.array(z.string()).min(1),
  scorekeeperId: z.string(),
})), async (c) => {
  const eventId = c.req.param('eventId');
  const { gameIds, scorekeeperId } = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Verify the user exists and has scorekeeper role
    const skUser = await db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.phone
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = ? AND ur.role = 'scorekeeper'
    `).bind(scorekeeperId).first<any>();

    if (!skUser) {
      return c.json({ success: false, error: 'User not found or not a scorekeeper' }, 404);
    }

    let updated = 0;
    const skName = `${skUser.first_name} ${skUser.last_name}`.trim();

    for (const gameId of gameIds) {
      const res = await db.prepare(`
        UPDATE games SET scorekeeper_id = ?, scorekeeper_name = ?, scorekeeper_phone = ?, updated_at = datetime('now')
        WHERE id = ? AND event_id = ?
      `).bind(scorekeeperId, skName, skUser.phone || null, gameId, eventId).run();
      updated += res.meta.changes || 0;
    }

    return c.json({ success: true, message: `${updated} games assigned to ${skName}` });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Bulk assign failed' }, 500);
  }
});

// ==========================================
// ADMIN: Unassign scorekeeper from games
// ==========================================
scoringRoutes.put('/events/:eventId/bulk-unassign', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  gameIds: z.array(z.string()).min(1),
})), async (c) => {
  const eventId = c.req.param('eventId');
  const { gameIds } = c.req.valid('json');
  const db = c.env.DB;

  try {
    let updated = 0;
    for (const gameId of gameIds) {
      const res = await db.prepare(`
        UPDATE games SET scorekeeper_id = NULL, scorekeeper_name = NULL, scorekeeper_phone = NULL, updated_at = datetime('now')
        WHERE id = ? AND event_id = ?
      `).bind(gameId, eventId).run();
      updated += res.meta.changes || 0;
    }

    return c.json({ success: true, message: `${updated} games unassigned` });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Bulk unassign failed' }, 500);
  }
});

// ==========================================
// ADMIN: Get scorekeepers for an event (both event-level and game-level)
// ==========================================
scoringRoutes.get('/events/:eventId/scorekeepers', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  try {
    // Get game-level assigned scorekeepers
    const gameLevel = await db.prepare(`
      SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.phone,
        COUNT(g.id) as assigned_games,
        SUM(CASE WHEN g.status = 'final' THEN 1 ELSE 0 END) as completed_games,
        SUM(CASE WHEN g.status IN ('in_progress', 'warmup', 'intermission') THEN 1 ELSE 0 END) as active_games
      FROM games g
      JOIN users u ON u.id = g.scorekeeper_id
      WHERE g.event_id = ? AND g.scorekeeper_id IS NOT NULL
      GROUP BY u.id
      ORDER BY u.last_name, u.first_name
    `).bind(eventId).all();

    // Get event-level scorekeepers
    const eventLevel = await db.prepare(`
      SELECT es.id as assignment_id, es.user_id, es.created_at,
             u.id, u.first_name, u.last_name, u.email, u.phone
      FROM event_scorekeepers es
      JOIN users u ON u.id = es.user_id
      WHERE es.event_id = ?
      ORDER BY u.last_name, u.first_name
    `).bind(eventId).all();

    return c.json({ success: true, data: gameLevel.results, eventScorekeepers: eventLevel.results });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to fetch scorekeepers' }, 500);
  }
});

// ==========================================
// ADMIN: Add scorekeeper to event (event-level — sees all games)
// ==========================================
scoringRoutes.post('/events/:eventId/event-scorekeepers', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  userIds: z.array(z.string()).min(1),
})), async (c) => {
  const eventId = c.req.param('eventId');
  const { userIds } = c.req.valid('json');
  const db = c.env.DB;

  try {
    let added = 0;
    for (const userId of userIds) {
      try {
        await db.prepare(`
          INSERT INTO event_scorekeepers (id, event_id, user_id)
          VALUES (?, ?, ?)
        `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, userId).run();
        added++;
      } catch {
        // unique constraint — already assigned, skip
      }
    }
    return c.json({ success: true, message: `${added} scorekeeper(s) added to event` });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to add event scorekeeper' }, 500);
  }
});

// ==========================================
// ADMIN: Remove scorekeeper from event (event-level)
// ==========================================
scoringRoutes.delete('/events/:eventId/event-scorekeepers/:userId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const userId = c.req.param('userId');
  const db = c.env.DB;

  try {
    await db.prepare(`DELETE FROM event_scorekeepers WHERE event_id = ? AND user_id = ?`).bind(eventId, userId).run();
    return c.json({ success: true, message: 'Scorekeeper removed from event' });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to remove scorekeeper' }, 500);
  }
});
