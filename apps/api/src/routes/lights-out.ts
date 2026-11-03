import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

/*
  LIGHTS OUT INVITATIONAL - invite-request registration.
  Public: list past events + submit a request (always lands as 'pending';
  every star claim is checked against game_three_stars for the admin).
  Admin: list requests, approve/deny - approval sends the "you're in" email.
*/

export const lightsOutRoutes = new Hono<{ Bindings: Env }>();

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';

async function sendEmail(env: Env, to: string, subject: string, html: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${(env as any).RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
  } catch {}
}

function emailShell(inner: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#04091a;">
  <div style="max-width:560px;margin:0 auto;padding:36px 22px;font-family:Arial,Helvetica,sans-serif;">
    <div style="text-align:center;margin-bottom:26px;">
      <img src="https://ultimatetournaments.com/lights-out-logo.png" alt="Lights Out Invitational" width="230" style="max-width:70%;" />
    </div>
    <div style="background:#0a1228;border:1px solid rgba(0,204,255,.35);border-radius:16px;padding:28px 24px;color:#dbe8f5;font-size:14px;line-height:1.65;">
      ${inner}
    </div>
    <p style="text-align:center;color:#55637a;font-size:11px;margin-top:22px;">Ultimate Hockey Tournaments · Lights Out Invitational · St. Louis, MO</p>
  </div></body></html>`;
}

// Past events a star could have been earned at (for the claim dropdown)
lightsOutRoutes.get('/events', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, start_date FROM events
    WHERE status NOT IN ('draft', 'cancelled')
      AND date(COALESCE(end_date, start_date)) <= date('now')
      AND EXISTS (SELECT 1 FROM games g JOIN game_three_stars ts ON ts.game_id = g.id WHERE g.event_id = events.id)
    ORDER BY start_date DESC
  `).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

const registerSchema = z.object({
  playerName: z.string().min(2).max(80),
  jerseyNumber: z.string().max(10).optional(),
  teamName: z.string().min(2).max(120),
  starEventId: z.string().min(8),
  birthYear: z.string().max(8).optional(),
  position: z.string().max(20).optional(),
  parentName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
});

lightsOutRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const b = c.req.valid('json');
  const db = c.env.DB;

  const ev = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(b.starEventId).first<any>();
  if (!ev) return c.json({ success: false, error: 'Unknown event' }, 400);

  const dup = await db.prepare(
    `SELECT id FROM lights_out_registrations WHERE LOWER(player_name) = LOWER(?) AND star_event_id = ? AND status != 'denied'`
  ).bind(b.playerName.trim(), b.starEventId).first<any>();
  if (dup) return c.json({ success: false, error: 'This player already has an invite request in. We will be in touch soon.' }, 409);

  // Check the star claim against the scoresheets (last-name match is enough
  // for the admin signal; parents sometimes enter a nickname first name)
  const parts = b.playerName.trim().split(/\s+/);
  const lastName = parts[parts.length - 1];
  const starHit = await db.prepare(`
    SELECT 1 as x FROM game_three_stars ts JOIN games g ON g.id = ts.game_id
    WHERE g.event_id = ? AND (LOWER(ts.player_name) = LOWER(?) OR LOWER(ts.player_name) LIKE LOWER(?))
    LIMIT 1
  `).bind(b.starEventId, b.playerName.trim(), `% ${lastName}`).first<any>();

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO lights_out_registrations (id, player_name, jersey_number, team_name, star_event_id, birth_year, position, parent_name, email, phone, status, star_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(id, b.playerName.trim(), b.jerseyNumber || null, b.teamName.trim(), b.starEventId, b.birthYear || null,
    b.position || null, b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null, starHit ? 1 : 0).run();

  await sendEmail(c.env, b.email.trim(), 'Your Lights Out Invitational request is in',
    emailShell(`
      <p style="margin:0 0 14px;font-size:17px;font-weight:bold;color:#ffffff;">We received your invite request.</p>
      <p style="margin:0 0 14px;">${b.playerName} has requested a spot at the <b style="color:#39ff14;">Lights Out Invitational</b> based on a Three Stars selection at ${ev.name}.</p>
      <p style="margin:0 0 14px;">Our team is confirming the star against the official scoresheets now. Spots are limited to Three Stars recipients only, and you will hear from us as soon as the invite is confirmed.</p>
      <p style="margin:0;color:#7fd8ff;">Keep an eye on this inbox. The lights go out soon.</p>
    `));

  await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out invite request: ${b.playerName}`,
    emailShell(`
      <p style="margin:0 0 12px;font-weight:bold;color:#fff;">New Lights Out invite request</p>
      <p style="margin:0 0 4px;">Player: <b>${b.playerName}</b> ${b.jerseyNumber ? `#${b.jerseyNumber}` : ''}</p>
      <p style="margin:0 0 4px;">Team: ${b.teamName}</p>
      <p style="margin:0 0 4px;">Star event: ${ev.name}</p>
      <p style="margin:0 0 4px;">Star found on scoresheets: <b style="color:${starHit ? '#39ff14' : '#ff6b6b'}">${starHit ? 'YES' : 'NOT FOUND'}</b></p>
      <p style="margin:0 0 4px;">Parent: ${b.parentName} · ${b.email}${b.phone ? ` · ${b.phone}` : ''}</p>
      <p style="margin:12px 0 0;">Approve or deny at ultimatetournaments.com/admin/lights-out</p>
    `));

  return c.json({ success: true, data: { id, starVerified: !!starHit } });
});

// --- Admin ---

lightsOutRoutes.get('/admin/requests', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT lr.*, e.name as star_event_name
    FROM lights_out_registrations lr
    LEFT JOIN events e ON e.id = lr.star_event_id
    ORDER BY CASE lr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, lr.created_at DESC
  `).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

lightsOutRoutes.patch('/admin/requests/:id', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({ status: z.enum(['approved', 'denied', 'pending']) })), async (c) => {
    const id = c.req.param('id');
    const { status } = c.req.valid('json');
    const db = c.env.DB;
    const row = await db.prepare(`
      SELECT lr.*, e.name as star_event_name FROM lights_out_registrations lr
      LEFT JOIN events e ON e.id = lr.star_event_id WHERE lr.id = ?
    `).bind(id).first<any>();
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);

    const user = (c as any).get('user');
    await db.prepare(`UPDATE lights_out_registrations SET status = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
      .bind(status, user?.email || user?.id || 'admin', id).run();

    if (status === 'approved' && row.status !== 'approved') {
      await sendEmail(c.env, row.email, `${row.player_name} is IN - Lights Out Invitational`,
        emailShell(`
          <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#39ff14;">CONFIRMED. ${row.player_name.toUpperCase()} IS IN.</p>
          <p style="margin:0 0 14px;">The star checks out. ${row.player_name} earned a Three Stars selection at ${row.star_event_name || 'a UHT event'}, and that means one thing: an official invite to the first-ever <b style="color:#7fd8ff;">glow-in-the-dark hockey tournament</b> in St. Louis.</p>
          <p style="margin:0 0 14px;">What happens next: we will send dates, rink details, and ${row.player_name}'s team placement (built by age and position) as soon as they are locked. The custom glow jerseys, glow puck, glow tape, glow tee, and UHT hockey bag are all included.</p>
          <p style="margin:0;color:#7fd8ff;">Tell no one. Or tell everyone. Either way - the lights go out soon.</p>
        `));
    }
    return c.json({ success: true });
  });
