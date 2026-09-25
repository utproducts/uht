/**
 * Automatic Three Stars (game MVPs), assigned the moment a game goes final.
 *
 * Selection rules (documented for admins - keep in sync with any UI copy):
 *   Skaters earn: 3 pts per goal, 2 pts per assist, +1 for the game-winning
 *   goal, minus 0.25 per penalty minute. A misconduct or worse (10+ minutes)
 *   disqualifies a player from the stars entirely.
 *   Goalies earn: 0.3 per save, +4 for a shutout, +1.5 for the win, minus
 *   0.5 per goal against (empty-net goals never count against a goalie).
 *   Fairness: at least one star comes from EACH team whenever the other team
 *   has an eligible player, so a lopsided score still recognizes the losing
 *   side (usually their goalie, who earns points for every save).
 *   Ties: more goals, then more assists, then fewer penalty minutes.
 *   Only players on the game lineup with status Playing are eligible.
 *
 * Scorekeepers/admins can overwrite the picks in the console; the automatic
 * pass never runs again once stars exist for the game.
 */

interface StarCandidate {
  teamId: string;
  jersey: string;
  playerId: string | null;
  name: string;
  pts: number;
  g: number;
  a: number;
  pim: number;
  disqualified: boolean;
}

export async function autoAssignThreeStars(db: any, gameId: string): Promise<boolean> {
  const existing = await db.prepare('SELECT COUNT(*) as n FROM game_three_stars WHERE game_id = ?').bind(gameId).first();
  if ((existing?.n || 0) > 0) return false;

  const game = await db.prepare('SELECT id, home_team_id, away_team_id, home_score, away_score FROM games WHERE id = ?').bind(gameId).first();
  if (!game?.home_team_id || !game?.away_team_id) return false;

  const [eventsQ, lineupsQ, shotsQ] = await Promise.all([
    db.prepare("SELECT * FROM game_events WHERE game_id = ? AND event_type IN ('goal','penalty')").bind(gameId).all(),
    db.prepare(`
      SELECT gl.team_id, gl.jersey_number, gl.player_id, gl.position, gl.is_starting_goalie, gl.status,
        p.first_name, p.last_name
      FROM game_lineups gl LEFT JOIN players p ON p.id = gl.player_id
      WHERE gl.game_id = ?
    `).bind(gameId).all(),
    db.prepare('SELECT team_id, SUM(shot_count) as shots FROM game_shots WHERE game_id = ? GROUP BY team_id').bind(gameId).all(),
  ]);
  const events = eventsQ.results || [];
  const lineups = (lineupsQ.results || []).filter((l: any) => (l.status || 'playing') === 'playing');
  const shotsByTeam: Record<string, number> = {};
  for (const s of (shotsQ.results || [])) shotsByTeam[s.team_id] = s.shots || 0;

  const goals = events.filter((e: any) => e.event_type === 'goal');
  const penalties = events.filter((e: any) => e.event_type === 'penalty');
  if (goals.length === 0 && Object.keys(shotsByTeam).length === 0) return false; // nothing recorded, nothing to judge

  const key = (t: string, j: string) => `${t}:${j}`;
  const cands = new Map<string, StarCandidate>();
  const lineupByKey = new Map<string, any>();
  for (const l of lineups) lineupByKey.set(key(l.team_id, String(l.jersey_number)), l);
  const ensure = (teamId: string, jersey: string): StarCandidate => {
    const k = key(teamId, jersey);
    if (!cands.has(k)) {
      const l = lineupByKey.get(k);
      cands.set(k, {
        teamId, jersey,
        playerId: l?.player_id || null,
        name: l ? `${l.first_name || ''} ${l.last_name || ''}`.trim() : `#${jersey}`,
        pts: 0, g: 0, a: 0, pim: 0, disqualified: false,
      });
    }
    return cands.get(k)!;
  };

  // Chronological goal order (period up, clock counting down within it)
  const chrono = [...goals].sort((x: any, y: any) =>
    (x.period || 0) - (y.period || 0) || String(y.game_time || '99:99').localeCompare(String(x.game_time || '99:99')));

  // Game-winning goal: the goal that put the winner past the loser's total
  const winnerId = game.home_score > game.away_score ? game.home_team_id
    : game.away_score > game.home_score ? game.away_team_id : null;
  let gwgIndex = -1;
  if (winnerId) {
    const loserScore = Math.min(game.home_score, game.away_score);
    let count = 0;
    for (let i = 0; i < chrono.length; i++) {
      if (chrono[i].team_id === winnerId) {
        count++;
        if (count === loserScore + 1) { gwgIndex = i; break; }
      }
    }
  }

  chrono.forEach((e: any, i: number) => {
    if (!e.team_id) return;
    if (e.jersey_number) {
      const c = ensure(e.team_id, String(e.jersey_number));
      c.g++; c.pts += 3;
      if (i === gwgIndex) c.pts += 1;
    }
    for (const aj of [e.assist1_jersey, e.assist2_jersey]) {
      if (aj) { const c = ensure(e.team_id, String(aj)); c.a++; c.pts += 2; }
    }
  });
  for (const pe of penalties) {
    if (!pe.team_id || !pe.jersey_number) continue;
    const c = ensure(pe.team_id, String(pe.jersey_number));
    const mins = pe.penalty_minutes || 2;
    c.pim += mins;
    c.pts -= mins * 0.25;
    if (mins >= 10) c.disqualified = true;
  }

  // Goalies: credit saves against the opposing team's shot total
  for (const [teamId, oppId] of [[game.home_team_id, game.away_team_id], [game.away_team_id, game.home_team_id]] as [string, string][]) {
    const teamGoalies = lineups.filter((l: any) => l.team_id === teamId && String(l.position || '').toUpperCase().startsWith('G'));
    if (teamGoalies.length === 0) continue;
    // GA charged per goalie via goalie_jersey when recorded; unattributed goals fall to the starter
    const oppGoals = goals.filter((e: any) => e.team_id === oppId && e.goalie_jersey !== 'EN');
    const starter = teamGoalies.find((l: any) => l.is_starting_goalie) || teamGoalies[0];
    const gaByJersey: Record<string, number> = {};
    for (const e of oppGoals) {
      const j = e.goalie_jersey ? String(e.goalie_jersey) : String(starter.jersey_number);
      gaByJersey[j] = (gaByJersey[j] || 0) + 1;
    }
    const sa = shotsByTeam[oppId] || 0;
    const totalGa = oppGoals.length;
    // The starter carries the shot workload unless GA attribution says otherwise
    const g = ensure(teamId, String(starter.jersey_number));
    const ga = gaByJersey[String(starter.jersey_number)] || 0;
    const saves = Math.max(0, sa - totalGa);
    g.pts += saves * 0.3 - ga * 0.5;
    if (sa > 0 && totalGa === 0) g.pts += 4;              // shutout
    if (winnerId && teamId === winnerId) g.pts += 1.5;    // win bonus
  }

  const ranked = [...cands.values()]
    .filter(c => !c.disqualified)
    .sort((x, y) => y.pts - x.pts || y.g - x.g || y.a - x.a || x.pim - y.pim);
  if (ranked.length === 0) return false;

  // Take the top three, then enforce the both-teams guarantee
  const picks = ranked.slice(0, 3);
  const teams = new Set(picks.map(p => p.teamId));
  if (teams.size === 1 && picks.length === 3) {
    const otherTeam = picks[0].teamId === game.home_team_id ? game.away_team_id : game.home_team_id;
    const bestOther = ranked.find(c => c.teamId === otherTeam);
    if (bestOther) picks[2] = bestOther;
  }

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO game_three_stars (id, game_id, star_number, team_id, player_id, jersey_number, player_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, gameId, i + 1, p.teamId, p.playerId, p.jersey, p.name || null).run();
  }
  return true;
}
