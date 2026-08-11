import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole, optionalAuth } from '../middleware/auth';

export const analyticsRoutes = new Hono<{ Bindings: Env }>();

// ==================
// Track user activity (called from frontend)
// ==================
const trackSchema = z.object({
  sessionId: z.string(),
  activityType: z.enum(['page_view', 'login', 'registration', 'action', 'session_heartbeat']),
  pagePath: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  durationSeconds: z.number().optional(),
});

analyticsRoutes.post('/track', optionalAuth, zValidator('json', trackSchema), async (c) => {
  const data = c.req.valid('json');
  const user = (c as any).get('user');
  const db = c.env.DB;

  const id = crypto.randomUUID().replace(/-/g, '');
  const userAgent = c.req.header('user-agent') || null;
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;

  await db.prepare(`
    INSERT INTO user_activity_log (id, user_id, session_id, activity_type, page_path, metadata, ip_address, user_agent, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    user?.id || null,
    data.sessionId,
    data.activityType,
    data.pagePath || null,
    data.metadata ? JSON.stringify(data.metadata) : null,
    ip,
    userAgent,
    data.durationSeconds || 0
  ).run();

  return c.json({ success: true });
});

// ==================
// Track batch activity (multiple events at once)
// ==================
analyticsRoutes.post('/track/batch', optionalAuth, async (c) => {
  const body = await c.req.json();
  const events = body.events || [];
  const user = (c as any).get('user');
  const db = c.env.DB;
  const userAgent = c.req.header('user-agent') || null;
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;

  for (const evt of events.slice(0, 50)) {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO user_activity_log (id, user_id, session_id, activity_type, page_path, metadata, ip_address, user_agent, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      user?.id || evt.userId || null,
      evt.sessionId || null,
      evt.activityType || 'page_view',
      evt.pagePath || null,
      evt.metadata ? JSON.stringify(evt.metadata) : null,
      ip,
      userAgent,
      evt.durationSeconds || 0
    ).run();
  }

  return c.json({ success: true });
});

// ==================
// ADMIN: Most Active Users Report
// ==================
analyticsRoutes.get('/reports/active-users', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { period, limit: limitParam } = c.req.query();

  // Default to last 30 days
  let dateFilter = "datetime('now', '-30 days')";
  if (period === '7d') dateFilter = "datetime('now', '-7 days')";
  else if (period === '90d') dateFilter = "datetime('now', '-90 days')";
  else if (period === 'all') dateFilter = "'2020-01-01'";

  const rowLimit = Math.min(parseInt(limitParam || '50'), 100);

  const result = await db.prepare(`
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      u.created_at as user_created_at,
      COALESCE(login_stats.login_count, 0) as login_count,
      COALESCE(login_stats.last_login, '') as last_login,
      COALESCE(page_stats.page_views, 0) as page_views,
      COALESCE(page_stats.unique_pages, 0) as unique_pages,
      COALESCE(time_stats.total_time_seconds, 0) as total_time_seconds,
      COALESCE(reg_stats.registration_count, 0) as registration_count,
      COALESCE(action_stats.action_count, 0) as action_count,
      (
        COALESCE(login_stats.login_count, 0) * 10 +
        COALESCE(page_stats.page_views, 0) * 1 +
        COALESCE(reg_stats.registration_count, 0) * 25 +
        COALESCE(action_stats.action_count, 0) * 5 +
        COALESCE(time_stats.total_time_seconds, 0) / 60
      ) as activity_score
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) as login_count, MAX(created_at) as last_login
      FROM user_activity_log
      WHERE activity_type = 'login' AND created_at >= ${dateFilter}
      GROUP BY user_id
    ) login_stats ON login_stats.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as page_views, COUNT(DISTINCT page_path) as unique_pages
      FROM user_activity_log
      WHERE activity_type = 'page_view' AND created_at >= ${dateFilter}
      GROUP BY user_id
    ) page_stats ON page_stats.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(duration_seconds) as total_time_seconds
      FROM user_activity_log
      WHERE activity_type = 'session_heartbeat' AND created_at >= ${dateFilter}
      GROUP BY user_id
    ) time_stats ON time_stats.user_id = u.id
    LEFT JOIN (
      SELECT registered_by as user_id, COUNT(*) as registration_count
      FROM registrations
      WHERE created_at >= ${dateFilter}
      GROUP BY registered_by
    ) reg_stats ON reg_stats.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as action_count
      FROM user_activity_log
      WHERE activity_type = 'action' AND created_at >= ${dateFilter}
      GROUP BY user_id
    ) action_stats ON action_stats.user_id = u.id
    WHERE (
      COALESCE(login_stats.login_count, 0) > 0 OR
      COALESCE(page_stats.page_views, 0) > 0 OR
      COALESCE(reg_stats.registration_count, 0) > 0
    )
    ORDER BY activity_score DESC
    LIMIT ?
  `).bind(rowLimit).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Activity summary stats
// ==================
analyticsRoutes.get('/reports/summary', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  const [totals, today, week, registrations] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(DISTINCT user_id) as total_users_tracked,
        COUNT(*) as total_events,
        COUNT(DISTINCT session_id) as total_sessions
      FROM user_activity_log
    `).first<any>(),
    db.prepare(`
      SELECT
        COUNT(DISTINCT user_id) as active_users,
        COUNT(*) as events,
        COUNT(DISTINCT session_id) as sessions
      FROM user_activity_log
      WHERE created_at >= datetime('now', '-1 day')
    `).first<any>(),
    db.prepare(`
      SELECT
        COUNT(DISTINCT user_id) as active_users,
        COUNT(*) as events,
        COUNT(DISTINCT session_id) as sessions
      FROM user_activity_log
      WHERE created_at >= datetime('now', '-7 days')
    `).first<any>(),
    db.prepare(`
      SELECT COUNT(*) as pending FROM registrations WHERE status = 'pending'
    `).first<any>(),
  ]);

  return c.json({
    success: true,
    data: {
      allTime: totals,
      today,
      thisWeek: week,
      pendingRegistrations: registrations?.pending || 0,
    },
  });
});

// ==================
// ADMIN: Pending registrations across ALL events
// ==================
analyticsRoutes.get('/reports/pending-registrations', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT r.*,
      t.name as team_name, t.age_group as team_age_group, t.city as team_city, t.state as team_state,
      t.head_coach_name, t.head_coach_email, t.head_coach_phone,
      ed.age_group as division_age_group, ed.division_level, ed.price_cents as division_price,
      ed.max_teams, ed.current_team_count,
      e.name as event_name, e.slug as event_slug, e.start_date, e.end_date, e.city as event_city, e.state as event_state,
      u.first_name as registered_by_first, u.last_name as registered_by_last, u.email as registered_by_email, u.phone as registered_by_phone,
      (SELECT COUNT(*) FROM registration_rosters rr WHERE rr.registration_id = r.id) as roster_count
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    JOIN events e ON e.id = r.event_id
    LEFT JOIN users u ON u.id = r.registered_by
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Teams by division (age group totals across all events)
// ==================
analyticsRoutes.get('/reports/division-totals', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT
      ed.age_group,
      SUM(ed.current_team_count) as total_teams,
      COUNT(DISTINCT ed.event_id) as event_count,
      SUM(ed.max_teams) as total_capacity
    FROM event_divisions ed
    JOIN events e ON e.id = ed.event_id
    WHERE e.status IN ('registration_open', 'active', 'published')
    GROUP BY ed.age_group
    ORDER BY total_teams DESC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Registration trends — month-over-month teams, approval status,
// states, and divisions across BOTH registration tables (last 12 months)
// ==================
analyticsRoutes.get('/reports/registration-trends', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  // Active registrations only — abandoned checkouts and dead rows excluded
  const [erRows, rRows] = await Promise.all([
    db.prepare(`
      SELECT strftime('%Y-%m', er.created_at) as month, er.status, er.age_group,
        COALESCE(NULLIF(TRIM(t.state), ''), '') as state
      FROM event_registrations er
      LEFT JOIN teams t ON t.id = er.team_id
      WHERE er.created_at >= date('now', '-12 months')
        AND er.status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')
    `).all(),
    db.prepare(`
      SELECT strftime('%Y-%m', r.created_at) as month, r.status,
        COALESCE(ed.age_group, t.age_group) as age_group,
        COALESCE(NULLIF(TRIM(t.state), ''), '') as state
      FROM registrations r
      LEFT JOIN teams t ON t.id = r.team_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      WHERE r.created_at >= date('now', '-12 months')
        AND r.status NOT IN ('rejected', 'withdrawn')
    `).all(),
  ]);

  const rows = [...(erRows.results || []), ...(rRows.results || [])] as Array<{
    month: string; status: string; age_group: string | null; state: string;
  }>;

  // Build the rolling 12-month axis (oldest -> current)
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const monthSet = new Set(months);

  // Normalize division to its age bucket ("Bantam (14U) ..." -> "14U")
  const normDivision = (ag: string | null): string => {
    if (!ag) return 'Other';
    const m = ag.match(/(\d{1,2})\s*U/i);
    return m ? `${m[1]}U` : ag.trim();
  };
  const normState = (s: string): string => {
    const t = (s || '').trim().toUpperCase();
    return t.length === 2 ? t : (t || 'Unknown');
  };

  const perMonth: Record<string, { total: number; approved: number; pending: number }> = {};
  for (const m of months) perMonth[m] = { total: 0, approved: 0, pending: 0 };
  const stateTotals: Record<string, number> = {};
  const divisionTotals: Record<string, number> = {};
  const statesByMonth: Record<string, Record<string, number>> = {};
  const divisionsByMonth: Record<string, Record<string, number>> = {};
  let total = 0, approved = 0, pending = 0;

  for (const row of rows) {
    if (!monthSet.has(row.month)) continue;
    const isApproved = row.status === 'approved';
    total++;
    if (isApproved) approved++; else pending++;

    const pm = perMonth[row.month];
    pm.total++;
    if (isApproved) pm.approved++; else pm.pending++;

    const st = normState(row.state);
    const dv = normDivision(row.age_group);
    stateTotals[st] = (stateTotals[st] || 0) + 1;
    divisionTotals[dv] = (divisionTotals[dv] || 0) + 1;
    (statesByMonth[row.month] ||= {})[st] = ((statesByMonth[row.month] ||= {})[st] || 0) + 1;
    (divisionsByMonth[row.month] ||= {})[dv] = ((divisionsByMonth[row.month] ||= {})[dv] || 0) + 1;
  }

  // Division order: numeric age ascending, non-numeric at the end
  const divisions = Object.entries(divisionTotals)
    .sort((a, b) => {
      const na = parseInt(a[0]), nb = parseInt(b[0]);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return b[1] - a[1];
    })
    .map(([division, count]) => ({ division, count }));

  const states = Object.entries(stateTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([state, count]) => ({ state, count }));

  return c.json({
    success: true,
    data: {
      months,
      totals: { total, approved, pending },
      perMonth: months.map(m => ({ month: m, ...perMonth[m] })),
      states,
      divisions,
      statesByMonth,
      divisionsByMonth,
    },
  });
});

// ==================
// ADMIN: Season comparison — approved teams by month, this season computed
// live vs prior-season benchmarks imported from the old Airtable tracker.
// Seasons run June (month 6) through May (month 5).
// ==================
analyticsRoutes.get('/reports/season-comparison', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  // Current season boundaries (June 1 -> May 31)
  const now = new Date();
  const seasonStartYear = now.getUTCMonth() + 1 >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const currentSeason = `${seasonStartYear}-${seasonStartYear + 1}`;
  const seasonStart = `${seasonStartYear}-06-01`;

  const [benchmarks, erApproved, rApproved, pendingCount] = await Promise.all([
    db.prepare('SELECT season, month, approved FROM season_benchmarks ORDER BY season, month').all(),
    db.prepare(`
      SELECT CAST(strftime('%m', created_at) AS INTEGER) as month, COUNT(*) as n
      FROM event_registrations
      WHERE created_at >= ? AND status = 'approved'
      GROUP BY month
    `).bind(seasonStart).all(),
    db.prepare(`
      SELECT CAST(strftime('%m', created_at) AS INTEGER) as month, COUNT(*) as n
      FROM registrations
      WHERE created_at >= ? AND status = 'approved'
      GROUP BY month
    `).bind(seasonStart).all(),
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM event_registrations WHERE created_at >= ? AND status NOT IN ('approved','denied','rejected','withdrawn','awaiting_payment')) +
        (SELECT COUNT(*) FROM registrations WHERE created_at >= ? AND status NOT IN ('approved','rejected','withdrawn')) as n
    `).bind(seasonStart, seasonStart).first<{ n: number }>(),
  ]);

  // Prior seasons from benchmarks: { '2025-2026': { total, months: {6: 2, ...} } }
  const priorSeasons: Record<string, { total: number | null; months: Record<number, number> }> = {};
  for (const row of (benchmarks.results || []) as any[]) {
    const s = (priorSeasons[row.season] ||= { total: null, months: {} });
    if (row.month === 0) s.total = row.approved;
    else s.months[row.month] = row.approved;
  }

  // Current season live months
  const currentMonths: Record<number, number> = {};
  for (const row of [...(erApproved.results || []), ...(rApproved.results || [])] as any[]) {
    currentMonths[row.month] = (currentMonths[row.month] || 0) + row.n;
  }
  const currentTotal = Object.values(currentMonths).reduce((s, v) => s + v, 0);

  const seasons = [
    ...Object.keys(priorSeasons).sort().map(season => ({
      season,
      total: priorSeasons[season].total,
      months: priorSeasons[season].months,
      current: false,
    })),
    { season: currentSeason, total: currentTotal, months: currentMonths, current: true },
  ];

  return c.json({
    success: true,
    data: { seasons, awaitingApproval: pendingCount?.n || 0 },
  });
});

// ==================
// ADMIN: User activity detail (for clicking into a specific user)
// ==================
analyticsRoutes.get('/reports/user/:userId/activity', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const userId = c.req.param('userId');
  const db = c.env.DB;

  const [user, activity, registrations] = await Promise.all([
    db.prepare('SELECT id, first_name, last_name, email, phone, created_at FROM users WHERE id = ?').bind(userId).first(),
    db.prepare(`
      SELECT activity_type, page_path, metadata, duration_seconds, created_at
      FROM user_activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(userId).all(),
    db.prepare(`
      SELECT r.id, r.status, r.created_at,
        e.name as event_name, ed.age_group, ed.division_level, t.name as team_name
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      JOIN event_divisions ed ON ed.id = r.event_division_id
      JOIN teams t ON t.id = r.team_id
      WHERE r.registered_by = ?
      ORDER BY r.created_at DESC
    `).bind(userId).all(),
  ]);

  return c.json({
    success: true,
    data: {
      user,
      recentActivity: activity.results,
      registrations: registrations.results,
    },
  });
});
