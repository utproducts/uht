/*
  EVENT RECAP: the morning after an event ends (event-local time, never
  UTC), everyone in the event gets a recap email and a push that deep-links
  to the recap. The recap celebrates champions (photos + names), every
  Three Stars recipient, every goal scorer, and a short summary. Champion
  teams additionally get the "review our app" ask - they're the happy ones.

  - buildRecapData(db, eventId): all the numbers and names
  - sendEventRecap(env, eventId): email + pushes + review ask, idempotent
    via events.recap_sent_at
  - runEventRecapSweep(env): hourly cron gate; fires between 9-11 AM
    event-local for events that ended the previous day
*/

import { sendExpoPushNotifications, logNotification, createUserNotifications, eventAudience, teamAudience, eventLocalNow } from './push';

const API_BASE = 'https://uht.chad-157.workers.dev';
const SITE = 'https://ultimatetournaments.com';
const REVIEW_URL = 'https://apps.apple.com/app/id6786085393?action=write-review';
const FROM = 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>';
const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Kid-safe display name: "Benjamin Brewster" -> "Benjamin B.", with
// title-casing for ALL-CAPS imports ("ACE MADIGAN" -> "Ace M.")
// "West Dundee Leafs Mite (8U) CUHL D2 - Frenier" -> "West Dundee Leafs"
function shortTeamName(name: string | null | undefined): string {
  const raw = String(name || '');
  const cut = raw.split(/\s+(?:Mite|Squirt|Pee\s?Wee|Peewee|Bantam|Midget|Girls)\b|\s*\(\d+U\)/i)[0];
  return (cut || raw).replace(/[\s-]+$/, '').trim() || raw;
}

function kidName(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw || raw.startsWith('#')) return raw;
  const tc = (w: string) => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return tc(parts[0]);
  const first = tc(parts[0]);
  const lastInitial = (parts[parts.length - 1][0] || '').toUpperCase();
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

export interface RecapData {
  event: any;
  champions: Array<{
    division: string; team_id: string; team_name: string;
    score: string; runner_up: string; photo_url: string | null;
  }>;
  stars: Array<{ team_name: string; player_name: string; jersey_number: string; first: number; second: number; third: number; total: number }>;
  scorers: Array<{ team_name: string; player_name: string; jersey_number: string; goals: number }>;
  totals: { games: number; goals: number; teams: number; divisions: number };
  summary: string;
  photos: Array<{ url: string }>;
}

export async function buildRecapData(db: any, eventId: string): Promise<RecapData | null> {
  const event = await db.prepare('SELECT id, name, slug, city, state, start_date, end_date, logo_url FROM events WHERE id = ? OR slug = ?')
    .bind(eventId, eventId).first<any>();
  if (!event) return null;
  const evId = event.id;

  // Champions: final championship games, winner first
  const champRows = (await db.prepare(`
    SELECT g.id, g.home_score, g.away_score, g.home_team_id, g.away_team_id,
      TRIM(COALESCE(ed.age_group, '') || ' ' || COALESCE(ed.division_level, '')) as division,
      COALESCE(ht.schedule_name, ht.name, 'Home') as home_name,
      COALESCE(at2.schedule_name, at2.name, 'Away') as away_name
    FROM games g
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    WHERE g.event_id = ? AND g.game_type = 'championship' AND g.status = 'final'
    ORDER BY division
  `).bind(evId).all()).results || [];

  const photos = (await db.prepare(
    "SELECT id, team_id FROM event_photos WHERE event_id = ? AND kind = 'champion' AND status = 'approved' ORDER BY created_at DESC"
  ).bind(evId).all()).results || [];
  const photoByTeam = new Map<string, string>();
  for (const p of photos as any[]) {
    if (p.team_id && !photoByTeam.has(p.team_id)) photoByTeam.set(p.team_id, `${API_BASE}/api/photos/file/${p.id}`);
  }

  const champions = (champRows as any[])
    .filter(g => g.home_team_id && g.away_team_id && g.home_score !== g.away_score)
    .map(g => {
      const homeWon = g.home_score > g.away_score;
      const winId = homeWon ? g.home_team_id : g.away_team_id;
      return {
        division: g.division || 'Championship',
        team_id: winId,
        team_name: homeWon ? g.home_name : g.away_name,
        score: `${Math.max(g.home_score, g.away_score)}-${Math.min(g.home_score, g.away_score)}`,
        runner_up: homeWon ? g.away_name : g.home_name,
        photo_url: photoByTeam.get(winId) || null,
      };
    });

  // Three Stars across the weekend
  const starRows = (await db.prepare(`
    SELECT gts.star_number, gts.jersey_number, gts.player_name, gts.team_id,
      COALESCE(t.schedule_name, t.name, 'Team') as team_name
    FROM game_three_stars gts
    JOIN games g ON g.id = gts.game_id AND g.event_id = ?
    LEFT JOIN teams t ON t.id = gts.team_id
  `).bind(evId).all()).results || [];
  const starAgg = new Map<string, any>();
  for (const s of starRows as any[]) {
    const key = `${s.team_id}|${s.jersey_number}`;
    if (!starAgg.has(key)) starAgg.set(key, { team_name: s.team_name, player_name: kidName(s.player_name) || `#${s.jersey_number}`, jersey_number: s.jersey_number, first: 0, second: 0, third: 0, total: 0 });
    const a = starAgg.get(key);
    if (s.star_number === 1) a.first++; else if (s.star_number === 2) a.second++; else a.third++;
    a.total++;
  }
  const stars = [...starAgg.values()].sort((a, b) => b.first - a.first || b.total - a.total || a.player_name.localeCompare(b.player_name));

  // Every goal scorer, names resolved through lineups
  const goalRows = (await db.prepare(`
    SELECT ge.jersey_number, ge.team_id,
      COALESCE(t.schedule_name, t.name, 'Team') as team_name,
      (SELECT p.first_name || ' ' || p.last_name FROM game_lineups gl
        LEFT JOIN players p ON p.id = gl.player_id
        WHERE gl.game_id = ge.game_id AND gl.team_id = ge.team_id AND gl.jersey_number = ge.jersey_number AND p.id IS NOT NULL
        LIMIT 1) as player_name
    FROM game_events ge
    JOIN games g ON g.id = ge.game_id AND g.event_id = ?
    LEFT JOIN teams t ON t.id = ge.team_id
    WHERE ge.event_type = 'goal' AND ge.team_id IS NOT NULL
  `).bind(evId).all()).results || [];
  const scorerAgg = new Map<string, any>();
  for (const gr of goalRows as any[]) {
    const key = `${gr.team_id}|${gr.jersey_number}`;
    if (!scorerAgg.has(key)) scorerAgg.set(key, { team_name: gr.team_name, player_name: kidName(gr.player_name) || `#${gr.jersey_number}`, jersey_number: gr.jersey_number, goals: 0 });
    scorerAgg.get(key).goals++;
  }
  const scorers = [...scorerAgg.values()].sort((a, b) => b.goals - a.goals || a.team_name.localeCompare(b.team_name));

  const totals = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM games WHERE event_id = ?1 AND status = 'final') as games,
      (SELECT COALESCE(SUM(home_score + away_score), 0) FROM games WHERE event_id = ?1 AND status = 'final') as goals,
      (SELECT COUNT(DISTINCT tid) FROM (
        SELECT home_team_id as tid FROM games WHERE event_id = ?1 AND home_team_id IS NOT NULL
        UNION SELECT away_team_id FROM games WHERE event_id = ?1 AND away_team_id IS NOT NULL)) as teams,
      (SELECT COUNT(DISTINCT event_division_id) FROM games WHERE event_id = ?1 AND event_division_id IS NOT NULL) as divisions
  `).bind(evId).first<any>();

  // Weekend gallery: every approved photo, newest first (fan + champion)
  const galleryRows = (await db.prepare(
    "SELECT id FROM event_photos WHERE event_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 250"
  ).bind(evId).all()).results || [];
  const galleryPhotos = (galleryRows as any[]).map(r => ({ url: `${API_BASE}/api/photos/file/${r.id}` }));

  const champLine = champions.length
    ? ` Congratulations to our champions: ${champions.map(ch => `${ch.team_name} (${ch.division})`).join(', ')}.`
    : '';
  const summary = `What a weekend of hockey! ${totals.teams} teams across ${totals.divisions} divisions battled through ${totals.games} games in ${event.city}, ${event.state}, lighting the lamp ${totals.goals} times.${champLine} Thank you to every player, coach, family, and volunteer who made ${event.name} one to remember - we can't wait to see you at the next one!`;

  return { event, champions, stars, scorers, totals: totals as any, summary, photos: galleryPhotos };
}

function esc(x: any): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildRecapEmailHtml(data: RecapData): string {
  const ev = data.event;
  const recapUrl = `${SITE}/recap?event=${ev.slug || ev.id}`;
  const championBlocks = data.champions.slice(0, 4).map(ch => `
    <td align="center" style="padding:10px;vertical-align:top;width:50%;">
      ${ch.photo_url ? `<img src="${ch.photo_url}" alt="${esc(ch.team_name)}" style="width:100%;max-width:260px;border-radius:12px;border:3px solid #d4af37;display:block;margin:0 auto 8px;" />` : ''}
      <div style="font-size:11px;letter-spacing:1px;color:#b8860b;font-weight:bold;">${esc(ch.division).toUpperCase()} CHAMPIONS</div>
      <div style="font-size:17px;font-weight:800;color:#003e79;margin-top:2px;">&#127942; ${esc(ch.team_name)}</div>
      <div style="font-size:12px;color:#6b7a90;">won ${esc(ch.score)} over ${esc(ch.runner_up)}</div>
    </td>`);
  const champRowsHtml: string[] = [];
  for (let i = 0; i < championBlocks.length; i += 2) {
    champRowsHtml.push(`<tr>${championBlocks[i]}${championBlocks[i + 1] || '<td style="width:50%;"></td>'}</tr>`);
  }
  const starRows = data.stars.slice(0, 6).map(st => `
    <tr>
      <td style="padding:5px 8px;border-bottom:1px solid #eef2f6;color:#b8860b;font-weight:bold;white-space:nowrap;">${'&#9733;'.repeat(Math.max(1, st.first > 0 ? 3 : st.second > 0 ? 2 : 1))}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eef2f6;font-weight:700;color:#1d2b3d;">${esc(st.player_name)} <span style="color:#8295ab;font-weight:600;">#${esc(st.jersey_number)}</span></td>
      <td style="padding:5px 8px;border-bottom:1px solid #eef2f6;color:#5b6b80;">${esc(shortTeamName(st.team_name))}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #eef2f6;color:#5b6b80;white-space:nowrap;">${st.total} star${st.total > 1 ? 's' : ''}</td>
    </tr>`).join('');
  const scorerCells = data.scorers.slice(0, 6).map(sc => `
    <td style="width:50%;padding:4px;vertical-align:top;">
      <div style="background:#f0f7ff;border:1px solid #d5e5f5;border-radius:12px;padding:8px 12px;">
        <span style="font-size:13px;font-weight:800;color:#17304d;">${esc(sc.player_name)}</span>
        ${sc.goals > 1 ? `<span style="background:#003e79;color:#fff;font-size:10px;font-weight:900;border-radius:999px;padding:1px 7px;margin-left:6px;">&times;${sc.goals}</span>` : ''}
        <div style="font-size:11px;color:#5b6b80;margin-top:2px;">${esc(shortTeamName(sc.team_name))}</div>
      </div>
    </td>`);
  const scorerRowsHtml: string[] = [];
  for (let i = 0; i < scorerCells.length; i += 2) {
    scorerRowsHtml.push(`<tr>${scorerCells[i]}${scorerCells[i + 1] || '<td style="width:50%;"></td>'}</tr>`);
  }
  const scorerItems = `<table role="presentation" style="width:100%;border-collapse:collapse;">${scorerRowsHtml.join('')}</table>`;

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#003e79,#005599 60%,#00ccff);padding:34px 24px;text-align:center;border-radius:0 0 18px 18px;">
    <div style="font-size:13px;letter-spacing:3px;color:#9fdcff;font-weight:bold;">EVENT RECAP</div>
    <div style="font-size:28px;font-weight:900;color:#ffffff;margin-top:6px;">${esc(ev.name)}</div>
    <div style="font-size:13px;color:#cfeaff;margin-top:4px;">${esc(ev.city)}, ${esc(ev.state)}</div>
    <table role="presentation" style="margin:18px auto 0;border-collapse:collapse;">
      <tr>
        <td style="padding:0 14px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#fff;">${data.totals.games}</div><div style="font-size:10px;letter-spacing:1px;color:#9fdcff;">GAMES</div></td>
        <td style="padding:0 14px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#fff;">${data.totals.goals}</div><div style="font-size:10px;letter-spacing:1px;color:#9fdcff;">GOALS</div></td>
        <td style="padding:0 14px;text-align:center;"><div style="font-size:22px;font-weight:900;color:#fff;">${data.totals.teams}</div><div style="font-size:10px;letter-spacing:1px;color:#9fdcff;">TEAMS</div></td>
      </tr>
    </table>
  </div>
  <div style="padding:22px 20px 6px;">
    <p style="font-size:14px;line-height:1.65;color:#2a3c52;">${esc(data.summary)}</p>
  </div>
  ${data.champions.length ? `
  <div style="padding:8px 14px;">
    <div style="font-size:14px;font-weight:900;letter-spacing:2px;color:#003e79;text-align:center;margin:10px 0;">&#127942; YOUR CHAMPIONS &#127942;</div>
    <table role="presentation" style="width:100%;border-collapse:collapse;">${champRowsHtml.join('')}</table>
    <div style="text-align:center;margin-top:10px;"><a href="${recapUrl}#champions" style="font-size:13px;font-weight:800;color:#b8860b;text-decoration:none;">View all ${data.champions.length} champions &rarr;</a></div>
  </div>` : ''}
  ${data.stars.length ? `
  <div style="padding:14px 20px;">
    <div style="font-size:13px;font-weight:900;letter-spacing:2px;color:#b8860b;margin-bottom:6px;">&#9733; THREE STARS <span style="color:#c9b885;font-weight:700;">&middot; ${data.stars.length} THIS WEEKEND</span></div>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;">${starRows}</table>
    <div style="text-align:center;margin-top:10px;"><a href="${recapUrl}#stars" style="font-size:13px;font-weight:800;color:#b8860b;text-decoration:none;">View all ${data.stars.length} Three Stars &rarr;</a></div>
  </div>` : ''}
  ${data.scorers.length ? `
  <div style="padding:14px 20px;">
    <div style="font-size:13px;font-weight:900;letter-spacing:2px;color:#003e79;margin-bottom:6px;">&#127954; TOP GOAL SCORERS <span style="color:#8fa6c0;font-weight:700;">&middot; ${data.scorers.length} LIT THE LAMP</span></div>
    ${scorerItems}
    <div style="text-align:center;margin-top:10px;"><a href="${recapUrl}#scorers" style="font-size:13px;font-weight:800;color:#003e79;text-decoration:none;">View all ${data.scorers.length} goal scorers &rarr;</a></div>
  </div>` : ''}
  ${data.photos && data.photos.length ? `
  <div style="text-align:center;padding:4px 20px 0;">
    <a href="${recapUrl}#photos" style="font-size:13px;font-weight:800;color:#003e79;text-decoration:none;">&#128247; View the weekend photo gallery (${data.photos.length} photos) &rarr;</a>
  </div>` : ''}
  <div style="text-align:center;padding:10px 20px 24px;">
    <a href="${recapUrl}" style="background:linear-gradient(135deg,#d4af37,#b8860b);color:#fff;text-decoration:none;padding:15px 36px;border-radius:999px;font-size:16px;font-weight:900;display:inline-block;box-shadow:0 4px 14px rgba(184,134,11,0.35);">&#127942; View the Full Event Recap &rarr;</a>
    <div style="font-size:11.5px;color:#8295ab;margin-top:8px;">Every champion, all ${data.stars.length} stars, and all ${data.scorers.length} goal scorers</div>
  </div>
  <div style="background:#f6f9fc;border-radius:14px;margin:4px 16px 24px;padding:16px 18px;text-align:center;">
    <div style="font-size:14px;font-weight:800;color:#1d2b3d;">Enjoyed the weekend?</div>
    <div style="font-size:12.5px;color:#5b6b80;margin:4px 0 10px;">A quick App Store review helps more youth hockey families find us.</div>
    <a href="${REVIEW_URL}" style="color:#003e79;font-weight:800;font-size:13px;">Leave a review &rarr;</a>
  </div>
</div>`;
}

async function recapRecipients(db: any, eventId: string): Promise<string[]> {
  const rows = (await db.prepare(`
    WITH evt_teams AS (
      SELECT er.team_id AS tid FROM event_registrations er
        WHERE er.event_id = ?1 AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment') AND er.team_id IS NOT NULL
      UNION SELECT r.team_id FROM registrations r
        WHERE r.event_id = ?1 AND r.status NOT IN ('rejected','withdrawn') AND r.team_id IS NOT NULL
      UNION SELECT home_team_id FROM games WHERE event_id = ?1 AND home_team_id IS NOT NULL
      UNION SELECT away_team_id FROM games WHERE event_id = ?1 AND away_team_id IS NOT NULL
    )
    SELECT DISTINCT u.email FROM users u WHERE u.id IN (
      SELECT user_id FROM team_coaches WHERE team_id IN (SELECT tid FROM evt_teams)
      UNION SELECT user_id FROM team_managers WHERE team_id IN (SELECT tid FROM evt_teams)
      UNION SELECT user_id FROM team_members WHERE team_id IN (SELECT tid FROM evt_teams) AND status = 'active'
      UNION SELECT user_id FROM user_follows WHERE team_id IN (SELECT tid FROM evt_teams)
    ) AND u.email IS NOT NULL
    UNION
    SELECT er2.email1 FROM event_registrations er2 WHERE er2.event_id = ?1 AND er2.email1 IS NOT NULL
    UNION
    SELECT er3.email2 FROM event_registrations er3 WHERE er3.event_id = ?1 AND er3.email2 IS NOT NULL
  `).bind(eventId).all()).results || [];
  return [...new Set((rows as any[]).map(r => String(r.email || '').trim().toLowerCase()).filter(e => emailRe.test(e)))];
}

export async function sendEventRecap(env: any, eventId: string, opts: { force?: boolean } = {}): Promise<any> {
  const db = env.DB;
  const ev = await db.prepare('SELECT id, name, slug, COALESCE(is_test,0) as is_test, recap_sent_at FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!ev) return { error: 'Event not found' };
  if (ev.recap_sent_at && !opts.force) return { skipped: 'already sent', at: ev.recap_sent_at };
  if (!opts.force) {
    // Claim atomically - the cron gate fires every minute of the send hour
    const claim = await db.prepare("UPDATE events SET recap_sent_at = datetime('now') WHERE id = ? AND recap_sent_at IS NULL").bind(eventId).run();
    if ((claim.meta?.changes || 0) === 0) return { skipped: 'already claimed' };
  }

  const data = await buildRecapData(db, eventId);
  if (!data) return { error: 'No recap data' };
  const html = buildRecapEmailHtml(data);
  const subject = `${data.event.name} Recap: Champions, Three Stars & Every Goal`;
  const recipients = await recapRecipients(db, eventId);

  // Email in BCC batches; staff get the first copy addressed directly
  let emailed = 0;
  const BATCH = 40;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const chunk = recipients.slice(i, i + BATCH);
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: i === 0 ? ['johnny@ultimatetournaments.com', 'john@ultimatetournaments.com'] : ['registration@ultimatetournaments.com'],
          bcc: chunk,
          subject: i === 0 ? `[Recap - ${recipients.length} recipients] ${subject}` : subject,
          html,
        }),
      });
      if (resp.ok) emailed += chunk.length;
    } catch {}
  }

  // Push to the whole event audience, deep-linking to the recap
  const { tokens, userIds } = await eventAudience(db, eventId);
  const pushTitle = `🏆 ${data.event.name} Recap is here!`;
  const pushBody = `Champions, Three Stars, and every goal from the weekend. Tap to relive it!`;
  const pushData = { type: 'event_recap', event_id: eventId };
  const pushed = tokens.length ? await sendExpoPushNotifications(tokens, pushTitle, pushBody, pushData) : 0;
  await logNotification(db, { type: 'event_recap', title: pushTitle, body: pushBody, audience: 'event_followers', target_id: eventId, sent_count: pushed, sent_by: 'system' });
  if (userIds.length) await createUserNotifications(db, userIds, pushTitle, pushBody, 'event_recap', pushData);

  // Champions get the review ask - they're the happy ones
  let reviewPushed = 0;
  for (const ch of data.champions) {
    const aud = await teamAudience(db, [ch.team_id], eventId);
    if (!aud.tokens.length) continue;
    const title = `🏆 ${ch.team_name} - CHAMPIONS!`;
    const body = `Congratulations on winning the ${ch.division} championship! Loved the app this weekend? A quick review helps us grow youth hockey.`;
    const rd = { type: 'app_review', event_id: eventId };
    reviewPushed += await sendExpoPushNotifications(aud.tokens, title, body, rd);
    await createUserNotifications(db, aud.userIds, title, body, 'app_review', rd);
  }

  await db.prepare("UPDATE events SET recap_sent_at = datetime('now') WHERE id = ?").bind(eventId).run();
  return { emailed, recipients: recipients.length, pushed, reviewPushed, champions: data.champions.length };
}

export async function runEventRecapSweep(env: any): Promise<void> {
  const db = env.DB;
  const events = (await db.prepare(`
    SELECT id, name, timezone, end_date FROM events
    WHERE schedule_published = 1 AND COALESCE(is_test, 0) = 0 AND recap_sent_at IS NULL
      AND date(end_date) >= date('now', '-3 day') AND date(end_date) <= date('now')
  `).all()).results || [];
  for (const ev of events as any[]) {
    const nowLocal = eventLocalNow(ev.timezone);           // 'YYYY-MM-DD HH:MM:SS' event-local
    const localDate = nowLocal.slice(0, 10);
    const localHour = parseInt(nowLocal.slice(11, 13), 10);
    // The morning AFTER the event ends, 9-11 AM local
    if (localDate > String(ev.end_date).slice(0, 10) && localHour >= 9 && localHour < 12) {
      try {
        const res = await sendEventRecap(env, ev.id);
        console.log('Event recap sent:', ev.name, JSON.stringify(res));
      } catch (e) { console.error('Event recap failed:', ev.name, e); }
    }
  }
}
