/*
  GENERIC EVENT BLAST EMAIL: one-off admin message to every approved team's
  coaches and managers for an event (same audience as the welcome email),
  deduped across teams, wrapped in the UHT navy template, and logged under
  Email Campaigns per recipient. Used for things like "double check your
  schedule" notices.
*/

import { eventTeams } from './event-welcome';
import { recordCampaignSend } from './event-info-sweep';

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';

function esc(x: any): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildBlastHtml(ev: any, heading: string, message: string): string {
  const paragraphs = String(message || '').trim().split(/\n{2,}/).map(p =>
    `<p style="font-size:13.5px;line-height:1.6;color:#2a3c52;">${esc(p).replace(/\n/g, '<br>')}</p>`
  ).join('');
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#002d5a,#003e79 60%,#0077b0);padding:24px;text-align:center;border-radius:0 0 16px 16px;">
    <div style="font-size:11px;letter-spacing:3px;color:#7fd8ff;font-weight:bold;">${esc(ev.name).toUpperCase()}</div>
    <div style="font-size:23px;font-weight:900;color:#ffffff;margin-top:5px;">${esc(heading)}</div>
    <div style="font-size:12.5px;color:#bfe8ff;margin-top:4px;">${esc(ev.city)}, ${esc(ev.state)}</div>
  </div>
  <div style="padding:18px 22px 8px;">
    ${paragraphs}
    <p style="font-size:12.5px;color:#5b6b80;">Johnny Schwarz &middot; Ultimate Tournaments &middot; 630.336.6175</p>
  </div>
</div>`;
}

export async function sendEventBlast(env: any, eventId: string, opts: {
  subject: string; heading: string; message: string; testEmail?: string;
}): Promise<any> {
  const db = env.DB;
  const ev = await db.prepare('SELECT id, name, city, state FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!ev) return { error: 'Event not found' };
  if (!opts.subject || !opts.message) return { error: 'subject and message required' };
  const html = buildBlastHtml(ev, opts.heading || opts.subject, opts.message);

  const sendOne = async (to: string[]) => {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject: opts.subject, html }),
    });
    const j: any = await resp.json().catch(() => null);
    return { ok: resp.ok, id: j?.id || null };
  };

  if (opts.testEmail) {
    const r = await sendOne([opts.testEmail]);
    return { test: true, ok: r.ok };
  }

  let campaignId: string | null = null;
  try {
    const cname = `${opts.heading || opts.subject} - ${ev.name}`;
    const existing = await db.prepare('SELECT id FROM email_campaigns WHERE name = ?').bind(cname).first<any>();
    if (existing) campaignId = existing.id as string;
    else {
      campaignId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO email_campaigns (id, name, subject, body_html, event_id, template_type, status, sent_at)
        VALUES (?, ?, ?, ?, ?, 'custom', 'sent', datetime('now'))
      `).bind(campaignId, cname, opts.subject, html, ev.id).run();
    }
  } catch (e: any) { console.error('Event blast campaign bookkeeping failed (sends continue):', e?.message); }

  const teams = await eventTeams(db, eventId);
  const seen = new Set<string>();
  const recipients: Array<{ email: string; team: string }> = [];
  for (const t of teams) {
    for (const e of t.emails) {
      if (!seen.has(e)) { seen.add(e); recipients.push({ email: e, team: t.team_name }); }
    }
  }

  let sent = 0, failed = 0;
  for (const r of recipients) {
    try {
      const res = await sendOne([r.email]);
      if (res.ok) {
        sent++;
        if (campaignId) await recordCampaignSend(db, campaignId, r.email, r.team, res.id);
      } else failed++;
    } catch { failed++; }
  }
  if (sent > 0) {
    try { await sendOne(['johnny@ultimatetournaments.com', 'john@ultimatetournaments.com']); } catch {}
  }
  return { teams: teams.length, recipients: recipients.length, sent, failed };
}
