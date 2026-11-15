// ==========================================
// Weekend photo last call - Mondays only.
// Families asked for more time past Sunday, so the upload deadline is
// Monday night and the mosaic goes out Tuesday. For every event that
// ended over the weekend, push a last-call reminder to its followers
// (once per event, tracked in the notifications log).
// Called from the cron during the 16:00 UTC hour (10am CT).
// ==========================================

import { sendExpoPushNotifications, logNotification, createUserNotifications, eventAudience } from './push';

export async function runPhotoLastCallSweep(db: any): Promise<{ events: number; sent: number }> {
  if (new Date().getUTCDay() !== 1) return { events: 0, sent: 0 }; // Mondays only

  const events = (await db.prepare(`
    SELECT e.id, e.name FROM events e
    WHERE date(COALESCE(e.end_date, e.start_date)) >= date('now', '-3 days')
      AND date(COALESCE(e.end_date, e.start_date)) < date('now')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n WHERE n.type = 'photo_lastcall' AND n.target_id = e.id
      )
  `).all()).results || [];

  let total = 0;
  for (const ev of events as any[]) {
    const { tokens, userIds } = await eventAudience(db, ev.id);
    if (tokens.length === 0) continue;
    const title = 'Last call for weekend photos!';
    const body = `Tonight is the last night to upload your photos from ${ev.name} - open the event, tap Photos, and add your favorites. The FREE event mosaic made from every single photo goes out to all families tomorrow!`;
    const data = { type: 'event_update', event_id: ev.id };
    const sent = await sendExpoPushNotifications(tokens, title, body, data);
    await logNotification(db, {
      type: 'photo_lastcall', title, body,
      audience: 'event_followers', target_id: ev.id, sent_count: sent, sent_by: 'system',
    });
    await createUserNotifications(db, userIds, title, body, 'event_update', data);
    total += sent;
  }
  return { events: events.length, sent: total };
}
