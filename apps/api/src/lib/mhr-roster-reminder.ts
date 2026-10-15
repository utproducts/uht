/**
 * MHR link + USA Hockey roster reminders.
 *
 * Automated cadence (runMhrRosterReminderSweep, daily from the cron):
 * starting 30 days before an event, every team still missing its MHR link
 * or roster gets an email + push once a week until both are in.
 * Weekly idempotence comes from week-bucketed automated_email_log template
 * ids (mhr_roster_<year>-<isoweek>), so re-runs inside a week are no-ops.
 */

import { sendExpoPushNotifications, createUserNotifications, logNotification } from './push';

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';

const SITE = 'https://ultimatetournaments.com';

// Johnny asked OFF the per-email BCC but still wants one copy per blast
async function sendBlastCopy(env: any, subject: string, html: string, sent: number) {
  if (sent <= 0) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: ['johnny@ultimatetournaments.com'], subject: `[Blast copy - ${sent} sent] ${subject}`, html }),
    });
  } catch {}
}

const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtRange(start: string, end?: string | null): string {
  const [sy, sm, sd] = String(start).slice(0, 10).split('-').map(Number);
  if (!end) return `${MONTHS[sm - 1]} ${sd}, ${sy}`;
  const [ey, em, ed] = String(end).slice(0, 10).split('-').map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd} - ${ed}, ${sy}`;
  return `${MONTHS[sm - 1]} ${sd} - ${MONTHS[em - 1]} ${ed}, ${sy}`;
}

/** ISO week bucket, e.g. mhr_roster_2026-42 - one send per team per week */
export function weeklyTemplateId(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `mhr_roster_${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

/** Approved teams for an event that are missing their MHR link and/or roster */
export async function mhrRosterStatus(db: any, eventId: string): Promise<any[]> {
  const rows = (await db.prepare(`
    SELECT er.id as reg_id, er.email1, er.email2, er.coach_email,
      t.id as team_id, t.head_coach_email,
      COALESCE(t.schedule_name, t.name, er.team_name) as team_name,
      COALESCE(ed.age_group, t.age_group, er.age_group) as age_group,
      CASE WHEN t.id IS NULL OR t.mhr_url IS NULL OR t.mhr_url = '' THEN 1 ELSE 0 END as missing_mhr,
      CASE WHEN t.id IS NULL OR (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') = 0 THEN 1 ELSE 0 END as missing_roster
    FROM event_registrations er
    LEFT JOIN teams t ON t.id = COALESCE(er.team_id,
      (SELECT t9.id FROM teams t9 WHERE LOWER(t9.name) = LOWER(er.team_name) AND t9.is_active = 1 LIMIT 1))
    LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
    WHERE er.event_id = ? AND er.status = 'approved'
  `).bind(eventId).all()).results || [];
  // Mites: MyHockeyRankings does not rank them, and their roster is AAU,
  // not USA Hockey - never nag a mite team about an MHR link
  for (const r of rows as any[]) {
    r.is_mite = /mite|\b8u\b/i.test(String(r.age_group || r.team_name || '')) ? 1 : 0;
    if (r.is_mite) r.missing_mhr = 0;
  }
  return (rows as any[]).filter(r => r.missing_mhr || r.missing_roster);
}

export function buildMhrRosterHtml(opts: {
  eventName: string; eventDates: string; teamName: string;
  missingMhr: boolean; missingRoster: boolean; teamId: string | null; isMite?: boolean;
}): { subject: string; html: string } {
  const { eventName, eventDates, teamName, missingMhr, missingRoster, teamId } = opts;
  const rosterLabel = opts.isMite ? 'AAU roster' : 'USA Hockey roster';
  const needs = [missingMhr ? 'MHR link' : null, missingRoster ? rosterLabel : null].filter(Boolean).join(' and ');
  const subject = `Action needed for ${eventName}: add your ${needs}`;
  const editUrl = teamId ? `${SITE}/create-team?edit=${teamId}` : `${SITE}/dashboard`;

  const mhrBlock = missingMhr ? `
      <div style="background:#f7fafd;border:1px solid #dbe6f1;border-radius:12px;padding:16px 18px;margin:0 0 12px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#003e79;">1. Add your MyHockeyRankings link</p>
        <p style="margin:0 0 10px;font-size:14px;color:#3d3d3d;line-height:1.5;">Find your team on <a href="https://myhockeyrankings.com" style="color:#0077b6;">myhockeyrankings.com</a>, copy the page link, and paste it into your team profile. We use MHR ratings to build fair, competitive schedules.</p>
        <a href="${editUrl}" style="display:inline-block;background:#003e79;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;">Add MHR link to ${teamName}</a>
      </div>` : '';

  const rosterBlock = missingRoster ? `
      <div style="background:#f7fafd;border:1px solid #dbe6f1;border-radius:12px;padding:16px 18px;margin:0 0 12px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#003e79;">${missingMhr ? '2' : '1'}. Add your roster</p>
        <p style="margin:0;font-size:14px;color:#3d3d3d;line-height:1.5;">Open the UHT app, go to My Teams, tap ${teamName}, then Roster, and add your players. You can paste your ${rosterLabel} straight in. Rosters are required for game-day check-in and scoresheets.</p>
      </div>` : '';

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f2f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#003e79;border-radius:16px 16px 0 0;padding:26px 28px 22px;text-align:center;">
      <p style="margin:0;font-size:12px;letter-spacing:2px;color:#00ccff;font-weight:700;">${eventName.toUpperCase()}</p>
      <h1 style="margin:8px 0 4px;font-size:22px;color:#ffffff;">Your team setup needs one more step</h1>
      <p style="margin:0;font-size:14px;color:#b9c9dc;">${teamName} - ${eventDates}</p>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px 28px 26px;">
      <p style="margin:0 0 16px;font-size:15px;color:#1d1d1f;">Coaches and managers,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#3d3d3d;line-height:1.6;">Before the tournament we need every team's ${needs}. Here is what is still missing for <strong>${teamName}</strong>:</p>
      ${mhrBlock}
      ${rosterBlock}
      <p style="margin:16px 0 0;font-size:13px;color:#6e6e73;line-height:1.5;">Questions? Just reply to this email and we will help you out.</p>
      <p style="margin:14px 0 0;font-size:13px;color:#6e6e73;">Ultimate Hockey Tournaments</p>
    </div>
  </div>
</body>
</html>`;
  return { subject, html };
}

/**
 * Email + push every approved team still missing MHR/roster for an event.
 * Weekly idempotent. Returns per-team detail for the caller/preview.
 */
export async function sendMhrRosterReminders(env: any, eventId: string, opts: { commit?: boolean } = {}) {
  const db = env.DB;
  const event = await db.prepare('SELECT id, name, start_date, end_date, COALESCE(is_test,0) as is_test FROM events WHERE id = ?')
    .bind(eventId).first();
  if (!event) return { error: 'Event not found' };
  if (event.is_test) return { error: 'Test event - reminders disabled' };

  const teams = await mhrRosterStatus(db, eventId);
  const eventDates = fmtRange(event.start_date, event.end_date);
  const templateId = weeklyTemplateId();
  const out: any = { teams: teams.length, emails_sent: 0, emails_skipped: 0, pushes_sent: 0, no_email: 0, detail: [] as any[] };

  let lastSample: { subject: string; html: string } | null = null;
  for (const t of teams) {
    const { subject, html } = buildMhrRosterHtml({
      eventName: event.name, eventDates, teamName: t.team_name || 'Your Team',
      missingMhr: !!t.missing_mhr, missingRoster: !!t.missing_roster, teamId: t.team_id || null,
      isMite: !!t.is_mite,
    });
    const recipients = [...new Set(
      [t.email1, t.email2, t.coach_email, t.head_coach_email]
        .map((e: string | null) => (e || '').trim().toLowerCase())
        .filter((e: string) => emailRe.test(e) && !e.includes('..'))
    )];
    out.detail.push({ team: t.team_name, missing_mhr: !!t.missing_mhr, missing_roster: !!t.missing_roster, recipients });
    if (!opts.commit) continue;

    if (recipients.length === 0) out.no_email++;
    for (const email of recipients) {
      const already = await db.prepare(
        'SELECT id FROM automated_email_log WHERE template_id = ? AND registration_id = ? AND email = ?'
      ).bind(templateId, t.reg_id, email).first();
      if (already) { out.emails_skipped++; continue; }
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [email], subject, html }),
        });
        if (!resp.ok) { console.error(`MHR reminder failed for ${email}: ${resp.status}`); continue; }
        await db.prepare(
          'INSERT OR IGNORE INTO automated_email_log (template_id, event_id, registration_id, email) VALUES (?, ?, ?, ?)'
        ).bind(templateId, event.id, t.reg_id, email).run();
        out.emails_sent++;
        lastSample = { subject, html };
      } catch (e: any) {
        console.error(`MHR reminder error for ${email}:`, e?.message || String(e));
      }
    }

    // Push to the team's coaches and managers in the app (weekly via the
    // same log: a sentinel row keyed to the push "address")
    if (t.team_id) {
      const pushKey = `push:${t.team_id}`;
      const pushAlready = await db.prepare(
        'SELECT id FROM automated_email_log WHERE template_id = ? AND registration_id = ? AND email = ?'
      ).bind(templateId, t.reg_id, pushKey).first();
      if (!pushAlready) {
        const staff = (await db.prepare(`
          SELECT DISTINCT pt.token, pt.user_id FROM push_tokens pt WHERE pt.user_id IN (
            SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id = ?1
            UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id = ?1
          )
        `).bind(t.team_id).all()).results || [];
        if (staff.length > 0) {
          const needs = [t.missing_mhr ? 'MHR link' : null, t.missing_roster ? (t.is_mite ? 'AAU roster' : 'roster') : null].filter(Boolean).join(' and ');
          const title = `${t.team_name}: ${needs} needed`;
          const body = `Please add your team's ${needs} before ${event.name}. It only takes a minute.`;
          const tokens = (staff as any[]).map(r => r.token);
          const userIds = [...new Set((staff as any[]).map(r => r.user_id))] as string[];
          const sent = await sendExpoPushNotifications(tokens, title, body, { type: 'mhr_roster_reminder', event_id: event.id });
          await createUserNotifications(db, userIds, title, body, 'mhr_roster_reminder', { event_id: event.id });
          await logNotification(db, { type: 'mhr_roster_reminder', title, body, audience: 'team_staff', target_id: t.team_id, sent_count: sent, sent_by: 'system' });
          await db.prepare(
            'INSERT OR IGNORE INTO automated_email_log (template_id, event_id, registration_id, email) VALUES (?, ?, ?, ?)'
          ).bind(templateId, event.id, t.reg_id, pushKey).run();
          out.pushes_sent += sent;
        }
      }
    }
  }
  if (lastSample) await sendBlastCopy(env, lastSample.subject, lastSample.html, out.emails_sent);
  return out;
}

/** Daily sweep: events starting within 30 days get the weekly nag */
export async function runMhrRosterReminderSweep(env: any) {
  const db = env.DB;
  const events = (await db.prepare(`
    SELECT id, name FROM events
    WHERE COALESCE(is_test, 0) = 0
      AND date(start_date) BETWEEN date('now') AND date('now', '+30 days')
      AND date(end_date) >= date('now')
  `).all()).results || [];
  const results: any[] = [];
  for (const e of events as any[]) {
    const r = await sendMhrRosterReminders(env, e.id, { commit: true });
    results.push({ event: e.name, ...r });
  }
  return { events: events.length, results };
}
