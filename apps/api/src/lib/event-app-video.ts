/*
  APP HOW-TO VIDEO EMAIL: a short pre-event send to every approved team's
  coaches and managers with the Loom walkthrough of the app - digital
  check-in, digital scoresheets, schedules/lockers, Three Stars. Same
  audience as the welcome email; recipients are deduped across teams since
  the content is identical. Logged under Email Campaigns per recipient.
*/

import { eventTeams } from './event-welcome';
import { recordCampaignSend } from './event-info-sweep';

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
const APP_STORE_URL = 'https://apps.apple.com/app/id6786085393';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.ultimatetournaments.uht';

function esc(x: any): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildAppVideoHtml(ev: any, videoUrl: string): string {
  const item = (title: string, body: string) => `
    <tr><td style="padding:8px 0;border-bottom:1px solid #eef2f6;font-family:Arial,sans-serif;font-size:13.5px;color:#2a3c52;line-height:1.55;">
      <b style="color:#003e79;">${title}</b><br>${body}
    </td></tr>`;

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
  <div style="background:linear-gradient(135deg,#002d5a,#003e79 60%,#0077b0);padding:26px 24px;text-align:center;border-radius:0 0 16px 16px;">
    <div style="font-size:11px;letter-spacing:3px;color:#7fd8ff;font-weight:bold;">BEFORE THIS WEEKEND</div>
    <div style="font-size:24px;font-weight:900;color:#ffffff;margin-top:5px;">How the UHT App Works</div>
    <div style="font-size:12.5px;color:#bfe8ff;margin-top:4px;">${esc(ev.name)} &middot; ${esc(ev.city)}, ${esc(ev.state)}</div>
  </div>
  <div style="padding:18px 22px 8px;">
    <p style="font-size:13.5px;line-height:1.6;color:#2a3c52;">Hello Coaches and Managers,</p>
    <p style="font-size:13.5px;line-height:1.6;color:#2a3c52;">Everything at the ${esc(ev.name)} runs through the UHT app, so we made a short video walking you through exactly how it works. Please watch it before you get to the rink - it covers the things you will need to do this weekend:</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:4px 0 6px;">
      ${item('Digital check-in', 'Check your players in from the app before each game - no paper at the scorekeeper table.')}
      ${item('Digital scoresheets', 'View the official scoresheet for every game right in the app, including goals, assists, and penalties.')}
      ${item('And more', 'Schedules, standings, locker room assignments for every game, and the Three Stars awarded after each game.')}
    </table>
    <div style="text-align:center;margin:20px 0 10px;">
      <a href="${esc(videoUrl)}" style="display:inline-block;background:#003e79;color:#ffffff;font-weight:900;font-size:15px;padding:13px 34px;border-radius:12px;text-decoration:none;">WATCH THE VIDEO</a>
      <div style="font-size:11px;color:#8a97a6;margin-top:8px;">It only takes a few minutes</div>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#2a3c52;">Don't have the app yet? It's free on <a href="${APP_STORE_URL}" style="color:#0077b0;font-weight:bold;">iPhone</a> and <a href="${PLAY_STORE_URL}" style="color:#0077b0;font-weight:bold;">Android</a>.</p>
    <p style="font-size:13px;line-height:1.6;color:#2a3c52;">See you at the rink!</p>
    <p style="font-size:12.5px;color:#5b6b80;">Johnny Schwarz &middot; Ultimate Tournaments &middot; 630.336.6175</p>
  </div>
</div>`;
}

export async function sendEventAppVideo(env: any, eventId: string, opts: { videoUrl: string; testEmail?: string }): Promise<any> {
  const db = env.DB;
  const ev = await db.prepare('SELECT id, name, city, state, start_date, COALESCE(is_test,0) as is_test FROM events WHERE id = ?')
    .bind(eventId).first<any>();
  if (!ev) return { error: 'Event not found' };
  if (!opts.videoUrl) return { error: 'videoUrl required' };
  const html = buildAppVideoHtml(ev, opts.videoUrl);
  const subject = `${ev.name}: How the UHT App Works - Check-In, Scoresheets + More`;

  const sendOne = async (to: string[]) => {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html }),
    });
    const j: any = await resp.json().catch(() => null);
    return { ok: resp.ok, id: j?.id || null };
  };

  if (opts.testEmail) {
    const r = await sendOne([opts.testEmail]);
    return { test: true, ok: r.ok };
  }

  // Campaign bookkeeping so it shows on the Email Campaigns page
  let campaignId: string | null = null;
  try {
    const cname = `App How-To Video - ${ev.name}`;
    const existing = await db.prepare('SELECT id FROM email_campaigns WHERE name = ?').bind(cname).first<any>();
    if (existing) campaignId = existing.id as string;
    else {
      campaignId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO email_campaigns (id, name, subject, body_html, event_id, template_type, status, sent_at)
        VALUES (?, ?, ?, ?, ?, 'custom', 'sent', datetime('now'))
      `).bind(campaignId, cname, subject, html, ev.id).run();
    }
  } catch (e: any) { console.error('App video campaign bookkeeping failed (sends continue):', e?.message); }

  const teams = await eventTeams(db, eventId);
  const seen = new Set<string>();
  // One send per unique recipient so a coach on two teams gets it once
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

  // One blast copy to staff (no per-email CC)
  if (sent > 0) {
    try { await sendOne(['johnny@ultimatetournaments.com', 'john@ultimatetournaments.com']); } catch {}
  }
  return { teams: teams.length, recipients: recipients.length, sent, failed };
}
