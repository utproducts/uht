/*
  Shared push-notification helpers (extracted from routes/push.ts 9/21 so the
  scoring routes and the cron can send pushes too).

  Audience fixes vs the old inline queries:
  - Legacy event_registrations rows often have team_id NULL (team matched by
    name only) — those teams' followers were silently skipped. The audience
    CTE now also matches teams by name for id-less rows, and consults the
    normalized registrations table.
  - Withdrawn/denied/rejected/abandoned registrations no longer pull their
    followers into event sends.
*/

export async function sendExpoPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<number> {
  const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  const BATCH_SIZE = 100;
  let totalSent = 0;

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    ...(data ? { data } : {}),
  }));

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        totalSent += batch.length;
      } else {
        console.error('Expo push API error:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Failed to send push batch:', err);
    }
  }

  return totalSent;
}

export async function logNotification(db: any, data: {
  type: string;
  title: string;
  body: string;
  audience: string;
  target_id: string | null;
  sent_count: number;
  sent_by: string;
  metadata?: string;
}) {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO notifications (id, type, title, body, audience, target_id, sent_count, sent_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.type, data.title, data.body, data.audience, data.target_id, data.sent_count, data.sent_by, data.metadata || null).run();
}

export async function createUserNotifications(
  db: any,
  userIds: string[],
  title: string,
  body: string,
  type: string,
  data?: Record<string, unknown>
) {
  const dataStr = data ? JSON.stringify(data) : null;
  for (const userId of userIds) {
    const id = crypto.randomUUID().replace(/-/g, '');
    try {
      await db.prepare(`
        INSERT INTO user_notifications (id, user_id, title, body, type, data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, userId, title, body, type, dataStr).run();
    } catch (e) {
      console.error('Failed to create user notification:', e);
    }
  }
}

/*
  The team set for an event (optionally one division), from BOTH registration
  tables, active statuses only, with a name fallback for id-less legacy rows.
*/
const EVENT_TEAMS_CTE = `
  WITH evt_teams AS (
    SELECT er.team_id AS tid FROM event_registrations er
      WHERE er.event_id = ?1 AND (?2 IS NULL OR er.event_division_id = ?2)
        AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment')
        AND er.team_id IS NOT NULL
    UNION
    SELECT t.id FROM event_registrations er JOIN teams t ON LOWER(TRIM(t.name)) = LOWER(TRIM(er.team_name))
      WHERE er.event_id = ?1 AND (?2 IS NULL OR er.event_division_id = ?2)
        AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment')
        AND er.team_id IS NULL
    UNION
    SELECT r.team_id FROM registrations r
      WHERE r.event_id = ?1 AND (?2 IS NULL OR r.event_division_id = ?2)
        AND r.status NOT IN ('rejected','withdrawn')
        AND r.team_id IS NOT NULL
  )
`;

/*
  TEST EVENT GATE: pushes for an is_test event only ever reach admin/director
  users - staff get the real push experience during dry runs, real parents
  and followers of the (real) teams attached to the test never hear a thing.
*/
async function applyTestGate(
  db: any,
  eventId: string | null | undefined,
  aud: { tokens: string[]; userIds: string[] }
): Promise<{ tokens: string[]; userIds: string[] }> {
  if (!eventId || aud.userIds.length === 0) return aud;
  let isTest = false;
  try {
    const ev = await db.prepare('SELECT COALESCE(is_test, 0) as t FROM events WHERE id = ?').bind(eventId).first();
    isTest = !!(ev && ev.t);
  } catch { return aud; /* can't read the event - treat as real */ }
  if (!isTest) return aud;
  // From here the event IS a test: any failure must FAIL CLOSED (send to
  // nobody), never leak the full audience. D1 caps bound params at 100, so
  // chunk the membership query.
  try {
    const tokens: string[] = [];
    const userIds = new Set<string>();
    for (let i = 0; i < aud.userIds.length; i += 50) {
      const chunk = aud.userIds.slice(i, i + 50);
      const ph = chunk.map(() => '?').join(',');
      const rows = (await db.prepare(`
        SELECT DISTINCT pt.token, pt.user_id FROM push_tokens pt
        JOIN user_roles ur ON ur.user_id = pt.user_id AND ur.role IN ('admin', 'director')
        WHERE pt.user_id IN (${ph})
      `).bind(...chunk).all()).results || [];
      for (const r of rows) { tokens.push(r.token as string); userIds.add(r.user_id as string); }
    }
    return { tokens: [...new Set(tokens)], userIds: [...userIds] };
  } catch { return { tokens: [], userIds: [] }; }
}

export async function eventAudience(
  db: any,
  eventId: string,
  divisionId?: string | null
): Promise<{ tokens: string[]; userIds: string[] }> {
  const result = await db.prepare(`
    ${EVENT_TEAMS_CTE}
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    WHERE pt.user_id IN (
      SELECT uf.user_id FROM user_follows uf WHERE uf.team_id IN (SELECT tid FROM evt_teams)
      UNION SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id IN (SELECT tid FROM evt_teams)
      UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id IN (SELECT tid FROM evt_teams)
      UNION SELECT tmem.user_id FROM team_members tmem WHERE tmem.team_id IN (SELECT tid FROM evt_teams) AND tmem.status = 'active'
    )
  `).bind(eventId, divisionId || null).all();
  const rows = result.results || [];
  return applyTestGate(db, eventId, {
    tokens: rows.map((r: any) => r.token as string),
    userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
  });
}

export async function teamAudience(db: any, teamIds: string[], eventId?: string): Promise<{ tokens: string[]; userIds: string[] }> {
  const ids = teamIds.filter(Boolean);
  if (ids.length === 0) return { tokens: [], userIds: [] };
  const ph = ids.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    WHERE pt.user_id IN (
      SELECT uf.user_id FROM user_follows uf WHERE uf.team_id IN (${ph})
      UNION SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id IN (${ph})
      UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id IN (${ph})
      UNION SELECT tmem.user_id FROM team_members tmem WHERE tmem.team_id IN (${ph}) AND tmem.status = 'active'
    )
  `).bind(...ids, ...ids, ...ids, ...ids).all();
  const rows = result.results || [];
  return applyTestGate(db, eventId, {
    tokens: rows.map((r: any) => r.token as string),
    userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
  });
}

/*
  Final-score push to the two teams' followers/staff. Idempotent via
  games.final_push_sent so score edits after the final don't re-push.
*/
export async function notifyGameFinalPush(db: any, gameId: string) {
  const g = await db.prepare(`
    SELECT g.id, g.event_id, g.game_number, g.home_score, g.away_score,
      g.home_team_id, g.away_team_id, COALESCE(g.final_push_sent, 0) as final_push_sent,
      e.name as event_name,
      COALESCE(ht.schedule_name, ht.name, g.home_placeholder, 'Home') as home_name,
      COALESCE(at2.schedule_name, at2.name, g.away_placeholder, 'Away') as away_name
    FROM games g
    JOIN events e ON e.id = g.event_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    WHERE g.id = ?
  `).bind(gameId).first();
  if (!g || g.final_push_sent) return;

  const { tokens, userIds } = await teamAudience(db, [g.home_team_id, g.away_team_id], g.event_id);
  await db.prepare("UPDATE games SET final_push_sent = 1, updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
  if (tokens.length === 0) return;

  const title = `Final: ${g.home_name} ${g.home_score}, ${g.away_name} ${g.away_score}`;
  const body = `${g.event_name}${g.game_number ? ` - Game #${g.game_number}` : ''}`;
  const pushData = { type: 'game_final', game_id: g.id, event_id: g.event_id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, {
    type: 'game_final', title, body, audience: 'team_followers',
    target_id: g.event_id, sent_count: sent, sent_by: 'system',
    metadata: JSON.stringify({ game_id: g.id }),
  });
  await createUserNotifications(db, userIds, title, body, 'game_final', pushData);
}

/*
  Scoresheet-ready push to both teams' COACHES and MANAGERS only (not all
  followers) the moment a game goes final. Tapping opens the scoresheet in
  the app. Idempotent via games.scoresheet_push_sent.
*/
export async function notifyScoresheetPush(db: any, gameId: string) {
  const g = await db.prepare(`
    SELECT g.id, g.event_id, g.game_number, g.home_score, g.away_score,
      g.home_team_id, g.away_team_id, COALESCE(g.scoresheet_push_sent, 0) as scoresheet_push_sent,
      e.name as event_name,
      COALESCE(ht.schedule_name, ht.name, g.home_placeholder, 'Home') as home_name,
      COALESCE(at2.schedule_name, at2.name, g.away_placeholder, 'Away') as away_name
    FROM games g
    JOIN events e ON e.id = g.event_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    WHERE g.id = ?
  `).bind(gameId).first();
  if (!g || g.scoresheet_push_sent) return;

  const teamIds = [g.home_team_id, g.away_team_id].filter(Boolean);
  if (teamIds.length === 0) return;
  const ph = teamIds.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    WHERE pt.user_id IN (
      SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id IN (${ph})
      UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id IN (${ph})
    )
  `).bind(...teamIds, ...teamIds).all();
  const rows = result.results || [];
  const { tokens, userIds } = await applyTestGate(db, g.event_id, {
    tokens: rows.map((r: any) => r.token as string),
    userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
  });

  await db.prepare("UPDATE games SET scoresheet_push_sent = 1, updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
  if (tokens.length === 0) return;

  const title = '📋 Scoresheet Ready';
  const body = `${g.home_name} ${g.home_score}, ${g.away_name} ${g.away_score}${g.game_number ? ` - Game #${g.game_number}` : ''} - tap to view the official scoresheet`;
  const pushData = { type: 'scoresheet', game_id: g.id, event_id: g.event_id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, {
    type: 'scoresheet', title, body, audience: 'team_staff',
    target_id: g.event_id, sent_count: sent, sent_by: 'system',
    metadata: JSON.stringify({ game_id: g.id }),
  });
  await createUserNotifications(db, userIds, title, body, 'scoresheet', pushData);
}

/*
  Three Stars announcement to both teams' followers/staff/players once the
  stars are set after a final. Idempotent via games.stars_push_sent.
*/
export async function notifyThreeStarsPush(db: any, gameId: string) {
  const g = await db.prepare(`
    SELECT g.id, g.event_id, g.game_number, g.home_team_id, g.away_team_id,
      COALESCE(g.stars_push_sent, 0) as stars_push_sent,
      e.name as event_name,
      COALESCE(ht.schedule_name, ht.name, g.home_placeholder, 'Home') as home_name,
      COALESCE(at2.schedule_name, at2.name, g.away_placeholder, 'Away') as away_name
    FROM games g
    JOIN events e ON e.id = g.event_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    WHERE g.id = ?
  `).bind(gameId).first();
  if (!g || g.stars_push_sent) return;

  const stars = (await db.prepare(
    'SELECT star_number, team_id, jersey_number, player_name FROM game_three_stars WHERE game_id = ? ORDER BY star_number ASC'
  ).bind(gameId).all()).results || [];
  if (stars.length === 0) return;

  const teamName = (tid: string) => (tid === g.home_team_id ? g.home_name : g.away_name);
  const label = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');
  const line = stars.map((s: any) =>
    `${label(s.star_number)}: ${s.player_name || `#${s.jersey_number}`} (${teamName(s.team_id)})`).join(' · ');

  const { tokens, userIds } = await teamAudience(db, [g.home_team_id, g.away_team_id], g.event_id);
  await db.prepare("UPDATE games SET stars_push_sent = 1, updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
  if (tokens.length === 0) return;

  const title = '⭐ Three Stars of the Game';
  const body = `${g.home_name} vs ${g.away_name} - ${line}`;
  const pushData = { type: 'three_stars', game_id: g.id, event_id: g.event_id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, {
    type: 'three_stars', title, body, audience: 'team_followers',
    target_id: g.event_id, sent_count: sent, sent_by: 'system',
    metadata: JSON.stringify({ game_id: g.id }),
  });
  await createUserNotifications(db, userIds, title, body, 'three_stars', pushData);
}

/*
  Game-start push to both teams' followers: "Dogs vs Cats - starting now".
  Idempotent via games.start_push_sent (a re-tapped Start Game never
  double-pushes).
*/
export async function notifyGameStartPush(db: any, gameId: string) {
  const g = await db.prepare(`
    SELECT g.id, g.event_id, g.game_number, g.home_team_id, g.away_team_id,
      COALESCE(g.start_push_sent, 0) as start_push_sent,
      e.name as event_name,
      vr.name as rink_name, v.name as venue_name,
      COALESCE(ht.schedule_name, ht.name, g.home_placeholder, 'Home') as home_name,
      COALESCE(at2.schedule_name, at2.name, g.away_placeholder, 'Away') as away_name
    FROM games g
    JOIN events e ON e.id = g.event_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    WHERE g.id = ?
  `).bind(gameId).first();
  if (!g || g.start_push_sent) return;

  const { tokens, userIds } = await teamAudience(db, [g.home_team_id, g.away_team_id], g.event_id);
  await db.prepare("UPDATE games SET start_push_sent = 1, updated_at = datetime('now') WHERE id = ?").bind(gameId).run();
  if (tokens.length === 0) return;

  const title = `${g.away_name} vs ${g.home_name} - starting now!`;
  const where = [g.venue_name, g.rink_name].filter(Boolean).join(' - ');
  const body = `${g.event_name}${g.game_number ? ` - Game #${g.game_number}` : ''}${where ? `\n${where}` : ''}`;
  const pushData = { type: 'game_start', game_id: g.id, event_id: g.event_id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, {
    type: 'game_start', title, body, audience: 'team_followers',
    target_id: g.event_id, sent_count: sent, sent_by: 'system',
    metadata: JSON.stringify({ game_id: g.id }),
  });
  await createUserNotifications(db, userIds, title, body, 'game_start', pushData);
}

/*
  Delay push to the game's division. delay_push_sig stores the last-notified
  delay so edits that don't change anything (or repeat saves) don't re-push.
*/
export async function notifyGameDelayPush(db: any, gameId: string) {
  const g = await db.prepare(`
    SELECT g.id, g.event_id, g.event_division_id, g.game_number, g.start_time,
      g.delay_status, g.delay_minutes, g.delay_reason, g.delay_push_sig,
      e.name as event_name,
      COALESCE(ht.schedule_name, ht.name, g.home_placeholder, 'TBD') as home_name,
      COALESCE(at2.schedule_name, at2.name, g.away_placeholder, 'TBD') as away_name
    FROM games g
    JOIN events e ON e.id = g.event_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    WHERE g.id = ?
  `).bind(gameId).first();
  if (!g) return;

  const sig = `${g.delay_status || ''}|${g.delay_minutes || 0}|${g.delay_reason || ''}`;
  if (sig === (g.delay_push_sig || '') || sig === '|0|') return;

  const { tokens, userIds } = await eventAudience(db, g.event_id, g.event_division_id);
  await db.prepare("UPDATE games SET delay_push_sig = ?, updated_at = datetime('now') WHERE id = ?").bind(sig, gameId).run();
  if (tokens.length === 0) return;

  const cleared = !g.delay_status || g.delay_status === 'on_time';
  const title = cleared
    ? `Game #${g.game_number ?? ''} back on schedule`.trim()
    : `Game #${g.game_number ?? ''} delayed${g.delay_minutes ? ` ~${g.delay_minutes} min` : ''}`.trim();
  const body = `${g.away_name} at ${g.home_name} - ${g.event_name}${g.delay_reason ? `\n${g.delay_reason}` : ''}`;
  const pushData = { type: 'game_delay', game_id: g.id, event_id: g.event_id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, {
    type: 'game_delay', title, body, audience: 'division_followers',
    target_id: g.event_id, sent_count: sent, sent_by: 'system',
    metadata: JSON.stringify({ game_id: g.id }),
  });
  await createUserNotifications(db, userIds, title, body, 'game_delay', pushData);
}

/*
  Locker-room sweep: games starting within ~1h with locker rooms assigned and
  not yet notified. Called from the Worker cron and from the admin button.
*/
export async function runLockerRoomSweep(db: any): Promise<{ games_checked: number; games_notified: number[]; total_sent: number }> {
  // start_time is EVENT-LOCAL wall clock; the window must be computed per
  // event timezone (comparing against UTC made this fire 4-5 hours early)
  const events = (await db.prepare(
    "SELECT id, timezone FROM events WHERE schedule_published = 1 AND date(end_date) >= date('now', '-1 day')"
  ).all()).results || [];
  const rows: any[] = [];
  for (const ev of events as any[]) {
    const windowStart = eventLocalNow(ev.timezone, -30);
    const windowEnd = eventLocalNow(ev.timezone, 60);
    const g = await db.prepare(`
      SELECT g.id, g.game_number, g.start_time, g.event_id, g.event_division_id,
        g.home_team_id, g.away_team_id,
        g.home_locker_room, g.away_locker_room, g.notes,
        e.name as event_name,
        r.name as rink_name,
        ht.name as home_team_name, at.name as away_team_name
      FROM games g
      LEFT JOIN events e ON e.id = g.event_id
      LEFT JOIN venue_rinks r ON r.id = g.rink_id
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at ON at.id = g.away_team_id
      WHERE g.event_id = ? AND g.start_time BETWEEN ? AND ?
      AND (g.home_locker_room IS NOT NULL OR g.away_locker_room IS NOT NULL)
      AND g.locker_room_notified = 0
      AND g.status IN ('scheduled', 'warmup')
    `).bind(ev.id, windowStart, windowEnd).all();
    rows.push(...(g.results || []));
  }
  const games = { results: rows };

  let totalSent = 0;
  const gamesNotified: number[] = [];

  for (const game of (games.results || []) as any[]) {
    // Audience = the two teams on the game. (Filtering event followers by the
    // game's division id matched nothing: CSV-created game divisions are
    // separate rows from registration divisions.)
    const { tokens, userIds } = await teamAudience(db, [game.home_team_id, game.away_team_id].filter(Boolean), game.event_id);
    if (tokens.length === 0) {
      await db.prepare("UPDATE games SET locker_room_notified = 1, updated_at = datetime('now') WHERE id = ?").bind(game.id).run();
      continue;
    }

    const gameTime = game.start_time ? fmt12(String(game.start_time)) : '';
    const lockerInfo: string[] = [];
    if (game.home_locker_room) lockerInfo.push(`${game.home_team_name || 'Home'}: ${game.home_locker_room}`);
    if (game.away_locker_room) lockerInfo.push(`${game.away_team_name || 'Away'}: ${game.away_locker_room}`);

    const matchup = game.home_team_name && game.away_team_name
      ? `${game.home_team_name} vs ${game.away_team_name}` : (game.notes || 'Game');
    const title = `Locker Rooms - Game #${game.game_number}`;
    const body = `${matchup} at ${gameTime}${game.rink_name ? ` (${game.rink_name})` : ''}\n${lockerInfo.join(' | ')}`;
    const pushData = { type: 'locker_room', game_id: game.id, event_id: game.event_id };
    const sent = await sendExpoPushNotifications(tokens, title, body, pushData);

    totalSent += sent;
    gamesNotified.push(game.game_number);

    await db.prepare("UPDATE games SET locker_room_notified = 1, updated_at = datetime('now') WHERE id = ?").bind(game.id).run();
    await logNotification(db, {
      type: 'locker_room_auto', title, body, audience: 'event_followers',
      target_id: game.event_id, sent_count: sent, sent_by: 'system',
      metadata: JSON.stringify({ game_id: game.id, game_number: game.game_number }),
    });
    await createUserNotifications(db, userIds, title, body, 'locker_room', pushData);
  }

  return { games_checked: (games.results || []).length, games_notified: gamesNotified, total_sent: totalSent };
}


/*
  CHECK-IN REMINDERS: 90 minutes before each game, the coaches and managers
  of each side that has not checked in yet get a push. Game times are stored
  in EVENT-LOCAL time, so "now" is computed in the event's timezone (the
  events.timezone human label maps to an IANA zone). Idempotent via
  checkin_alert_log; runs from the worker cron every minute.
*/
const TZ_LABELS: [string, string][] = [
  ['eastern', 'America/New_York'],
  ['central', 'America/Chicago'],
  ['mountain', 'America/Denver'],
  ['pacific', 'America/Los_Angeles'],
  ['arizona', 'America/Phoenix'],
];
export function eventLocalNow(tzLabel?: string | null, offsetMinutes = 0): string {
  let tz = 'America/New_York';
  const l = (tzLabel || '').toLowerCase();
  for (const [key, zone] of TZ_LABELS) { if (l.includes(key)) { tz = zone; break; } }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(Date.now() + offsetMinutes * 60_000));
  const g = (t: string) => parts.find(pp => pp.type === t)?.value || '00';
  const hh = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}-${g('month')}-${g('day')} ${hh}:${g('minute')}:${g('second')}`;
}
function fmt12(start: string): string {
  const hh = parseInt(start.slice(11, 13), 10); const mm = start.slice(14, 16);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export async function runCheckinReminderSweep(db: any) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS checkin_alert_log (
    game_id TEXT NOT NULL, team_id TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now')), UNIQUE(game_id, team_id))`).run();

  const events = (await db.prepare(
    "SELECT id, name, timezone FROM events WHERE schedule_published = 1 AND date(end_date) >= date('now', '-1 day')"
  ).all()).results || [];

  for (const ev of events as any[]) {
    const nowLocal = eventLocalNow(ev.timezone);
    const windowEnd = eventLocalNow(ev.timezone, 90);
    const games = (await db.prepare(`
      SELECT g.id, g.game_number, g.start_time, g.home_team_id, g.away_team_id,
        COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END) as home_name,
        COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END) as away_name,
        vr.name as rink_name, v.name as venue_name
      FROM games g
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at2 ON at2.id = g.away_team_id
      LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
      LEFT JOIN venues v ON v.id = g.venue_id
      WHERE g.event_id = ? AND g.status = 'scheduled'
        AND g.start_time > ? AND g.start_time <= ?
    `).bind(ev.id, nowLocal, windowEnd).all()).results || [];

    for (const g of games as any[]) {
      const sides = [
        { teamId: g.home_team_id, name: g.home_name, opp: g.away_name },
        { teamId: g.away_team_id, name: g.away_name, opp: g.home_name },
      ].filter(s0 => s0.teamId);
      for (const side of sides) {
        const already = await db.prepare('SELECT 1 as x FROM checkin_alert_log WHERE game_id = ? AND team_id = ?').bind(g.id, side.teamId).first();
        if (already) continue;
        const checked = await db.prepare('SELECT 1 as x FROM game_checkins WHERE game_id = ? AND team_id = ?').bind(g.id, side.teamId).first();
        await db.prepare('INSERT OR IGNORE INTO checkin_alert_log (game_id, team_id) VALUES (?, ?)').bind(g.id, side.teamId).run();
        if (checked) continue;
        // coaches + managers of this team only
        const rows = (await db.prepare(`
          SELECT DISTINCT pt.token, pt.user_id FROM push_tokens pt
          WHERE pt.user_id IN (
            SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id = ?1
            UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id = ?1
          )
        `).bind(side.teamId).all()).results || [];
        const { tokens, userIds } = await applyTestGate(db, ev.id, {
          tokens: rows.map((r: any) => r.token as string),
          userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
        });
        if (tokens.length === 0) continue;
        const where = [g.venue_name, g.rink_name].filter(Boolean).join(' - ');
        const title = `⏰ Check-in time: ${side.name}`;
        const body = `Game${g.game_number ? ` #${g.game_number}` : ''} at ${fmt12(g.start_time)} vs ${side.opp || 'TBD'}${where ? ` (${where})` : ''}. Open the app to confirm your roster, pick your starting goalie, and sign off.`;
        const pushData = { type: 'checkin_reminder', event_id: ev.id, game_id: g.id };
        const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
        await logNotification(db, { type: 'checkin_reminder', title, body, audience: 'team_staff', target_id: ev.id, sent_count: sent, sent_by: 'system', metadata: JSON.stringify({ game_id: g.id, team_id: side.teamId }) });
        await createUserNotifications(db, userIds, title, body, 'checkin_reminder', pushData);
      }
    }
  }
}

/*
  LOCKER ROOM ON CHECK-IN: the moment a team checks in for a game, everyone
  on that team (followers, family, staff) gets their locker room assignment,
  if one is set on the game.
*/
export async function notifyLockerOnCheckin(db: any, gameId: string, teamId: string) {
  const g = await db.prepare(`
    SELECT g.id, g.event_id, g.game_number, g.start_time, g.home_team_id, g.away_team_id,
      g.home_locker_room, g.away_locker_room,
      COALESCE(t.schedule_name, t.name) as team_name,
      vr.name as rink_name, v.name as venue_name
    FROM games g
    JOIN teams t ON t.id = ?2
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    WHERE g.id = ?1
  `).bind(gameId, teamId).first();
  if (!g) return;
  const locker = g.home_team_id === teamId ? g.home_locker_room : g.away_team_id === teamId ? g.away_locker_room : null;
  const { tokens, userIds } = await teamAudience(db, [teamId], g.event_id);
  if (tokens.length === 0) return;
  const where = [g.venue_name, g.rink_name].filter(Boolean).join(' - ');
  const title = `🚪 Locker Room ${locker || 'TBD'}`;
  const body = locker
    ? `${g.team_name} is checked in. Game${g.game_number ? ` #${g.game_number}` : ''} at ${fmt12(String(g.start_time))}${where ? ` - ${where}` : ''}.`
    : `${g.team_name} is checked in. Game${g.game_number ? ` #${g.game_number}` : ''} at ${fmt12(String(g.start_time))}${where ? ` - ${where}` : ''}. Locker room not posted yet - you'll get an alert when it is.`;
  const pushData = { type: 'locker_room', event_id: g.event_id, game_id: g.id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, { type: 'locker_room', title, body, audience: 'team_followers', target_id: g.event_id, sent_count: sent, sent_by: 'system', metadata: JSON.stringify({ game_id: g.id, team_id: teamId }) });
  await createUserNotifications(db, userIds, title, body, 'locker_room', pushData);
}


/*
  MISSING LOCKER ROOM ALARM: any scheduled game starting within 2 hours with
  an unassigned locker room pushes once to all admin/director devices.
  Idempotent via locker_missing_log.
*/
export async function runLockerMissingSweep(db: any) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS locker_missing_log (
    game_id TEXT PRIMARY KEY, sent_at TEXT DEFAULT (datetime('now')))`).run();
  const events = (await db.prepare(
    "SELECT id, name, timezone, COALESCE(is_test,0) as is_test FROM events WHERE schedule_published = 1 AND date(end_date) >= date('now', '-1 day')"
  ).all()).results || [];
  for (const ev of events as any[]) {
    const nowLocal = eventLocalNow(ev.timezone);
    const windowEnd = eventLocalNow(ev.timezone, 120);
    const games = (await db.prepare(`
      SELECT g.id, g.game_number, g.start_time, vr.name as rink_name, v.name as venue_name,
        g.home_locker_room, g.away_locker_room
      FROM games g
      LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
      LEFT JOIN venues v ON v.id = g.venue_id
      WHERE g.event_id = ? AND g.status = 'scheduled'
        AND g.start_time > ? AND g.start_time <= ?
        AND (g.home_locker_room IS NULL OR g.home_locker_room = '' OR g.away_locker_room IS NULL OR g.away_locker_room = '')
    `).bind(ev.id, nowLocal, windowEnd).all()).results || [];
    for (const g of games as any[]) {
      const logged = await db.prepare('SELECT 1 as x FROM locker_missing_log WHERE game_id = ?').bind(g.id).first();
      if (logged) continue;
      await db.prepare('INSERT OR IGNORE INTO locker_missing_log (game_id) VALUES (?)').bind(g.id).run();
      const rows = (await db.prepare(`
        SELECT DISTINCT pt.token, pt.user_id FROM push_tokens pt
        JOIN user_roles ur ON ur.user_id = pt.user_id AND ur.role IN ('admin', 'director')
      `).all()).results || [];
      const tokens = rows.map((r: any) => r.token as string);
      const userIds = [...new Set(rows.map((r: any) => r.user_id as string))] as string[];
      if (tokens.length === 0) continue;
      const where = [g.venue_name, g.rink_name].filter(Boolean).join(' - ');
      const title = '🚨 Locker rooms not assigned';
      const body = `Game${g.game_number ? ` #${g.game_number}` : ''} at ${fmt12(String(g.start_time))}${where ? ` (${where})` : ''} starts in under 2 hours without locker rooms. Open Locker Rooms in director tools to assign.`;
      const pushData = { type: 'locker_missing', event_id: ev.id, game_id: g.id };
      const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
      await logNotification(db, { type: 'locker_missing', title, body, audience: 'staff', target_id: ev.id, sent_count: sent, sent_by: 'system', metadata: JSON.stringify({ game_id: g.id }) });
      await createUserNotifications(db, userIds, title, body, 'locker_missing', pushData);
    }
  }
}


/*
  GROUP AUDIENCES for an event's approved teams, strictly separated:
  - 'coaches': team_coaches + team_managers of the event's teams
  - 'parents': followers + active team members of the event's teams,
    MINUS anyone who is a coach or manager of any of them
  Used by meeting announcements and other role-scoped sends.
*/
export async function groupAudience(db: any, eventId: string, group: 'coaches' | 'parents'):
  Promise<{ tokens: string[]; userIds: string[] }> {
  const staffSel = `
    SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id IN (SELECT tid FROM evt_teams)
    UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id IN (SELECT tid FROM evt_teams)`;
  const famSel = `
    SELECT uf.user_id FROM user_follows uf WHERE uf.team_id IN (SELECT tid FROM evt_teams)
    UNION SELECT tmem.user_id FROM team_members tmem WHERE tmem.team_id IN (SELECT tid FROM evt_teams) AND tmem.status = 'active'`;
  const member = group === 'coaches'
    ? staffSel
    : `${famSel} EXCEPT ${staffSel}`;
  const result = await db.prepare(`
    ${EVENT_TEAMS_CTE}
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    WHERE pt.user_id IN (${member})
  `).bind(eventId, null).all();
  const rows = result.results || [];
  return applyTestGate(db, eventId, {
    tokens: rows.map((r: any) => r.token as string),
    userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
  });
}
