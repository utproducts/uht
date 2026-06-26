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

  // Upsert: if user already has a token for this platform, update it
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
  const { team_id, title, body, data } = c.req.valid('json');

  // Find all users following this team and their push tokens
  const result = await db.prepare(`
    SELECT pt.token
    FROM push_tokens pt
    JOIN user_follows uf ON uf.user_id = pt.user_id
    WHERE uf.team_id = ?
  `).bind(team_id).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for team followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, data);

  return c.json({ success: true, data: { sent } });
});

// ==================
// POST /send-event — Notify all teams in an event
// ==================
const sendEventSchema = z.object({
  event_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

pushRoutes.post('/send-event', authMiddleware, requireRole('admin', 'director'), zValidator('json', sendEventSchema), async (c) => {
  const db = c.env.DB;
  const { event_id, title, body, data } = c.req.valid('json');

  // Find all teams registered for this event, then all followers with push tokens
  const result = await db.prepare(`
    SELECT DISTINCT pt.token
    FROM push_tokens pt
    JOIN user_follows uf ON uf.user_id = pt.user_id
    JOIN event_registrations er ON er.team_id = uf.team_id
    WHERE er.event_id = ?
  `).bind(event_id).all();

  const tokens = (result.results || []).map((r: any) => r.token as string);

  if (tokens.length === 0) {
    return c.json({ success: true, data: { sent: 0 }, message: 'No push tokens found for event followers' });
  }

  const sent = await sendExpoPushNotifications(tokens, title, body, data);

  return c.json({ success: true, data: { sent } });
});

// ==================
// POST /migrate — Create push_tokens table
// ==================
pushRoutes.post('/migrate', async (c) => {
  const db = c.env.DB;

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

  return c.json({ success: true, message: 'push_tokens table created' });
});

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

  // Build messages
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    ...(data ? { data } : {}),
  }));

  // Send in batches of 100
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
