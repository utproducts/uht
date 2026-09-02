import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const webUpdateRoutes = new Hono<{ Bindings: Env }>();

// All routes are staff-only
webUpdateRoutes.use('*', authMiddleware, requireRole('admin', 'director'));

// ==========================================
// List all requests (shared queue — everyone sees everything)
// ==========================================
webUpdateRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT * FROM web_update_requests
    ORDER BY
      CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'needs_info' THEN 2 ELSE 3 END,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at DESC
  `).all();
  return c.json({ success: true, data: result.results });
});

// ==========================================
// Create a request
// ==========================================
const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(5000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  page_url: z.string().max(500).optional().nullable(),
  screenshot_url: z.string().max(500).optional().nullable(),
});

webUpdateRoutes.post('/', zValidator('json', createSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  const requester = await db.prepare('SELECT first_name, last_name, email FROM users WHERE id = ?')
    .bind(user.id).first<{ first_name: string; last_name: string; email: string }>();

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO web_update_requests (id, title, description, priority, page_url, screenshot_url, requested_by_id, requested_by_name, requested_by_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.title.trim(), data.description.trim(), data.priority || 'normal',
    data.page_url?.trim() || null, data.screenshot_url?.trim() || null,
    user.id,
    requester ? `${requester.first_name || ''} ${requester.last_name || ''}`.trim() : null,
    requester?.email || null
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ==========================================
// Update a request (status / result notes / priority).
// Moving to done or needs_info emails the requester with the notes.
// ==========================================
const updateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'done', 'needs_info', 'declined']).optional(),
  result_notes: z.string().max(5000).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(3).max(5000).optional(),
});

webUpdateRoutes.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT * FROM web_update_requests WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'Request not found' }, 404);

  const setClauses: string[] = [];
  const params: (string | null)[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(val as any);
    }
  }
  if (setClauses.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

  setClauses.push("updated_at = datetime('now')");
  if (data.status === 'done') setClauses.push("completed_at = datetime('now')");
  params.push(id);
  await db.prepare(`UPDATE web_update_requests SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();

  // Notify the requester when their request is completed or needs their input
  const notifyStatuses = ['done', 'needs_info', 'declined'];
  if (data.status && notifyStatuses.includes(data.status) && existing.status !== data.status && existing.requested_by_email) {
    const notes = (data.result_notes ?? existing.result_notes) || '';
    const statusText = data.status === 'done' ? 'Completed ✅' : data.status === 'needs_info' ? 'Needs more info ❓' : 'Declined';
    const subject = data.status === 'done'
      ? `Done: ${existing.title}`
      : data.status === 'needs_info'
        ? `Question about your web update: ${existing.title}`
        : `Web update declined: ${existing.title}`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.RESEND_API}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'UHT Web Updates <registration@ultimatetournaments.com>',
          to: [existing.requested_by_email],
          subject,
          html: `
            <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <h2 style="color:#003e79;margin:0 0 4px;">Web Update: ${statusText}</h2>
              <p style="font-size:16px;font-weight:600;color:#1d1d1f;margin:16px 0 4px;">${existing.title}</p>
              <p style="font-size:14px;color:#6e6e73;white-space:pre-wrap;margin:0 0 16px;">${existing.description}</p>
              ${notes ? `<div style="background:#f5f5f7;border-radius:12px;padding:14px 16px;margin:0 0 16px;">
                <p style="font-size:13px;font-weight:600;color:#003e79;margin:0 0 6px;">Notes</p>
                <p style="font-size:14px;color:#1d1d1f;white-space:pre-wrap;margin:0;">${notes}</p>
              </div>` : ''}
              <a href="https://ultimatetournaments.com/admin/web-updates" style="display:inline-block;background:#003e79;color:#fff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:10px;text-decoration:none;">View in Admin</a>
            </div>`,
          text: `Web Update ${statusText}: ${existing.title}\n\n${notes ? 'Notes: ' + notes + '\n\n' : ''}https://ultimatetournaments.com/admin/web-updates`,
        }),
      });
    } catch (e) {
      console.error('Web update notification email error:', e);
    }
  }

  const updated = await db.prepare('SELECT * FROM web_update_requests WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: updated });
});
