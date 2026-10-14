import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const surveyRoutes = new Hono<{ Bindings: Env }>();

// Allowed answers per survey question - anything else is dropped so the
// public endpoint can't be used to stuff garbage into the overview
const GLOW_FIELDS: Record<string, string[]> = {
  interest: ['very', 'somewhat', 'not'],
  format: ['all_glow', 'hybrid', 'either'],
  cost_reaction: ['still_in', 'depends', 'probably_out'],
  travel: ['would_travel', 'home_city_only', 'either'],
};

// PUBLIC: submit a response (no login - the link goes out by email)
surveyRoutes.post('/:surveyId/submit', async (c) => {
  const surveyId = c.req.param('surveyId');
  if (surveyId !== 'glow-2026') return c.json({ success: false, error: 'Unknown survey' }, 404);
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({})) as any;

  const clean: Record<string, string | null> = {};
  for (const [field, allowed] of Object.entries(GLOW_FIELDS)) {
    const v = String(body[field] || '').trim();
    clean[field] = allowed.includes(v) ? v : null;
  }
  if (!clean.interest) return c.json({ success: false, error: 'Please answer the first question' }, 400);

  const email = String(body.email || '').trim().toLowerCase().slice(0, 200) || null;
  const name = String(body.name || '').trim().slice(0, 120) || null;
  const city = String(body.city || '').trim().slice(0, 120) || null;
  const comments = String(body.comments || '').trim().slice(0, 1000) || null;

  // One response per email (latest wins) so a resubmit doesn't double-count
  if (email) {
    await db.prepare('DELETE FROM survey_responses WHERE survey_id = ? AND email = ?').bind(surveyId, email).run();
  }
  await db.prepare(`
    INSERT INTO survey_responses (survey_id, email, name, interest, format, cost_reaction, travel, city, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(surveyId, email, name, clean.interest, clean.format, clean.cost_reaction, clean.travel, city, comments).run();

  return c.json({ success: true });
});

// ADMIN: overview counts + all responses
surveyRoutes.get('/:surveyId/summary', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const surveyId = c.req.param('surveyId');
  const db = c.env.DB;
  const counts: Record<string, Record<string, number>> = {};
  for (const field of Object.keys(GLOW_FIELDS)) {
    const rows = (await db.prepare(
      `SELECT ${field} as v, COUNT(*) as n FROM survey_responses WHERE survey_id = ? AND ${field} IS NOT NULL GROUP BY ${field}`
    ).bind(surveyId).all()).results || [];
    counts[field] = Object.fromEntries((rows as any[]).map(r => [r.v, r.n]));
  }
  const total = await db.prepare('SELECT COUNT(*) as n FROM survey_responses WHERE survey_id = ?').bind(surveyId).first<any>();
  const responses = (await db.prepare(
    'SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY created_at DESC LIMIT 2000'
  ).bind(surveyId).all()).results || [];
  return c.json({ success: true, data: { total: total?.n || 0, counts, responses } });
});
