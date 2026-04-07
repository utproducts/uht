import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const schedulingRoutes = new Hono<{ Bindings: Env }>();

/**
 * UHT SCHEDULING ENGINE
 *
 * UHT uses a 3-4 game guarantee model:
 * - Pool play: 3 games (or 2 for 3-team divisions)
 * - Teams are seeded by pool standings into bracket play
 * - Bracket games: championship, consolation, placement
 *
 * Division structures (from John's Bible):
 * - 3 teams: 1 pool, play both others (2 pool games) + bracket
 * - 4 teams: 1 pool of 4, full round-robin (3 games each), then 1v2/3v4
 * - 5 teams: 1 pool of 3 + 1 pool of 2, crossovers for 3 games, then brackets
 * - 6 teams: 2 pools of 3, 2 intra-pool + 1 crossover = 3 pool games, then cross-pool brackets
 * - 8 teams: 2 pools of 4, 3 intra-pool games, then cross-pool brackets
 */

// Get schedule rules for an event
schedulingRoutes.get('/events/:eventId/rules', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM schedule_rules WHERE event_id = ? ORDER BY priority DESC').bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// Set schedule rules for an event
const setRulesSchema = z.object({
  rules: z.array(z.object({
    ruleType: z.string(),
    ruleValue: z.string(),
    priority: z.number().default(0),
  })),
});

schedulingRoutes.post('/events/:eventId/rules', authMiddleware, requireRole('admin', 'director'), zValidator('json', setRulesSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Clear existing rules
  await db.prepare('DELETE FROM schedule_rules WHERE event_id = ?').bind(eventId).run();

  // Insert new rules
  for (const rule of data.rules) {
    await db.prepare(`
      INSERT INTO schedule_rules (id, event_id, rule_type, rule_value, priority)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, rule.ruleType, rule.ruleValue, rule.priority).run();
  }

  return c.json({ success: true, message: `${data.rules.length} rules saved` });
});

// ==========================================
// AUTO-GENERATE SCHEDULE (Pool Play + Brackets)
// ==========================================
schedulingRoutes.post('/events/:eventId/generate', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Get event details
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Get divisions with approved teams
  const divisions = await db.prepare(`
    SELECT ed.*,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id AND r.status = 'approved') as team_count
    FROM event_divisions ed
    WHERE ed.event_id = ?
  `).bind(eventId).all<any>();

  // Get approved teams per division
  const divisionTeams: Record<string, any[]> = {};
  for (const div of divisions.results || []) {
    const teams = await db.prepare(`
      SELECT t.id, t.name FROM registrations r
      JOIN teams t ON t.id = r.team_id
      WHERE r.event_division_id = ? AND r.status = 'approved'
      ORDER BY r.created_at
    `).bind(div.id).all<any>();
    divisionTeams[div.id] = teams.results || [];
  }

  // Get schedule rules
  const rules = await db.prepare('SELECT * FROM schedule_rules WHERE event_id = ?').bind(eventId).all<any>();
  const ruleMap: Record<string, string> = {};
  const ruleList: any[] = [];
  for (const rule of rules.results || []) {
    ruleMap[rule.rule_type] = rule.rule_value;
    ruleList.push(rule);
  }

  // Get available rinks
  const venueRinks = event.venue_id
    ? (await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ?').bind(event.venue_id).all<any>()).results || []
    : [];

  // ==============================
  // SCHEDULE GENERATION
  // ==============================
  const games: any[] = [];
  let gameNumber = 1;

  // Default config (overridable by event rules)
  const minRestMinutes = parseInt(ruleMap['min_rest_minutes'] || '60');
  const gameDurationMinutes = parseInt(ruleMap['game_duration_minutes'] || '60');
  const firstGameTime = ruleMap['first_game_time'] || '08:00';
  const lastGameTime = ruleMap['last_game_time'] || '20:00';

  // Parse per-rink availability rules
  const rinkConfig: Record<string, { firstMinute: number; lastMinute: number; blocked: { start: number; end: number }[] }> = {};
  for (const rule of ruleList) {
    try {
      if (rule.rule_type === 'rink_first_game') {
        const data = JSON.parse(rule.rule_value);
        if (!rinkConfig[data.rinkId]) rinkConfig[data.rinkId] = { firstMinute: parseTime(firstGameTime), lastMinute: parseTime(lastGameTime), blocked: [] };
        rinkConfig[data.rinkId].firstMinute = parseTime(data.time);
      } else if (rule.rule_type === 'rink_last_game') {
        const data = JSON.parse(rule.rule_value);
        if (!rinkConfig[data.rinkId]) rinkConfig[data.rinkId] = { firstMinute: parseTime(firstGameTime), lastMinute: parseTime(lastGameTime), blocked: [] };
        rinkConfig[data.rinkId].lastMinute = parseTime(data.time);
      } else if (rule.rule_type === 'rink_blocked_times') {
        const data = JSON.parse(rule.rule_value);
        if (!rinkConfig[data.rinkId]) rinkConfig[data.rinkId] = { firstMinute: parseTime(firstGameTime), lastMinute: parseTime(lastGameTime), blocked: [] };
        rinkConfig[data.rinkId].blocked = (data.blocked || []).map((b: any) => ({ start: parseTime(b.start), end: parseTime(b.end) }));
      }
    } catch (_) { /* skip malformed rules */ }
  }

  // Event date range
  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);
  const eventDays = getEventDays(startDate, endDate);

  // Global time slot tracker — tracks which rink+time combos are used
  // to prevent double-booking, with per-rink availability support
  const timeSlotTracker = new TimeSlotTracker(
    eventDays,
    parseTime(firstGameTime),
    parseTime(lastGameTime),
    gameDurationMinutes,
    minRestMinutes,
    venueRinks,
    rinkConfig
  );

  // Process each division
  for (const div of divisions.results || []) {
    const teams = divisionTeams[div.id] || [];
    if (teams.length < 2) continue;

    // Number each team within the division (1-indexed) for Bible-style display
    const numberedTeams = teams.map((t: any, i: number) => ({ ...t, seed: i + 1 }));

    // Create pools based on division size
    const poolStructure = createPools(numberedTeams);

    // Generate pool play matchups
    const poolGames = generatePoolPlayGames(poolStructure, teams.length);

    // Schedule pool play games across event days (not the last day — save that for brackets)
    const poolDays = eventDays.length > 1 ? eventDays.slice(0, -1) : eventDays;
    const bracketDay = eventDays[eventDays.length - 1];

    for (const matchup of poolGames) {
      const slot = timeSlotTracker.getNextSlot(poolDays);
      if (!slot) {
        // Fallback: try any day including bracket day
        const fallbackSlot = timeSlotTracker.getNextSlot(eventDays);
        if (!fallbackSlot) continue;
        Object.assign(slot || {}, fallbackSlot);
      }
      const actualSlot = slot || timeSlotTracker.getNextSlot(eventDays);
      if (!actualSlot) continue;

      const startTime = formatDateTime(actualSlot.date, actualSlot.startMinutes);
      const endTimeStr = formatDateTime(actualSlot.date, actualSlot.startMinutes + gameDurationMinutes);

      games.push({
        id: crypto.randomUUID().replace(/-/g, ''),
        event_id: eventId,
        event_division_id: div.id,
        home_team_id: matchup.home.id,
        away_team_id: matchup.away.id,
        venue_id: event.venue_id,
        rink_id: actualSlot.rinkId,
        game_number: gameNumber++,
        start_time: startTime,
        end_time: endTimeStr,
        game_type: 'pool',
        pool_name: matchup.poolName,
        status: 'scheduled',
        notes: `#${matchup.home.seed} vs #${matchup.away.seed}`,
      });
    }

    // Initialize pool standings
    for (const pool of poolStructure) {
      for (const team of pool.teams) {
        await db.prepare(`
          INSERT OR REPLACE INTO pool_standings (id, event_id, event_division_id, pool_name, team_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, div.id, pool.name, team.id).run();
      }
    }

    // Generate bracket games (TBD teams — seeded from pool results)
    const bracketGames = generateBracketGames(poolStructure, teams.length);

    for (const bracket of bracketGames) {
      const slot = timeSlotTracker.getNextSlot([bracketDay]);
      if (!slot) continue;

      const startTime = formatDateTime(slot.date, slot.startMinutes);
      const endTimeStr = formatDateTime(slot.date, slot.startMinutes + gameDurationMinutes);

      games.push({
        id: crypto.randomUUID().replace(/-/g, ''),
        event_id: eventId,
        event_division_id: div.id,
        home_team_id: null, // TBD from pool standings
        away_team_id: null,
        venue_id: event.venue_id,
        rink_id: slot.rinkId,
        game_number: gameNumber++,
        start_time: startTime,
        end_time: endTimeStr,
        game_type: bracket.gameType,
        pool_name: null,
        status: 'scheduled',
        notes: bracket.label, // e.g. "1G vs 2B" or "1 vs 2"
      });
    }
  }

  // Clear existing schedule
  await db.prepare('DELETE FROM games WHERE event_id = ?').bind(eventId).run();
  await db.prepare('DELETE FROM pool_standings WHERE event_id = ?').bind(eventId).run();

  // Insert all games
  for (const game of games) {
    await db.prepare(`
      INSERT INTO games (id, event_id, event_division_id, home_team_id, away_team_id, venue_id, rink_id,
        game_number, start_time, end_time, game_type, pool_name, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      game.id, game.event_id, game.event_division_id, game.home_team_id, game.away_team_id,
      game.venue_id, game.rink_id, game.game_number, game.start_time, game.end_time,
      game.game_type, game.pool_name, game.status, game.notes || null
    ).run();
  }

  // Re-insert pool standings
  for (const div of divisions.results || []) {
    const teams = divisionTeams[div.id] || [];
    if (teams.length < 2) continue;
    const poolStructure = createPools(teams.map((t: any, i: number) => ({ ...t, seed: i + 1 })));
    for (const pool of poolStructure) {
      for (const team of pool.teams) {
        await db.prepare(`
          INSERT OR REPLACE INTO pool_standings (id, event_id, event_division_id, pool_name, team_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, div.id, pool.name, team.id).run();
      }
    }
  }

  return c.json({
    success: true,
    data: {
      gamesCreated: games.length,
      poolGames: games.filter(g => g.game_type === 'pool').length,
      bracketGames: games.filter(g => g.game_type !== 'pool').length,
      divisions: (divisions.results || []).map((d: any) => ({
        name: d.name,
        teams: (divisionTeams[d.id] || []).length,
        pools: createPools((divisionTeams[d.id] || []).map((t: any, i: number) => ({ ...t, seed: i + 1 }))).length,
      })),
      message: 'Schedule generated — pool play + bracket games. Review and publish when ready.',
    },
  });
});

// ==========================================
// GET SCHEDULE FOR AN EVENT
// ==========================================
schedulingRoutes.get('/events/:eventId/games', authMiddleware, async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT g.*,
      ht.name as home_team_name,
      at.name as away_team_name,
      vr.name as rink_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    WHERE g.event_id = ?
    ORDER BY g.start_time, g.game_number
  `).bind(eventId).all();

  return c.json({ success: true, data: result.results });
});

// ==========================================
// GET POOL STANDINGS
// ==========================================
schedulingRoutes.get('/events/:eventId/standings', authMiddleware, async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT ps.*, t.name as team_name, ed.name as division_name
    FROM pool_standings ps
    JOIN teams t ON t.id = ps.team_id
    JOIN event_divisions ed ON ed.id = ps.event_division_id
    WHERE ps.event_id = ?
    ORDER BY ps.event_division_id, ps.pool_name, ps.points DESC, ps.goal_differential DESC
  `).bind(eventId).all();

  return c.json({ success: true, data: result.results });
});

// ==========================================
// DELETE SCHEDULE
// ==========================================
schedulingRoutes.delete('/events/:eventId/games', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  await db.prepare('DELETE FROM games WHERE event_id = ?').bind(eventId).run();
  await db.prepare('DELETE FROM pool_standings WHERE event_id = ?').bind(eventId).run();
  return c.json({ success: true, message: 'Schedule cleared' });
});

// ==========================================
// UPDATE SINGLE GAME
// ==========================================
const updateGameSchema = z.object({
  home_team_id: z.string().nullable().optional(),
  away_team_id: z.string().nullable().optional(),
  rink_id: z.string().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  game_type: z.enum(['pool', 'quarterfinal', 'semifinal', 'consolation', 'championship', 'placement']).optional(),
  pool_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['scheduled', 'warmup', 'in_progress', 'intermission', 'final', 'cancelled', 'forfeit']).optional(),
});

schedulingRoutes.put('/games/:gameId', authMiddleware, requireRole('admin', 'director'), zValidator('json', updateGameSchema), async (c) => {
  const gameId = c.req.param('gameId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Verify game exists
  const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first();
  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  // Build dynamic update
  const updates: string[] = [];
  const values: any[] = [];

  if (data.home_team_id !== undefined) { updates.push('home_team_id = ?'); values.push(data.home_team_id); }
  if (data.away_team_id !== undefined) { updates.push('away_team_id = ?'); values.push(data.away_team_id); }
  if (data.rink_id !== undefined) { updates.push('rink_id = ?'); values.push(data.rink_id); }
  if (data.start_time !== undefined) { updates.push('start_time = ?'); values.push(data.start_time); }
  if (data.end_time !== undefined) { updates.push('end_time = ?'); values.push(data.end_time); }
  if (data.game_type !== undefined) { updates.push('game_type = ?'); values.push(data.game_type); }
  if (data.pool_name !== undefined) { updates.push('pool_name = ?'); values.push(data.pool_name); }
  if (data.notes !== undefined) { updates.push('notes = ?'); values.push(data.notes); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(gameId);

  await db.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // Return updated game with team names
  const updated = await db.prepare(`
    SELECT g.*, ht.name as home_team_name, at.name as away_team_name, vr.name as rink_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    WHERE g.id = ?
  `).bind(gameId).first();

  return c.json({ success: true, data: updated });
});

// ==========================================
// SWAP TWO GAMES (swap time slots and rinks)
// ==========================================
const swapGamesSchema = z.object({
  gameId1: z.string(),
  gameId2: z.string(),
});

schedulingRoutes.post('/games/swap', authMiddleware, requireRole('admin', 'director'), zValidator('json', swapGamesSchema), async (c) => {
  const { gameId1, gameId2 } = c.req.valid('json');
  const db = c.env.DB;

  const game1 = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId1).first<any>();
  const game2 = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId2).first<any>();

  if (!game1 || !game2) return c.json({ success: false, error: 'One or both games not found' }, 404);

  // Swap start_time, end_time, rink_id, and game_number
  await db.prepare(`UPDATE games SET start_time = ?, end_time = ?, rink_id = ?, game_number = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(game2.start_time, game2.end_time, game2.rink_id, game2.game_number, gameId1).run();
  await db.prepare(`UPDATE games SET start_time = ?, end_time = ?, rink_id = ?, game_number = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(game1.start_time, game1.end_time, game1.rink_id, game1.game_number, gameId2).run();

  return c.json({ success: true, message: 'Games swapped' });
});

// ==========================================
// DELETE SINGLE GAME
// ==========================================
schedulingRoutes.delete('/games/:gameId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;

  const game = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first();
  if (!game) return c.json({ success: false, error: 'Game not found' }, 404);

  await db.prepare('DELETE FROM games WHERE id = ?').bind(gameId).run();
  return c.json({ success: true, message: 'Game deleted' });
});

// ==========================================
// ADD SINGLE GAME
// ==========================================
const addGameSchema = z.object({
  event_id: z.string(),
  event_division_id: z.string(),
  home_team_id: z.string().nullable(),
  away_team_id: z.string().nullable(),
  rink_id: z.string().nullable().optional(),
  start_time: z.string(),
  end_time: z.string().optional(),
  game_type: z.enum(['pool', 'quarterfinal', 'semifinal', 'consolation', 'championship', 'placement']),
  pool_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

schedulingRoutes.post('/games', authMiddleware, requireRole('admin', 'director'), zValidator('json', addGameSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Get next game number for this event
  const maxGame = await db.prepare('SELECT MAX(game_number) as max_num FROM games WHERE event_id = ?').bind(data.event_id).first<any>();
  const gameNumber = (maxGame?.max_num || 0) + 1;

  const id = crypto.randomUUID().replace(/-/g, '');
  const event = await db.prepare('SELECT venue_id FROM events WHERE id = ?').bind(data.event_id).first<any>();

  await db.prepare(`
    INSERT INTO games (id, event_id, event_division_id, home_team_id, away_team_id, venue_id, rink_id,
      game_number, start_time, end_time, game_type, pool_name, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
  `).bind(
    id, data.event_id, data.event_division_id, data.home_team_id, data.away_team_id,
    event?.venue_id || null, data.rink_id || null, gameNumber, data.start_time, data.end_time || null,
    data.game_type, data.pool_name || null, data.notes || null
  ).run();

  const created = await db.prepare(`
    SELECT g.*, ht.name as home_team_name, at.name as away_team_name, vr.name as rink_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    WHERE g.id = ?
  `).bind(id).first();

  return c.json({ success: true, data: created });
});

// ==========================================
// POOL CREATION
// ==========================================

interface TeamWithSeed {
  id: string;
  name: string;
  seed: number;
}

interface Pool {
  name: string;
  teams: TeamWithSeed[];
}

function createPools(teams: TeamWithSeed[]): Pool[] {
  const n = teams.length;

  if (n <= 4) {
    // Single pool
    return [{ name: 'Pool A', teams }];
  }

  if (n === 5) {
    // Pool Gold (3 teams) + Pool Blue (2 teams)
    // Snake draft: 1→Gold, 2→Blue, 3→Blue, 4→Gold, 5→Gold
    return [
      { name: 'Pool Gold', teams: [teams[0], teams[3], teams[4]] },
      { name: 'Pool Blue', teams: [teams[1], teams[2]] },
    ];
  }

  if (n === 6) {
    // 2 pools of 3
    // Snake draft: 1→Gold, 2→Blue, 3→Blue, 4→Gold, 5→Gold, 6→Blue
    return [
      { name: 'Pool Gold', teams: [teams[0], teams[3], teams[4]] },
      { name: 'Pool Blue', teams: [teams[1], teams[2], teams[5]] },
    ];
  }

  if (n === 7) {
    // Pool Gold (4 teams) + Pool Blue (3 teams)
    return [
      { name: 'Pool Gold', teams: [teams[0], teams[3], teams[4], teams[6]] },
      { name: 'Pool Blue', teams: [teams[1], teams[2], teams[5]] },
    ];
  }

  if (n === 8) {
    // 2 pools of 4
    // Snake draft: 1→Gold, 2→Blue, 3→Blue, 4→Gold, 5→Gold, 6→Blue, 7→Blue, 8→Gold
    return [
      { name: 'Pool Gold', teams: [teams[0], teams[3], teams[4], teams[7]] },
      { name: 'Pool Blue', teams: [teams[1], teams[2], teams[5], teams[6]] },
    ];
  }

  // 9+ teams: split into pools of 3-4 via snake draft
  const numPools = Math.ceil(n / 4);
  const pools: Pool[] = Array.from({ length: numPools }, (_, i) => ({
    name: numPools === 2 ? (i === 0 ? 'Pool Gold' : 'Pool Blue') : `Pool ${String.fromCharCode(65 + i)}`,
    teams: [],
  }));

  teams.forEach((team, idx) => {
    const round = Math.floor(idx / numPools);
    const poolIdx = round % 2 === 0 ? idx % numPools : numPools - 1 - (idx % numPools);
    pools[poolIdx].teams.push(team);
  });

  return pools;
}

// ==========================================
// POOL PLAY GAME GENERATION
// ==========================================

interface Matchup {
  home: TeamWithSeed;
  away: TeamWithSeed;
  poolName: string;
  isCrossover: boolean;
}

function generatePoolPlayGames(pools: Pool[], totalTeams: number): Matchup[] {
  const matchups: Matchup[] = [];

  if (totalTeams === 3) {
    // 3-team division: each team plays the other 2 = 2 pool games per team
    const t = pools[0].teams;
    matchups.push({ home: t[0], away: t[1], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[0], away: t[2], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[1], away: t[2], poolName: 'Pool A', isCrossover: false });
    return matchups;
  }

  if (totalTeams === 4) {
    // 4-team division: 1 pool, full round-robin = 3 games per team
    const t = pools[0].teams;
    matchups.push({ home: t[0], away: t[1], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[2], away: t[3], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[0], away: t[2], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[1], away: t[3], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[0], away: t[3], poolName: 'Pool A', isCrossover: false });
    matchups.push({ home: t[1], away: t[2], poolName: 'Pool A', isCrossover: false });
    return matchups;
  }

  if (totalTeams === 5) {
    // 5 teams: Pool Gold (3) + Pool Blue (2)
    // Gold: 2 intra-pool games each (need 1 crossover to reach 3)
    // Blue: 1 intra-pool game each (need 2 crossovers to reach 3)
    const gold = pools[0].teams; // 3 teams
    const blue = pools[1].teams; // 2 teams
    // Intra-pool Gold (3 games)
    matchups.push({ home: gold[0], away: gold[1], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[0], away: gold[2], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[1], away: gold[2], poolName: 'Pool Gold', isCrossover: false });
    // Intra-pool Blue (1 game)
    matchups.push({ home: blue[0], away: blue[1], poolName: 'Pool Blue', isCrossover: false });
    // Crossovers: each Gold team gets exactly 1, each Blue team gets exactly 2
    // Blue #1 vs Gold #1, Blue #1 vs Gold #2
    // Blue #2 vs Gold #3
    // This gives: Gold#1=3, Gold#2=3, Gold#3=3, Blue#1=3, Blue#2=2
    // Need one more for Blue#2... pair with remaining Gold
    matchups.push({ home: blue[0], away: gold[0], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: blue[0], away: gold[1], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: blue[1], away: gold[2], poolName: 'Crossover', isCrossover: true });
    // Blue#2 still needs 1 more — pair with Gold#1 or Gold#2 (one of them will get 4th game)
    // This is unavoidable with 5 teams — one team must play 4 games or accept uneven distribution
    // Better approach: Blue#2 gets a crossover with the Gold team that has the earliest availability
    matchups.push({ home: blue[1], away: gold[1], poolName: 'Crossover', isCrossover: true });
    // Result: Gold#1=3, Gold#2=4, Gold#3=3, Blue#1=3, Blue#2=3
    // Note: 5-team divisions inherently create asymmetry. Gold#2 plays 4 pool games.
    return matchups;
  }

  if (totalTeams === 6) {
    // 6 teams: 2 pools of 3
    // Each team: 2 intra-pool games + 1 crossover = 3 pool games
    const gold = pools[0].teams; // 3 teams
    const blue = pools[1].teams; // 3 teams

    // Intra-pool Gold (3 games: each team plays the other 2)
    matchups.push({ home: gold[0], away: gold[1], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[0], away: gold[2], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[1], away: gold[2], poolName: 'Pool Gold', isCrossover: false });

    // Intra-pool Blue (3 games)
    matchups.push({ home: blue[0], away: blue[1], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[0], away: blue[2], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[1], away: blue[2], poolName: 'Pool Blue', isCrossover: false });

    // Crossover games: each team plays 1 crossover
    // Match by seed: Gold #1 vs Blue #1, Gold #2 vs Blue #2, Gold #3 vs Blue #3
    matchups.push({ home: gold[0], away: blue[0], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: gold[1], away: blue[1], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: gold[2], away: blue[2], poolName: 'Crossover', isCrossover: true });
    return matchups;
  }

  if (totalTeams === 8) {
    // 8 teams: 2 pools of 4
    // Each team: 3 intra-pool games (full round-robin within pool)
    const gold = pools[0].teams; // 4 teams
    const blue = pools[1].teams; // 4 teams

    // Intra-pool Gold (6 games: full round-robin of 4)
    matchups.push({ home: gold[0], away: gold[1], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[2], away: gold[3], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[0], away: gold[2], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[1], away: gold[3], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[0], away: gold[3], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[1], away: gold[2], poolName: 'Pool Gold', isCrossover: false });

    // Intra-pool Blue (6 games)
    matchups.push({ home: blue[0], away: blue[1], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[2], away: blue[3], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[0], away: blue[2], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[1], away: blue[3], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[0], away: blue[3], poolName: 'Pool Blue', isCrossover: false });
    matchups.push({ home: blue[1], away: blue[2], poolName: 'Pool Blue', isCrossover: false });
    return matchups;
  }

  // Generic fallback: intra-pool round-robin + crossovers to hit 3 games
  for (const pool of pools) {
    for (let i = 0; i < pool.teams.length; i++) {
      for (let j = i + 1; j < pool.teams.length; j++) {
        matchups.push({ home: pool.teams[i], away: pool.teams[j], poolName: pool.name, isCrossover: false });
      }
    }
  }

  // Add crossovers if teams have fewer than 3 pool games
  if (pools.length >= 2) {
    const gamesPerTeam: Record<string, number> = {};
    for (const m of matchups) {
      gamesPerTeam[m.home.id] = (gamesPerTeam[m.home.id] || 0) + 1;
      gamesPerTeam[m.away.id] = (gamesPerTeam[m.away.id] || 0) + 1;
    }
    // Add crossovers for teams under 3 games
    for (let pi = 0; pi < pools.length; pi++) {
      for (const team of pools[pi].teams) {
        if ((gamesPerTeam[team.id] || 0) < 3) {
          // Find opponent from another pool who also needs games
          for (let pj = 0; pj < pools.length; pj++) {
            if (pi === pj) continue;
            for (const opp of pools[pj].teams) {
              if ((gamesPerTeam[opp.id] || 0) < 3 && (gamesPerTeam[team.id] || 0) < 3) {
                const alreadyPlaying = matchups.some(
                  m => (m.home.id === team.id && m.away.id === opp.id) || (m.home.id === opp.id && m.away.id === team.id)
                );
                if (!alreadyPlaying) {
                  matchups.push({ home: team, away: opp, poolName: 'Crossover', isCrossover: true });
                  gamesPerTeam[team.id] = (gamesPerTeam[team.id] || 0) + 1;
                  gamesPerTeam[opp.id] = (gamesPerTeam[opp.id] || 0) + 1;
                }
              }
            }
          }
        }
      }
    }
  }

  return matchups;
}

// ==========================================
// BRACKET GAME GENERATION
// ==========================================

interface BracketGame {
  gameType: 'championship' | 'consolation' | 'placement' | 'semifinal';
  label: string; // e.g., "1G vs 2B", "3G vs 3B"
}

function generateBracketGames(pools: Pool[], totalTeams: number): BracketGame[] {
  const brackets: BracketGame[] = [];

  if (totalTeams === 3) {
    // 3-game guarantee: 2 pool games + bracket games
    // #2 vs #3 play-in, then winner vs #1 championship
    // This gives every team at least 3 games (#2 may get 4 if they win play-in)
    brackets.push({ gameType: 'semifinal', label: '2nd vs 3rd — Play-In' });
    brackets.push({ gameType: 'championship', label: '1st vs Play-In Winner — Championship' });
    return brackets;
  }

  if (totalTeams === 4) {
    // Single pool: consolation first, then championship last
    brackets.push({ gameType: 'consolation', label: '3rd vs 4th — Consolation' });
    brackets.push({ gameType: 'championship', label: '1st vs 2nd — Championship' });
    return brackets;
  }

  if (totalTeams === 5) {
    // Placement & consolation first, championship last
    brackets.push({ gameType: 'placement', label: '5th Place Game' });
    brackets.push({ gameType: 'consolation', label: '3rd vs 4th — Consolation' });
    brackets.push({ gameType: 'championship', label: '1st vs 2nd — Championship' });
    return brackets;
  }

  if (totalTeams === 6) {
    // Cross-pool brackets: semis first, then consolation, then championship last
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'consolation', label: '3G vs 3B — Consolation' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    return brackets;
  }

  if (totalTeams === 7) {
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'consolation', label: 'Losers — Consolation' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    return brackets;
  }

  if (totalTeams === 8) {
    // 2 pools of 4: semis → placement → consolation → championship (always last)
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'placement', label: '4G vs 4B — 7th Place' });
    brackets.push({ gameType: 'placement', label: '3G vs 3B — 5th Place' });
    brackets.push({ gameType: 'consolation', label: 'Losers — 3rd Place' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    return brackets;
  }

  // Generic: cross-pool semis + championship
  if (pools.length >= 2) {
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    brackets.push({ gameType: 'consolation', label: 'Losers — Consolation' });
  } else {
    brackets.push({ gameType: 'championship', label: '1st vs 2nd — Championship' });
    brackets.push({ gameType: 'consolation', label: '3rd vs 4th — Consolation' });
  }

  return brackets;
}

// ==========================================
// TIME SLOT MANAGEMENT
// ==========================================

class TimeSlotTracker {
  private slotIndex: Map<string, number> = new Map(); // "YYYY-MM-DD|rinkId" -> next available minute
  private days: Date[];
  private firstMinute: number;
  private lastMinute: number;
  private gameDuration: number;
  private restTime: number;
  private rinks: any[];
  private rinkConfig: Record<string, { firstMinute: number; lastMinute: number; blocked: { start: number; end: number }[] }>;

  constructor(
    days: Date[], firstMinute: number, lastMinute: number, gameDuration: number, restTime: number, rinks: any[],
    rinkConfig: Record<string, { firstMinute: number; lastMinute: number; blocked: { start: number; end: number }[] }> = {}
  ) {
    this.days = days;
    this.firstMinute = firstMinute;
    this.lastMinute = lastMinute;
    this.gameDuration = gameDuration;
    this.restTime = restTime;
    this.rinks = rinks.length > 0 ? rinks : [{ id: null, name: 'Default' }];
    this.rinkConfig = rinkConfig;

    // Initialize all slots — use per-rink first game time if configured
    for (const day of days) {
      for (const rink of this.rinks) {
        const key = `${day.toISOString().split('T')[0]}|${rink.id}`;
        const rc = rink.id ? this.rinkConfig[rink.id] : null;
        this.slotIndex.set(key, rc ? rc.firstMinute : firstMinute);
      }
    }
  }

  // Check if a time slot overlaps with any blocked window for this rink
  private isBlocked(rinkId: string | null, startMinutes: number): boolean {
    if (!rinkId) return false;
    const rc = this.rinkConfig[rinkId];
    if (!rc || !rc.blocked) return false;
    const endMinutes = startMinutes + this.gameDuration;
    for (const block of rc.blocked) {
      // Overlap check: game starts before block ends AND game ends after block starts
      if (startMinutes < block.end && endMinutes > block.start) return true;
    }
    return false;
  }

  // Get the last game minute for a specific rink
  private getRinkLastMinute(rinkId: string | null): number {
    if (rinkId && this.rinkConfig[rinkId]) return this.rinkConfig[rinkId].lastMinute;
    return this.lastMinute;
  }

  getNextSlot(allowedDays: Date[]): { date: Date; startMinutes: number; rinkId: string | null } | null {
    // Find the earliest available slot across all allowed days and rinks
    let best: { date: Date; startMinutes: number; rinkId: string | null; key: string } | null = null;

    for (const day of allowedDays) {
      for (const rink of this.rinks) {
        const key = `${day.toISOString().split('T')[0]}|${rink.id}`;
        let nextMinute = this.slotIndex.get(key) || this.firstMinute;
        const rinkLast = this.getRinkLastMinute(rink.id);

        // Skip past any blocked windows
        let safety = 0;
        while (this.isBlocked(rink.id, nextMinute) && safety < 100) {
          // Jump to end of the blocking window
          const rc = rink.id ? this.rinkConfig[rink.id] : null;
          if (rc) {
            for (const block of rc.blocked) {
              if (nextMinute < block.end && nextMinute + this.gameDuration > block.start) {
                nextMinute = block.end + this.restTime;
                break;
              }
            }
          }
          safety++;
        }

        if (nextMinute + this.gameDuration <= rinkLast + this.gameDuration) {
          if (!best || nextMinute < best.startMinutes || (nextMinute === best.startMinutes && day < best.date)) {
            best = { date: day, startMinutes: nextMinute, rinkId: rink.id, key };
          }
        }
      }
    }

    if (best) {
      // Advance the slot — and skip past any blocked windows for next time
      let nextAvail = best.startMinutes + this.gameDuration + this.restTime;
      // Pre-skip blocked windows for the next call
      if (best.rinkId && this.rinkConfig[best.rinkId]) {
        let safety = 0;
        while (this.isBlocked(best.rinkId, nextAvail) && safety < 100) {
          for (const block of this.rinkConfig[best.rinkId].blocked) {
            if (nextAvail < block.end && nextAvail + this.gameDuration > block.start) {
              nextAvail = block.end + this.restTime;
              break;
            }
          }
          safety++;
        }
      }
      this.slotIndex.set(best.key, nextAvail);
      return { date: best.date, startMinutes: best.startMinutes, rinkId: best.rinkId };
    }

    return null;
  }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatDateTime(date: Date, minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${date.toISOString().split('T')[0]}T${h}:${m}:00`;
}

function getEventDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  // Ensure at least 1 day
  if (days.length === 0) days.push(new Date(start));
  return days;
}
