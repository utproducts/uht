/**
 * Division format rules: per-event rows in schedule_rules
 * (rule_type = 'division_format') that re-apply a division's bracket
 * structure automatically after every schedule upload, so a re-upload
 * never silently reverts hand-built formats.
 *
 * rule_value JSON:
 * {
 *   "division": "Mite C",                 // matched against age_group + division_level
 *   "format": "rr_placement_championship",// last day: first game -> placement (2nd v 3rd),
 *                                         // last game -> championship (1st v winner of placement)
 *   "exhibition": [                       // optional: games that never count toward standings
 *     { "home": "orland", "away": "misfits", "nth": 1 }
 *   ]
 * }
 *
 * Idempotent: running it twice leaves the same result.
 */

const norm = (s: any) => String(s || '').toLowerCase().replace(/[().\-–—_/]/g, ' ').replace(/\s+/g, ' ').trim();

export async function applyDivisionFormatRules(db: D1Database, eventId: string): Promise<string[]> {
  const notes: string[] = [];

  const rules = (await db.prepare(
    "SELECT rule_value FROM schedule_rules WHERE event_id = ? AND rule_type = 'division_format'"
  ).bind(eventId).all<any>()).results || [];
  if (rules.length === 0) return notes;

  const divisions = (await db.prepare(
    'SELECT id, age_group, division_level FROM event_divisions WHERE event_id = ?'
  ).bind(eventId).all<any>()).results || [];

  for (const row of rules) {
    let rule: any;
    try { rule = JSON.parse(row.rule_value); } catch { notes.push('Skipped a format rule with invalid JSON'); continue; }
    const want = norm(rule.division);
    const div = divisions.find((d: any) => norm(`${d.age_group} ${d.division_level || ''}`) === want)
      || divisions.find((d: any) => norm(d.age_group) === want);
    if (!div) { notes.push(`Format rule "${rule.division}": no matching division — skipped`); continue; }

    const games = (await db.prepare(`
      SELECT g.id, g.game_number, g.start_time, g.game_type, g.status,
             COALESCE(ht.name, g.home_placeholder, '') as home_name,
             COALESCE(at.name, g.away_placeholder, '') as away_name
      FROM games g
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at ON at.id = g.away_team_id
      WHERE g.event_division_id = ? ORDER BY g.start_time, g.game_number
    `).bind(div.id).all<any>()).results || [];
    if (games.length === 0) { notes.push(`Format rule "${rule.division}": division has no games — skipped`); continue; }

    // ---- exhibitions: flag games that never count toward standings ----
    for (const ex of (Array.isArray(rule.exhibition) ? rule.exhibition : [])) {
      const h = norm(ex.home), a = norm(ex.away);
      if (!h || !a) continue;
      let hits = 0;
      const target = games.find(g => {
        const gh = norm(g.home_name), ga = norm(g.away_name);
        const match = (gh.includes(h) && ga.includes(a)) || (gh.includes(a) && ga.includes(h));
        if (match) hits++;
        return match && hits === (ex.nth || 1);
      });
      if (!target) { notes.push(`Format rule "${rule.division}": exhibition ${ex.home} vs ${ex.away} not found`); continue; }
      await db.prepare(
        "UPDATE games SET counts_toward_standings = 0, notes = 'Exhibition - does not count toward standings', updated_at = datetime('now') WHERE id = ?"
      ).bind(target.id).run();
      notes.push(`${rule.division}: ${target.home_name} vs ${target.away_name} (${target.start_time}) marked exhibition`);
    }

    // ---- bracket: last day's first game = placement 2v3, last = championship ----
    if (rule.format === 'rr_placement_championship') {
      const lastDay = games.reduce((d, g) => g.start_time.slice(0, 10) > d ? g.start_time.slice(0, 10) : d, '');
      const dayGames = games.filter(g => g.start_time.slice(0, 10) === lastDay && g.status === 'scheduled');
      if (dayGames.length < 2) {
        notes.push(`Format rule "${rule.division}": needs 2 games on the last day (${lastDay}) for placement + championship, found ${dayGames.length} — bracket left as uploaded`);
        continue;
      }
      const placement = dayGames[0];
      const champ = dayGames[dayGames.length - 1];

      let pn = placement.game_number;
      if (pn == null) {
        const mx = await db.prepare('SELECT MAX(game_number) as m FROM games WHERE event_id = ?').bind(eventId).first<any>();
        pn = (mx?.m || 0) + 1;
      }
      await db.prepare(`
        UPDATE games SET game_type = 'placement', game_number = ?, pool_name = NULL,
          home_team_id = NULL, home_placeholder = '2nd',
          away_team_id = NULL, away_placeholder = '3rd', updated_at = datetime('now')
        WHERE id = ?
      `).bind(pn, placement.id).run();
      await db.prepare(`
        UPDATE games SET game_type = 'championship', pool_name = NULL,
          home_team_id = NULL, home_placeholder = ?,
          away_team_id = NULL, away_placeholder = '1st', updated_at = datetime('now')
        WHERE id = ?
      `).bind(`Winner Game ${pn}`, champ.id).run();
      notes.push(`${rule.division}: ${lastDay} ${placement.start_time.slice(11, 16)} set to placement (2nd v 3rd), ${champ.start_time.slice(11, 16)} set to championship (1st v winner of game ${pn})`);
    }
  }

  return notes;
}
