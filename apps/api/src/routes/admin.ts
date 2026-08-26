import { Hono } from 'hono';
import type { Env } from '../types';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';
import { getResolvedFields } from '../lib/template-overrides';

// Internal admin tooling — used by Chad's Cowork/automation sessions.
// Auth: Bearer ADMIN_SQL_KEY (worker secret), NOT user JWTs.
// (Re-created 2026-08-26 after being lost between sessions; now committed.)
export const adminRoutes = new Hono<{ Bindings: Env }>();

function checkKey(c: any): boolean {
  const key = c.env.ADMIN_SQL_KEY;
  if (!key) return false;
  const auth = c.req.header('Authorization') || '';
  return auth === `Bearer ${key}`;
}

// Run a SQL statement against D1 (SELECT returns rows; writes return meta)
adminRoutes.post('/sql', async (c) => {
  if (!checkKey(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const body = await c.req.json<{ query?: string; params?: (string | number | null)[] }>().catch(() => ({} as any));
  if (!body.query || typeof body.query !== 'string') {
    return c.json({ success: false, error: 'query is required' }, 400);
  }
  try {
    const stmt = c.env.DB.prepare(body.query);
    const bound = body.params?.length ? stmt.bind(...body.params) : stmt;
    const result = await bound.all();
    return c.json({ success: true, results: result.results, meta: result.meta });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || String(err) }, 400);
  }
});

// Send a registration-confirmation email with custom event data (testing /
// manual resends). Accepts a list of recipients.
adminRoutes.post('/test-email', async (c) => {
  if (!checkKey(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const body = await c.req.json<{
    to?: string[]; teamName?: string; ageGroup?: string; eventName?: string;
    eventDate?: string; eventCity?: string; eventLogoUrl?: string;
    discountCode?: string; subject?: string;
  }>().catch(() => ({} as any));

  const recipients = (body.to || []).filter((e: string) => typeof e === 'string' && e.includes('@'));
  if (!recipients.length) return c.json({ success: false, error: 'to[] with at least one email is required' }, 400);

  const overrides = await getResolvedFields(c.env.DB, 'registration_confirmation').catch(() => ({} as any));
  if (body.subject) (overrides as any).subject = body.subject;

  const results: { to: string; success: boolean; error?: string }[] = [];
  for (const to of recipients) {
    const r = await sendRegistrationConfirmationEmail(c.env, {
      recipientEmail: to,
      recipientName: body.teamName || 'Coach',
      teamName: body.teamName || 'Test Team',
      ageGroup: body.ageGroup || 'Squirt',
      eventName: body.eventName || 'UHT Tournament',
      eventDate: body.eventDate || 'TBD',
      eventCity: body.eventCity || 'TBD',
      eventLogoUrl: body.eventLogoUrl || undefined,
      discountCode: body.discountCode || undefined,
      _overrides: overrides,
    } as any).catch((err: any) => ({ success: false, error: err?.message || String(err) }));
    results.push({ to, ...r });
  }
  return c.json({ success: results.every(r => r.success), results });
});
