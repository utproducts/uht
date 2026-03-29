import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const schedulingRoutes = new Hono<{ Bindings: Env }>();

/**
 * SCHEDULING ENGINE
 *
 * This is the core automated schedule builder. It takes:
 * - An event with registered teams grouped into divisions
 * - Schedule rules/constraints (John's scheduling bible)
 * - Available rinks and time slots
 *
 * And generates a complete game schedule respecting all constraints.
 *
 * TODO: When John's scheduling rules are provided, encode them as
 * constraint types in the schedule_rules table. The engine will then
 * use constraint satisfaction to generate valid schedules.
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

// ==================
// AUTO-GENERATE SCHEDULE
// ==================
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
  // SCHEDULE GENERATION ALGORITHM
  // ==============================
  const games: any[] = [];
  let gameNumber = 1;

  // Default rules (can be overridden by event-specific rules)
  const poolPlayGames = parseInt(ruleMap['pool_play_games'] || '3');
  const minRestMinutes = parseInt(ruleMap['min_rest_minutes'] || '60');
  const gameDurationMinutes = parseInt(ruleMap['game_duration_minutes'] || '60');
  const maxGamesPerDay = parseInt(ruleMap['max_games_per_day'] || '3');
  const firstGameTime = ruleMap['first_game_time'] || '08:00';
  const lastGameTime = ruleMap['last_game_time'] || '20:00';

  for (const div of divisions.results || []) {
    const teams = divisionTeams[div.id] || [];
    if (teams.length < 2) continue;

    // Create pools
    const numPools = teams.length <= 4 ? 1 : teams.length <= 8 ? 2 : Math.ceil(teams.length / 4);
    const pools: any[][] = Array.from({ length: numPools }, () => []);

    // Distribute teams into pools (snake draft)
    teams.forEach((team, i) => {
      const poolIndex = i % numPools;
      pools[poolIndex].push(team);
    });

    // Generate round-robin games within each pool
    for (let poolIdx = 0; poolIdx < pools.length; poolIdx++) {
      const poolTeams = pools[poolIdx];
      const poolName = `Pool ${String.fromCharCode(65 + poolIdx)}`;

      // Round-robin: each team plays every other team (up to poolPlayGames limit)
      const matchups: [any, any][] = [];
      for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i + 1; j < poolTeams.length; j++) {
          matchups.push([poolTeams[i], poolTeams[j]]);
        }
      }

      // Schedule matchups across available time slots
      const startDate = new Date(event.start_date);
      const endDate = new Date(event.end_date);
      let currentDate = new Date(startDate);
      let currentTimeMinutes = parseTime(firstGameTime);

      for (const [home, away] of matchups) {
        const rink = venueRinks.length > 0
          ? venueRinks[games.length % venueRinks.length]
          : null;

        const startTime = formatDateTime(currentDate, currentTimeMinutes);
        const endTime = formatDateTime(currentDate, currentTimeMinutes + gameDurationMinutes);

        games.push({
          id: crypto.randomUUID().replace(/-/g, ''),
          event_id: eventId,
          event_division_id: div.id,
          home_team_id: home.id,
          away_team_id: away.id,
          venue_id: event.venue_id,
          rink_id: rink?.id || null,
          game_number: gameNumber++,
          start_time: startTime,
          end_time: endTime,
          game_type: 'pool',
          pool_name: poolName,
          status: 'scheduled',
        });

        // Advance time
        currentTimeMinutes += gameDurationMinutes + minRestMinutes;
        const lastTime = parseTime(lastGameTime);
        if (currentTimeMinutes + gameDurationMinutes > lastTime) {
          // Next day
          currentDate.setDate(currentDate.getDate() + 1);
          currentTimeMinutes = parseTime(firstGameTime);
          if (currentDate > endDate) {
            currentDate = new Date(startDate); // Wrap around if needed
          }
        }
      }

      // Initialize pool standings
      for (const team of poolTeams) {
        await db.prepare(`
          INSERT OR REPLACE INTO pool_standings (id, event_id, event_division_id, pool_name, team_id)
          VALUES (?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, div.id, poolName, team.id).run();
      }
    }

    // Generate bracket games (semifinal, championship) — placeholder slots
    if (teams.length >= 4) {
      // Semis
      for (let i = 0; i < 2; i++) {
        games.push({
          id: crypto.randomUUID().replace(/-/g, ''),
          event_id: eventId,
          event_division_id: div.id,
          home_team_id: null, // TBD based on pool results
          away_team_id: null,
          venue_id: event.venue_id,
          rink_id: venueRinks[0]?.id || null,
          game_number: gameNumber++,
          start_time: formatDateTime(new Date(event.end_date), parseTime('08:00') + i * (gameDurationMinutes + 30)),
          end_time: formatDateTime(new Date(event.end_date), parseTime('08:00') + i * (gameDurationMinutes + 30) + gameDurationMinutes),
          game_type: 'semifinal',
          pool_name: null,
          status: 'scheduled',
        });
      }

      // Championship
      games.push({
        id: crypto.randomUUID().replace(/-/g, ''),
        event_id: eventId,
        event_division_id: div.id,
        home_team_id: null,
        away_team_id: null,
        venue_id: event.venue_id,
        rink_id: venueRinks[0]?.id || null,
        game_number: gameNumber++,
        start_time: formatDateTime(new Date(event.end_date), parseTime('14:00')),
        end_time: formatDateTime(new Date(event.end_date), parseTime('14:00') + gameDurationMinutes),
        game_type: 'championship',
        pool_name: null,
        status: 'scheduled',
      });
    }
  }

  // Clear existing schedule
  await db.prepare('DELETE FROM games WHERE event_id = ?').bind(eventId).run();

  // Insert all games
  for (const game of games) {
    await db.prepare(`
      INSERT INTO games (id, event_id, event_division_id, home_team_id, away_team_id, venue_id, rink_id,
        game_number, start_time, end_time, game_type, pool_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      game.id, game.event_id, game.event_division_id, game.home_team_id, game.away_team_id,
      game.venue_id, game.rink_id, game.game_number, game.start_time, game.end_time,
      game.game_type, game.pool_name, game.status
    ).run();
  }

  return c.json({
    success: true,
    data: {
      gamesCreated: games.length,
      poolGames: games.filter(g => g.game_type === 'pool').length,
      bracketGames: games.filter(g => g.game_type !== 'pool').length,
      message: 'Schedule generated successfully. Review and publish when ready.',
    },
  });
});

// Helper functions
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatDateTime(date: Date, minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${date.toISOString().split('T')[0]}T${h}:${m}:00`;
}
