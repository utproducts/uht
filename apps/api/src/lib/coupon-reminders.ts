// Coupon reminder campaign (Chad, 2026-11-08).
// Every registration earns a UHT-XXXXXX code ($100 off the next event, $200
// off with hotels) sent in the confirmation email. Most go unused. This sweep
// reminds each team that still holds an unused code, in daily cohorts so the
// sends spread across the calendar instead of one blast.
//
// Audience: coupon_reminder_targets — one row per (email, team) holding that
// team's newest unused post-registration code. Populated by script; this
// sweep only sends and marks.
//
// One email per target, from Johnny, personalized: team name, the code, and
// up to four upcoming events that have the team's age group, linked by slug.
//
// Runs from the worker cron, gated to SEND_HOUR_UTC; idempotent per target
// (sent_at set in the same batch that records the send) and per day (cohort
// cap counts today's sends). Eligibility rechecked every run: a code that got
// used or an email that unsubscribed drops out before sending.
//
// Tracking rides the existing rails: one email_campaigns row ('couponrem2026',
// status 'sent' so the stale-campaign cron never grabs it, body_html holds a
// rendered sample for the dashboard preview modal) and one email_sends row per
// send carrying the Resend id for the webhook to mark delivered/opened/clicked.

const PER_DAY = 75;
const SEND_HOUR_UTC = 17; // 11am CST — an hour after the re-engagement sweep
const START_DATE = '2026-11-09'; // no sends before this (gives Chad review room)
const BATCH = 25;
const MAX_EVENTS_LISTED = 4;

const FROM = 'Johnny - Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
export const CAMPAIGN_ID = 'couponrem2026';

type Target = {
  id: string; code: string; email: string; first_name: string | null;
  team_name: string; age_group: string | null;
  earned_event_id: string; earned_event_name: string;
};

type UpcomingEvent = {
  id: string; name: string; slug: string; city: string; state: string;
  start_date: string; end_date: string; age_groups: Set<string>;
};

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "Squirt (10U)" -> Squirt, "12U" -> Pee Wee, "Girls 12U" stays exact
export function ageBase(ag: string | null | undefined): string | null {
  if (!ag) return null;
  const s = ag.trim();
  if (!s) return null;
  if (/^girls/i.test(s)) return s;
  const m = s.match(/^([A-Za-z .]+?)\s*\(/);
  if (m) return m[1].trim();
  const u: Record<string, string> = { '8u': 'Mite', '10u': 'Squirt', '12u': 'Pee Wee', '14u': 'Bantam' };
  return u[s.toLowerCase()] || s;
}

function fmtDates(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return sStr === eStr ? sStr : `${sStr} - ${eStr}`;
}

function footer(): string {
  return `
<div style="padding:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <p style="color:#aeaeb2;font-size:11px;margin:0;">
    Ultimate Hockey Tournaments &middot; <a href="https://ultimatetournaments.com" style="color:#86868b;">ultimatetournaments.com</a><br/>
    You are receiving this because your team registered for a UHT event.
    <a href="https://ultimatetournaments.com/unsubscribe" style="color:#aeaeb2;text-decoration:underline;">Unsubscribe</a>
  </p>
</div>`;
}

function wrap(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1d1d1f;">
${content}
${footer()}
</td></tr></table></td></tr></table>
</body></html>`;
}

function eventRows(events: UpcomingEvent[]): string {
  if (!events.length) return '';
  const rows = events.map(ev => `
<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f2;">
  <a href="https://ultimatetournaments.com/events/${esc(ev.slug)}" style="color:#003e79;font-size:15px;font-weight:700;text-decoration:none;">${esc(ev.name)}</a>
  <span style="color:#6e6e73;font-size:13px;"> &middot; ${esc(ev.city)}, ${esc(ev.state)} &middot; ${fmtDates(ev.start_date, ev.end_date)}</span>
</td><td align="right" style="padding:10px 0;border-bottom:1px solid #f0f0f2;">
  <a href="https://ultimatetournaments.com/events/${esc(ev.slug)}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:7px 14px;border-radius:16px;text-decoration:none;font-size:12px;font-weight:700;">Register</a>
</td></tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;">${rows}</table>`;
}

export function reminderSubject(t: Target): string {
  return `${t.team_name} has a $100 credit waiting`;
}

export function reminderHtml(t: Target, eligible: UpcomingEvent[]): string {
  const name = (t.first_name || '').trim();
  const greeting = name ? `Hey ${esc(name)},` : 'Hey Coach,';
  const eventsBlock = eligible.length
    ? `<p style="margin:18px 0 6px 0;font-weight:700;">Weekends with ${esc(ageBase(t.age_group) || 'your')} divisions open right now:</p>${eventRows(eligible)}`
    : `<p>Every open weekend is on the schedule at <a href="https://ultimatetournaments.com/events/" style="color:#003e79;">ultimatetournaments.com/events</a>.</p>`;
  return wrap(`
<p>${greeting}</p>
<p>Johnny here from Ultimate Hockey Tournaments. When ${esc(t.team_name)} registered for ${esc(t.earned_event_name)}, we set aside a thank-you credit for your next event. I checked today and it has not been used yet, so I wanted to make sure it did not get buried in your inbox.</p>
<p style="text-align:center;margin:24px 0 10px 0;"><span style="display:inline-block;background:#f0f6ff;border:2px dashed #003e79;border-radius:10px;padding:14px 28px;font-size:20px;font-weight:700;letter-spacing:1px;color:#003e79;">${esc(t.code)}</span></p>
<p style="text-align:center;margin:0 0 20px 0;color:#6e6e73;font-size:13px;">$100 off your next event, or $200 off when you book your hotel block with it</p>
${eventsBlock}
<p>Enter the code at checkout and it comes right off your deposit. If you have questions about dates or divisions, just reply to this email and I will help you find the right fit.</p>
<p>See you at the rink,</p>
<p>Johnny<br/>Ultimate Hockey Tournaments</p>`);
}

async function ensureSetup(db: D1Database): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO email_campaigns (id, name, subject, body_html, from_name, from_email, template_type, status, sent_at)
    VALUES (?, 'Coupon reminder - unused $100 credits', 'Your team has a $100 credit waiting', '(per-recipient template in lib/coupon-reminders.ts)', 'Johnny - Ultimate Hockey Tournaments', 'johnny@ultimatetournaments.com', 'coupon_reminder', 'sent', datetime('now'))
  `).bind(CAMPAIGN_ID).run();
  await db.prepare("UPDATE email_campaigns SET is_marketing = 1 WHERE id = ? AND COALESCE(is_marketing,0) = 0").bind(CAMPAIGN_ID).run().catch(() => {});
}

// Drop anyone whose code got used or who unsubscribed since the last run.
async function refreshEligibility(db: D1Database): Promise<void> {
  await db.prepare(`
    UPDATE coupon_reminder_targets SET status = 'redeemed'
    WHERE status = 'pending'
      AND EXISTS (SELECT 1 FROM discount_codes dc WHERE dc.code = coupon_reminder_targets.code AND dc.is_used = 1)
  `).run();
  await db.prepare(`
    UPDATE coupon_reminder_targets SET status = 'unsubscribed'
    WHERE status = 'pending'
      AND EXISTS (SELECT 1 FROM contacts c WHERE LOWER(c.email) = coupon_reminder_targets.email AND c.is_subscribed_email = 0)
  `).run();
}

export async function loadUpcomingEvents(db: D1Database): Promise<UpcomingEvent[]> {
  const evs = ((await db.prepare(`
    SELECT e.id, e.name, e.slug, e.city, e.state, e.start_date, e.end_date
    FROM events e
    WHERE date(e.start_date) > date('now', '+2 days')
      AND e.status IN ('published', 'registration_open')
      AND COALESCE(e.is_test, 0) = 0 AND COALESCE(e.is_sold_out, 0) = 0
    ORDER BY e.start_date LIMIT 40
  `).all<any>()).results || []);
  const out: UpcomingEvent[] = evs.map((e: any) => ({ ...e, age_groups: new Set<string>() }));
  const byId = new Map(out.map(e => [e.id, e]));
  for (let i = 0; i < out.length; i += 50) {
    const chunk = out.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const rows = ((await db.prepare(
      `SELECT event_id, age_group FROM event_divisions WHERE event_id IN (${ph}) AND status != 'cancelled'`
    ).bind(...chunk.map(e => e.id)).all<any>()).results || []);
    for (const r of rows) byId.get(r.event_id)?.age_groups.add(String(r.age_group || '').trim());
  }
  return out;
}

export function eligibleFor(t: Target, events: UpcomingEvent[]): UpcomingEvent[] {
  const base = ageBase(t.age_group);
  const pool = events.filter(ev => ev.id !== t.earned_event_id);
  const matched = base ? pool.filter(ev => ev.age_groups.has(base)) : [];
  return (matched.length ? matched : pool).slice(0, MAX_EVENTS_LISTED);
}

async function contactIdFor(db: D1Database, email: string): Promise<string> {
  const row = await db.prepare('SELECT id FROM contacts WHERE LOWER(email) = ? LIMIT 1').bind(email).first<any>();
  if (row) return row.id;
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare("INSERT INTO contacts (id, email, source) VALUES (?, ?, 'registration')").bind(id, email).run();
  return id;
}

export async function runCouponReminderSweep(env: any): Promise<{ sent: number } | { skipped: string }> {
  const now = new Date();
  if (now.getUTCHours() !== SEND_HOUR_UTC) return { skipped: 'outside send hour' };
  const today = now.toISOString().slice(0, 10);
  if (today < START_DATE) return { skipped: 'before campaign start' };
  const db: D1Database = env.DB;

  const probe = await db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'coupon_reminder_targets'").first<any>();
  if (!probe?.n) return { skipped: 'no targets table' };

  await ensureSetup(db);
  await refreshEligibility(db);

  const sentToday = await db.prepare(
    "SELECT COUNT(*) n FROM coupon_reminder_targets WHERE date(sent_at) = date('now')"
  ).first<any>();
  const room = PER_DAY - (sentToday?.n || 0);
  if (room <= 0) return { sent: 0 };

  // Overfetch so cooldown deferrals still leave a full cohort to send
  const raw = ((await db.prepare(
    "SELECT * FROM coupon_reminder_targets WHERE status = 'pending' AND sent_at IS NULL ORDER BY created_at, email LIMIT ?"
  ).bind(room * 3).all<Target>()).results || []);

  // 72h marketing cooldown (Chad 11/8): defer anyone who got a marketing
  // email in the last 72 hours; they stay pending for a later day. The set
  // also dedupes same-email targets inside this run (two teams, one manager).
  const { recentlyMarketedSet } = await import('./marketing-guard');
  const cooled = await recentlyMarketedSet(db);
  const targets = raw.filter(t => {
    if (cooled.has(t.email)) return false;
    cooled.add(t.email);
    return true;
  }).slice(0, room);
  if (!targets.length) return { sent: 0 };

  const events = await loadUpcomingEvents(db);

  let sent = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const payload = chunk.map(t => ({
      from: FROM,
      reply_to: REPLY_TO,
      to: [t.email],
      subject: reminderSubject(t),
      html: reminderHtml(t, eligibleFor(t, events)),
    }));
    const resp = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.status === 422) {
      // One malformed address poisons a Resend batch — isolate it with
      // individual sends so the rest of the cohort still goes out
      console.error(`Coupon reminder batch 422 — falling back to individual sends`);
      for (let k = 0; k < chunk.length; k++) {
        const t = chunk[k];
        try {
          const single = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload[k]),
          });
          if (single.ok) {
            const sj = (await single.json()) as any;
            const contactId = await contactIdFor(db, t.email);
            await db.batch([
              db.prepare('INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, ?, ?)')
                .bind(crypto.randomUUID().replace(/-/g, ''), CAMPAIGN_ID, contactId, sj?.id || null, 'sent'),
              db.prepare("UPDATE coupon_reminder_targets SET sent_at = datetime('now'), status = 'sent' WHERE id = ?").bind(t.id),
              db.prepare('UPDATE email_campaigns SET total_sent = total_sent + 1 WHERE id = ?').bind(CAMPAIGN_ID),
            ]);
            sent++;
          } else if (single.status === 422) {
            await db.prepare("UPDATE coupon_reminder_targets SET status = 'invalid' WHERE id = ?").bind(t.id).run();
            console.error('Coupon reminder: dropped invalid address', t.email);
          }
        } catch (e) { console.error('Coupon reminder single send error:', e); }
        await new Promise(res => setTimeout(res, 550));
      }
      continue;
    }
    if (!resp.ok) {
      console.error(`Coupon reminder batch failed: ${resp.status} ${await resp.text()}`);
      break; // sent_at stays unset; a later tick retries
    }
    const ids = ((await resp.json()) as any)?.data || [];
    const stmts: D1PreparedStatement[] = [];
    for (let k = 0; k < chunk.length; k++) {
      const t = chunk[k];
      const contactId = await contactIdFor(db, t.email);
      stmts.push(db.prepare(
        'INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID().replace(/-/g, ''), CAMPAIGN_ID, contactId, ids[k]?.id || null, 'sent'));
      stmts.push(db.prepare(
        "UPDATE coupon_reminder_targets SET sent_at = datetime('now'), status = 'sent' WHERE id = ?"
      ).bind(t.id));
    }
    stmts.push(db.prepare('UPDATE email_campaigns SET total_sent = total_sent + ? WHERE id = ?').bind(chunk.length, CAMPAIGN_ID));
    await db.batch(stmts);
    sent += chunk.length;
  }
  return { sent };
}
