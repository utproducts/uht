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
  for (const rule of rules.results || []) {
    ruleMap[rule.rule_type] = rule.rule_value;
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

  // Event date range
  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);
  const eventDays = getEventDays(startDate, endDate);

  // Global time slot tracker — tracks which rink+time combos are used
  // to prevent double-booking
  const timeSlotTracker = new TimeSlotTracker(
    eventDays,
    parseTime(firstGameTime),
    parseTime(lastGameTime),
    gameDurationMinutes,
    minRestMinutes,
    venueRinks
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
    // Gold pool: each plays the other 2 = 3 intra-pool games total
    const gold = pools[0].teams; // 3 teams
    const blue = pools[1].teams; // 2 teams
    // Intra-pool Gold (3 games)
    matchups.push({ home: gold[0], away: gold[1], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[0], away: gold[2], poolName: 'Pool Gold', isCrossover: false });
    matchups.push({ home: gold[1], away: gold[2], poolName: 'Pool Gold', isCrossover: false });
    // Intra-pool Blue (1 game)
    matchups.push({ home: blue[0], away: blue[1], poolName: 'Pool Blue', isCrossover: false });
    // Crossover games to get everyone to 3 games:
    // Blue team 1 needs 2 more, Blue team 2 needs 2 more
    matchups.push({ home: blue[0], away: gold[0], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: blue[0], away: gold[1], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: blue[1], away: gold[0], poolName: 'Crossover', isCrossover: true });
    matchups.push({ home: blue[1], away: gold[2], poolName: 'Crossover', isCrossover: true });
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
    // Championship: 1st vs 2nd
    brackets.push({ gameType: 'championship', label: '1st vs 2nd — Championship' });
    return brackets;
  }

  if (totalTeams === 4) {
    // Single pool: 1v2 championship, 3v4 consolation
    brackets.push({ gameType: 'championship', label: '1st vs 2nd — Championship' });
    brackets.push({ gameType: 'consolation', label: '3rd vs 4th — Consolation' });
    return brackets;
  }

  if (totalTeams === 5) {
    // Cross-pool brackets based on combined standings
    brackets.push({ gameType: 'championship', label: '1st vs 2nd — Championship' });
    brackets.push({ gameType: 'consolation', label: '3rd vs 4th — Consolation' });
    brackets.push({ gameType: 'placement', label: '5th Place Game' });
    return brackets;
  }

  if (totalTeams === 6) {
    // Cross-pool brackets: 1G vs 2B, 1B vs 2G (semis), then finals
    // From Bible: 1gV2g (within gold playoff), 1bV2b (within blue playoff), 3gV3b (consolation)
    // Actually from Bible: cross-pool — 1G vs 2B, 1B vs 2G for championship bracket
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    brackets.push({ gameType: 'consolation', label: '3G vs 3B — Consolation' });
    return brackets;
  }

  if (totalTeams === 7) {
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    brackets.push({ gameType: 'consolation', label: 'Losers — Consolation' });
    return brackets;
  }

  if (totalTeams === 8) {
    // 2 pools of 4, cross-pool brackets
    brackets.push({ gameType: 'semifinal', label: '1G vs 2B — Semifinal' });
    brackets.push({ gameType: 'semifinal', label: '1B vs 2G — Semifinal' });
    brackets.push({ gameType: 'championship', label: 'Winners — Championship' });
    brackets.push({ gameType: 'consolation', label: 'Losers — 3rd Place' });
    brackets.push({ gameType: 'placement', label: '3G vs 3B — 5th Place' });
    brackets.push({ gameType: 'placement', label: '4G vs 4B — 7th Place' });
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

  constructor(days: Date[], firstMinute: number, lastMinute: number, gameDuration: number, restTime: number, rinks: any[]) {
    this.days = days;
    this.firstMinute = firstMinute;
    this.lastMinute = lastMinute;
    this.gameDuration = gameDuration;
    this.restTime = restTime;
    this.rinks = rinks.length > 0 ? rinks : [{ id: null, name: 'Default' }];

    // Initialize all slots
    for (const day of days) {
      for (const rink of this.rinks) {
        const key = `${day.toISOString().split('T')[0]}|${rink.id}`;
        this.slotIndex.set(key, firstMinute);
      }
    }
  }

  getNextSlot(allowedDays: Date[]): { date: Date; startMinutes: number; rinkId: string | null } | null {
    // Find the earliest available slot across all allowed days and rinks
    let best: { date: Date; startMinutes: number; rinkId: string | null; key: string } | null = null;

    for (const day of allowedDays) {
      for (const rink of this.rinks) {
        const key = `${day.toISOString().split('T')[0]}|${rink.id}`;
        const nextMinute = this.slotIndex.get(key) || this.firstMinute;

        if (nextMinute + this.gameDuration <= this.lastMinute + this.gameDuration) {
          if (!best || nextMinute < best.startMinutes || (nextMinute === best.startMinutes && day < best.date)) {
            best = { date: day, startMinutes: nextMinute, rinkId: rink.id, key };
          }
        }
      }
    }

    if (best) {
      // Advance the slot
      this.slotIndex.set(best.key, best.startMinutes + this.gameDuration + this.restTime);
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
