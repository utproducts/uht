/*
  PRE-EVENT WELCOME EMAIL (Johnny's "Important Events Email", Oct 2026):
  goes to every approved team's coaches/managers 1-3 days before an event
  starts, with the team's own Parent/Fan code baked in. Johnny can add a
  per-event note (events.welcome_note) from the admin Overview card before
  it fires; idempotent via events.welcome_sent_at + per-team log rows.
*/

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
const APP_STORE_URL = 'https://apps.apple.com/app/id6786085393';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ultimatetournaments.uht';
const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function esc(x: any): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildWelcomeHtml(ev: any, teamName: string, parentCode: string | null): string {
  const note = String(ev.welcome_note || '').trim();
  const point = (n: number, title: string, body: string) => `
    <tr><td style="padding:9px 0;border-bottom:1px solid #eef2f6;vertical-align:top;">
      <table role="presentation" style="border-collapse:collapse;"><tr>
        <td style="vertical-align:top;padding-right:12px;"><div style="width:26px;height:26px;border-radius:50%;background:#003e79;color:#fff;font-weight:800;font-size:13px;text-align:center;line-height:26px;font-family:Arial,sans-serif;">${n}</div></td>
        <td style="font-family:Arial,sans-serif;font-size:13.5px;color:#2a3c52;line-height:1.55;"><b style="color:#003e79;">${title}</b><br>${body}</td>
      </tr></table>
    </td></tr>`;

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#002d5a,#003e79 60%,#0077b0);padding:28px 24px;text-align:center;border-radius:0 0 16px 16px;">
    <div style="font-size:11px;letter-spacing:3px;color:#7fd8ff;font-weight:bold;">WELCOME TO</div>
    <div style="font-size:25px;font-weight:900;color:#ffffff;margin-top:5px;">${esc(ev.name)}</div>
    <div style="font-size:12.5px;color:#bfe8ff;margin-top:4px;">${esc(ev.city)}, ${esc(ev.state)} &middot; We can't wait to host ${esc(teamName)}!</div>
  </div>
  <div style="padding:18px 22px 4px;">
    <p style="font-size:13.5px;line-height:1.6;color:#2a3c52;">Hello Coaches and Managers,</p>
    <p style="font-size:13.5px;line-height:1.6;color:#2a3c52;">Welcome to the ${esc(ev.name)}! We look forward to hosting your team this weekend. Here is the important information to make sure you have the <b>ULTIMATE</b> experience with us:</p>
    ${note ? `<div style="background:#f0f7ff;border-left:4px solid #003e79;border-radius:0 8px 8px 0;padding:10px 14px;margin:10px 0;font-size:13.5px;line-height:1.55;color:#17304d;"><b>A note for this weekend:</b><br>${esc(note).replace(/\n/g, '<br>')}</div>` : ''}
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:4px;">
      ${point(1, 'Get every family on the UHT app', `It's free on <a href="${APP_STORE_URL}" style="color:#0077b0;font-weight:bold;">iPhone</a> and <a href="${PLAY_STORE_URL}" style="color:#0077b0;font-weight:bold;">Android</a>. Share your team's Parent/Fan code so families can follow along:${parentCode ? `<br><span style="display:inline-block;margin-top:6px;background:#003e79;color:#fff;font-weight:900;font-size:17px;letter-spacing:4px;padding:7px 18px;border-radius:9px;">${esc(parentCode)}</span>` : ' find it on your team page in the app.'}`)}
      ${point(2, 'Upload your player list', 'Player lists power digital scoring and stat tracking all weekend and at every future UHT event. Add yours in the app under your team, or on the website.')}
      ${point(3, 'Everything lives in the app', 'Schedules, standings, locker room assignments for every game, and the Three Stars awarded after each game.')}
      ${point(4, 'Save on team dinners', "Check the Promotions tab for restaurant deals exclusive to tournament families - don't miss them!")}
      ${point(5, 'Event merchandise', 'Official event merch will be available at select rinks all weekend.')}
      ${point(6, 'Neck guards & warm-up pucks', '<b style="color:#c0392b;">All players are required to wear neck guards this season.</b> Players without proper protection are subject to disqualification from that game. And please bring your own warm-up pucks!')}
      ${point(7, 'Have fun!', 'Enjoy making everlasting memories with your families and friends this weekend.')}
    </table>
    <p style="font-size:13px;line-height:1.6;color:#2a3c52;margin-top:14px;">Thank you for your cooperation - see you at the rink!</p>
    <p style="font-size:12.5px;color:#5b6b80;">Johnny Schwarz &middot; Ultimate Tournaments &middot; 630.336.6175</p>
  </div>
</div>`;
}

async function eventTeams(db: any, eventId: string): Promise<Array<{ team_id: string; team_name: string; parent_code: string | null; emails: string[] }>> {
  const rows = (await db.prepare(`
    SELECT t.id as team_id,
      COALESCE(t.schedule_name, t.name) as team_name,
      t.parent_invite_code,
      er.email1, er.email2, er.coach_email
    FROM event_registrations er
    JOIN teams t ON t.id = er.team_id
    WHERE er.event_id = ?1 AND er.status = 'approved' AND er.team_id IS NOT NULL
    UNION
    SELECT t2.id, COALESCE(t2.schedule_name, t2.name), t2.parent_invite_code, NULL, NULL, NULL
    FROM registrations r
    JOIN teams t2 ON t2.id = r.team_id
    WHERE r.event_id = ?1 AND r.status = 'approved' AND r.team_id IS NOT NULL
  `).bind(eventId).all()).results || [];
  const byTeam = new Map<string, any>();
  for (const r of rows as any[]) {
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, { team_id: r.team_id, team_name: r.team_name, parent_code: r.parent_invite_code, emails: new Set<string>() });
    for (const e of [r.email1, r.email2, r.coach_email]) {
      const v = String(e || '').trim().toLowerCase();
      if (emailRe.test(v)) byTeam.get(r.team_id).emails.add(v);
    }
  }
  for (const t of byTeam.values()) {
    const staff = (await db.prepare(`
      SELECT DISTINCT u.email FROM users u WHERE u.id IN (
        SELECT user_id FROM team_coaches WHERE team_id = ?1
        UNION SELECT user_id FROM team_managers WHERE team_id = ?1
      ) AND u.email IS NOT NULL
    `).bind(t.team_id).all()).results || [];
    for (const s of staff as any[]) {
      const v = String(s.email || '').trim().toLowerCase();
      if (emailRe.test(v)) t.emails.add(v);
    }
  }
  return [...byTeam.values()].map(t => ({ ...t, emails: [...t.emails] }));
}

export async function sendEventWelcome(env: any, eventId: string, opts: { force?: boolean } = {}): Promise<any> {
  const db = env.DB;
  const ev = await db.prepare('SELECT id, name, slug, city, state, start_date, welcome_note, welcome_sent_at, COALESCE(is_test,0) as is_test FROM events WHERE id = ?')
    .bind(eventId).first<any>();
  if (!ev) return { error: 'Event not found' };
  if (ev.is_test) return { skipped: 'test event' };
  if (ev.welcome_sent_at && !opts.force) return { skipped: 'already sent', at: ev.welcome_sent_at };
  if (!opts.force) {
    const claim = await db.prepare("UPDATE events SET welcome_sent_at = datetime('now') WHERE id = ? AND welcome_sent_at IS NULL").bind(eventId).run();
    if ((claim.meta?.changes || 0) === 0) return { skipped: 'already claimed' };
  }

  const teams = await eventTeams(db, eventId);
  let sent = 0, skipped = 0;
  for (const t of teams) {
    if (t.emails.length === 0) { skipped++; continue; }
    const html = buildWelcomeHtml(ev, t.team_name, t.parent_code);
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, reply_to: REPLY_TO, to: t.emails.slice(0, 10),
          subject: `Welcome to ${ev.name} - Important Info for This Weekend`,
          html,
        }),
      });
      if (resp.ok) sent++;
    } catch {}
  }
  if (opts.force) await db.prepare("UPDATE events SET welcome_sent_at = datetime('now') WHERE id = ?").bind(eventId).run();

  // One blast copy to staff (Johnny's no-per-email-CC rule)
  if (sent > 0) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: ['johnny@ultimatetournaments.com', 'john@ultimatetournaments.com'],
          subject: `[Blast copy - ${sent} teams] Welcome to ${ev.name} - Important Info for This Weekend`,
          html: buildWelcomeHtml(ev, 'your team', 'TEAMCODE'),
        }),
      });
    } catch {}
  }
  return { teams: teams.length, sent, skipped };
}

export async function runEventWelcomeSweep(env: any): Promise<void> {
  const db = env.DB;
  const { eventLocalNow } = await import('./push');
  const events = (await db.prepare(`
    SELECT id, name, timezone, start_date FROM events
    WHERE COALESCE(is_test, 0) = 0 AND welcome_sent_at IS NULL
      AND date(start_date) >= date('now') AND date(start_date) <= date('now', '+3 days')
      AND status IN ('published', 'registration_open', 'active')
  `).all()).results || [];
  for (const ev of events as any[]) {
    const nowLocal = eventLocalNow(ev.timezone);
    const hour = parseInt(nowLocal.slice(11, 13), 10);
    const daysOut = Math.round((new Date(String(ev.start_date).slice(0, 10)).getTime() - new Date(nowLocal.slice(0, 10)).getTime()) / 86400000);
    // 1-3 days before start, during the event-local working day
    if (daysOut >= 1 && daysOut <= 3 && hour >= 9 && hour < 18) {
      try {
        const res = await sendEventWelcome(env, ev.id);
        console.log('Event welcome sent:', ev.name, JSON.stringify(res));
      } catch (e) { console.error('Event welcome failed:', ev.name, e); }
    }
  }
}
