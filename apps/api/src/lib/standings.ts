/*
  Pool standings with real tiebreakers, and bracket auto-advancement.

  Tiebreaker order (applied within a pool, standard USA Hockey-style — the
  exact sequence is intentionally in ONE place so it can be adjusted):
    1. Points (2 for a win, 1 for a tie)
    2. Head-to-head points, only when exactly two teams are tied
    3. Most wins
    4. Goal differential
    5. Fewest goals against
    6. Most goals for
    7. Still tied -> alphabetical, flagged 'unresolved' so admins see it

  Bracket auto-advancement fills a bracket game's empty team slots from:
    - "Nth Place <pool>" placeholders (CSV upload style, e.g. "1st Place Blue",
      "2nd Place Pool A") once every pool game in that pool is final
    - "Winner Game N" / "Loser Game N" placeholders once game N is final
  It only fills slots whose team id is NULL, so re-running is always safe;
  with force=true it re-resolves slots on games that haven't started yet
  (covers score corrections that change seeding).
*/

const TEAM_NAME_SQL = `COALESCE(t.schedule_name, CASE WHEN t.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = t.organization_id), t.name) || ' (' || TRIM(SUBSTR(t.head_coach_name, INSTR(t.head_coach_name, ' '))) || ')' ELSE t.name END)`;

export interface StandingRow {
  event_division_id: string;
  age_group: string;
  division_level: string | null;
  pool_name: string | null;
  team_id: string;
  team_name: string;
  team_logo: string | null;
  games_played: number;
  wins: number;
  losses: number;
  ties: number;
  goals_for: number;
  goals_against: number;
  points: number;
  goal_differential: number;
  rank: number;
  tiebreaker: string | null;
}

interface PoolGame {
  id: string;
  event_division_id: string;
  pool_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
  status: string;
  game_number: number | null;
}

interface TeamMeta { team_id: string; team_name: string; team_logo: string | null }

function poolKey(divId: string, pool: string | null): string {
  return `${divId}|${(pool || '').trim().toLowerCase()}`;
}

export async function computeStandings(
  db: D1Database,
  eventId: string,
  divisionId?: string
): Promise<{ standings: StandingRow[]; poolComplete: Map<string, boolean> }> {
  let gq = `
    SELECT g.id, g.event_division_id, g.pool_name, g.home_team_id, g.away_team_id,
           g.home_score, g.away_score, g.status, g.game_number
    FROM games g WHERE g.event_id = ? AND g.game_type = 'pool'`;
  const params: string[] = [eventId];
  if (divisionId) { gq += ' AND g.event_division_id = ?'; params.push(divisionId); }
  const games = ((await db.prepare(gq).bind(...params).all<PoolGame>()).results || []);

  // Team metadata for every team that appears in a pool game
  const teamIds = Array.from(new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]).filter(Boolean))) as string[];
  const meta = new Map<string, TeamMeta>();
  for (let i = 0; i < teamIds.length; i += 50) {
    const chunk = teamIds.slice(i, i + 50);
    const rows = await db.prepare(
      `SELECT t.id as team_id, ${TEAM_NAME_SQL} as team_name, t.logo_url as team_logo FROM teams t WHERE t.id IN (${chunk.map(() => '?').join(',')})`
    ).bind(...chunk).all<TeamMeta>();
    for (const r of (rows.results || [])) meta.set(r.team_id, r);
  }

  const divMeta = new Map<string, { age_group: string; division_level: string | null }>();
  const divIds = Array.from(new Set(games.map(g => g.event_division_id)));
  for (const d of divIds) {
    const row = await db.prepare('SELECT age_group, division_level FROM event_divisions WHERE id = ?').bind(d).first<any>();
    if (row) divMeta.set(d, row);
  }

  // Accumulate stats per (division, pool, team) from FINAL games only;
  // scheduled games still register the team so pre-tournament standings show 0s.
  const buckets = new Map<string, Map<string, StandingRow>>();
  const finalsByBucket = new Map<string, PoolGame[]>();
  const poolComplete = new Map<string, boolean>();

  for (const g of games) {
    const key = poolKey(g.event_division_id, g.pool_name);
    if (!buckets.has(key)) buckets.set(key, new Map());
    if (!finalsByBucket.has(key)) finalsByBucket.set(key, []);
    if (!poolComplete.has(key)) poolComplete.set(key, true);
    if (g.status !== 'final') poolComplete.set(key, false);

    for (const side of ['home', 'away'] as const) {
      const tid = side === 'home' ? g.home_team_id : g.away_team_id;
      if (!tid) { poolComplete.set(key, false); continue; }
      const bucket = buckets.get(key)!;
      if (!bucket.has(tid)) {
        const m = meta.get(tid);
        const dm = divMeta.get(g.event_division_id);
        bucket.set(tid, {
          event_division_id: g.event_division_id,
          age_group: dm?.age_group || '',
          division_level: dm?.division_level || null,
          pool_name: g.pool_name,
          team_id: tid,
          team_name: m?.team_name || 'Unknown Team',
          team_logo: m?.team_logo || null,
          games_played: 0, wins: 0, losses: 0, ties: 0,
          goals_for: 0, goals_against: 0, points: 0, goal_differential: 0,
          rank: 0, tiebreaker: null,
        });
      }
    }

    if (g.status === 'final' && g.home_team_id && g.away_team_id) {
      finalsByBucket.get(key)!.push(g);
      const bucket = buckets.get(key)!;
      const home = bucket.get(g.home_team_id)!;
      const away = bucket.get(g.away_team_id)!;
      home.games_played++; away.games_played++;
      home.goals_for += g.home_score; home.goals_against += g.away_score;
      away.goals_for += g.away_score; away.goals_against += g.home_score;
      if (g.home_score > g.away_score) { home.wins++; away.losses++; }
      else if (g.home_score < g.away_score) { away.wins++; home.losses++; }
      else { home.ties++; away.ties++; }
    }
  }

  const standings: StandingRow[] = [];
  for (const [key, bucket] of buckets) {
    const rows = Array.from(bucket.values());
    for (const r of rows) {
      r.points = r.wins * 2 + r.ties;
      r.goal_differential = r.goals_for - r.goals_against;
    }
    const finals = finalsByBucket.get(key) || [];
    rankPool(rows, finals);
    standings.push(...rows);
  }

  standings.sort((a, b) =>
    a.age_group.localeCompare(b.age_group) ||
    (a.division_level || '').localeCompare(b.division_level || '') ||
    (a.pool_name || '').localeCompare(b.pool_name || '') ||
    a.rank - b.rank
  );

  return { standings, poolComplete };
}

/** Head-to-head points between exactly two teams across their pool meetings. */
function headToHead(finals: PoolGame[], a: string, b: string): number {
  // positive -> a ahead, negative -> b ahead, 0 -> even
  let aPts = 0, bPts = 0;
  for (const g of finals) {
    const pair = [g.home_team_id, g.away_team_id];
    if (!(pair.includes(a) && pair.includes(b))) continue;
    if (g.home_score === g.away_score) { aPts += 1; bPts += 1; continue; }
    const winner = g.home_score > g.away_score ? g.home_team_id : g.away_team_id;
    if (winner === a) aPts += 2; else bPts += 2;
  }
  return aPts - bPts;
}

function rankPool(rows: StandingRow[], finals: PoolGame[]) {
  rows.sort((a, b) => b.points - a.points);

  // Break rows into tie groups on points, resolve each group
  const ranked: StandingRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const group = rows.filter(r => r.points === rows[i].points);
    if (group.length === 1) {
      ranked.push(group[0]);
    } else if (group.length === 2) {
      const [a, b] = group;
      const h2h = headToHead(finals, a.team_id, b.team_id);
      if (h2h !== 0) {
        const pair = h2h > 0 ? [a, b] : [b, a];
        pair[0].tiebreaker = 'head-to-head'; pair[1].tiebreaker = 'head-to-head';
        ranked.push(...pair);
      } else {
        ranked.push(...resolveByStats(group));
      }
    } else {
      ranked.push(...resolveByStats(group));
    }
    i += group.length;
  }

  ranked.forEach((r, idx) => { r.rank = idx + 1; });
  rows.length = 0;
  rows.push(...ranked);
}

function resolveByStats(group: StandingRow[]): StandingRow[] {
  const sorted = [...group].sort((a, b) =>
    b.wins - a.wins ||
    b.goal_differential - a.goal_differential ||
    a.goals_against - b.goals_against ||
    b.goals_for - a.goals_for ||
    a.team_name.localeCompare(b.team_name)
  );
  for (let j = 0; j < sorted.length; j++) {
    const r = sorted[j];
    const peer = sorted.find(o => o !== r &&
      o.wins === r.wins && o.goal_differential === r.goal_differential &&
      o.goals_against === r.goals_against && o.goals_for === r.goals_for);
    r.tiebreaker = peer ? 'unresolved' : (r.tiebreaker || 'stats');
  }
  return sorted;
}

// ==========================================
// Bracket auto-advancement
// ==========================================

interface BracketGame {
  id: string;
  event_division_id: string;
  game_number: number | null;
  game_type: string;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
  home_score: number;
  away_score: number;
}

const PLACE_RE = /^\s*(\d+)\s*(?:st|nd|rd|th)?\s*place\s*(?:pool\s*)?(.*?)\s*$/i;
const WINNER_RE = /^\s*winner\s*(?:of\s*)?(?:game\s*)?#?\s*(\d+)\s*$/i;
const LOSER_RE = /^\s*loser\s*(?:of\s*)?(?:game\s*)?#?\s*(\d+)\s*$/i;

export async function resolveBracketGames(
  db: D1Database,
  eventId: string,
  opts: { force?: boolean } = {}
): Promise<{ filled: number; details: string[] }> {
  const details: string[] = [];
  let filled = 0;

  const games = ((await db.prepare(`
    SELECT id, event_division_id, game_number, game_type, status,
           home_team_id, away_team_id, home_placeholder, away_placeholder,
           home_score, away_score
    FROM games WHERE event_id = ?
  `).bind(eventId).all<BracketGame>()).results || []);

  const byNumber = new Map<number, BracketGame>();
  for (const g of games) { if (g.game_number != null) byNumber.set(g.game_number, g); }

  const { standings, poolComplete } = await computeStandings(db, eventId);

  const resolveSlot = (g: BracketGame, placeholder: string | null): { teamId: string | null; note?: string } => {
    if (!placeholder) return { teamId: null };

    let m = placeholder.match(PLACE_RE);
    if (m) {
      const rank = parseInt(m[1], 10);
      const label = (m[2] || '').trim().toLowerCase();
      const divRows = standings.filter(r => r.event_division_id === g.event_division_id);
      const pools = Array.from(new Set(divRows.map(r => (r.pool_name || '').trim().toLowerCase())));
      let pool: string;
      if (label) {
        const match = pools.find(p => p === label || p === `pool ${label}` || `pool ${p}` === label);
        if (match === undefined) return { teamId: null, note: `no pool matching "${m[2]}"` };
        pool = match;
      } else if (pools.length === 1) {
        pool = pools[0];
      } else {
        return { teamId: null, note: 'placeholder names no pool and division has several' };
      }
      const key = `${g.event_division_id}|${pool}`;
      if (!poolComplete.get(key)) return { teamId: null, note: `pool "${pool || '(default)'}" not finished` };
      const row = divRows.find(r => (r.pool_name || '').trim().toLowerCase() === pool && r.rank === rank);
      if (!row) return { teamId: null, note: `no rank ${rank} in pool "${pool}"` };
      if (row.tiebreaker === 'unresolved') return { teamId: null, note: `rank ${rank} tie unresolved — needs admin decision` };
      return { teamId: row.team_id };
    }

    m = placeholder.match(WINNER_RE) || placeholder.match(LOSER_RE);
    if (m) {
      const wantLoser = LOSER_RE.test(placeholder);
      const src = byNumber.get(parseInt(m[1], 10));
      if (!src) return { teamId: null, note: `game ${m[1]} not found` };
      if (src.status !== 'final') return { teamId: null, note: `game ${m[1]} not final` };
      if (!src.home_team_id || !src.away_team_id) return { teamId: null, note: `game ${m[1]} has unresolved teams` };
      if (src.home_score === src.away_score) return { teamId: null, note: `game ${m[1]} ended tied — needs admin decision` };
      const winner = src.home_score > src.away_score ? src.home_team_id : src.away_team_id;
      const loser = winner === src.home_team_id ? src.away_team_id : src.home_team_id;
      return { teamId: wantLoser ? loser : winner };
    }

    return { teamId: null };
  };

  for (const g of games) {
    if (g.game_type === 'pool') continue;
    const rewritable = opts.force && g.status === 'scheduled';
    const slots: Array<['home' | 'away', string | null, string | null]> = [
      ['home', g.home_team_id, g.home_placeholder],
      ['away', g.away_team_id, g.away_placeholder],
    ];
    for (const [side, currentId, placeholder] of slots) {
      if (currentId && !rewritable) continue;
      const { teamId, note } = resolveSlot(g, placeholder);
      if (note) details.push(`Game ${g.game_number ?? g.id.slice(0, 8)} ${side}: ${note}`);
      if (teamId && teamId !== currentId) {
        await db.prepare(
          `UPDATE games SET ${side === 'home' ? 'home_team_id' : 'away_team_id'} = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(teamId, g.id).run();
        filled++;
        details.push(`Game ${g.game_number ?? g.id.slice(0, 8)} ${side}: filled from "${placeholder}"`);
        if (side === 'home') g.home_team_id = teamId; else g.away_team_id = teamId;
        if (g.game_number != null) byNumber.set(g.game_number, g);
      }
    }
  }

  // A newly-filled bracket game can feed a later "Winner Game N" slot in the
  // same pass (championship waiting on a semifinal that just resolved) — but
  // only source games that are FINAL feed forward, and those were current in
  // byNumber, so a single pass is enough; deeper chains resolve on the next
  // game_end call. Run once more only if we filled anything, to be safe.
  return { filled, details };
}
