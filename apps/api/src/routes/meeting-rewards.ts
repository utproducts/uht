import { Hono } from 'hono';
import type { Env } from '../types';

// Meeting reward codes (UHT-XXXXXX, dollar amounts) issued to coaches at
// coach/manager meetings. The register flow validates them as a fallback when a
// code isn't found in discount_codes. Amount is in DOLLARS (frontend multiplies
// by 100), matching how the codes were issued.
export const meetingRewardRoutes = new Hono<{ Bindings: Env }>();

meetingRewardRoutes.post('/validate', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json() as { code?: string };
  const code = (body.code || '').trim().toUpperCase();

  if (!code) {
    return c.json({ success: false, error: 'Code is required' }, 400);
  }

  const reward = await db.prepare(
    'SELECT id, code, name, amount, redeemed FROM meeting_rewards WHERE UPPER(code) = ?'
  ).bind(code).first<any>();

  if (!reward) {
    return c.json({ success: false, error: 'Invalid code' }, 404);
  }
  if (reward.redeemed) {
    return c.json({ success: false, error: 'This reward code has already been used' }, 400);
  }

  return c.json({
    success: true,
    data: { valid: true, amount: reward.amount, name: reward.name },
  });
});

meetingRewardRoutes.post('/redeem', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json() as { code?: string; registrationId?: string; eventId?: string };
  const code = (body.code || '').trim().toUpperCase();

  if (!code) {
    return c.json({ success: false, error: 'Code is required' }, 400);
  }

  const reward = await db.prepare(
    'SELECT id, redeemed FROM meeting_rewards WHERE UPPER(code) = ?'
  ).bind(code).first<any>();

  if (!reward) {
    return c.json({ success: false, error: 'Invalid code' }, 404);
  }
  if (reward.redeemed) {
    return c.json({ success: false, error: 'This reward code has already been used' }, 400);
  }

  await db.prepare(
    "UPDATE meeting_rewards SET redeemed = 1, redeemed_at = datetime('now'), redeemed_event_id = ? WHERE id = ?"
  ).bind(body.eventId || body.registrationId || null, reward.id).run();

  return c.json({ success: true, message: 'Reward code redeemed' });
});
