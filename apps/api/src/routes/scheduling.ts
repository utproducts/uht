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

// ==========================================
// AUTO-MIGRATE: Add staff assignment columns to games
// ==========================================
async function ensureStaffColumns(db: any) {
  const cols = ['scorekeeper_id', 'director_id', 'ref1_id', 'ref2_id'];
  for (const col of cols) {
    try {
      await db.prepare(`ALTER TABLE games ADD COLUMN ${col} TEXT`).run();
    } catch (_) { /* column already exists */ }
  }
}

// AUTO-MIGRATE: Add mhr_rating to registrations (pulled from USA Hockey)
async function ensureMhrColumn(db: any) {
  try {
    await db.prepare('ALTER TABLE registrations ADD COLUMN mhr_rating INTEGER').run();
  } catch (_) { /* column already exists */ }
}

// Get schedule progress summary for multiple events (batch)
schedulingRoutes.get('/events/schedule-summary', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  // Get game counts per event
  const gameCounts = await db.prepare(`
    SELECT event_id, COUNT(*) as game_count
    FROM games
    GROUP BY event_id
  `).all();

  // Get approved registration counts per event
  const regCounts = await db.prepare(`
    SELECT event_id, COUNT(*) as team_count
    FROM registrations
    WHERE status = 'approved'
    GROUP BY event_id
  `).all();

  // Get division counts per event
  const divCounts = await db.prepare(`
    SELECT event_id, COUNT(*) as division_count
    FROM event_divisions
    GROUP BY event_id
  `).all();

  // Build summary map
  const summary: Record<string, { games: number; teams: number; divisions: number }> = {};

  (gameCounts.results as any[]).forEach((r: any) => {
    if (!summary[r.event_id]) summary[r.event_id] = { games: 0, teams: 0, divisions: 0 };
    summary[r.event_id].games = r.game_count;
  });
  (regCounts.results as any[]).forEach((r: any) => {
    if (!summary[r.event_id]) summary[r.event_id] = { games: 0, teams: 0, divisions: 0 };
    summary[r.event_id].teams = r.team_count;
  });
  (divCounts.results as any[]).forEach((r: any) => {
    if (!summary[r.event_id]) summary[r.event_id] = { games: 0, teams: 0, divisions: 0 };
    summary[r.event_id].divisions = r.division_count;
  });

  return c.json({ success: true, data: summary });
});

// Get MHR ratings for teams in an event
schedulingRoutes.get('/events/:eventId/team-ratings', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  await ensureMhrColumn(db);
  const result = await db.prepare(`
    SELECT r.id as registration_id, r.team_id, r.mhr_rating, r.event_division_id,
      t.name as team_name, t.city as team_city, t.state as team_state,
      ed.age_group, ed.division_level
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE r.event_id = ? AND r.status = 'approved'
    ORDER BY ed.age_group, t.name
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// Update MHR ratings for teams in an event
schedulingRoutes.put('/events/:eventId/team-ratings', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  await ensureMhrColumn(db);
  const body = await c.req.json() as { ratings: { registration_id: string; mhr_rating: number | null }[] };
  for (const r of body.ratings) {
    await db.prepare('UPDATE registrations SET mhr_rating = ? WHERE id = ? AND event_id = ?')
      .bind(r.mhr_rating, r.registration_id, eventId).run();
  }
  return c.json({ success: true, message: `${body.ratings.length} ratings updated` });
});

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

  try {

  // Optional: generate for a single division only
  let body: any = {};
  try { body = await c.req.json(); } catch (_) {}
  const targetDivisionId = body.division_id || null;

  console.log('Generate schedule:', { eventId, targetDivisionId });

  // Get event details
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Get divisions with approved teams (optionally filter to one division)
  const divQuery = targetDivisionId
    ? db.prepare(`
        SELECT ed.*,
          (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id AND r.status = 'approved') as team_count
        FROM event_divisions ed
        WHERE ed.event_id = ? AND ed.id = ?
      `).bind(eventId, targetDivisionId)
    : db.prepare(`
        SELECT ed.*,
          (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id AND r.status = 'approved') as team_count
        FROM event_divisions ed
        WHERE ed.event_id = ?
      `).bind(eventId);
  const divisions = await divQuery.all<any>();

  // Get approved teams per division (with MHR ratings)
  await ensureMhrColumn(db);
  const divisionTeams: Record<string, any[]> = {};
  for (const div of divisions.results || []) {
    const teams = await db.prepare(`
      SELECT t.id, t.name, r.mhr_rating FROM registrations r
      JOIN teams t ON t.id = r.team_id
      WHERE r.event_division_id = ? AND r.status = 'approved'
      ORDER BY r.mhr_rating DESC, r.created_at
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

  // Default config (overridable by event rules)
  const minRestMinutes = parseInt(ruleMap['min_rest_minutes'] || '60');
  const gameDurationMinutes = parseInt(ruleMap['game_duration_minutes'] || '60');
  const firstGameTime = ruleMap['first_game_time'] || '08:00';
  const lastGameTime = ruleMap['last_game_time'] || '20:00';

  // Parse per-rink availability rules
  const rinkConfig: Record<string, { firstMinute: number; lastMinute: number; blocked: { start: number; end: number; date: string | null }[] }> = {};
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
        const newBlocks = (data.blocked || []).map((b: any) => ({ start: parseTime(b.start), end: parseTime(b.end), date: b.date || null }));
        rinkConfig[data.rinkId].blocked.push(...newBlocks);
      }
    } catch (_) { /* skip malformed rules */ }
  }

  // Clear existing schedule FIRST (before generating new games)
  console.log('Step 1: Clearing old data...');
  // Delete child records from all tables that reference games(id)
  // Use subquery to target games by event (and optionally division)
  const gameFilter = targetDivisionId
    ? `game_id IN (SELECT id FROM games WHERE event_id = '${eventId}' AND event_division_id = '${targetDivisionId}')`
    : `game_id IN (SELECT id FROM games WHERE event_id = '${eventId}')`;

  // Child tables that reference games(id) WITHOUT ON DELETE CASCADE
  // These must be manually deleted before deleting games
  // From 0005_referees.sql:
  //   referee_game_assignments → games(id) (no cascade)
  // From 0006_scoring_overhaul.sql:
  //   game_lineups, game_three_stars, goalie_game_stats, shootout_rounds,
  //   game_period_scores, game_notes, game_coaches, game_officials → games(id) (no cascade)
  // Note: scoresheets, game_locker_rooms, game_status_log have ON DELETE CASCADE — auto-handled
  const childTables = [
    'referee_game_assignments',
    'game_lineups',
    'game_three_stars',
    'goalie_game_stats',
    'shootout_rounds',
    'game_period_scores',
    'game_notes',
    'game_coaches',
    'game_officials',
  ];
  for (const table of childTables) {
    try {
      await db.prepare(`DELETE FROM ${table} WHERE ${gameFilter}`).run();
    } catch (e: any) {
      console.log(`  Child table ${table} cleanup: ${e?.message || 'skipped'}`);
    }
  }

  if (targetDivisionId) {
    await db.prepare('DELETE FROM pool_standings WHERE event_id = ? AND event_division_id = ?').bind(eventId, targetDivisionId).run();
    await db.prepare('DELETE FROM games WHERE event_id = ? AND event_division_id = ?').bind(eventId, targetDivisionId).run();
  } else {
    await db.prepare('DELETE FROM pool_standings WHERE event_id = ?').bind(eventId).run();
    await db.prepare('DELETE FROM games WHERE event_id = ?').bind(eventId).run();
  }

  console.log('Step 2: Old data cleared. Setting up time tracker...');

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

  // Parse age-group-to-rink mapping from rules
  // Rule type: 'age_group_rinks' with value like '{"ageGroup":"8U","rinkIds":["rink1","rink2"]}'
  const ageGroupRinks: Record<string, string[]> = {};
  for (const rule of ruleList) {
    if (rule.rule_type === 'age_group_rinks') {
      try {
        const data = JSON.parse(rule.rule_value);
        if (data.ageGroup && Array.isArray(data.rinkIds) && data.rinkIds.length > 0) {
          ageGroupRinks[data.ageGroup] = data.rinkIds;
        }
      } catch (_) {}
    }
  }

  // Parse per-division game duration overrides from rules
  // Rule type: 'division_game_duration' with value like '{"divisionId":"xxx","minutes":50}'
  const divisionDurations: Record<string, number> = {};
  for (const rule of ruleList) {
    if (rule.rule_type === 'division_game_duration') {
      try {
        const data = JSON.parse(rule.rule_value);
        if (data.divisionId && data.minutes) {
          divisionDurations[data.divisionId] = parseInt(data.minutes);
        }
      } catch (_) {}
    }
  }

  // Parse MHR matchup limit rules
  // Rule type: 'mhr_matchup_limit' with value like '{"max_spread":30}'
  let mhrMaxSpread: number | null = null;
  for (const rule of ruleList) {
    if (rule.rule_type === 'mhr_matchup_limit') {
      try {
        const data = JSON.parse(rule.rule_value);
        if (data.max_spread) mhrMaxSpread = parseInt(data.max_spread);
      } catch (_) {}
    }
  }

  // Parse team time restriction rules
  // Rule type: 'team_time_restriction' with value like:
  // '{"team_id":"xxx","restriction":"earliest_start","day":"2025-03-14","time":"19:00"}'
  // or '{"team_id":"xxx","restriction":"latest_end","day":"2025-03-16","time":"14:00"}'
  interface TeamTimeRestriction {
    team_id: string;
    restriction: 'earliest_start' | 'latest_end';
    day: string;
    time: string;
    timeMinutes: number;
  }
  const teamTimeRestrictions: TeamTimeRestriction[] = [];
  for (const rule of ruleList) {
    if (rule.rule_type === 'team_time_restriction') {
      try {
        const data = JSON.parse(rule.rule_value);
        if (data.team_id && data.restriction && data.time) {
          teamTimeRestrictions.push({
            team_id: data.team_id,
            restriction: data.restriction,
            day: data.day || null,
            time: data.time,
            timeMinutes: parseTime(data.time),
          });
        }
      } catch (_) {}
    }
  }

  // If generating for a single division, figure out the highest existing game_number
  // so we can continue numbering from there
  let gameNumber = 1;
  if (targetDivisionId) {
    const maxGame = await db.prepare('SELECT MAX(game_number) as maxNum FROM games WHERE event_id = ?').bind(eventId).first<any>();
    gameNumber = (maxGame?.maxNum || 0) + 1;
  }

  // Helper: check if a time slot is valid for given teams based on time restrictions
  function isSlotValidForTeams(teamIds: string[], day: string, startMinutes: number, endMinutes: number): boolean {
    for (const ttr of teamTimeRestrictions) {
      if (!teamIds.includes(ttr.team_id)) continue;
      // If restriction is day-specific, only apply on that day
      if (ttr.day && ttr.day !== day) continue;
      if (ttr.restriction === 'earliest_start' && startMinutes < ttr.timeMinutes) return false;
      if (ttr.restriction === 'latest_end' && endMinutes > ttr.timeMinutes) return false;
    }
    return true;
  }

  // Track overflow games (scheduled on non-preferred rink)
  const overflowGameIds: string[] = [];

  // Process each division
  for (const div of divisions.results || []) {
    const teams = divisionTeams[div.id] || [];
    if (teams.length < 2) continue;

    // Use per-division game duration if set, otherwise fall back to global
    const divGameDuration = divisionDurations[div.id] || div.period_length_minutes * (div.num_periods || 3) || gameDurationMinutes;

    // Get preferred rinks for this division's age group (if configured)
    const preferredRinks = ageGroupRinks[div.age_group] || undefined;

    // If MHR spread limit is set, sort teams by MHR for balanced pool seeding
    if (mhrMaxSpread !== null) {
      teams.sort((a: any, b: any) => (b.mhr_rating || 0) - (a.mhr_rating || 0));
    }

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
      const gameTeamIds = [matchup.home.id, matchup.away.id];
      // Try up to 20 slots to find one that satisfies team time restrictions
      let actualSlot: any = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = timeSlotTracker.getNextSlot(poolDays, divGameDuration + minRestMinutes, preferredRinks);
        if (!candidate) {
          const fallback = timeSlotTracker.getNextSlot(eventDays, divGameDuration + minRestMinutes, preferredRinks);
          if (!fallback) break;
          if (teamTimeRestrictions.length === 0 || isSlotValidForTeams(gameTeamIds, fallback.date, fallback.startMinutes, fallback.startMinutes + divGameDuration)) {
            actualSlot = fallback;
            break;
          }
          continue;
        }
        if (teamTimeRestrictions.length === 0 || isSlotValidForTeams(gameTeamIds, candidate.date, candidate.startMinutes, candidate.startMinutes + divGameDuration)) {
          actualSlot = candidate;
          break;
        }
        // Slot violates team restrictions, try next
      }
      if (!actualSlot) {
        // No valid slot found, use any available as fallback
        actualSlot = timeSlotTracker.getNextSlot(eventDays, divGameDuration + minRestMinutes, preferredRinks);
        if (!actualSlot) continue;
      }

      const gameId = crypto.randomUUID().replace(/-/g, '');
      if (actualSlot.overflow) overflowGameIds.push(gameId);

      const startTime = formatDateTime(actualSlot.date, actualSlot.startMinutes);
      const endTimeStr = formatDateTime(actualSlot.date, actualSlot.startMinutes + divGameDuration);

      games.push({
        id: gameId,
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
        try {
          await db.prepare(`
            INSERT OR REPLACE INTO pool_standings (id, event_id, event_division_id, pool_name, team_id)
            VALUES (?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, div.id, pool.name, team.id).run();
        } catch (err) {
          console.error('Failed pool_standings insert:', JSON.stringify({ eventId, divId: div.id, pool: pool.name, teamId: team.id }), String(err));
          throw err;
        }
      }
    }

    // Generate bracket games (TBD teams — seeded from pool results)
    const bracketGames = generateBracketGames(poolStructure, teams.length);

    for (const bracket of bracketGames) {
      const slot = timeSlotTracker.getNextSlot([bracketDay], divGameDuration + minRestMinutes, preferredRinks);
      if (!slot) continue;

      const gameId = crypto.randomUUID().replace(/-/g, '');
      if (slot.overflow) overflowGameIds.push(gameId);

      const startTime = formatDateTime(slot.date, slot.startMinutes);
      const endTimeStr = formatDateTime(slot.date, slot.startMinutes + divGameDuration);

      games.push({
        id: gameId,
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

  console.log('Step 3: Games generated in memory:', games.length, '— inserting into DB...');

  // Insert all games
  for (const game of games) {
    try {
      await db.prepare(`
        INSERT INTO games (id, event_id, event_division_id, home_team_id, away_team_id, venue_id, rink_id,
          game_number, start_time, end_time, game_type, pool_name, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        game.id, game.event_id, game.event_division_id, game.home_team_id, game.away_team_id,
        game.venue_id || null, game.rink_id || null, game.game_number, game.start_time, game.end_time,
        game.game_type, game.pool_name || null, game.status, game.notes || null
      ).run();
    } catch (err) {
      console.error('Failed to insert game:', JSON.stringify({ id: game.id, venue_id: game.venue_id, rink_id: game.rink_id, div_id: game.event_division_id, home: game.home_team_id, away: game.away_team_id }), String(err));
      throw err;
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
      overflowGames: overflowGameIds.length,
      overflowGameIds,
      message: overflowGameIds.length > 0
        ? `Schedule generated — ${overflowGameIds.length} game(s) placed on non-preferred rinks (overflow). Review and adjust.`
        : 'Schedule generated — pool play + bracket games. Review and publish when ready.',
    },
  });

  } catch (err) {
    console.error('Generate schedule error at step:', String(err));
    return c.json({ success: false, error: 'Schedule generation failed: ' + String(err) }, 500);
  }
});

// ==========================================
// GET SCHEDULE FOR AN EVENT
// ==========================================
schedulingRoutes.get('/events/:eventId/games', authMiddleware, async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Ensure staff columns exist
  await ensureStaffColumns(db);

  const result = await db.prepare(`
    SELECT g.*,
      ht.name as home_team_name,
      at.name as away_team_name,
      vr.name as rink_name,
      v.name as venue_name,
      (sk.first_name || ' ' || sk.last_name) as scorekeeper_name,
      (dir.first_name || ' ' || dir.last_name) as director_name,
      (r1.first_name || ' ' || r1.last_name) as ref1_name,
      (r2.first_name || ' ' || r2.last_name) as ref2_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    LEFT JOIN users sk ON sk.id = g.scorekeeper_id
    LEFT JOIN users dir ON dir.id = g.director_id
    LEFT JOIN users r1 ON r1.id = g.ref1_id
    LEFT JOIN users r2 ON r2.id = g.ref2_id
    WHERE g.event_id = ?
    ORDER BY g.start_time, g.game_number
  `).bind(eventId).all();

  return c.json({ success: true, data: result.results });
});

// ==========================================
// GET STAFF (users with relevant roles for game assignments)
// ==========================================
schedulingRoutes.get('/staff', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.phone,
      GROUP_CONCAT(ur.role) as roles
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role IN ('director', 'scorekeeper', 'referee')
    AND u.is_active = 1
    GROUP BY u.id
    ORDER BY u.last_name, u.first_name
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==========================================
// RINK STAFF ASSIGNMENTS (scorekeeper by rink/day)
// ==========================================

// Auto-create rink_staff_assignments table
async function ensureRinkStaffTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS rink_staff_assignments (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        rink_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('scorekeeper', 'director', 'ref')),
        assignment_date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(event_id, rink_id, user_id, role, assignment_date)
      )
    `).run();
  } catch (_) {}
}

// GET rink staff assignments for an event
schedulingRoutes.get('/events/:eventId/rink-staff', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  await ensureRinkStaffTable(db);

  const result = await db.prepare(`
    SELECT rsa.*,
      (u.first_name || ' ' || u.last_name) as user_name,
      u.email as user_email,
      vr.name as rink_name
    FROM rink_staff_assignments rsa
    JOIN users u ON u.id = rsa.user_id
    LEFT JOIN venue_rinks vr ON vr.id = rsa.rink_id
    WHERE rsa.event_id = ?
    ORDER BY rsa.assignment_date, rsa.rink_id, rsa.role
  `).bind(eventId).all();

  return c.json({ success: true, data: result.results });
});

// PUT rink staff assignments (bulk save — replaces all for event)
const rinkStaffSchema = z.object({
  assignments: z.array(z.object({
    rink_id: z.string(),
    user_id: z.string(),
    role: z.enum(['scorekeeper', 'director', 'ref']),
    assignment_date: z.string(), // YYYY-MM-DD
  })),
  auto_populate: z.boolean().default(true), // auto-fill scorekeeper_id on matching games
});

schedulingRoutes.put('/events/:eventId/rink-staff', authMiddleware, requireRole('admin', 'director'), zValidator('json', rinkStaffSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const { assignments, auto_populate } = c.req.valid('json');
  const db = c.env.DB;
  await ensureRinkStaffTable(db);
  await ensureStaffColumns(db);

  // Clear existing assignments for this event
  await db.prepare('DELETE FROM rink_staff_assignments WHERE event_id = ?').bind(eventId).run();

  // Insert new assignments
  for (const a of assignments) {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO rink_staff_assignments (id, event_id, rink_id, user_id, role, assignment_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, eventId, a.rink_id, a.user_id, a.role, a.assignment_date).run();
  }

  // Auto-populate: set scorekeeper_id on all games matching rink+date
  if (auto_populate) {
    let populated = 0;
    for (const a of assignments) {
      if (a.role === 'scorekeeper') {
        const res = await db.prepare(`
          UPDATE games SET scorekeeper_id = ?
          WHERE event_id = ? AND rink_id = ? AND start_time LIKE ?
        `).bind(a.user_id, eventId, a.rink_id, a.assignment_date + '%').run();
        populated += res.meta.changes || 0;
      } else if (a.role === 'director') {
        const res = await db.prepare(`
          UPDATE games SET director_id = ?
          WHERE event_id = ? AND rink_id = ? AND start_time LIKE ?
        `).bind(a.user_id, eventId, a.rink_id, a.assignment_date + '%').run();
        populated += res.meta.changes || 0;
      }
    }
    return c.json({ success: true, message: `${assignments.length} assignments saved, ${populated} games auto-populated` });
  }

  return c.json({ success: true, message: `${assignments.length} assignments saved` });
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
  // Clean child tables without CASCADE before deleting games
  const gf = `game_id IN (SELECT id FROM games WHERE event_id = '${eventId}')`;
  for (const t of ['referee_game_assignments','game_lineups','game_three_stars','goalie_game_stats','shootout_rounds','game_period_scores','game_notes','game_coaches','game_officials']) {
    try { await db.prepare(`DELETE FROM ${t} WHERE ${gf}`).run(); } catch (_) {}
  }
  await db.prepare('DELETE FROM pool_standings WHERE event_id = ?').bind(eventId).run();
  await db.prepare('DELETE FROM games WHERE event_id = ?').bind(eventId).run();
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
  scorekeeper_id: z.string().nullable().optional(),
  director_id: z.string().nullable().optional(),
  ref1_id: z.string().nullable().optional(),
  ref2_id: z.string().nullable().optional(),
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
  if (data.scorekeeper_id !== undefined) { updates.push('scorekeeper_id = ?'); values.push(data.scorekeeper_id); }
  if (data.director_id !== undefined) { updates.push('director_id = ?'); values.push(data.director_id); }
  if (data.ref1_id !== undefined) { updates.push('ref1_id = ?'); values.push(data.ref1_id); }
  if (data.ref2_id !== undefined) { updates.push('ref2_id = ?'); values.push(data.ref2_id); }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(gameId);

  await db.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // Return updated game with team names and staff names
  const updated = await db.prepare(`
    SELECT g.*, ht.name as home_team_name, at.name as away_team_name, vr.name as rink_name, v.name as venue_name,
      (sk.first_name || ' ' || sk.last_name) as scorekeeper_name, (dir.first_name || ' ' || dir.last_name) as director_name,
      (r1.first_name || ' ' || r1.last_name) as ref1_name, (r2.first_name || ' ' || r2.last_name) as ref2_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    LEFT JOIN users sk ON sk.id = g.scorekeeper_id
    LEFT JOIN users dir ON dir.id = g.director_id
    LEFT JOIN users r1 ON r1.id = g.ref1_id
    LEFT JOIN users r2 ON r2.id = g.ref2_id
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

  // Clean child tables without CASCADE before deleting game
  for (const t of ['referee_game_assignments','game_lineups','game_three_stars','goalie_game_stats','shootout_rounds','game_period_scores','game_notes','game_coaches','game_officials']) {
    try { await db.prepare(`DELETE FROM ${t} WHERE game_id = ?`).bind(gameId).run(); } catch (_) {}
  }
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
    SELECT g.*, ht.name as home_team_name, at.name as away_team_name, vr.name as rink_name, v.name as venue_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at ON at.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    WHERE g.id = ?
  `).bind(id).first();

  return c.json({ success: true, data: created });
});

// Replace one team with another across all games in an event
const replaceTeamSchema = z.object({
  old_team_id: z.string().min(1),
  new_team_id: z.string().min(1),
});

schedulingRoutes.post('/events/:eventId/replace-team', authMiddleware, requireRole('admin', 'director'), zValidator('json', replaceTeamSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const { old_team_id, new_team_id } = c.req.valid('json');
  const db = c.env.DB;

  if (old_team_id === new_team_id) {
    return c.json({ success: false, error: 'Old and new team cannot be the same' }, 400);
  }

  // Verify both teams exist
  const [oldTeam, newTeam] = await Promise.all([
    db.prepare('SELECT id, name FROM teams WHERE id = ?').bind(old_team_id).first<any>(),
    db.prepare('SELECT id, name FROM teams WHERE id = ?').bind(new_team_id).first<any>(),
  ]);
  if (!oldTeam) return c.json({ success: false, error: 'Original team not found' }, 404);
  if (!newTeam) return c.json({ success: false, error: 'Replacement team not found' }, 404);

  // Count affected games
  const countResult = await db.prepare(
    'SELECT COUNT(*) as cnt FROM games WHERE event_id = ? AND (home_team_id = ? OR away_team_id = ?)'
  ).bind(eventId, old_team_id, old_team_id).first<any>();
  const affected = countResult?.cnt || 0;

  if (affected === 0) {
    return c.json({ success: false, error: `${oldTeam.name} has no games in this event` }, 400);
  }

  // Update home_team_id
  await db.prepare(
    'UPDATE games SET home_team_id = ? WHERE event_id = ? AND home_team_id = ?'
  ).bind(new_team_id, eventId, old_team_id).run();

  // Update away_team_id
  await db.prepare(
    'UPDATE games SET away_team_id = ? WHERE event_id = ? AND away_team_id = ?'
  ).bind(new_team_id, eventId, old_team_id).run();

  // Also update the registration if one exists for the old team in this event
  // (swap the team on the registration so standings etc. carry over)
  const oldReg = await db.prepare(
    'SELECT id, event_division_id FROM registrations WHERE event_id = ? AND team_id = ?'
  ).bind(eventId, old_team_id).first<any>();

  if (oldReg) {
    // Check if new team already has a registration in this division
    const existingNewReg = await db.prepare(
      'SELECT id FROM registrations WHERE event_id = ? AND team_id = ? AND event_division_id = ?'
    ).bind(eventId, new_team_id, oldReg.event_division_id).first<any>();

    if (!existingNewReg) {
      // Reassign the registration from old team to new team
      await db.prepare(
        'UPDATE registrations SET team_id = ? WHERE id = ?'
      ).bind(new_team_id, oldReg.id).run();
    }
  }

  return c.json({
    success: true,
    data: {
      games_updated: affected,
      old_team: oldTeam.name,
      new_team: newTeam.name,
      message: `Replaced "${oldTeam.name}" with "${newTeam.name}" in ${affected} game${affected !== 1 ? 's' : ''}.`,
    },
  });
});

// ==========================================
// DIVISION ASSIGNMENT
// ==========================================

// Get teams grouped by age group with division assignments
schedulingRoutes.get('/events/:eventId/division-assignments', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Get all divisions for this event
  const divResult = await db.prepare(`
    SELECT id, age_group, division_level, max_teams, min_teams, price_cents, game_format, period_length_minutes, num_periods, status
    FROM event_divisions WHERE event_id = ? ORDER BY age_group, division_level
  `).bind(eventId).all();

  // Get all approved registrations with team info
  const regResult = await db.prepare(`
    SELECT r.id as registration_id, r.event_division_id, r.team_id, r.status,
           t.name as team_name, t.city, t.state, t.division_level as team_level
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    WHERE r.event_id = ? AND r.status = 'approved'
    ORDER BY t.name
  `).bind(eventId).all();

  // Group by age_group
  const divisions = divResult.results as any[];
  const registrations = regResult.results as any[];

  const ageGroups: Record<string, { divisions: any[]; teams: any[] }> = {};

  for (const div of divisions) {
    if (!ageGroups[div.age_group]) {
      ageGroups[div.age_group] = { divisions: [], teams: [] };
    }
    ageGroups[div.age_group].divisions.push(div);
  }

  for (const reg of registrations) {
    const div = divisions.find((d: any) => d.id === reg.event_division_id);
    if (div) {
      if (!ageGroups[div.age_group]) {
        ageGroups[div.age_group] = { divisions: [], teams: [] };
      }
      ageGroups[div.age_group].teams.push({
        ...reg,
        age_group: div.age_group,
        division_level: div.division_level,
      });
    }
  }

  return c.json({ success: true, data: ageGroups });
});

// Auto-split an age group into divisions of max N teams (default 6)
const autoSplitSchema = z.object({
  age_group: z.string(),
  max_per_division: z.number().min(3).max(8).default(6),
});

schedulingRoutes.post('/events/:eventId/auto-split', authMiddleware, requireRole('admin', 'director'), zValidator('json', autoSplitSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const { age_group, max_per_division } = c.req.valid('json');
  const db = c.env.DB;

  // Get all approved registrations for this age group
  const regResult = await db.prepare(`
    SELECT r.id as registration_id, r.event_division_id, r.team_id,
           t.name as team_name, t.division_level as team_level
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE r.event_id = ? AND ed.age_group = ? AND r.status = 'approved'
    ORDER BY t.name
  `).bind(eventId, age_group).all();

  const teams = regResult.results as any[];
  if (teams.length === 0) {
    return c.json({ success: false, error: 'No approved teams in this age group' }, 400);
  }

  // If already fits in one division, nothing to do
  if (teams.length <= max_per_division) {
    return c.json({ success: true, message: `Only ${teams.length} teams — no split needed`, data: { splits: 0 } });
  }

  // Calculate number of divisions needed
  const numDivisions = Math.ceil(teams.length / max_per_division);

  // Get a template division for this age group (use the first one for pricing/format)
  const templateDiv = await db.prepare(`
    SELECT * FROM event_divisions WHERE event_id = ? AND age_group = ? ORDER BY division_level LIMIT 1
  `).bind(eventId, age_group).first<any>();

  if (!templateDiv) {
    return c.json({ success: false, error: 'No division found for this age group' }, 400);
  }

  // Division level naming: A, AA, B, BB, etc. for competitive tiers
  // Or just numbered: Division 1, Division 2, etc.
  const levelNames = ['A', 'AA', 'B', 'BB', 'C', 'CC', 'D', 'DD'];

  // Create new divisions if needed
  const divisionIds: string[] = [];
  const existingDivs = await db.prepare(`
    SELECT id, division_level FROM event_divisions WHERE event_id = ? AND age_group = ? ORDER BY division_level
  `).bind(eventId, age_group).all();

  const existingDivIds = (existingDivs.results as any[]).map((d: any) => d.id);

  // If we have exactly the right number already, reuse them
  if (existingDivIds.length >= numDivisions) {
    // Reuse existing divisions
    for (let i = 0; i < numDivisions; i++) {
      divisionIds.push(existingDivIds[i]);
    }
  } else {
    // Keep the first existing division, create new ones for the rest
    divisionIds.push(existingDivIds[0]);
    for (let i = 1; i < numDivisions; i++) {
      if (i < existingDivIds.length) {
        divisionIds.push(existingDivIds[i]);
      } else {
        const newId = crypto.randomUUID().replace(/-/g, '');
        const level = i < levelNames.length ? levelNames[i] : `Division ${i + 1}`;
        await db.prepare(`
          INSERT INTO event_divisions (id, event_id, age_group, division_level, max_teams, min_teams, price_cents, game_format, period_length_minutes, num_periods, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `).bind(
          newId, eventId, age_group, level,
          max_per_division, templateDiv.min_teams || 3,
          templateDiv.price_cents, templateDiv.game_format,
          templateDiv.period_length_minutes, templateDiv.num_periods
        ).run();
        divisionIds.push(newId);
      }
    }
    // Update the first division's level name if it doesn't have one matching the scheme
    const firstLevel = levelNames[0];
    await db.prepare(`UPDATE event_divisions SET division_level = ?, max_teams = ? WHERE id = ?`).bind(firstLevel, max_per_division, divisionIds[0]).run();
  }

  // Snake-draft teams into divisions by MHR ranking
  // Round 0: 0→Div0, 1→Div1, 2→Div2 ...
  // Round 1: (numDiv-1)→Div0, (numDiv-2)→Div1 ...
  const assignments: { teamId: string; registrationId: string; divisionId: string; divIndex: number }[] = [];
  teams.forEach((team: any, idx: number) => {
    const round = Math.floor(idx / numDivisions);
    const divIdx = round % 2 === 0 ? idx % numDivisions : numDivisions - 1 - (idx % numDivisions);
    assignments.push({
      teamId: team.team_id,
      registrationId: team.registration_id,
      divisionId: divisionIds[divIdx],
      divIndex: divIdx,
    });
  });

  // Update all registrations with their new division
  for (const a of assignments) {
    await db.prepare(`UPDATE registrations SET event_division_id = ? WHERE id = ?`).bind(a.divisionId, a.registrationId).run();
  }

  // Update current_team_count for all affected divisions
  for (const divId of divisionIds) {
    const count = assignments.filter(a => a.divisionId === divId).length;
    await db.prepare(`UPDATE event_divisions SET current_team_count = ? WHERE id = ?`).bind(count, divId).run();
  }

  return c.json({
    success: true,
    data: {
      splits: numDivisions,
      divisions: divisionIds,
      assignments: assignments.length,
      message: `Split ${teams.length} ${age_group} teams into ${numDivisions} divisions of ~${max_per_division}`,
    },
  });
});

// Move a team from one division to another
const moveTeamSchema = z.object({
  registration_id: z.string(),
  target_division_id: z.string(),
});

schedulingRoutes.post('/events/:eventId/move-team', authMiddleware, requireRole('admin', 'director'), zValidator('json', moveTeamSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const { registration_id, target_division_id } = c.req.valid('json');
  const db = c.env.DB;

  // Verify registration exists
  const reg = await db.prepare(`SELECT * FROM registrations WHERE id = ? AND event_id = ?`).bind(registration_id, eventId).first<any>();
  if (!reg) return c.json({ success: false, error: 'Registration not found' }, 404);

  // Verify target division exists and belongs to the same event
  const targetDiv = await db.prepare(`SELECT * FROM event_divisions WHERE id = ? AND event_id = ?`).bind(target_division_id, eventId).first<any>();
  if (!targetDiv) return c.json({ success: false, error: 'Target division not found' }, 404);

  const oldDivId = reg.event_division_id;
  if (oldDivId === target_division_id) return c.json({ success: true, message: 'Already in that division' });

  // Move registration
  await db.prepare(`UPDATE registrations SET event_division_id = ? WHERE id = ?`).bind(target_division_id, registration_id).run();

  // Update team counts on both divisions
  await db.prepare(`UPDATE event_divisions SET current_team_count = (SELECT COUNT(*) FROM registrations WHERE event_division_id = ? AND status = 'approved') WHERE id = ?`).bind(oldDivId, oldDivId).run();
  await db.prepare(`UPDATE event_divisions SET current_team_count = (SELECT COUNT(*) FROM registrations WHERE event_division_id = ? AND status = 'approved') WHERE id = ?`).bind(target_division_id, target_division_id).run();

  return c.json({ success: true, message: 'Team moved successfully' });
});

// Create a new division under an age group
const createDivisionSchema = z.object({
  age_group: z.string(),
  division_level: z.string(),
});

schedulingRoutes.post('/events/:eventId/create-division', authMiddleware, requireRole('admin', 'director'), zValidator('json', createDivisionSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const { age_group, division_level } = c.req.valid('json');
  const db = c.env.DB;

  // Get template from existing division in this age group
  const template = await db.prepare(`
    SELECT * FROM event_divisions WHERE event_id = ? AND age_group = ? LIMIT 1
  `).bind(eventId, age_group).first<any>();

  const newId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO event_divisions (id, event_id, age_group, division_level, max_teams, min_teams, price_cents, game_format, period_length_minutes, num_periods, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `).bind(
    newId, eventId, age_group, division_level,
    template?.max_teams || 6, template?.min_teams || 3,
    template?.price_cents || 0, template?.game_format || '5v5',
    template?.period_length_minutes || 12, template?.num_periods || 3
  ).run();

  return c.json({ success: true, data: { id: newId, age_group, division_level } });
});

// Delete an empty division
schedulingRoutes.delete('/events/:eventId/divisions/:divisionId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const divisionId = c.req.param('divisionId');
  const db = c.env.DB;

  // Check no teams are in this division (ANY status — FK constraint is on all registrations, not just approved)
  const count = await db.prepare(`SELECT COUNT(*) as c FROM registrations WHERE event_division_id = ?`).bind(divisionId).first<any>();
  if (count && count.c > 0) {
    return c.json({ success: false, error: 'Cannot delete division with teams — move teams first' }, 400);
  }

  // Clean up any games + pool_standings referencing this division (FK without CASCADE)
  const gf = `game_id IN (SELECT id FROM games WHERE event_division_id = '${divisionId}')`;
  for (const t of ['referee_game_assignments','game_lineups','game_three_stars','goalie_game_stats','shootout_rounds','game_period_scores','game_notes','game_coaches','game_officials']) {
    try { await db.prepare(`DELETE FROM ${t} WHERE ${gf}`).run(); } catch (_) {}
  }
  await db.prepare(`DELETE FROM pool_standings WHERE event_division_id = ?`).bind(divisionId).run();
  await db.prepare(`DELETE FROM games WHERE event_division_id = ?`).bind(divisionId).run();
  // Also clean up champions referencing this division
  try { await db.prepare(`DELETE FROM champions WHERE event_division_id = ?`).bind(divisionId).run(); } catch (_) {}

  await db.prepare(`DELETE FROM event_divisions WHERE id = ? AND event_id = ?`).bind(divisionId, eventId).run();
  return c.json({ success: true, message: 'Division deleted' });
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
  private rinkConfig: Record<string, { firstMinute: number; lastMinute: number; blocked: { start: number; end: number; date: string | null }[] }>;

  constructor(
    days: Date[], firstMinute: number, lastMinute: number, gameDuration: number, restTime: number, rinks: any[],
    rinkConfig: Record<string, { firstMinute: number; lastMinute: number; blocked: { start: number; end: number; date: string | null }[] }> = {}
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
  private isBlocked(rinkId: string | null, startMinutes: number, date?: string): boolean {
    if (!rinkId) return false;
    const rc = this.rinkConfig[rinkId];
    if (!rc || !rc.blocked) return false;
    const endMinutes = startMinutes + this.gameDuration;
    for (const block of rc.blocked) {
      // If block has a date, only apply on that date
      if (block.date && date && block.date !== date) continue;
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

  /**
   * Get next available time slot.
   * @param allowedDays - which event days to search
   * @param slotDurationOverride - total time needed (game + rest)
   * @param preferredRinkIds - if set, try these rinks first; if full, overflow to any rink
   * @returns slot info with `overflow: true` if it landed on a non-preferred rink
   */
  getNextSlot(allowedDays: Date[], slotDurationOverride?: number, preferredRinkIds?: string[]): { date: Date; startMinutes: number; rinkId: string | null; overflow: boolean } | null {
    const slotDuration = slotDurationOverride || (this.gameDuration + this.restTime);

    const findBestSlot = (rinkFilter?: string[]) => {
      let best: { date: Date; startMinutes: number; rinkId: string | null; key: string } | null = null;
      for (const day of allowedDays) {
        for (const rink of this.rinks) {
          // If filtering by rink, skip non-matching rinks
          if (rinkFilter && rinkFilter.length > 0 && !rinkFilter.includes(rink.id)) continue;

          const dayStr = day.toISOString().split('T')[0];
          const key = `${dayStr}|${rink.id}`;
          let nextMinute = this.slotIndex.get(key) || this.firstMinute;
          const rinkLast = this.getRinkLastMinute(rink.id);

          // Skip past any blocked windows
          let safety = 0;
          while (this.isBlocked(rink.id, nextMinute, dayStr) && safety < 100) {
            const rc = rink.id ? this.rinkConfig[rink.id] : null;
            if (rc) {
              for (const block of rc.blocked) {
                if (block.date && block.date !== dayStr) continue;
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
      return best;
    };

    // Try preferred rinks first (if any are configured)
    let best = (preferredRinkIds && preferredRinkIds.length > 0) ? findBestSlot(preferredRinkIds) : null;
    let overflow = false;

    // If no preferred rink slot available, fall back to any rink (overflow)
    if (!best) {
      best = findBestSlot();
      if (best && preferredRinkIds && preferredRinkIds.length > 0) overflow = true;
    }

    if (best) {
      // Advance the slot using the actual slot duration
      let nextAvail = best.startMinutes + slotDuration;
      // Pre-skip blocked windows for the next call
      const bestDayStr = best.date.toISOString().split('T')[0];
      if (best.rinkId && this.rinkConfig[best.rinkId]) {
        let safety = 0;
        while (this.isBlocked(best.rinkId, nextAvail, bestDayStr) && safety < 100) {
          for (const block of this.rinkConfig[best.rinkId].blocked) {
            if (block.date && block.date !== bestDayStr) continue;
            if (nextAvail < block.end && nextAvail + this.gameDuration > block.start) {
              nextAvail = block.end + this.restTime;
              break;
            }
          }
          safety++;
        }
      }
      this.slotIndex.set(best.key, nextAvail);
      return { date: best.date, startMinutes: best.startMinutes, rinkId: best.rinkId, overflow };
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
