import { Hono } from 'hono';
import type { Env } from '../types';

const adminRoutes = new Hono<{ Bindings: Env }>();

// Admin SQL endpoint — secured by JWT_SECRET as bearer token
// This allows Claude sessions to run DB queries without Cloudflare dashboard access
adminRoutes.post('/sql', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  // Accept either ADMIN_SQL_KEY (dedicated) or JWT_SECRET (fallback)
  const validKey = c.env.ADMIN_SQL_KEY || c.env.JWT_SECRET;
  if (!token || token !== validKey) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { query, params } = body as { query?: string; params?: any[] };

  if (!query) {
    return c.json({ success: false, error: 'Query is required' }, 400);
  }

  // Block dangerous operations
  const upper = query.toUpperCase().trim();
  if (upper.startsWith('DROP') || upper.startsWith('ALTER') || upper.startsWith('TRUNCATE')) {
    return c.json({ success: false, error: 'DROP/ALTER/TRUNCATE not allowed via this endpoint' }, 403);
  }

  try {
    const isRead = upper.startsWith('SELECT') || upper.startsWith('PRAGMA');

    if (isRead) {
      const stmt = params && params.length > 0
        ? c.env.DB.prepare(query).bind(...params)
        : c.env.DB.prepare(query);
      const result = await stmt.all();
      return c.json({ success: true, data: result.results, meta: { rows: result.results?.length || 0 } });
    } else {
      const stmt = params && params.length > 0
        ? c.env.DB.prepare(query).bind(...params)
        : c.env.DB.prepare(query);
      const result = await stmt.run();
      return c.json({ success: true, data: { changes: result.meta?.changes || 0 }, meta: result.meta });
    }
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export { adminRoutes };
