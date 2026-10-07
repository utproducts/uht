import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole, optionalAuth } from '../middleware/auth';

/**
 * Event photo gallery.
 * - Families upload all weekend from the app (photo library picks, base64).
 * - Directors upload Champions photos tied to a team - highlighted in app/web.
 * - Everything lands in R2 under event-photos/{eventId}/ and rows in
 *   event_photos. Report + admin hide keep it App Store compliant.
 */
export const photoRoutes = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 8 * 1024 * 1024; // ~8MB decoded

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Upload (any signed-in user; kind=champion needs director/admin) ──
photoRoutes.post('/events/:eventId/photos', authMiddleware, async (c) => {
  const eventId = c.req.param('eventId');
  const user = c.get('user') as any;
  const db = c.env.DB;

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  const body = await c.req.json().catch(() => ({})) as any;
  const data = String(body.data || '');
  const mimeType = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const kind = body.kind === 'champion' ? 'champion' : 'fan';
  const teamId = body.teamId ? String(body.teamId) : null;
  if (!data) return c.json({ success: false, error: 'No image data' }, 400);

  if (kind === 'champion') {
    const roles: string[] = user?.roles || [];
    if (!roles.some(r => ['admin', 'director', 'tournament_director'].includes(r))) {
      return c.json({ success: false, error: 'Champions photos are director-only' }, 403);
    }
    if (!teamId) return c.json({ success: false, error: 'Pick the winning team first' }, 400);
  }

  let bytes: Uint8Array;
  try { bytes = b64ToBytes(data); } catch { return c.json({ success: false, error: 'Bad image data' }, 400); }
  if (bytes.length > MAX_BYTES) return c.json({ success: false, error: 'Image too large' }, 413);

  const id = crypto.randomUUID().replace(/-/g, '');
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const key = `event-photos/${eventId}/${id}.${ext}`;
  await c.env.STORAGE.put(key, bytes, { httpMetadata: { contentType: mimeType } });

  await db.prepare(`
    INSERT INTO event_photos (id, event_id, user_id, r2_key, kind, team_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, eventId, user?.id || null, key, kind, teamId).run();

  return c.json({ success: true, data: { id, url: `/api/photos/file/${id}` } });
});

// ── Public gallery feed ──
photoRoutes.get('/events/:eventId/photos', optionalAuth, async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const { kind, page = '1', per_page = '60' } = c.req.query();
  const limit = Math.min(parseInt(per_page) || 60, 120);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  let where = "ep.event_id = ? AND ep.status = 'approved'";
  const params: any[] = [eventId];
  if (kind === 'fan' || kind === 'champion') { where += ' AND ep.kind = ?'; params.push(kind); }

  const rows = (await db.prepare(`
    SELECT ep.id, ep.kind, ep.team_id, ep.caption, ep.created_at,
      COALESCE(t.schedule_name, t.name) as team_name,
      ed.age_group, ed.division_level
    FROM event_photos ep
    LEFT JOIN teams t ON t.id = ep.team_id
    LEFT JOIN (
      SELECT er.team_id as tid, MAX(er.event_division_id) as event_division_id
      FROM event_registrations er WHERE er.event_id = ? GROUP BY er.team_id
    ) reg ON reg.tid = ep.team_id
    LEFT JOIN event_divisions ed ON ed.id = reg.event_division_id
    WHERE ${where}
    ORDER BY CASE ep.kind WHEN 'champion' THEN 0 ELSE 1 END, ep.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(eventId, ...params, limit, offset).all()).results || [];

  const total = await db.prepare(
    "SELECT COUNT(*) as n, SUM(CASE WHEN kind='champion' THEN 1 ELSE 0 END) as champs FROM event_photos WHERE event_id = ? AND status = 'approved'"
  ).bind(eventId).first<any>();

  return c.json({
    success: true,
    data: {
      photos: rows.map((r: any) => ({ ...r, url: `https://uht.chad-157.workers.dev/api/photos/file/${r.id}` })),
      total: total?.n || 0,
      champions: total?.champs || 0,
    },
  });
});

// ── Serve a photo from R2 ──
photoRoutes.get('/file/:photoId', async (c) => {
  const db = c.env.DB;
  const row = await db.prepare("SELECT r2_key, status FROM event_photos WHERE id = ?")
    .bind(c.req.param('photoId')).first<any>();
  if (!row || row.status !== 'approved') return c.json({ error: 'Not found' }, 404);
  const obj = await c.env.STORAGE.get(row.r2_key);
  if (!obj) return c.json({ error: 'Not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
});

// ── Report (any signed-in user); 3 reports auto-hides pending review ──
photoRoutes.post('/:photoId/report', authMiddleware, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('photoId');
  await db.prepare('UPDATE event_photos SET reports = reports + 1 WHERE id = ?').bind(id).run();
  await db.prepare("UPDATE event_photos SET status = 'hidden' WHERE id = ? AND reports >= 3").bind(id).run();
  return c.json({ success: true });
});

// ── Admin moderation ──
photoRoutes.get('/events/:eventId/photos/admin', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const rows = (await db.prepare(`
    SELECT ep.id, ep.kind, ep.status, ep.reports, ep.created_at, ep.team_id,
      COALESCE(t.schedule_name, t.name) as team_name, u.first_name, u.last_name
    FROM event_photos ep
    LEFT JOIN teams t ON t.id = ep.team_id
    LEFT JOIN users u ON u.id = ep.user_id
    WHERE ep.event_id = ?
    ORDER BY ep.created_at DESC
  `).bind(c.req.param('eventId')).all()).results || [];
  return c.json({ success: true, data: rows.map((r: any) => ({ ...r, url: `https://uht.chad-157.workers.dev/api/photos/admin-file/${r.id}` })) });
});

// Admin can view hidden photos too
photoRoutes.get('/admin-file/:photoId', async (c) => {
  const db = c.env.DB;
  const row = await db.prepare('SELECT r2_key FROM event_photos WHERE id = ?')
    .bind(c.req.param('photoId')).first<any>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const obj = await c.env.STORAGE.get(row.r2_key);
  if (!obj) return c.json({ error: 'Not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=3600');
  return new Response(obj.body, { headers });
});

photoRoutes.patch('/:photoId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({})) as any;
  const status = body.status === 'hidden' ? 'hidden' : 'approved';
  await db.prepare("UPDATE event_photos SET status = ?, reports = CASE WHEN ? = 'approved' THEN 0 ELSE reports END WHERE id = ?")
    .bind(status, status, c.req.param('photoId')).run();
  return c.json({ success: true });
});

photoRoutes.delete('/:photoId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const row = await db.prepare('SELECT r2_key FROM event_photos WHERE id = ?').bind(c.req.param('photoId')).first<any>();
  if (row) await c.env.STORAGE.delete(row.r2_key).catch(() => {});
  await db.prepare('DELETE FROM event_photos WHERE id = ?').bind(c.req.param('photoId')).run();
  return c.json({ success: true });
});
