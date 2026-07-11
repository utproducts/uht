import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

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
    SELECT pt.token, pt.user_id
    FROM push_tokens pt
    JOIN user_follows uf ON uf.user_id = pt.user_id
    WHERE uf.team_id = ?
  `).bind(team_id).all();

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

  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    JOIN user_follows uf ON uf.user_id = pt.user_id
    JOIN event_registrations er ON er.team_id = uf.team_id
    WHERE er.event_id = ?
  `).bind(event_id).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);
  const userIds = [...new Set((result.results || []).map((r: any) => r.user_id as string))];

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for event followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, data);

  await logNotification(db, {
    type: 'event_update',
    title,
    body,
    audience: 'event_followers',
    target_id: event_id,
    sent_count: sent,
    sent_by: user.id,
  });

  await createUserNotifications(db, userIds, title, body, 'event_update', data);

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

  // Get all push tokens for users following teams in this division
  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    JOIN user_follows uf ON uf.user_id = pt.user_id
    JOIN event_registrations er ON er.team_id = uf.team_id
    WHERE er.event_id = ? AND er.event_division_id = ?
  `).bind(event_id, event_division_id).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);
  const userIds = [...new Set((result.results || []).map((r: any) => r.user_id as string))];

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for division followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, data);

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

  await createUserNotifications(db, userIds, title, body, 'division_update', data);

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

  // Also check notes field for team names (mock data uses notes)
  // Find followers of teams registered for the event in the game's division
  const result = await db.prepare(`
    SELECT DISTINCT pt.token, pt.user_id
    FROM push_tokens pt
    JOIN user_follows uf ON uf.user_id = pt.user_id
    JOIN event_registrations er ON er.team_id = uf.team_id
    WHERE er.event_id = ?
    AND er.event_division_id = ?
  `).bind(game.event_id, game.event_division_id).all();

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

  const result = await db.prepare(`
    SELECT n.*, u.firstName || ' ' || u.lastName as sent_by_name
    FROM notifications n
    LEFT JOIN users u ON u.id = n.sent_by
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

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
pushRoutes.post('/check-locker-room-alerts', async (c) => {
  const db = c.env.DB;

  // Verify this is a cron trigger or admin request
  const authHeader = c.req.header('Authorization');
  const cronSecret = c.req.header('X-Cron-Secret');

  // Allow cron triggers or authenticated admin users
  if (!cronSecret && !authHeader) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  // Find games starting in ~1 hour that have locker rooms assigned
  // and haven't already been notified (check notifications table)
  const games = await db.prepare(`
    SELECT g.id, g.game_number, g.start_time, g.event_id, g.event_division_id,
      g.home_locker_room, g.away_locker_room, g.notes,
      e.name as event_name,
      r.name as rink_name
    FROM games g
    LEFT JOIN events e ON e.id = g.event_id
    LEFT JOIN rinks r ON r.id = g.rink_id
    WHERE g.start_time BETWEEN ? AND ?
    AND (g.home_locker_room IS NOT NULL OR g.away_locker_room IS NOT NULL)
    AND g.locker_room_notified = 0
    AND g.status IN ('scheduled', 'warmup')
  `).bind(
    thirtyMinAgo.toISOString().replace('Z', ''),
    oneHourFromNow.toISOString().replace('Z', '')
  ).all();

  let totalSent = 0;
  const gamesNotified: number[] = [];

  for (const game of (games.results || []) as any[]) {
    // Get push tokens for all followers of teams in this division
    const tokenResult = await db.prepare(`
      SELECT DISTINCT pt.token, pt.user_id
      FROM push_tokens pt
      JOIN user_follows uf ON uf.user_id = pt.user_id
      JOIN event_registrations er ON er.team_id = uf.team_id
      WHERE er.event_id = ? AND er.event_division_id = ?
    `).bind(game.event_id, game.event_division_id).all();

    const tokens = (tokenResult.results || []).map((r: any) => r.token as string);
    const autoUserIds = [...new Set((tokenResult.results || []).map((r: any) => r.user_id as string))];
    if (tokens.length === 0) continue;

    const gameTime = game.start_time ? new Date(game.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const lockerInfo: string[] = [];
    if (game.home_locker_room) lockerInfo.push(`Home: ${game.home_locker_room}`);
    if (game.away_locker_room) lockerInfo.push(`Away: ${game.away_locker_room}`);

    const title = `Locker Room - Game #${game.game_number}`;
    const body = `${game.notes || 'Game'} at ${gameTime}${game.rink_name ? ` (${game.rink_name})` : ''}\n${lockerInfo.join(' | ')}`;

    const pushData = { type: 'locker_room', game_id: game.id, event_id: game.event_id };
    const sent = await sendExpoPushNotifications(tokens, title, body, pushData);

    totalSent += sent;
    gamesNotified.push(game.game_number);

    // Mark game as notified
    await db.prepare(
      `UPDATE games SET locker_room_notified = 1, updated_at = datetime('now') WHERE id = ?`
    ).bind(game.id).run();

    // Log notification
    await logNotification(db, {
      type: 'locker_room_auto',
      title,
      body,
      audience: 'event_followers',
      target_id: game.event_id,
      sent_count: sent,
      sent_by: 'system',
      metadata: JSON.stringify({ game_id: game.id, game_number: game.game_number }),
    });

    await createUserNotifications(db, autoUserIds, title, body, 'locker_room', pushData);
  }

  return c.json({
    success: true,
    data: {
      games_checked: (games.results || []).length,
      games_notified: gamesNotified,
      total_sent: totalSent,
    },
  });
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

// ==================
// Helper: Log a notification to the notifications table
// ==================
async function logNotification(db: any, data: {
  type: string;
  title: string;
  body: string;
  audience: string;
  target_id: string | null;
  sent_count: number;
  sent_by: string;
  metadata?: string;
}) {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO notifications (id, type, title, body, audience, target_id, sent_count, sent_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.type, data.title, data.body, data.audience, data.target_id, data.sent_count, data.sent_by, data.metadata || null).run();
}

// ==================
// Helper: Create per-user notification records for inbox
// ==================
async function createUserNotifications(
  db: any,
  userIds: string[],
  title: string,
  body: string,
  type: string,
  data?: Record<string, unknown>
) {
  const dataStr = data ? JSON.stringify(data) : null;
  // Batch insert — D1 doesn't support multi-row INSERT, so we loop
  for (const userId of userIds) {
    const id = crypto.randomUUID().replace(/-/g, '');
    try {
      await db.prepare(`
        INSERT INTO user_notifications (id, user_id, title, body, type, data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, userId, title, body, type, dataStr).run();
    } catch (e) {
      console.error('Failed to create user notification:', e);
    }
  }
}

// ==================
// Helper: Send notifications via Expo Push API (batched, max 100 per request)
// ==================
async function sendExpoPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<number> {
  const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  const BATCH_SIZE = 100;
  let totalSent = 0;

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    ...(data ? { data } : {}),
  }));

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        totalSent += batch.length;
      } else {
        console.error('Expo push API error:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Failed to send push batch:', err);
    }
  }

  return totalSent;
}
