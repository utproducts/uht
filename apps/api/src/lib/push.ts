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
  return {
    tokens: rows.map((r: any) => r.token as string),
    userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
  };
}

export async function teamAudience(db: any, teamIds: string[]): Promise<{ tokens: string[]; userIds: string[] }> {
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
  return {
    tokens: rows.map((r: any) => r.token as string),
    userIds: [...new Set(rows.map((r: any) => r.user_id as string))] as string[],
  };
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

  const { tokens, userIds } = await teamAudience(db, [g.home_team_id, g.away_team_id]);
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
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const games = await db.prepare(`
    SELECT g.id, g.game_number, g.start_time, g.event_id, g.event_division_id,
      g.home_locker_room, g.away_locker_room, g.notes,
      e.name as event_name,
      r.name as rink_name
    FROM games g
    LEFT JOIN events e ON e.id = g.event_id
    LEFT JOIN rinks r ON r.id = g.rink_id
    WHERE g.start_time BETWEEN ? AND ?
    AND (g.home_locker_room IS NOT NULL OR g.away_locker_room IS NOT NULL)
    AND g.locker_room_notified = 0
    AND g.status IN ('scheduled', 'warmup')
  `).bind(
    thirtyMinAgo.toISOString().replace('Z', ''),
    oneHourFromNow.toISOString().replace('Z', '')
  ).all();

  let totalSent = 0;
  const gamesNotified: number[] = [];

  for (const game of (games.results || []) as any[]) {
    const { tokens, userIds } = await eventAudience(db, game.event_id, game.event_division_id);
    if (tokens.length === 0) {
      await db.prepare("UPDATE games SET locker_room_notified = 1, updated_at = datetime('now') WHERE id = ?").bind(game.id).run();
      continue;
    }

    const gameTime = game.start_time ? new Date(game.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const lockerInfo: string[] = [];
    if (game.home_locker_room) lockerInfo.push(`Home: ${game.home_locker_room}`);
    if (game.away_locker_room) lockerInfo.push(`Away: ${game.away_locker_room}`);

    const title = `Locker Room - Game #${game.game_number}`;
    const body = `${game.notes || 'Game'} at ${gameTime}${game.rink_name ? ` (${game.rink_name})` : ''}\n${lockerInfo.join(' | ')}`;
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
