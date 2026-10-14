import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sendExpoPushNotifications, logNotification, createUserNotifications, eventAudience, runLockerRoomSweep , groupAudience } from '../lib/push';

export const pushRoutes = new Hono<{ Bindings: Env }>();

// ==================
// POST /register — Register a push token (auth required)
// ==================
const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

pushRoutes.post('/register', authMiddleware, zValidator('json', registerSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { token, platform } = c.req.valid('json');

  const existing = await db.prepare(
    `SELECT id FROM push_tokens WHERE user_id = ? AND platform = ?`
  ).bind(user.id, platform).first();

  if (existing) {
    await db.prepare(
      `UPDATE push_tokens SET token = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(token, existing.id).run();
    return c.json({ success: true, message: 'Push token updated' });
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(
    `INSERT INTO push_tokens (id, user_id, token, platform) VALUES (?, ?, ?, ?)`
  ).bind(id, user.id, token, platform).run();

  return c.json({ success: true, message: 'Push token registered' });
});

// ==================
// DELETE /register — Unregister a push token (auth required)
// ==================
const unregisterSchema = z.object({
  token: z.string().min(1),
});

pushRoutes.delete('/register', authMiddleware, zValidator('json', unregisterSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { token } = c.req.valid('json');

  await db.prepare(
    `DELETE FROM push_tokens WHERE user_id = ? AND token = ?`
  ).bind(user.id, token).run();

  return c.json({ success: true, message: 'Push token unregistered' });
});

// ==================
// POST /send — Send push notification to followers of a team (admin/director)
// ==================
const sendSchema = z.object({
  team_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

pushRoutes.post('/send', authMiddleware, requireRole('admin', 'director'), zValidator('json', sendSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { team_id, title, body, data } = c.req.valid('json');

  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    WHERE pt.user_id IN (
      SELECT user_id FROM user_follows WHERE team_id = ?
      UNION SELECT user_id FROM team_coaches WHERE team_id = ?
      UNION SELECT user_id FROM team_managers WHERE team_id = ?
      UNION SELECT user_id FROM team_members WHERE team_id = ? AND status = 'active'
    )
  `).bind(team_id, team_id, team_id, team_id).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);
  const userIds = [...new Set((result.results || []).map((r: any) => r.user_id as string))];

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for team followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, data);

  // Log the notification
  await logNotification(db, {
    type: 'team',
    title,
    body,
    audience: 'team_followers',
    target_id: team_id,
    sent_count: sent,
    sent_by: user.id,
  });

  // Create per-user notification records for inbox
  await createUserNotifications(db, userIds, title, body, 'team', data);

  return c.json({ success: true, data: { sent } });
});

// ==================
// GET /audience-preview — how many devices/people a push would reach
// ==================
pushRoutes.get('/audience-preview', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const eventId = c.req.query('event_id');
  const divisionId = c.req.query('event_division_id') || null;
  if (eventId) {
    const { tokens, userIds } = await eventAudience(db, eventId, divisionId);
    return c.json({ success: true, data: { devices: tokens.length, users: userIds.length } });
  }
  const row = await db.prepare(
    'SELECT COUNT(DISTINCT token) as devices, COUNT(DISTINCT user_id) as users FROM push_tokens'
  ).first() as any;
  return c.json({ success: true, data: { devices: row?.devices || 0, users: row?.users || 0 } });
});

// ==================
// POST /send-event — Notify all followers of teams registered for an event
// ==================
const sendEventSchema = z.object({
  event_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

pushRoutes.post('/send-event', authMiddleware, requireRole('admin', 'director'), zValidator('json', sendEventSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { event_id, title, body, data } = c.req.valid('json');
  // Taps need a destination: always carry type + event_id in the payload
  const pushData = { type: 'event_update', event_id, ...(data || {}) };

  const { tokens, userIds } = await eventAudience(db, event_id);

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for event followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);

  await logNotification(db, {
    type: 'event_update',
    title,
    body,
    audience: 'event_followers',
    target_id: event_id,
    sent_count: sent,
    sent_by: user.id,
  });

  await createUserNotifications(db, userIds, title, body, 'event_update', pushData);

  return c.json({ success: true, data: { sent } });
});

// ==================
// POST /send-division — Send push notification to all followers of teams in a specific division
// ==================
const sendDivisionSchema = z.object({
  event_id: z.string().min(1),
  event_division_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

pushRoutes.post('/send-division', authMiddleware, requireRole('admin', 'director'), zValidator('json', sendDivisionSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { event_id, event_division_id, title, body, data } = c.req.valid('json');
  const pushData = { type: 'division_update', event_id, event_division_id, ...(data || {}) };

  const { tokens, userIds } = await eventAudience(db, event_id, event_division_id);

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for division followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);

  // Get division info for logging
  const divInfo = await db.prepare(`
    SELECT ed.id, ag.name as age_group, dl.name as division_level
    FROM event_divisions ed
    LEFT JOIN age_groups ag ON ag.id = ed.age_group_id
    LEFT JOIN division_levels dl ON dl.id = ed.division_level_id
    WHERE ed.id = ?
  `).bind(event_division_id).first() as any;

  await logNotification(db, {
    type: 'division_update',
    title,
    body,
    audience: 'division_followers',
    target_id: event_id,
    sent_count: sent,
    sent_by: user.id,
    metadata: JSON.stringify({ event_division_id, division_name: divInfo ? `${divInfo.age_group || ''} ${divInfo.division_level || ''}`.trim() : '' }),
  });

  await createUserNotifications(db, userIds, title, body, 'division_update', pushData);

  return c.json({ success: true, data: { sent } });
});

// ==================
// POST /send-all — Broadcast to ALL app users (admin only)
// ==================
const sendAllSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

pushRoutes.post('/send-all', authMiddleware, requireRole('admin'), zValidator('json', sendAllSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { title, body, data } = c.req.valid('json');

  const result = await db.prepare(`
    SELECT DISTINCT token, user_id FROM push_tokens
  `).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);
  const userIds = [...new Set((result.results || []).map((r: any) => r.user_id as string))];

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, data);

  await logNotification(db, {
    type: 'broadcast',
    title,
    body,
    audience: 'all_users',
    target_id: null,
    sent_count: sent,
    sent_by: user.id,
  });

  await createUserNotifications(db, userIds, title, body, 'broadcast', data);

  return c.json({ success: true, data: { sent } });
});

// ==================

// ==========================================
// MEETINGS: role-scoped announcements on the app home screen
// ==========================================
pushRoutes.get('/meetings', authMiddleware, async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(`
    SELECT m.id, m.event_id, m.title, m.audience, m.when_text, m.details, m.link, e.name as event_name
    FROM event_meetings m JOIN events e ON e.id = m.event_id
    WHERE m.meeting_at_utc >= datetime('now', '-2 hours')
    ORDER BY m.meeting_at_utc ASC LIMIT 10
  `).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /send-group — push to the coaches OR the parents/fans of an event,
// never both (meeting announcements etc.)
pushRoutes.post('/send-group', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  event_id: z.string().min(1),
  group: z.enum(['coaches', 'parents']),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
})), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { event_id, group, title, body, data } = c.req.valid('json');
  const pushData = { type: 'event_update', event_id, ...(data || {}) };
  const { tokens, userIds } = await groupAudience(db, event_id, group);
  if (tokens.length === 0) return c.json({ success: true, data: { sent: 0 }, message: 'No devices in that group' });
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, { type: 'event_update', title, body, audience: `event_${group}`, target_id: event_id, sent_count: sent, sent_by: user.id });
  await createUserNotifications(db, userIds, title, body, 'event_update', pushData);
  return c.json({ success: true, data: { sent, users: userIds.length } });
});


// Admin meeting management: list (incl. recent past), create, delete, announce
pushRoutes.get('/meetings/event/:eventId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM event_meetings WHERE event_id = ? ORDER BY meeting_at_utc ASC"
  ).bind(c.req.param('eventId')).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

pushRoutes.post('/meetings', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  event_id: z.string().min(1),
  title: z.string().min(1).max(80),
  audience: z.enum(['coaches', 'parents']),
  when_text: z.string().min(1).max(120),
  meeting_at_utc: z.string().min(10),
  link: z.string().max(500).nullable().optional(),
})), async (c) => {
  const b = c.req.valid('json');
  const id = crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare(
    "INSERT INTO event_meetings (id, event_id, title, audience, when_text, meeting_at_utc, link, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, b.event_id, b.title, b.audience, b.when_text, b.meeting_at_utc, b.link || null, b.link ? 'Join on Zoom' : null).run();
  return c.json({ success: true, data: { id } });
});

pushRoutes.delete('/meetings/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  await c.env.DB.prepare('DELETE FROM event_meetings WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// Announce: push the meeting to its audience (coaches OR parents, never both)
pushRoutes.post('/meetings/:id/announce', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const reqBody = await c.req.json().catch(() => ({})) as any;
  const note = typeof reqBody.note === 'string' ? reqBody.note.trim().slice(0, 140) : '';
  const m = await db.prepare(
    'SELECT m.*, e.name as event_name FROM event_meetings m JOIN events e ON e.id = m.event_id WHERE m.id = ?'
  ).bind(c.req.param('id')).first<any>();
  if (!m) return c.json({ success: false, error: 'Meeting not found' }, 404);
  const title = note
    ? `${m.audience === 'coaches' ? '📋' : '📣'} ${m.title}: ${note}`
    : `${m.audience === 'coaches' ? '📋' : '📣'} ${m.title} - ${m.when_text}`;
  const body = `${m.event_name}: ${m.title} ${m.when_text}${note ? ` - ${note}` : ''}${m.link ? ' Open the app - the banner on your home screen has the Zoom link.' : ' Details on your home screen in the app.'}`;
  const pushData = { type: 'event_update', event_id: m.event_id };
  const { tokens, userIds } = await groupAudience(db, m.event_id, m.audience);
  if (tokens.length === 0) return c.json({ success: true, data: { sent: 0 }, message: 'No devices in that group' });
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);
  await logNotification(db, { type: 'event_update', title, body, audience: `event_${m.audience}`, target_id: m.event_id, sent_count: sent, sent_by: user.id, metadata: JSON.stringify({ meeting_id: m.id }) });
  await createUserNotifications(db, userIds, title, body, 'event_update', pushData);
  return c.json({ success: true, data: { sent, users: userIds.length } });
});


// Email the meeting (with Zoom link) to its audience group. Optional note
// turns it into a "Starting in 5 minutes" style reminder. Recipients are
// BCC'd in batches so addresses never leak.
pushRoutes.post('/meetings/:id/email', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const reqBody = await c.req.json().catch(() => ({})) as any;
  const note = typeof reqBody.note === 'string' ? reqBody.note.trim().slice(0, 140) : '';
  const m = await db.prepare(
    'SELECT m.*, e.name as event_name FROM event_meetings m JOIN events e ON e.id = m.event_id WHERE m.id = ?'
  ).bind(c.req.param('id')).first<any>();
  if (!m) return c.json({ success: false, error: 'Meeting not found' }, 404);

  const staffSel = `
    SELECT tc.user_id FROM team_coaches tc WHERE tc.team_id IN (SELECT tid FROM evt_teams)
    UNION SELECT tm.user_id FROM team_managers tm WHERE tm.team_id IN (SELECT tid FROM evt_teams)`;
  const famSel = `
    SELECT uf.user_id FROM user_follows uf WHERE uf.team_id IN (SELECT tid FROM evt_teams)
    UNION SELECT tmem.user_id FROM team_members tmem WHERE tmem.team_id IN (SELECT tid FROM evt_teams) AND tmem.status = 'active'`;
  const member = m.audience === 'coaches' ? staffSel : `${famSel} EXCEPT ${staffSel}`;
  const CTE = `WITH evt_teams AS (
    SELECT er.team_id AS tid FROM event_registrations er
    WHERE er.event_id = ?1 AND er.status = 'approved' AND er.team_id IS NOT NULL)`;
  const userRows = (await db.prepare(`${CTE}
    SELECT DISTINCT u.email FROM users u WHERE u.id IN (${member}) AND u.email IS NOT NULL AND u.email != ''
  `).bind(m.event_id).all()).results || [];
  let emails = (userRows as any[]).map((r: any) => String(r.email).trim().toLowerCase());
  if (m.audience === 'coaches') {
    const regRows = (await db.prepare(
      "SELECT email1, email2, coach_email FROM event_registrations WHERE event_id = ? AND status = 'approved'"
    ).bind(m.event_id).all()).results || [];
    for (const r of regRows as any[]) emails.push(...[r.email1, r.email2, r.coach_email].map((e: any) => String(e || '').trim().toLowerCase()));
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  emails = [...new Set(emails.filter(e => emailRe.test(e)))];
  if (emails.length === 0) return c.json({ success: true, data: { sent: 0 }, message: 'No email addresses in that group' });

  const subject = note ? `${note} - ${m.title} (${m.event_name})` : `${m.title}: ${m.when_text} (${m.event_name})`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f2f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#003e79;border-radius:16px 16px 0 0;padding:24px 28px;text-align:center;">
      <div style="color:#00ccff;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${m.event_name}</div>
      <div style="color:#ffffff;font-size:24px;font-weight:800;margin-top:6px;">${m.title}</div>
      <div style="color:#aee6ff;font-size:15px;font-weight:700;margin-top:4px;">${m.when_text}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;text-align:center;">
      ${note ? `<div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:12px 16px;margin:0 0 18px;font-size:16px;font-weight:800;color:#b91c1c;">${note}</div>` : ''}
      ${m.link ? `<a href="${m.link}" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:17px;font-weight:800;text-decoration:none;border-radius:999px;padding:14px 36px;">Join Zoom Meeting</a>
      <p style="font-size:12px;color:#86868b;margin:14px 0 0;word-break:break-all;"><a href="${m.link}" style="color:#0a7cc9;">${m.link}</a></p>` :
      '<p style="font-size:14px;color:#1d2a3d;">Details are on your home screen in the UHT app.</p>'}
      <p style="font-size:13px;color:#5b6b83;margin:18px 0 0;">The join link is also on your home screen in the UHT app.</p>
    </div>
  </div></body></html>`;

  // preview: true returns the rendered email + recipient count, sends nothing
  if (reqBody.preview) {
    return c.json({ success: true, data: { preview: true, subject, html, recipients: emails.length } });
  }

  let sent = 0;
  for (let i = 0; i < emails.length; i += 40) {
    const chunk = emails.slice(i, i + 40);
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>',
        reply_to: 'johnny@ultimatetournaments.com',
        // One copy for Johnny (first batch only), not one per 40 recipients
        to: [i === 0 ? 'johnny@ultimatetournaments.com' : 'registration@ultimatetournaments.com'],
        bcc: chunk, subject, html,
      }),
    });
    if (resp.ok) sent += chunk.length;
  }
  return c.json({ success: true, data: { sent, recipients: emails.length } });
});

// POST /send-locker-room — Send locker room assignment push to team followers
// ==================
const lockerRoomPushSchema = z.object({
  game_id: z.string().min(1),
});

pushRoutes.post('/send-locker-room', authMiddleware, requireRole('admin', 'director', 'scorekeeper'), zValidator('json', lockerRoomPushSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const { game_id } = c.req.valid('json');

  // Get game with locker room info
  const game = await db.prepare(`
    SELECT g.*, e.name as event_name,
      r.name as rink_name
    FROM games g
    LEFT JOIN events e ON e.id = g.event_id
    LEFT JOIN rinks r ON r.id = g.rink_id
    WHERE g.id = ?
  `).bind(game_id).first() as any;

  if (!game) {
    return c.json({ success: false, error: 'Game not found' }, 404);
  }

  if (!game.home_locker_room && !game.away_locker_room) {
    return c.json({ success: false, error: 'No locker rooms assigned to this game' }, 400);
  }

  // Get all team IDs involved in this game
  const teamIds: string[] = [];
  if (game.home_team_id) teamIds.push(game.home_team_id);
  if (game.away_team_id) teamIds.push(game.away_team_id);

  // Find followers/coaches/managers of teams registered for the event in the game's division
  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    WHERE pt.user_id IN (
      SELECT uf.user_id FROM user_follows uf JOIN event_registrations er ON er.team_id = uf.team_id WHERE er.event_id = ? AND er.event_division_id = ?
      UNION SELECT tc.user_id FROM team_coaches tc JOIN event_registrations er ON er.team_id = tc.team_id WHERE er.event_id = ? AND er.event_division_id = ?
      UNION SELECT tm.user_id FROM team_managers tm JOIN event_registrations er ON er.team_id = tm.team_id WHERE er.event_id = ? AND er.event_division_id = ?
      UNION SELECT tmem.user_id FROM team_members tmem JOIN event_registrations er ON er.team_id = tmem.team_id WHERE er.event_id = ? AND er.event_division_id = ? AND tmem.status = 'active'
    )
  `).bind(game.event_id, game.event_division_id, game.event_id, game.event_division_id, game.event_id, game.event_division_id, game.event_id, game.event_division_id).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);
  const userIds = [...new Set((result.results || []).map((r: any) => r.user_id as string))];

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for teams in this game' });
  }

  const gameTime = game.start_time ? new Date(game.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const lockerInfo: string[] = [];
  if (game.home_locker_room) lockerInfo.push(`Home: ${game.home_locker_room}`);
  if (game.away_locker_room) lockerInfo.push(`Away: ${game.away_locker_room}`);

  const title = `Locker Room Assignment - Game #${game.game_number}`;
  const body = `${game.notes || 'Game'} at ${gameTime}${game.rink_name ? ` (${game.rink_name})` : ''}\n${lockerInfo.join(' | ')}`;

  const pushData = { type: 'locker_room', game_id, event_id: game.event_id };
  const sent = await sendExpoPushNotifications(tokens, title, body, pushData);

  await logNotification(db, {
    type: 'locker_room',
    title,
    body,
    audience: 'event_followers',
    target_id: game.event_id,
    sent_count: sent,
    sent_by: user.id,
    metadata: JSON.stringify({ game_id, game_number: game.game_number }),
  });

  await createUserNotifications(db, userIds, title, body, 'locker_room', pushData);

  return c.json({ success: true, data: { sent, game_number: game.game_number } });
});

// ==================
// PATCH /games/:id/locker-rooms — Assign locker rooms to a game
// ==================
const lockerRoomSchema = z.object({
  home_locker_room: z.string().nullable().optional(),
  away_locker_room: z.string().nullable().optional(),
});

pushRoutes.patch('/games/:id/locker-rooms', authMiddleware, requireRole('admin', 'director', 'scorekeeper'), zValidator('json', lockerRoomSchema), async (c) => {
  const db = c.env.DB;
  const gameId = c.req.param('id');
  const { home_locker_room, away_locker_room } = c.req.valid('json');

  // Verify game exists
  const game = await db.prepare(`SELECT id FROM games WHERE id = ?`).bind(gameId).first();
  if (!game) {
    return c.json({ success: false, error: 'Game not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (home_locker_room !== undefined) {
    updates.push('home_locker_room = ?');
    values.push(home_locker_room);
  }
  if (away_locker_room !== undefined) {
    updates.push('away_locker_room = ?');
    values.push(away_locker_room);
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(gameId);

  await db.prepare(
    `UPDATE games SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, message: 'Locker rooms updated' });
});

// ==================
// GET /notifications — List notification history (admin/director)
// ==================
pushRoutes.get('/notifications', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const eventId = c.req.query('event_id') || null;
  const result = await db.prepare(`
    SELECT n.*, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) as sent_by_name
    FROM notifications n
    LEFT JOIN users u ON u.id = n.sent_by
    WHERE (?1 IS NULL OR n.target_id = ?1)
    ORDER BY n.created_at DESC
    LIMIT ?2 OFFSET ?3
  `).bind(eventId, limit, offset).all();

  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM notifications`).first() as any;

  return c.json({
    success: true,
    data: {
      notifications: result.results || [],
      total: countResult?.total || 0,
      limit,
      offset,
    },
  });
});

// ==================
// POST /check-locker-room-alerts — Trigger locker room push for games starting within 1 hour
// Called by a Cloudflare Cron trigger or manual admin trigger
// ==================
pushRoutes.post('/check-locker-room-alerts', authMiddleware, requireRole('admin', 'director', 'scorekeeper'), async (c) => {
  // The sweep also runs every minute from the Worker cron; this endpoint is
  // the admin page's manual trigger. (The old version accepted ANY value in
  // the Authorization header - never validated.)
  const result = await runLockerRoomSweep(c.env.DB);
  return c.json({ success: true, data: result });
});

// ==================
// GET /user-notifications — Get current user's notification inbox
// ==================
pushRoutes.get('/user-notifications', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const result = await db.prepare(`
    SELECT id, title, body, type, data, is_read, read_at, created_at
    FROM user_notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(user.id, limit, offset).all();

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM user_notifications WHERE user_id = ?`
  ).bind(user.id).first() as any;

  return c.json({
    success: true,
    data: {
      notifications: result.results || [],
      total: countResult?.total || 0,
      limit,
      offset,
    },
  });
});

// ==================
// GET /unread-count — Get current user's unread notification count
// ==================
pushRoutes.get('/unread-count', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };

  const result = await db.prepare(
    `SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND is_read = 0`
  ).bind(user.id).first() as any;

  return c.json({
    success: true,
    data: { unread_count: result?.count || 0 },
  });
});

// ==================
// DELETE /notifications/:id — delete one of the user's own notifications
pushRoutes.delete('/notifications/:id', authMiddleware, async (c) => {
  const user = c.get('user') as { id: string };
  await c.env.DB.prepare('DELETE FROM user_notifications WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).run();
  return c.json({ success: true });
});

// POST /notifications/clear — delete ALL of the user's notifications
pushRoutes.post('/notifications/clear', authMiddleware, async (c) => {
  const user = c.get('user') as { id: string };
  const r = await c.env.DB.prepare('DELETE FROM user_notifications WHERE user_id = ?').bind(user.id).run();
  return c.json({ success: true, data: { deleted: r.meta?.changes || 0 } });
});

// POST /mark-read/:id — Mark a single notification as read
// ==================
pushRoutes.post('/mark-read/:id', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const notifId = c.req.param('id');

  await db.prepare(
    `UPDATE user_notifications SET is_read = 1, read_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).bind(notifId, user.id).run();

  return c.json({ success: true });
});

// ==================
// POST /mark-all-read — Mark all user's notifications as read
// ==================
pushRoutes.post('/mark-all-read', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };

  await db.prepare(
    `UPDATE user_notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND is_read = 0`
  ).bind(user.id).run();

  return c.json({ success: true });
});

// ==================
// POST /migrate — Create/update tables
// ==================
pushRoutes.post('/migrate', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  // Create push_tokens table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, platform)
    )
  `).run();

  // Create notifications history table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL,
      target_id TEXT,
      sent_count INTEGER DEFAULT 0,
      sent_by TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Create user_notifications table for per-user inbox
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT,
      data TEXT,
      is_read INTEGER DEFAULT 0,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Create index for user inbox queries
  try {
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, created_at DESC)`).run();
  } catch (e) { /* index may already exist */ }

  try {
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, is_read)`).run();
  } catch (e) { /* index may already exist */ }

  // Add locker room columns to games table
  try {
    await db.prepare(`ALTER TABLE games ADD COLUMN home_locker_room TEXT`).run();
  } catch (e) { /* column may already exist */ }

  try {
    await db.prepare(`ALTER TABLE games ADD COLUMN away_locker_room TEXT`).run();
  } catch (e) { /* column may already exist */ }

  try {
    await db.prepare(`ALTER TABLE games ADD COLUMN locker_room_notified INTEGER DEFAULT 0`).run();
  } catch (e) { /* column may already exist */ }

  // Add delay columns to games table
  try {
    await db.prepare(`ALTER TABLE games ADD COLUMN delay_minutes INTEGER`).run();
  } catch (e) { /* column may already exist */ }

  try {
    await db.prepare(`ALTER TABLE games ADD COLUMN delay_note TEXT`).run();
  } catch (e) { /* column may already exist */ }

  return c.json({ success: true, message: 'Push tables and locker room columns created/updated' });
});
