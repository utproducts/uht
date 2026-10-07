// Schedule sanity checks, run on every CSV upload (preview AND commit) so
// structural mistakes get flagged before anyone has to eyeball the sheet.
//
// Chad's rules (2026-10-07):
//   1. Every team has at least 1 home game
//   2. A team's games on the same day must start at least 3.5 hours apart
//   3. Bracket games count too: flag potential short gaps for whichever team
//      lands in the seed (warning - seeds aren't solidified)
//   4. Every team has at least 1 away game
//   5. 6-team division: two groups of 3 - everyone plays their 2 groupmates
//      plus exactly 1 crossover game
//   6. 4 and 5 team divisions: full round robin, everyone plays everyone once
//   7. 5-team division: every team gets exactly 2 home and 2 away games

export interface CheckGame {
  div: string;                 // division label from the sheet
  start: string;               // 'YYYY-MM-DD HH:MM:SS'
  homeName: string;
  awayName: string;
  homeIsSeed: boolean;         // bracket placeholder like "1st Blue"
  awayIsSeed: boolean;
  isBracket: boolean;          // game type != pool
}

export interface ScheduleChecks {
  errors: string[];
  warnings: string[];
}

const MIN_GAP_MIN = 210; // 3.5 hours

const dateOf = (start: string) => start.slice(0, 10);
const minsOf = (start: string) => {
  const hh = parseInt(start.slice(11, 13), 10);
  const mm = parseInt(start.slice(14, 16), 10);
  return hh * 60 + mm;
};
const fmtTime = (start: string) => {
  const hh = parseInt(start.slice(11, 13), 10);
  const mm = start.slice(14, 16);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${hh >= 12 ? 'PM' : 'AM'}`;
};
const fmtDay = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
};
const fmtGap = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};

export function runScheduleChecks(games: CheckGame[]): ScheduleChecks {
  const errors: string[] = [];
  const warnings: string[] = [];

  const byDiv = new Map<string, CheckGame[]>();
  for (const g of games) {
    const key = g.div.trim();
    if (!byDiv.has(key)) byDiv.set(key, []);
    byDiv.get(key)!.push(g);
  }

  for (const [div, divGames] of byDiv) {
    const pool = divGames.filter(g => !g.isBracket);
    const bracket = divGames.filter(g => g.isBracket);

    // ---- collect teams + home/away/opponent tallies from pool play ----
    const teams = new Map<string, { home: number; away: number; opps: Map<string, number>; games: CheckGame[] }>();
    const teamOf = (name: string) => {
      const key = name.trim();
      if (!teams.has(key)) teams.set(key, { home: 0, away: 0, opps: new Map(), games: [] });
      return teams.get(key)!;
    };
    for (const g of pool) {
      if (g.homeIsSeed || g.awayIsSeed) continue;
      const h = teamOf(g.homeName), a = teamOf(g.awayName);
      h.home += 1; a.away += 1;
      h.opps.set(g.awayName.trim(), (h.opps.get(g.awayName.trim()) || 0) + 1);
      a.opps.set(g.homeName.trim(), (a.opps.get(g.homeName.trim()) || 0) + 1);
      h.games.push(g); a.games.push(g);
    }
    const names = [...teams.keys()].sort();
    const n = names.length;
    if (n === 0) continue;

    // ---- Rule 1 + 4: at least one home and one away game each ----
    for (const nm of names) {
      const t = teams.get(nm)!;
      if (t.home === 0) errors.push(`${div}: ${nm} has no home games (${t.away} away)`);
      if (t.away === 0) errors.push(`${div}: ${nm} has no away games (${t.home} home)`);
    }

    // ---- Rule 6: 4/5-team divisions are a full round robin ----
    if (n === 4 || n === 5) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const c = teams.get(names[i])!.opps.get(names[j]) || 0;
          if (c === 0) errors.push(`${div}: ${names[i]} and ${names[j]} never play each other (${n}-team division should be a round robin)`);
          if (c > 1) errors.push(`${div}: ${names[i]} and ${names[j]} play each other ${c} times (should be once)`);
        }
      }
    }

    // ---- Rule 7: 5-team division is 2 home + 2 away for everyone ----
    if (n === 5) {
      for (const nm of names) {
        const t = teams.get(nm)!;
        if (t.home !== 2 || t.away !== 2) {
          errors.push(`${div}: ${nm} has ${t.home} home / ${t.away} away (5-team division should be 2 and 2)`);
        }
      }
    }

    // ---- Rule 5: 6-team division = two groups of 3 + exactly 1 crossover each ----
    if (n === 6) {
      for (const nm of names) {
        const t = teams.get(nm)!;
        const total = t.home + t.away;
        if (total !== 3) errors.push(`${div}: ${nm} has ${total} pool games (6-team division should be exactly 3)`);
      }
      const allHaveThree = names.every(nm => (teams.get(nm)!.home + teams.get(nm)!.away) === 3);
      if (allHaveThree) {
        const plays = (a: string, b: string) => (teams.get(a)!.opps.get(b) || 0) > 0;
        let valid = false;
        // try every split of the 6 teams into two groups of 3 (anchor names[0])
        for (let i = 1; i < 6 && !valid; i++) {
          for (let j = i + 1; j < 6 && !valid; j++) {
            const g1 = [names[0], names[i], names[j]];
            const g2 = names.filter(nm => !g1.includes(nm));
            const triangles =
              plays(g1[0], g1[1]) && plays(g1[0], g1[2]) && plays(g1[1], g1[2]) &&
              plays(g2[0], g2[1]) && plays(g2[0], g2[2]) && plays(g2[1], g2[2]);
            if (!triangles) continue;
            // each team's remaining game must be a single crossover
            const crossOk = names.every(nm => {
              const t = teams.get(nm)!;
              const inG1 = g1.includes(nm);
              const mates = inG1 ? g1 : g2;
              const others = inG1 ? g2 : g1;
              let cross = 0;
              for (const [opp, c] of t.opps) {
                if (mates.includes(opp) && opp !== nm && c !== 1) return false;
                if (others.includes(opp)) cross += c;
              }
              return cross === 1;
            });
            if (crossOk) valid = true;
          }
        }
        if (!valid) errors.push(`${div}: 6-team pool games don't form two groups of 3 with 1 crossover each - check the matchups`);
      }
    }

    // ---- Rule 2: same-day games at least 3.5h apart (start to start) ----
    for (const nm of names) {
      const t = teams.get(nm)!;
      const byDay = new Map<string, number[]>();
      for (const g of t.games) {
        const d = dateOf(g.start);
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d)!.push(minsOf(g.start));
      }
      for (const [d, starts] of byDay) {
        starts.sort((a, b) => a - b);
        for (let i = 1; i < starts.length; i++) {
          const gap = starts[i] - starts[i - 1];
          if (gap < MIN_GAP_MIN) {
            errors.push(`${div}: ${nm} has games only ${fmtGap(gap)} apart on ${fmtDay(d)} (minimum 3.5h)`);
          }
        }
      }
    }

    // ---- Rule 3: bracket games vs possible participants (seeds not solid yet) ----
    for (const bg of bracket) {
      const bDay = dateOf(bg.start);
      const bMins = minsOf(bg.start);
      const seedLabels = [bg.homeIsSeed ? bg.homeName : null, bg.awayIsSeed ? bg.awayName : null].filter(Boolean).join(' / ');
      for (const nm of names) {
        const t = teams.get(nm)!;
        for (const g of t.games) {
          if (dateOf(g.start) !== bDay) continue;
          const gap = Math.abs(bMins - minsOf(g.start));
          if (gap < MIN_GAP_MIN) {
            warnings.push(`${div}: if ${nm} lands in "${seedLabels || 'bracket game'}" at ${fmtTime(bg.start)} on ${fmtDay(bDay)}, it's only ${fmtGap(gap)} from their ${fmtTime(g.start)} game`);
          }
        }
      }
      // bracket-to-bracket: only a conflict when both games can involve the
      // same team - i.e. they share a seed label (or chain on winner/loser)
      const seedsOf = (g: CheckGame) => [g.homeIsSeed ? g.homeName : null, g.awayIsSeed ? g.awayName : null]
        .filter(Boolean).map(s0 => String(s0).trim().toLowerCase());
      const bgSeeds = seedsOf(bg);
      for (const other of bracket) {
        if (other === bg) continue;
        if (dateOf(other.start) !== bDay) continue;
        const shared = seedsOf(other).filter(s0 => bgSeeds.includes(s0) || /winner|loser/.test(s0));
        if (shared.length === 0 && !bgSeeds.some(s0 => /winner|loser/.test(s0))) continue;
        const gap = minsOf(other.start) - bMins;
        if (gap > 0 && gap < MIN_GAP_MIN) {
          warnings.push(`${div}: bracket games at ${fmtTime(bg.start)} and ${fmtTime(other.start)} on ${fmtDay(bDay)} can involve the same team and are only ${fmtGap(gap)} apart`);
        }
      }
    }
  }

  // de-dupe (the same gap can be seen from both ends)
  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
