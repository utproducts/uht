// Re-engagement drip campaign (approved by Chad 2026-11-07).
// Audience: reengagement_targets — 2025-26 teams that have not returned this
// season, each holding a one-time team-name discount code (TROYSTING100 style,
// $100, discount_codes.event_id = 'reengagement-2026-27').
//
// Three emails from Johnny, spaced per contact:
//   e1 day 0 (friendly check-in)  — rolls out in daily cohorts of E1_PER_DAY
//   e2 day 7 (the code)
//   e3 day 18 (last chance), never after the code deadline
//
// Daily cohorts are deliberate: each day's sends form a cohort so the
// dashboard can compare open/click/redeem rates by day.
//
// Runs from the worker cron, gated to SEND_HOUR_UTC; idempotent per target
// (eN_sent_at set in the same batch that records the send) and per day
// (cohort cap counts today's e1 sends). Eligibility is rechecked every run:
// anyone who registered this season, redeemed their code, or unsubscribed
// drops out of all remaining sends.
//
// Tracking rides the existing rails: three email_campaigns rows (status
// 'sent', audience_filter NULL so the stale-campaign cron never grabs them)
// and one email_sends row per send carrying the Resend id — the
// /webhooks/resend handler then records delivered/opened/clicked for free.

const E1_PER_DAY = 75;
const SEND_HOUR_UTC = 16; // 10am CST
const E2_AFTER_DAYS = 7;
const E3_AFTER_E2_DAYS = 11; // day 18 overall
const DEADLINE = '2026-12-08'; // code expires Dec 7; no e3 on/after this date
const BATCH = 25;

const FROM = 'Johnny - Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';

const CAMPAIGNS = [
  { id: 'reengage2026e1', name: 'Re-engagement 1 - We missed you', subject: 'We missed you this season' },
  { id: 'reengage2026e2', name: 'Re-engagement 2 - $100 offer', subject: '' }, // subject is per-recipient
  { id: 'reengage2026e3', name: 'Re-engagement 3 - Last chance', subject: 'Your $100 code expires Monday' },
];

type Target = {
  id: string; email: string; first_name: string; team_name: string;
  last_event: string; last_city: string; events_count: number; code: string;
  status: string; e1_sent_at: string | null; e2_sent_at: string | null; e3_sent_at: string | null;
};

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function footer(): string {
  return `
<div style="padding:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <p style="color:#aeaeb2;font-size:11px;margin:0;">
    Ultimate Hockey Tournaments &middot; <a href="https://ultimatetournaments.com" style="color:#86868b;">ultimatetournaments.com</a><br/>
    You are receiving this because your team played a UHT event last season.
    <a href="https://ultimatetournaments.com/unsubscribe" style="color:#aeaeb2;text-decoration:underline;">Unsubscribe</a>
  </p>
</div>`;
}

// Personal-note styling on purpose: these read as a note from Johnny, not a
// branded blast — no navy header banner.
function wrap(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1d1d1f;">
${content}
${footer()}
</td></tr></table></td></tr></table>
</body></html>`;
}

function greeting(t: Target): string {
  const name = (t.first_name || '').trim();
  return name ? `Hey ${esc(name)},` : 'Hey Coach,';
}

function e1Html(t: Target): string {
  return wrap(`
<p>${greeting(t)}</p>
<p>Johnny here from Ultimate Hockey Tournaments. I was going through our events from last season and saw ${esc(t.team_name)} out there at ${esc(t.last_event)}. Then I noticed we haven't seen you yet this year, and honestly, the tournaments aren't the same without you.</p>
<p>This season is our biggest yet. Same cities you know, some new ones, and the whole weekend now runs through our app - live scores, schedules, locker room assignments, photo walls, the works. Parents love it.</p>
<p>Is the team playing this season? Hit reply and let me know what you're up to. I read every one of these.</p>
<p>Johnny<br/>Ultimate Hockey Tournaments</p>`);
}

function e2Subject(t: Target): string {
  return `$100 off for ${t.team_name} - welcome back`;
}

function e2Html(t: Target): string {
  return wrap(`
<p>${greeting(t)}</p>
<p>I'll keep this quick. We want ${esc(t.team_name)} back this season, so I set aside a $100 credit just for you.</p>
<p style="text-align:center;margin:24px 0;"><span style="display:inline-block;background:#f0f6ff;border:2px dashed #003e79;border-radius:10px;padding:14px 28px;font-size:20px;font-weight:700;letter-spacing:1px;color:#003e79;">${esc(t.code)}</span></p>
<p>It works on any open event and comes right off your deposit when you register at <a href="https://ultimatetournaments.com/events/" style="color:#003e79;">ultimatetournaments.com</a>. One catch - it expires December 7, so grab a weekend before it's gone.</p>
<p>Browse the schedule, find a city the families will love, and use the code at checkout. If you have questions about dates or divisions, just reply to this email and I'll help you find the right fit.</p>
<p>See you at the rink,</p>
<p>Johnny<br/>Ultimate Hockey Tournaments</p>`);
}

function e3Html(t: Target): string {
  return wrap(`
<p>${greeting(t)}</p>
<p>Last call - the $100 credit I set aside for ${esc(t.team_name)} expires Monday, December 7. After that it's gone for good.</p>
<p style="text-align:center;margin:24px 0;"><span style="display:inline-block;background:#f0f6ff;border:2px dashed #003e79;border-radius:10px;padding:14px 28px;font-size:20px;font-weight:700;letter-spacing:1px;color:#003e79;">${esc(t.code)}</span></p>
<p>Register for any open event at <a href="https://ultimatetournaments.com/events/" style="color:#003e79;">ultimatetournaments.com</a> and the code comes off your deposit at checkout. Takes about five minutes.</p>
<p>If this season just isn't in the cards for the team, no hard feelings - reply and tell me and I'll stop bugging you. But if the kids want one more great hockey weekend, now's the time.</p>
<p>Johnny<br/>Ultimate Hockey Tournaments</p>`);
}

async function ensureSetup(db: D1Database): Promise<void> {
  for (const col of ['e1_sent_at', 'e2_sent_at', 'e3_sent_at']) {
    try { await db.prepare(`ALTER TABLE reengagement_targets ADD COLUMN ${col} TEXT`).run(); } catch {}
  }
  for (const c of CAMPAIGNS) {
    await db.prepare(`
      INSERT OR IGNORE INTO email_campaigns (id, name, subject, body_html, from_name, from_email, template_type, status, sent_at)
      VALUES (?, ?, ?, '(per-recipient template in lib/reengagement.ts)', 'Johnny - Ultimate Hockey Tournaments', 'johnny@ultimatetournaments.com', 'reengagement', 'sent', datetime('now'))
    `).bind(c.id, c.name, c.subject || '$100 off - welcome back').run();
  }
  await db.prepare("UPDATE email_campaigns SET is_marketing = 1 WHERE id IN ('reengage2026e1','reengage2026e2','reengage2026e3') AND COALESCE(is_marketing,0) = 0").run().catch(() => {});
}

// Drop anyone who came back, redeemed, or unsubscribed since the last run.
// IN-subqueries, NOT correlated EXISTS with LOWER() - the correlated form
// re-scans the inner table once per target and melted D1 (11/11 outage; the
// coupon sweep's identical pattern read 17.9M rows per run). Target emails
// are stored lowercased, so one-pass LOWER() subqueries match them.
async function refreshEligibility(db: D1Database): Promise<void> {
  await db.prepare(`
    UPDATE reengagement_targets SET status = 'redeemed'
    WHERE status IN ('pending', 'active')
      AND code IN (SELECT code FROM discount_codes WHERE is_used = 1)
  `).run();
  await db.prepare(`
    UPDATE reengagement_targets SET status = 'returned'
    WHERE status IN ('pending', 'active')
      AND email IN (
        SELECT LOWER(email1) FROM event_registrations
        WHERE created_at >= '2026-06-01' AND COALESCE(status,'') NOT IN ('denied','rejected','withdrawn') AND email1 IS NOT NULL
        UNION
        SELECT LOWER(email2) FROM event_registrations
        WHERE created_at >= '2026-06-01' AND COALESCE(status,'') NOT IN ('denied','rejected','withdrawn') AND email2 IS NOT NULL
        UNION
        SELECT LOWER(coach_email) FROM event_registrations
        WHERE created_at >= '2026-06-01' AND COALESCE(status,'') NOT IN ('denied','rejected','withdrawn') AND coach_email IS NOT NULL
      )
  `).run();
  await db.prepare(`
    UPDATE reengagement_targets SET status = 'unsubscribed'
    WHERE status IN ('pending', 'active')
      AND email IN (SELECT LOWER(email) FROM contacts WHERE is_subscribed_email = 0 AND email IS NOT NULL)
  `).run();
}

async function contactIdFor(db: D1Database, email: string): Promise<string> {
  const row = await db.prepare('SELECT id FROM contacts WHERE LOWER(email) = ? LIMIT 1').bind(email).first<any>();
  if (row) return row.id;
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare("INSERT INTO contacts (id, email, source) VALUES (?, ?, 'reengagement')").bind(id, email).run();
  return id;
}

async function sendBatch(
  db: D1Database, env: any, targets: Target[],
  which: 1 | 2 | 3,
): Promise<number> {
  const campaign = CAMPAIGNS[which - 1];
  let sent = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const payload = chunk.map(t => ({
      from: FROM,
      reply_to: REPLY_TO,
      to: [t.email],
      subject: which === 2 ? e2Subject(t) : campaign.subject,
      html: which === 1 ? e1Html(t) : which === 2 ? e2Html(t) : e3Html(t),
    }));
    const resp = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error(`Reengagement e${which} batch failed: ${resp.status} ${await resp.text()}`);
      break; // leave eN_sent_at unset; a later tick retries
    }
    const ids = ((await resp.json()) as any)?.data || [];
    const stmts: D1PreparedStatement[] = [];
    for (let k = 0; k < chunk.length; k++) {
      const t = chunk[k];
      const resendId = ids[k]?.id || null;
      const contactId = await contactIdFor(db, t.email);
      stmts.push(db.prepare(
        'INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID().replace(/-/g, ''), campaign.id, contactId, resendId, 'sent'));
      stmts.push(db.prepare(
        `UPDATE reengagement_targets SET e${which}_sent_at = datetime('now'), status = 'active' WHERE id = ?`
      ).bind(t.id));
    }
    stmts.push(db.prepare('UPDATE email_campaigns SET total_sent = total_sent + ? WHERE id = ?').bind(chunk.length, campaign.id));
    await db.batch(stmts);
    sent += chunk.length;
  }
  return sent;
}

export async function runReengagementSweep(env: any): Promise<{ e1: number; e2: number; e3: number } | { skipped: string }> {
  const now = new Date();
  if (now.getUTCHours() !== SEND_HOUR_UTC) return { skipped: 'outside send hour' };
  const db: D1Database = env.DB;

  // Cheap existence probe doubles as the "campaign loaded?" check
  const probe = await db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'reengagement_targets'").first<any>();
  if (!probe?.n) return { skipped: 'no targets table' };

  // Cheap due-work probe FIRST (725-row table): most ticks in the send hour
  // have nothing due, and skipping them avoids re-running the eligibility
  // refresh + 72h cooldown scan every minute (D1 overload, 11/11)
  const due = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM reengagement_targets WHERE status = 'active' AND e3_sent_at IS NULL AND e2_sent_at IS NOT NULL AND e2_sent_at <= datetime('now', '-${E3_AFTER_E2_DAYS} days')) AS d3,
    (SELECT COUNT(*) FROM reengagement_targets WHERE status = 'active' AND e2_sent_at IS NULL AND e1_sent_at IS NOT NULL AND e1_sent_at <= datetime('now', '-${E2_AFTER_DAYS} days')) AS d2,
    (SELECT COUNT(*) FROM reengagement_targets WHERE status = 'pending' AND e1_sent_at IS NULL) AS d1,
    (SELECT COUNT(*) FROM reengagement_targets WHERE date(e1_sent_at) = date('now')) AS s1
  `).first<any>();
  const e1Due = (due?.d1 || 0) > 0 && (E1_PER_DAY - (due?.s1 || 0)) > 0;
  if (!due?.d3 && !due?.d2 && !e1Due) return { e1: 0, e2: 0, e3: 0 };

  await ensureSetup(db);
  await refreshEligibility(db);

  const today = now.toISOString().slice(0, 10);
  const counts = { e1: 0, e2: 0, e3: 0 };

  // 72h marketing cooldown (Chad 11/8): defer anyone who got a marketing
  // email in the last 72 hours — they stay active/pending and a later day's
  // sweep sends their email once the window clears. The set also dedupes
  // same-email targets inside this run (two teams, one manager).
  const { recentlyMarketedSet } = await import('./marketing-guard');
  const cooled = await recentlyMarketedSet(db);
  const clear = (list: Target[]) => list.filter(t => {
    if (cooled.has(t.email)) return false;
    cooled.add(t.email);
    return true;
  });

  // e3: last chance, day 18+, only before the deadline
  if (today < DEADLINE) {
    const r3 = await db.prepare(`
      SELECT * FROM reengagement_targets
      WHERE status = 'active' AND e3_sent_at IS NULL AND e2_sent_at IS NOT NULL
        AND e2_sent_at <= datetime('now', '-${E3_AFTER_E2_DAYS} days')
      ORDER BY e2_sent_at LIMIT 150
    `).all<Target>();
    const r3c = clear(r3.results || []);
    if (r3c.length) counts.e3 = await sendBatch(db, env, r3c, 3);
  }

  // e2: the offer, day 7+
  const r2 = await db.prepare(`
    SELECT * FROM reengagement_targets
    WHERE status = 'active' AND e2_sent_at IS NULL AND e1_sent_at IS NOT NULL
      AND e1_sent_at <= datetime('now', '-${E2_AFTER_DAYS} days')
    ORDER BY e1_sent_at LIMIT 150
  `).all<Target>();
  const r2c = clear(r2.results || []);
  if (r2c.length) counts.e2 = await sendBatch(db, env, r2c, 2);

  // e1: today's cohort, capped per day
  const sentToday = await db.prepare(
    "SELECT COUNT(*) n FROM reengagement_targets WHERE date(e1_sent_at) = date('now')"
  ).first<any>();
  const room = E1_PER_DAY - (sentToday?.n || 0);
  if (room > 0) {
    const r1 = await db.prepare(
      "SELECT * FROM reengagement_targets WHERE status = 'pending' AND e1_sent_at IS NULL ORDER BY events_count DESC, email LIMIT ?"
    ).bind(room * 3).all<Target>(); // overfetch: cooldown deferrals still leave a full cohort
    const r1c = clear(r1.results || []).slice(0, room);
    if (r1c.length) counts.e1 = await sendBatch(db, env, r1c, 1);
  }

  return counts;
}
