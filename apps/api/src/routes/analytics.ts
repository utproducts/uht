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
