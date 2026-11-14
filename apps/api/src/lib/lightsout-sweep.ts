// ==========================================
// LIGHTS OUT marketing sweep
// - Personalized launch waves from lightsout_targets (coach / parent at
//   Sat Nov 14 8am CT, follower at Mon Nov 16 8am CT), sent via Resend
//   batch and marked sent per row (idempotent, resumes across ticks).
// - Activates the scheduled all-database announcement campaign
//   (template_type 'lightsout_announce') on its scheduled date; the
//   existing wave engine then handles the actual sending.
// Called from the cron during the 14:00 UTC hour.
// ==========================================

const WAVE_TIMES: Record<string, string> = {
  coach: '2026-11-14 14:00:00',
  parent: '2026-11-14 14:00:00',
  follower: '2026-11-16 14:00:00',
};

const FROM = 'Johnny - Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const REPLY_TO = 'johnny@ultimatetournaments.com';
const PAGE = 'https://ultimatetournaments.com/lights-out';
const PER_TICK = 300; // Resend batch is 100/call; 3 calls per tick keeps subrequests safe

function shell(inner: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="text-align:center;margin-bottom:22px;">
      <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="Ultimate Hockey Tournaments" width="160" style="max-width:55%;height:auto;" />
    </div>
    <div style="background:#ffffff;border:1px solid #e3e9f0;border-radius:14px;padding:28px 24px;color:#1d1d1f;font-size:14px;line-height:1.65;">
      ${inner}
    </div>
    <p style="text-align:center;color:#9aa4b0;font-size:11px;margin-top:18px;">Ultimate Hockey Tournaments</p>
  </div></body></html>`;
}

const CTA = `<div style="text-align:center;margin:22px 0;">
  <a href="${PAGE}?register=1" style="display:inline-block;background:#003e79;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">REGISTER NOW</a>
  <p style="margin:10px 0 0;font-size:12px;"><a href="${PAGE}" style="color:#0077b0;">or see the full Invitational page first</a></p>
</div>`;

const INCLUDES = `<ul style="margin:0 0 14px;padding-left:20px;color:#3c3c43;">
  <li>Glow-in-the-dark home and away jerseys, theirs to keep</li>
  <li>A Lights Out collector stick and glow puck made only for this event</li>
  <li>Teams drafted and balanced by age and position - no team entry needed</li>
  <li>$550 per player, family and fans welcome in the stands</li>
</ul>`;

const LIMITED = `<p style="margin:0 0 6px;color:#6e6e73;font-size:13px;">This is an extremely limited event - a $200 non-refundable deposit holds a spot, and unpaid registrations are not held.</p>`;

function coachEmail(t: any): { subject: string; html: string } {
  const starList = String(t.star_list || '').split(' || ')
    .filter(Boolean)
    .map(seg => `<li>${seg}</li>`).join('');
  return {
    subject: 'Your players earned a Lights Out invite - June 11-13 in St. Louis',
    html: shell(`
      <h2 style="margin:0 0 14px;color:#003e79;font-size:19px;">Your players earned this one</h2>
      <p style="margin:0 0 14px;">Hi Coach,</p>
      <p style="margin:0 0 14px;">Big news - the first-ever <b>Lights Out Invitational</b> has official dates: <b>June 11-13, 2027</b> in St. Louis. The arena goes dark, the ice glows, and the only way in is a Three Stars selection at a UHT event this season. These players from your team are officially invited:</p>
      <ul style="margin:0 0 14px;padding-left:20px;color:#1d1d1f;">${starList}</ul>
      <p style="margin:0 0 14px;"><b>Here is what we need from you:</b> make sure those families know. Forward this email or share the link with them.</p>
      ${CTA}
      <p style="margin:0 0 8px;">What their invite includes:</p>
      ${INCLUDES}
      ${LIMITED}
      <p style="margin:14px 0 0;">Thanks for everything this season - your players earned this one.<br/><br/>Johnny<br/>Ultimate Hockey Tournaments</p>
    `),
  };
}

function parentEmail(t: any): { subject: string; html: string } {
  const first = t.first_name ? ` ${t.first_name}` : '';
  const sl = String(t.star_list || '');
  const firstPlayer = sl.split(';')[0]?.replace(/\(.*\)/, '').trim() || 'Your player';
  return {
    subject: `${firstPlayer.split(' ')[0]} earned a Lights Out invite - June 11-13 in St. Louis`,
    html: shell(`
      <h2 style="margin:0 0 14px;color:#003e79;font-size:19px;">This one is worth a fridge magnet</h2>
      <p style="margin:0 0 14px;">Hi${first},</p>
      <p style="margin:0 0 14px;"><b>${sl}</b> this season - and that means an official invitation to the <b>Lights Out Invitational</b>.</p>
      <p style="margin:0 0 14px;"><b>June 11-13, 2027</b> in St. Louis, the arena goes dark and the ice glows for the first glow-in-the-dark hockey tournament ever played. It is invite only, and a Three Stars selection at a UHT event is the only way in. Your player earned it on the ice.</p>
      ${CTA}
      <p style="margin:0 0 8px;">The invitation includes:</p>
      ${INCLUDES}
      <p style="margin:0 0 14px;color:#3c3c43;">Every registration is verified against the official scoresheets.</p>
      ${LIMITED}
      <p style="margin:14px 0 0;">See you in the dark.<br/><br/>Johnny<br/>Ultimate Hockey Tournaments</p>
    `),
  };
}

function followerEmail(t: any): { subject: string; html: string } {
  const first = t.first_name ? ` ${t.first_name}` : '';
  return {
    subject: 'Lights Out is real - June 11-13 - did your player earn an invite?',
    html: shell(`
      <h2 style="margin:0 0 14px;color:#003e79;font-size:19px;">The lights are officially going out</h2>
      <p style="margin:0 0 14px;">Hi${first},</p>
      <p style="margin:0 0 14px;">The <b>Lights Out Invitational</b> is the first glow-in-the-dark hockey tournament ever played - dark arena, glowing ice, neon pucks - and it is invite only. <b>June 11-13, 2027</b> in St. Louis.</p>
      <p style="margin:0 0 14px;">You follow <b>${t.team_names || 'a UHT team'}</b> in the UHT app, and players on your team earned Three Stars selections this season. If your player was announced as a star at any UHT game, they are in.</p>
      ${CTA}
      <p style="margin:0 0 14px;color:#3c3c43;">Every player keeps the custom glow home and away jerseys, a Lights Out collector stick, and a glow puck made only for this event. We verify every registration against the official scoresheets.</p>
      ${LIMITED}
      <p style="margin:14px 0 0;">See you in the dark.<br/><br/>Johnny<br/>Ultimate Hockey Tournaments</p>
    `),
  };
}

export async function runLightsOutSweep(env: any): Promise<{ sent: number; activated: number }> {
  const db = env.DB;
  let sent = 0;
  let activated = 0;

  // 1. Personalized launch waves
  const dueWaves = Object.entries(WAVE_TIMES)
    .filter(([, at]) => new Date().toISOString().replace('T', ' ').slice(0, 19) >= at)
    .map(([aud]) => aud);
  if (dueWaves.length > 0) {
    const rows = (await db.prepare(
      `SELECT * FROM lightsout_targets WHERE status = 'pending' AND audience IN (${dueWaves.map(() => '?').join(',')}) ORDER BY id LIMIT ?`
    ).bind(...dueWaves, PER_TICK).all()).results || [];

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const payload = chunk.map((t: any) => {
        const m = t.audience === 'coach' ? coachEmail(t) : t.audience === 'parent' ? parentEmail(t) : followerEmail(t);
        return { from: FROM, to: [t.email], reply_to: REPLY_TO, subject: m.subject, html: m.html };
      });
      const resp = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        console.error('LightsOut wave batch failed:', resp.status, await resp.text().catch(() => ''));
        break;
      }
      const ids = chunk.map((t: any) => t.id);
      await db.prepare(
        `UPDATE lightsout_targets SET status = 'sent', sent_at = datetime('now') WHERE id IN (${ids.map(() => '?').join(',')})`
      ).bind(...ids).run();
      sent += chunk.length;
    }
  }

  // 2. Abandoned checkouts: one nudge each with a fresh Stripe link
  try {
    const { remindIncompleteCheckouts } = await import('../routes/lights-out');
    await remindIncompleteCheckouts(env);
  } catch (e) {
    console.error('LightsOut incomplete-checkout nudge error:', e);
  }

  // 3. Wednesday announcement: hand the scheduled campaign to the wave engine
  const r = await db.prepare(`
    UPDATE email_campaigns SET status = 'sending', updated_at = datetime('now', '-3 minutes')
    WHERE template_type = 'lightsout_announce' AND status = 'scheduled' AND date(scheduled_at) <= date('now')
  `).run();
  activated = r.meta?.changes || 0;

  return { sent, activated };
}
