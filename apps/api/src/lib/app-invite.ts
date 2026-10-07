/**
 * App invite email: ask every APPROVED team's coaches/managers to get their
 * parents on the UHT app, with that team's parent follow code baked in.
 *
 * Mirrors the tournament guide engine: per-registration personalized sends,
 * idempotent via automated_email_log, recorded as a per-event campaign so
 * opens show on the Email Campaigns page, staff BCC on every send.
 */

const TEMPLATE_ID = 'app_invite';
const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
const STAFF_BCC = ['johnny@ultimatetournaments.com'];
const APP_STORE_URL = 'https://apps.apple.com/app/id6786085393';

const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtRange(start: string, end?: string | null): string {
  const [sy, sm, sd] = start.slice(0, 10).split('-').map(Number);
  if (!end) return `${MONTHS[sm - 1]} ${sd}, ${sy}`;
  const [ey, em, ed] = end.slice(0, 10).split('-').map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd} - ${ed}, ${sy}`;
  return `${MONTHS[sm - 1]} ${sd} - ${MONTHS[em - 1]} ${ed}, ${sy}`;
}

/** Resolve the registration's team row (direct link, or by name) for its codes */
async function teamFor(db: any, reg: any): Promise<{ id: string; name: string; parent_invite_code: string | null; invite_code: string | null } | null> {
  if (reg.team_id) {
    const t = await db.prepare('SELECT id, name, parent_invite_code, invite_code FROM teams WHERE id = ? AND is_active = 1')
      .bind(reg.team_id).first();
    if (t) return t as any;
  }
  if (reg.team_name) {
    const t = await db.prepare('SELECT id, name, parent_invite_code, invite_code FROM teams WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active = 1 LIMIT 1')
      .bind(reg.team_name).first();
    if (t) return t as any;
  }
  return null;
}

export function buildAppInviteHtml(opts: {
  eventName: string;
  eventDates: string;
  teamName: string;
  code: string;
}): { subject: string; html: string } {
  const { eventName, eventDates, teamName, code } = opts;
  const subject = `Action needed: get your ${teamName} families on the UHT app`;
  const textForParents = `Follow ${teamName} on the UHT app for ${eventName}! 1) Download the app: ${APP_STORE_URL} 2) Create a free account 3) Enter team code ${code} to follow our team for live scores, schedules and updates.`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f2f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#003e79;border-radius:16px 16px 0 0;padding:28px 28px 24px;text-align:center;">
      <img src="https://uht.chad-157.workers.dev/api/assets/brand/app-icon-rounded.png" alt="UHT app" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:18px;" />
      <div style="color:#00ccff;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Ultimate Hockey Tournaments</div>
      <div style="color:#ffffff;font-size:26px;font-weight:800;margin-top:8px;line-height:1.25;">Schedules are LIVE</div>
      <div style="color:#00ccff;font-size:16px;font-weight:700;margin-top:4px;">and can only be found in the UHT app</div>
      <div style="color:rgba(255,255,255,0.75);font-size:14px;margin-top:10px;">${eventName} &bull; ${eventDates}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;">
      <p style="font-size:15px;color:#1d2a3d;line-height:1.6;margin:0 0 14px;">Coaches and managers,</p>
      <p style="font-size:15px;color:#1d2a3d;line-height:1.6;margin:0 0 14px;">
        The full schedule, live scores, standings, and locker room assignments for <strong>${eventName}</strong>
        will be posted <strong>in the UHT app only</strong>. Please have every parent and family member on
        <strong>${teamName}</strong> download the app and follow your team before the event.
      </p>

      <div style="background:#f0f7ff;border:2px solid #00ccff;border-radius:14px;padding:20px;text-align:center;margin:22px 0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#003e79;text-transform:uppercase;">Your team code</div>
        <div style="font-size:38px;font-weight:800;letter-spacing:8px;color:#003e79;margin-top:6px;">${code}</div>
        <div style="font-size:12px;color:#5b6b83;margin-top:6px;">Anyone can enter this code in the app to follow ${teamName}</div>
      </div>

      <p style="font-size:15px;color:#1d2a3d;line-height:1.6;margin:0 0 10px;"><strong>Three steps for your families:</strong></p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;font-size:14px;color:#1d2a3d;line-height:1.5;"><strong style="color:#003e79;">1.</strong> Download the UHT app from the App Store: <a href="${APP_STORE_URL}" style="color:#0a7cc9;font-weight:600;">${APP_STORE_URL}</a></td></tr>
        <tr><td style="padding:8px 0;font-size:14px;color:#1d2a3d;line-height:1.5;"><strong style="color:#003e79;">2.</strong> Create a free account (choose Parent / Fan)</td></tr>
        <tr><td style="padding:8px 0;font-size:14px;color:#1d2a3d;line-height:1.5;"><strong style="color:#003e79;">3.</strong> Enter team code <strong>${code}</strong> to follow ${teamName} and get live scores, schedules, and game updates pushed to their phone</td></tr>
      </table>

      <div style="background:#f7f8fa;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#5b6b83;text-transform:uppercase;margin-bottom:8px;">Copy and text this to your team</div>
        <div style="font-size:13px;color:#1d2a3d;line-height:1.6;font-style:italic;">${textForParents}</div>
      </div>

      <p style="font-size:14px;color:#5b6b83;line-height:1.6;margin:0;">
        Questions? Just reply to this email.<br><br>
        Ultimate Hockey Tournaments<br>
        <a href="https://ultimatetournaments.com" style="color:#0a7cc9;">ultimatetournaments.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

async function campaignFor(db: any, event: any): Promise<string> {
  const name = `App Invite - ${event.name}`;
  const existing = await db.prepare('SELECT id FROM email_campaigns WHERE name = ?').bind(name).first();
  if (existing) return existing.id as string;
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO email_campaigns (id, name, subject, body_html, template_type, status, sent_at)
    VALUES (?, ?, ?, ?, 'custom', 'sent', datetime('now'))
  `).bind(id, name, 'Action needed: get your families on the UHT app',
    '<p>App adoption email - each team receives its own copy with its parent follow code.</p>').run();
  return id;
}

async function recordSend(db: any, campaignId: string, email: string, name: string, resendId: string | null) {
  try {
    let contact = await db.prepare('SELECT id FROM contacts WHERE LOWER(email) = ?').bind(email.toLowerCase()).first();
    let contactId = contact?.id as string | undefined;
    if (!contactId) {
      contactId = crypto.randomUUID().replace(/-/g, '');
      const parts = (name || '').split(' ');
      await db.prepare("INSERT INTO contacts (id, email, first_name, last_name, source) VALUES (?, ?, ?, ?, 'registration')")
        .bind(contactId, email.toLowerCase(), parts[0] || null, parts.slice(1).join(' ') || null).run();
    }
    await db.prepare("INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, ?, 'sent')")
      .bind(crypto.randomUUID().replace(/-/g, ''), campaignId, contactId, resendId).run();
    await db.prepare("UPDATE email_campaigns SET total_sent = total_sent + 1, updated_at = datetime('now') WHERE id = ?").bind(campaignId).run();
  } catch (e: any) {
    console.error('App invite bookkeeping failed (send still went out):', e?.message);
  }
}

async function approvedRegs(db: any, eventId: string): Promise<any[]> {
  return ((await db.prepare(`
    SELECT er.*, t.head_coach_email
    FROM event_registrations er
    LEFT JOIN teams t ON t.id = er.team_id
    WHERE er.event_id = ? AND er.status = 'approved'
  `).bind(eventId).all()).results || []) as any[];
}

/** Counts for the admin card, including how many teams have no code */
export async function appInviteStatus(env: any, eventId: string) {
  const db = env.DB;
  const regs = await approvedRegs(db, eventId);
  let withCode = 0, noCode = 0;
  for (const reg of regs) {
    const team = await teamFor(db, reg);
    if (team && (team.parent_invite_code || team.invite_code)) withCode++;
    else noCode++;
  }
  const sent = await db.prepare(
    'SELECT COUNT(*) as n FROM automated_email_log WHERE template_id = ? AND event_id = ?'
  ).bind(TEMPLATE_ID, eventId).first() as any;
  return { teams: regs.length, with_code: withCode, no_code: noCode, emails_sent: sent?.n || 0 };
}

/**
 * Send to every approved team's coach/manager emails. Idempotent per
 * recipient. testEmail sends ONE sample (first team with a code) to that
 * address only, with a [TEST] subject, and logs nothing.
 */
export async function sendAppInviteForEvent(env: any, eventId: string, testEmail?: string) {
  const db = env.DB;
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return { error: 'Event not found' };

  const regs = await approvedRegs(db, eventId);
  const out = { teams: 0, sent: 0, skipped: 0, no_email: 0, no_code: 0 };
  const eventDates = fmtRange(event.start_date, event.end_date);
  const campaignId = testEmail ? null : await campaignFor(db, event);

  for (const reg of regs) {
    out.teams++;
    const team = await teamFor(db, reg);
    const code = team?.parent_invite_code || team?.invite_code || null;
    if (!code) { out.no_code++; continue; }

    const teamName = team?.name || reg.team_name || 'Your Team';
    const { subject, html } = buildAppInviteHtml({ eventName: event.name, eventDates, teamName, code });

    if (testEmail) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [testEmail], subject: `[TEST - ${teamName}] ${subject}`, html }),
      });
      return { test: true, teamName, ok: resp.ok, status: resp.status };
    }

    const recipients = [...new Set(
      [reg.email1, reg.email2, reg.coach_email, reg.head_coach_email]
        .map((e: string | null) => (e || '').trim().toLowerCase())
        .filter((e: string) => emailRe.test(e) && !e.includes('..'))
    )];
    if (recipients.length === 0) { out.no_email++; continue; }

    for (const email of recipients) {
      const already = await db.prepare(
        'SELECT id FROM automated_email_log WHERE template_id = ? AND registration_id = ? AND email = ?'
      ).bind(TEMPLATE_ID, reg.id, email).first();
      if (already) { out.skipped++; continue; }

      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [email], bcc: STAFF_BCC, subject, html }),
        });
        if (!resp.ok) {
          console.error(`App invite failed for ${email}: ${resp.status} ${await resp.text()}`);
          continue;
        }
        const respJson = await resp.json().catch(() => null) as any;
        await db.prepare(
          'INSERT OR IGNORE INTO automated_email_log (template_id, event_id, registration_id, email) VALUES (?, ?, ?, ?)'
        ).bind(TEMPLATE_ID, event.id, reg.id, email).run();
        if (campaignId) await recordSend(db, campaignId, email, teamName, respJson?.id || null);
        out.sent++;
      } catch (e: any) {
        console.error(`App invite error for ${email}:`, e?.message || String(e));
      }
    }
  }

  return out;
}
