/**
 * Daily sweep: send the 30-days-out event info email.
 *
 * Runs from the Worker cron. For every event whose start_date is exactly 30
 * days away, sends the event_info_30day template to each active registration's
 * coach/manager emails. Idempotent via automated_email_log, so the sweep can
 * run every cron tick during its send-hour window without double-sending.
 */

import { buildEventInfoHtml } from './event-info-email';
import { getResolvedFields, replaceVars } from './template-overrides';

const TEMPLATE_ID = 'event_info_30day';
const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function fmtRange(start: string, end?: string | null): string {
  const [sy, sm, sd] = start.slice(0, 10).split('-').map(Number);
  if (!end) return fmtDate(start);
  const [ey, em, ed] = end.slice(0, 10).split('-').map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd} - ${ed}, ${sy}`;
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} - ${MONTHS[em - 1]} ${ed}, ${sy}`;
  return `${fmtDate(start)} - ${fmtDate(end)}`;
}

const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Gather everything the email needs for one event (shared by sweep + preview) */
export async function getEventInfoContext(db: any, event: any) {
  // Rinks/venues attached to the event; fall back to venues of scheduled games
  let venues = (await db.prepare(`
    SELECT v.name, v.address, v.city, v.state
    FROM event_venues ev JOIN venues v ON v.id = ev.venue_id
    WHERE ev.event_id = ? ORDER BY ev.is_primary DESC, ev.sort_order
  `).bind(event.id).all()).results || [];
  if (venues.length === 0) {
    venues = (await db.prepare(`
      SELECT DISTINCT v.name, v.address, v.city, v.state
      FROM games g
      JOIN venue_rinks vr ON vr.id = g.rink_id
      JOIN venues v ON v.id = vr.venue_id
      WHERE g.event_id = ?
    `).bind(event.id).all()).results || [];
  }

  // Schedule email date: 10 days before start
  const start = new Date(`${event.start_date.slice(0, 10)}T12:00:00Z`);
  const sched = new Date(start.getTime() - 10 * 86400_000);
  const scheduleDate = `${MONTHS[sched.getUTCMonth()]} ${sched.getUTCDate()}`;

  return {
    eventName: event.name as string,
    eventDates: fmtRange(event.start_date, event.end_date),
    eventCity: [event.city, event.state].filter(Boolean).join(', '),
    eventUrl: event.slug ? `https://ultimatetournaments.com/events/${event.slug}` : 'https://ultimatetournaments.com/events',
    rinks: venues as { name: string; address?: string; city?: string; state?: string }[],
    scheduleDate,
  };
}

/** Roster size for a registration's team (0 = no roster online) */
async function rosterCountFor(db: any, reg: any): Promise<number> {
  let teamId = reg.team_id as string | null;
  if (!teamId && reg.team_name) {
    const t = await db.prepare('SELECT id FROM teams WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1')
      .bind(reg.team_name).first() as any;
    teamId = t?.id || null;
  }
  if (!teamId) return 0;
  const row = await db.prepare(
    "SELECT COUNT(*) as n FROM team_players WHERE team_id = ? AND status != 'inactive'"
  ).bind(teamId).first() as any;
  return row?.n || 0;
}

export async function runEventInfo30DaySweep(env: any): Promise<{ events: number; sent: number; skipped: number }> {
  const db = env.DB;
  const out = { events: 0, sent: 0, skipped: 0 };

  const events = (await db.prepare(`
    SELECT * FROM events
    WHERE date(start_date) = date('now', '+30 days')
      AND name NOT LIKE 'claude-test%'
  `).all()).results || [];
  if (events.length === 0) return out;

  const fields = await getResolvedFields(db, TEMPLATE_ID);

  for (const event of events) {
    out.events++;
    const ctx = await getEventInfoContext(db, event);

    const regs = (await db.prepare(`
      SELECT er.*, t.head_coach_email
      FROM event_registrations er
      LEFT JOIN teams t ON t.id = er.team_id
      WHERE er.event_id = ?
        AND er.status NOT IN ('withdrawn', 'denied', 'rejected', 'awaiting_payment')
    `).bind(event.id).all()).results || [];

    for (const reg of regs) {
      // One send wave per cron tick stays well under subrequest limits for
      // realistic event sizes (30-40 teams x ~2 emails); the idempotency log
      // lets a second tick finish anything a first tick could not.
      const recipients = [...new Set(
        [reg.email1, reg.email2, reg.coach_email, reg.head_coach_email]
          .map((e: string | null) => (e || '').trim().toLowerCase())
          .filter((e: string) => emailRe.test(e) && !e.includes('..'))
      )];
      if (recipients.length === 0) continue;

      const rosterCount = await rosterCountFor(db, reg);
      const vars = {
        eventName: ctx.eventName,
        teamName: reg.team_name || 'Your Team',
        eventDates: ctx.eventDates,
        eventCity: ctx.eventCity,
        scheduleDate: ctx.scheduleDate,
      };
      const subject = replaceVars(fields.subject, vars);
      const html = buildEventInfoHtml({
        ...ctx,
        teamName: reg.team_name || 'Your Team',
        ageGroup: reg.age_group,
        division: reg.division,
        rosterCount,
        isPaid: reg.payment_status === 'paid',
        payUrl: `https://ultimatetournaments.com/pay?reg=${reg.id}`,
        _overrides: fields,
      });

      for (const email of recipients) {
        const already = await db.prepare(
          'SELECT id FROM automated_email_log WHERE template_id = ? AND registration_id = ? AND email = ?'
        ).bind(TEMPLATE_ID, reg.id, email).first();
        if (already) { out.skipped++; continue; }

        try {
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [email], subject, html }),
          });
          if (!resp.ok) {
            console.error(`30-day email failed for ${email}: ${resp.status} ${await resp.text()}`);
            continue; // no log row — retried next tick
          }
          await db.prepare(
            'INSERT OR IGNORE INTO automated_email_log (template_id, event_id, registration_id, email) VALUES (?, ?, ?, ?)'
          ).bind(TEMPLATE_ID, event.id, reg.id, email).run();
          out.sent++;
        } catch (e: any) {
          console.error(`30-day email error for ${email}:`, e?.message || String(e));
        }
      }
    }
  }

  return out;
}
