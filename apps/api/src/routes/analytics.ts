import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole, optionalAuth, isDataRestricted } from '../middleware/auth';

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

  // user_activity_log is 5M+ rows and this report runs four GROUP BY
  // subqueries over it - cache per period/limit so repeated dashboard
  // opens don't overload D1 (outage 11/11)
  const cacheKey = `analytics:active-users:${period || '30d'}:${rowLimit}`;
  try {
    const cached = await c.env.SESSIONS.get(cacheKey, 'json');
    if (cached) return c.json({ success: true, data: cached, cached: true });
  } catch {}

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

  try { await c.env.SESSIONS.put(cacheKey, JSON.stringify(result.results), { expirationTtl: 300 }); } catch {}
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Activity summary stats
// ==================
analyticsRoutes.get('/reports/summary', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  // Full-table COUNT(DISTINCT) over 5M+ activity rows took down D1 when
  // several admins had dashboards open (outage 11/11): cache the whole
  // summary for 5 minutes, and the slow-moving all-time block for 6 hours.
  try {
    const cached = await c.env.SESSIONS.get('analytics:summary', 'json');
    if (cached) return c.json({ success: true, data: cached, cached: true });
  } catch {}

  let totalsCached: any = null;
  try { totalsCached = await c.env.SESSIONS.get('analytics:summary:alltime', 'json'); } catch {}

  const [totals, today, week, registrations] = await Promise.all([
    totalsCached ? Promise.resolve(totalsCached) : db.prepare(`
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
        AND event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
    `).first<any>(),
  ]);

  const data = {
    allTime: totals,
    today,
    thisWeek: week,
    pendingRegistrations: registrations?.pending || 0,
  };
  try {
    await c.env.SESSIONS.put('analytics:summary', JSON.stringify(data), { expirationTtl: 300 });
    if (!totalsCached && totals) await c.env.SESSIONS.put('analytics:summary:alltime', JSON.stringify(totals), { expirationTtl: 21600 });
  } catch {}

  return c.json({ success: true, data });
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
        AND r.event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
    ORDER BY r.created_at ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Teams by division (age group totals across all events)
// ==================
analyticsRoutes.get('/reports/division-totals', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  // Normalize any age_group spelling into its classification bucket.
  // Midget/16U/18U checked first so '18U' is never caught by the '8U' mite test.
  const norm = (ag: string | null | undefined): string => {
    const s = (ag || '').toLowerCase();
    if (/midget|16u|18u|high school/.test(s)) return 'Midget (16U/18U)';
    if (/bantam|14u/.test(s)) return 'Bantam (14U)';
    if (/pee\s*wee|peewee|12u/.test(s)) return 'Pee Wee (12U)';
    if (/squirt|10u/.test(s)) return 'Squirt (10U)';
    if (/mite|8u/.test(s)) return 'Mite (8U)';
    return (ag || '').trim() || 'Other';
  };
  const BUCKET_ORDER = ['Mite (8U)', 'Squirt (10U)', 'Pee Wee (12U)', 'Bantam (14U)', 'Midget (16U/18U)'];

  const eventFilter = `e.status IN ('registration_open', 'active', 'published') AND COALESCE(e.is_test, 0) = 0`;

  // Actual registered teams from BOTH registration tables (current_team_count is stale)
  const [erRows, rRows, capRows] = await Promise.all([
    db.prepare(`
      SELECT er.age_group as ag, er.event_id, LOWER(TRIM(COALESCE(er.team_name,''))) as tname
      FROM event_registrations er JOIN events e ON e.id = er.event_id
      WHERE ${eventFilter} AND er.status NOT IN ('denied','rejected','withdrawn','awaiting_payment')
    `).all(),
    db.prepare(`
      SELECT COALESCE(ed.age_group, t.age_group) as ag, r.event_id, LOWER(TRIM(COALESCE(t.name,''))) as tname
      FROM registrations r JOIN events e ON e.id = r.event_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      LEFT JOIN teams t ON t.id = r.team_id
      WHERE ${eventFilter} AND r.status NOT IN ('denied','rejected','withdrawn')
        AND r.event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
    `).all(),
    db.prepare(`
      SELECT ed.age_group as ag, ed.event_id, ed.max_teams
      FROM event_divisions ed JOIN events e ON e.id = ed.event_id
      WHERE ${eventFilter}
    `).all(),
  ]);

  const buckets: Record<string, { total_teams: number; events: Set<string>; total_capacity: number }> = {};
  const bucketOf = (ag: any) => {
    const key = norm(ag);
    if (!buckets[key]) buckets[key] = { total_teams: 0, events: new Set(), total_capacity: 0 };
    return buckets[key];
  };

  // Dedupe teams that appear in both registration tables for the same event
  const seen = new Set<string>();
  for (const row of [...(erRows.results || []), ...(rRows.results || [])] as any[]) {
    const dedupeKey = row.tname ? `${row.event_id}|${row.tname}` : `uniq|${Math.random()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const b = bucketOf(row.ag);
    b.total_teams += 1;
    b.events.add(row.event_id);
  }
  for (const row of (capRows.results || []) as any[]) {
    bucketOf(row.ag).total_capacity += row.max_teams || 0;
  }

  const data = Object.entries(buckets)
    .map(([age_group, b]) => ({
      age_group,
      total_teams: b.total_teams,
      event_count: b.events.size,
      total_capacity: b.total_capacity,
    }))
    .filter(d => d.total_teams > 0 || d.total_capacity > 0)
    .sort((a, b2) => {
      const ia = BUCKET_ORDER.indexOf(a.age_group); const ib = BUCKET_ORDER.indexOf(b2.age_group);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b2.total_teams - a.total_teams;
    });

  return c.json({ success: true, data });
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
        AND er.event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
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
        AND r.event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
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

  // Current season counts ALL active registrations (a team that registered counts
  // immediately, before admin approval) — matches how the team thinks about
  // monthly numbers. Historical Airtable benchmarks are end-of-season approved
  // counts, which equal total registrations since everything gets approved.
  const [benchmarks, erActive, rActive, erApproved, rApproved] = await Promise.all([
    db.prepare('SELECT season, month, approved FROM season_benchmarks ORDER BY season, month').all(),
    db.prepare(`
      SELECT CAST(strftime('%m', created_at) AS INTEGER) as month, COUNT(*) as n
      FROM event_registrations
      WHERE created_at >= ? AND status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')
        AND event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
      GROUP BY month
    `).bind(seasonStart).all(),
    db.prepare(`
      SELECT CAST(strftime('%m', created_at) AS INTEGER) as month, COUNT(*) as n
      FROM registrations
      WHERE created_at >= ? AND status NOT IN ('rejected', 'withdrawn')
        AND event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
      GROUP BY month
    `).bind(seasonStart).all(),
    db.prepare(`
      SELECT CAST(strftime('%m', created_at) AS INTEGER) as month, COUNT(*) as n
      FROM event_registrations
      WHERE created_at >= ? AND status = 'approved'
        AND event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
      GROUP BY month
    `).bind(seasonStart).all(),
    db.prepare(`
      SELECT CAST(strftime('%m', created_at) AS INTEGER) as month, COUNT(*) as n
      FROM registrations
      WHERE created_at >= ? AND status = 'approved'
        AND event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
      GROUP BY month
    `).bind(seasonStart).all(),
  ]);

  // Prior seasons from benchmarks: { '2025-2026': { total, months: {6: 2, ...} } }
  const priorSeasons: Record<string, { total: number | null; months: Record<number, number> }> = {};
  for (const row of (benchmarks.results || []) as any[]) {
    const s = (priorSeasons[row.season] ||= { total: null, months: {} });
    if (row.month === 0) s.total = row.approved;
    else s.months[row.month] = row.approved;
  }

  // Current season live months (registered + how many of those are approved)
  const currentMonths: Record<number, number> = {};
  for (const row of [...(erActive.results || []), ...(rActive.results || [])] as any[]) {
    currentMonths[row.month] = (currentMonths[row.month] || 0) + row.n;
  }
  const approvedMonths: Record<number, number> = {};
  for (const row of [...(erApproved.results || []), ...(rApproved.results || [])] as any[]) {
    approvedMonths[row.month] = (approvedMonths[row.month] || 0) + row.n;
  }
  const currentTotal = Object.values(currentMonths).reduce((s, v) => s + v, 0);
  const approvedTotal = Object.values(approvedMonths).reduce((s, v) => s + v, 0);

  const seasons = [
    ...Object.keys(priorSeasons).sort().map(season => ({
      season,
      total: priorSeasons[season].total,
      months: priorSeasons[season].months,
      current: false,
    })),
    { season: currentSeason, total: currentTotal, months: currentMonths, approvedMonths, approvedTotal, current: true },
  ];

  return c.json({
    success: true,
    data: { seasons, approvedThisSeason: approvedTotal },
  });
});

// ==================
// ADMIN: Month drill-down — day-by-day team registrations for one calendar
// month, this season (live tables) beside last season (legacy_registrations,
// pulled from the old Airtable tracker, dated by Approved At in Central time),
// so staff can eyeball who registered when.
// ==================
analyticsRoutes.get('/reports/month-detail/:month', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const month = parseInt(c.req.param('month') || '', 10);
  if (!month || month < 1 || month > 12) {
    return c.json({ success: false, error: 'month must be 1-12' }, 400);
  }
  const db = c.env.DB;
  const restricted = await isDataRestricted(c);

  // Seasons run June -> May; place this calendar month in the current season
  const now = new Date();
  const seasonStartYear = now.getUTCMonth() + 1 >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const thisYear = month >= 6 ? seasonStartYear : seasonStartYear + 1;
  const lastYear = thisYear - 1;
  const range = (y: number): [string, string] => {
    const mm = String(month).padStart(2, '0');
    const end = month === 12 ? `${y + 1}-01-01` : `${y}-${String(month + 1).padStart(2, '0')}-01`;
    return [`${y}-${mm}-01`, end];
  };
  const [curFrom, curTo] = range(thisYear);
  const [prevFrom, prevTo] = range(lastYear);

  const [erRows, rRows, legacyRows] = await Promise.all([
    db.prepare(`
      SELECT substr(er.created_at, 1, 10) as day, er.team_name, er.age_group, er.division,
             er.status, LOWER(COALESCE(NULLIF(er.email1, ''), er.coach_email)) as email,
             e.name as event_name, tm.state as state
      FROM event_registrations er JOIN events e ON e.id = er.event_id
      LEFT JOIN teams tm ON tm.id = er.team_id
      WHERE er.created_at >= ? AND er.created_at < ?
        AND er.status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')
        AND COALESCE(e.is_test, 0) = 0
      ORDER BY er.created_at
    `).bind(curFrom, curTo).all(),
    db.prepare(`
      SELECT substr(r.created_at, 1, 10) as day, t.name as team_name, ed.age_group,
             ed.division_level as division, r.status, NULL as email, e.name as event_name, t.state as state
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      LEFT JOIN teams t ON t.id = r.team_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      WHERE r.created_at >= ? AND r.created_at < ?
        AND r.status NOT IN ('rejected', 'withdrawn')
        AND COALESCE(e.is_test, 0) = 0
      ORDER BY r.created_at
    `).bind(curFrom, curTo).all(),
    db.prepare(`
      SELECT approved_on as day, team_name, event_name, division, email, state
      FROM legacy_registrations
      WHERE status = 'approved' AND approved_on >= ? AND approved_on < ?
      ORDER BY approved_on
    `).bind(prevFrom, prevTo).all(),
  ]);

  // Team profiles store anything from "IL" to "Illinois" — fold both seasons
  // onto 2-letter codes so the state report groups cleanly
  const STATE_CODES: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC' };
  const normState = (s: string | null | undefined): string => {
    const v = (s || '').trim();
    if (!v) return '';
    if (v.length <= 3) return v.toUpperCase().replace(/\./g, '').slice(0, 2);
    return STATE_CODES[v.toLowerCase()] || v.slice(0, 20);
  };

  // This season: one row per registration, grouped by day
  const curByDay = new Map<string, any[]>();
  for (const r of [...(erRows.results || []), ...(rRows.results || [])] as any[]) {
    const list = curByDay.get(r.day) || [];
    list.push({
      team_name: r.team_name || 'Unknown team',
      event_name: r.event_name,
      division: [r.age_group, r.division].filter(Boolean).join(' '),
      status: r.status,
      state: normState(r.state),
      ...(restricted ? {} : { email: r.email || null }),
    });
    curByDay.set(r.day, list);
  }

  // Last season: one row per team registration from the old Airtable tracker,
  // dated by when it was approved (matches the monthly benchmark basis)
  const prevByDay = new Map<string, any[]>();
  for (const r of (legacyRows.results || []) as any[]) {
    if (!r.team_name || !r.day) continue;
    const list = prevByDay.get(r.day) || [];
    list.push({
      team_name: r.team_name,
      event_name: r.event_name,
      division: r.division || undefined,
      state: normState(r.state),
      ...(restricted ? {} : { email: r.email || null }),
    });
    prevByDay.set(r.day, list);
  }

  const toDays = (m: Map<string, any[]>) =>
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, teams]) => ({ day, teams }));

  const curDays = toDays(curByDay);
  const prevDays = toDays(prevByDay);

  return c.json({
    success: true,
    data: {
      month,
      this_year: thisYear,
      last_year: lastYear,
      this_season: { days: curDays, total: curDays.reduce((n, d) => n + d.teams.length, 0) },
      last_season: {
        days: prevDays,
        total: prevDays.reduce((n, d) => n + d.teams.length, 0),
      },
    },
  });
});

// ==================
// ADMIN: Schedule health — scans current/upcoming events for schedule-data
// problems like the Northwoods 2026 one (games linked to the wrong team with
// a same-name coach, so check-in popped the wrong roster). Red = fix before
// game day; amber = look at it.
// ==================
analyticsRoutes.get('/reports/schedule-health', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const EVENT_FILTER = `COALESCE(e.is_test,0)=0 AND e.status NOT IN ('cancelled','draft') AND date(COALESCE(e.end_date,e.start_date)) >= date('now')`;
  const sideSelect = (side: 'home' | 'away') => `
    SELECT e.id as event_id, e.name as event_name, e.start_date, g.id as game_id, g.start_time, g.game_type,
      ged.age_group as game_age, ged.division_level as game_level,
      t.id as team_id, t.name as team_name, vr.name as rink_name, v.name as venue_name,
      er.id as reg_id, red.age_group as reg_age, red.division_level as reg_level
    FROM games g
    JOIN events e ON e.id = g.event_id
    JOIN event_divisions ged ON ged.id = g.event_division_id
    JOIN teams t ON t.id = g.${side}_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = vr.venue_id
    LEFT JOIN event_registrations er ON er.event_id = g.event_id AND er.team_id = t.id AND er.status = 'approved'
    LEFT JOIN event_divisions red ON red.id = er.event_division_id
    WHERE ${EVENT_FILTER}`;

  const [sidesQ, missingQ, regsQ] = await Promise.all([
    db.prepare(`${sideSelect('home')} UNION ALL ${sideSelect('away')}`).all(),
    db.prepare(`
      SELECT e.id as event_id, e.name as event_name, e.start_date, g.start_time,
        ged.age_group as game_age, ged.division_level as game_level,
        vr.name as rink_name, v.name as venue_name,
        ht.name as home_name, at2.name as away_name
      FROM games g JOIN events e ON e.id = g.event_id
      JOIN event_divisions ged ON ged.id = g.event_division_id
      LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
      LEFT JOIN venues v ON v.id = vr.venue_id
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at2 ON at2.id = g.away_team_id
      WHERE ${EVENT_FILTER} AND g.game_type = 'pool' AND (g.home_team_id IS NULL OR g.away_team_id IS NULL)
    `).all(),
    db.prepare(`
      SELECT e.id as event_id, e.name as event_name, e.start_date, er.team_id, er.team_name,
        (SELECT COUNT(*) FROM games g2 WHERE g2.event_division_id = er.event_division_id) as division_games
      FROM event_registrations er JOIN events e ON e.id = er.event_id
      WHERE ${EVENT_FILTER} AND er.status = 'approved' AND er.team_id IS NOT NULL AND er.event_division_id IS NOT NULL
    `).all(),
  ]);

  const sides = (sidesQ.results || []) as any[];
  type Issue = { severity: 'red' | 'amber'; type: string; message: string };
  const byEvent = new Map<string, { event_name: string; start_date: string; issues: Issue[] }>();
  const add = (event_id: string, event_name: string, start_date: string, issue: Issue) => {
    const ev = byEvent.get(event_id) || { event_name, start_date, issues: [] };
    ev.issues.push(issue);
    byEvent.set(event_id, ev);
  };
  // "Fri 11/20 6:00 PM · Rink 1 (Breaker Ice Arena)" — enough to walk straight
  // to the game in the Schedule Builder and fix it
  const fmtGame = (startTime: string, rink?: string | null, venue?: string | null) => {
    if (!startTime) return '';
    const d = new Date(startTime.replace(' ', 'T'));
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    let h = d.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const when = `${wd} ${d.getMonth() + 1}/${d.getDate()} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
    const where = rink ? ` · ${rink}${venue ? ` (${venue})` : ''}` : '';
    return when + where;
  };

  // 1. Team's games are in a different division than its registration — the
  //    wrong-roster bug. One line per team, listing every game to fix.
  // 2. Team in the schedule with no approved registration.
  const wrongDiv = new Map<string, { r: any; severity: 'red' | 'amber'; games: string[] }>();
  const noReg = new Map<string, { r: any; games: string[] }>();
  for (const r of sides) {
    if (r.reg_id) {
      const ageBad = r.reg_age && r.game_age && r.reg_age !== r.game_age;
      const levelBad = !ageBad && r.reg_level && r.game_level && r.reg_level !== r.game_level;
      if (ageBad || levelBad) {
        const key = `${r.event_id}|${r.team_id}|${r.game_age}|${r.game_level}`;
        const entry = wrongDiv.get(key) || { r, severity: ageBad ? 'red' as const : 'amber' as const, games: [] };
        entry.games.push(fmtGame(r.start_time, r.rink_name, r.venue_name));
        wrongDiv.set(key, entry);
      }
    } else {
      const key = `${r.event_id}|${r.team_id}`;
      const entry = noReg.get(key) || { r, games: [] };
      entry.games.push(fmtGame(r.start_time, r.rink_name, r.venue_name));
      noReg.set(key, entry);
    }
  }
  for (const { r, severity, games } of wrongDiv.values()) {
    add(r.event_id, r.event_name, r.start_date, {
      severity, type: 'wrong_division',
      message: `${r.team_name} is registered in ${[r.reg_age, r.reg_level].filter(Boolean).join(' ')} but its games are in ${[r.game_age, r.game_level].filter(Boolean).join(' ')} — check the team link on: ${games.sort().join('; ')}`,
    });
  }
  for (const { r, games } of noReg.values()) {
    add(r.event_id, r.event_name, r.start_date, {
      severity: 'amber', type: 'not_registered',
      message: `${r.team_name} has no approved registration but plays: ${games.sort().join('; ')}`,
    });
  }

  // 3. Same team on both sides of a game; 4. two games too close together
  const byGame = new Map<string, any[]>();
  for (const r of sides) {
    const list = byGame.get(r.game_id) || []; list.push(r); byGame.set(r.game_id, list);
  }
  for (const list of byGame.values()) {
    if (list.length === 2 && list[0].team_id === list[1].team_id) {
      add(list[0].event_id, list[0].event_name, list[0].start_date, {
        severity: 'red', type: 'self_game',
        message: `${list[0].team_name} is listed as both teams in the ${fmtGame(list[0].start_time, list[0].rink_name, list[0].venue_name)} game`,
      });
    }
  }
  const teamTimes = new Map<string, { r: any; times: Map<string, any> }>();
  for (const r of sides) {
    const key = `${r.event_id}|${r.team_id}`;
    const t = teamTimes.get(key) || { r, times: new Map<string, any>() };
    t.times.set(r.start_time, r); teamTimes.set(key, t);
  }
  for (const { r, times } of teamTimes.values()) {
    const ts = [...times.keys()].sort();
    for (let i = 1; i < ts.length; i++) {
      const gapMin = (new Date(ts[i].replace(' ', 'T')).getTime() - new Date(ts[i - 1].replace(' ', 'T')).getTime()) / 60000;
      if (gapMin < 75) {
        const a = times.get(ts[i - 1]); const b = times.get(ts[i]);
        add(r.event_id, r.event_name, r.start_date, {
          severity: gapMin < 50 ? 'red' : 'amber', type: 'tight_turnaround',
          message: `${r.team_name} plays ${fmtGame(ts[i - 1], a.rink_name, a.venue_name)} and then ${fmtGame(ts[i], b.rink_name, b.venue_name)} — only ${Math.round(gapMin)} minutes apart`,
        });
      }
    }
  }

  // 5. Pool games missing a team
  for (const r of (missingQ.results || []) as any[]) {
    const have = r.home_name || r.away_name;
    add(r.event_id, r.event_name, r.start_date, {
      severity: 'amber', type: 'missing_team',
      message: `${[r.game_age, r.game_level].filter(Boolean).join(' ')} pool game ${fmtGame(r.start_time, r.rink_name, r.venue_name)} is missing a team${have ? ` (${r.home_name ? 'away' : 'home'} side open, other team is ${have})` : ' (both sides open)'}`,
    });
  }

  // 6. Approved team with zero games while its division is scheduled — how
  //    the Northwoods mislink looked from the orphaned team's side
  const scheduledTeams = new Set(sides.map(r => `${r.event_id}|${r.team_id}`));
  for (const r of (regsQ.results || []) as any[]) {
    if (r.division_games > 0 && !scheduledTeams.has(`${r.event_id}|${r.team_id}`)) {
      add(r.event_id, r.event_name, r.start_date, {
        severity: 'red', type: 'zero_games',
        message: `${r.team_name} is approved and its division has games, but the team is not in any of them`,
      });
    }
  }

  const events = [...byEvent.entries()]
    .map(([event_id, ev]) => ({
      event_id, event_name: ev.event_name, start_date: ev.start_date,
      issues: ev.issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1)),
    }))
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

  return c.json({
    success: true,
    data: { events, games_checked: byGame.size + ((missingQ.results || []) as any[]).length },
  });
});

// ==================
// ADMIN: Lights Out page traffic — the "told you so" tile for the overview
// ==================
analyticsRoutes.get('/reports/lights-out-stats', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT COUNT(*) as views,
      COUNT(DISTINCT session_id) as visitors,
      SUM(created_at >= datetime('now', '-7 days')) as views_7d
    FROM user_activity_log
    WHERE activity_type = 'page_view' AND page_path LIKE '/lights-out%'
  `).first<any>();
  const regs = await c.env.DB.prepare(
    `SELECT COUNT(*) as n, SUM(COALESCE(amount_paid_cents, 0) > 0) as paid FROM lights_out_registrations`
  ).first<any>();
  return c.json({
    success: true,
    data: {
      views: row?.views || 0,
      visitors: row?.visitors || 0,
      views_7d: row?.views_7d || 0,
      registrations: regs?.n || 0,
      paid_registrations: regs?.paid || 0,
    },
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
        AND r.event_id NOT IN (SELECT id FROM events WHERE COALESCE(is_test, 0) = 1)
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

// ─── Team map: where this season's teams come from ───────────────────
// City coordinates come from city_geocodes (one-time Nominatim pass);
// cities we cannot place fall back to nothing and are listed separately.
analyticsRoutes.get('/reports/team-map', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const rows = (await db.prepare(`
    SELECT LOWER(TRIM(t.city)) as city, UPPER(SUBSTR(TRIM(t.state),1,2)) as state, COUNT(DISTINCT t.id) as teams
    FROM teams t WHERE COALESCE(t.city,'') != '' AND COALESCE(t.state,'') != ''
      AND t.id IN (
        SELECT er.team_id FROM event_registrations er JOIN events e ON e.id = er.event_id
        WHERE e.status NOT IN ('cancelled','draft') AND date(COALESCE(e.end_date, e.start_date)) >= date('2026-06-01')
          AND er.status = 'approved' AND er.team_id IS NOT NULL
        UNION
        SELECT r.team_id FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE e.status NOT IN ('cancelled','draft') AND date(COALESCE(e.end_date, e.start_date)) >= date('2026-06-01')
          AND r.status = 'approved' AND r.team_id IS NOT NULL
      )
    GROUP BY 1, 2
  `).all()).results as any[] || [];

  const norm = (city: string) => city.replace(/[.,]/g, '').replace(/^saint /, 'st ').replace(/\s+/g, ' ').trim();
  const agg = new Map<string, { city: string; state: string; teams: number }>();
  for (const r of rows) {
    const key = `${norm(r.city)}|${r.state}`;
    const cur = agg.get(key) || { city: norm(r.city), state: r.state, teams: 0 };
    cur.teams += r.teams;
    agg.set(key, cur);
  }

  const geo = (await db.prepare('SELECT city_key, lat, lng FROM city_geocodes').all()).results as any[] || [];
  const geoMap = new Map(geo.map((g: any) => [g.city_key, g]));

  const placed: any[] = [];
  const unplaced: any[] = [];
  for (const [key, v] of agg.entries()) {
    const g = geoMap.get(key);
    if (g) placed.push({ ...v, lat: g.lat, lng: g.lng });
    else unplaced.push(v);
  }
  placed.sort((a, b) => b.teams - a.teams);
  unplaced.sort((a, b) => b.teams - a.teams);

  const byState = new Map<string, number>();
  for (const v of agg.values()) byState.set(v.state, (byState.get(v.state) || 0) + v.teams);
  const states = Array.from(byState.entries()).map(([state, teams]) => ({ state, teams })).sort((a, b) => b.teams - a.teams);

  return c.json({ success: true, data: { cities: placed, unplaced, states, total: Array.from(agg.values()).reduce((n, v) => n + v.teams, 0) } });
});

// ==================
// ADMIN: Marketing dashboard — re-engagement campaign performance.
// Cohorts are keyed by the day each contact got email 1, so day-of-week
// open/click/redeem comparisons fall straight out of the table.
// ==================
analyticsRoutes.get('/reports/marketing', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const CIDS = ['reengage2026e1', 'reengage2026e2', 'reengage2026e3'];

  const [campaigns, statuses, cohorts, daily, redemptions, recent, cityDrip, audienceCount, e2due, e3due, pendingE1, couponPending, couponCampaign] = await Promise.all([
    db.prepare(`SELECT id, name, total_sent, total_delivered, total_opened, total_clicked FROM email_campaigns WHERE id IN ('reengage2026e1','reengage2026e2','reengage2026e3') ORDER BY id`).all(),
    db.prepare('SELECT status, COUNT(*) as n FROM reengagement_targets GROUP BY status').all(),
    db.prepare(`
      SELECT date(e1_sent_at) as day, COUNT(*) as cohort_size,
        SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) as redeemed,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN e2_sent_at IS NOT NULL THEN 1 ELSE 0 END) as got_e2,
        SUM(CASE WHEN e3_sent_at IS NOT NULL THEN 1 ELSE 0 END) as got_e3
      FROM reengagement_targets WHERE e1_sent_at IS NOT NULL
      GROUP BY day ORDER BY day
    `).all(),
    db.prepare(`
      SELECT campaign_id, date(created_at) as day, COUNT(*) as sent,
        SUM(CASE WHEN status IN ('opened','clicked') THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
      FROM email_sends WHERE campaign_id IN ('reengage2026e1','reengage2026e2','reengage2026e3')
      GROUP BY campaign_id, day ORDER BY day
    `).all(),
    db.prepare(`
      SELECT dc.code, dc.team_name, dc.used_at,
        COALESCE(er.payment_amount_cents, r.amount_cents, 0) as amount_cents,
        COALESCE(er.team_name, dc.team_name) as reg_team
      FROM discount_codes dc
      LEFT JOIN event_registrations er ON er.id = dc.used_registration_id
      LEFT JOIN registrations r ON r.id = dc.used_registration_id
      WHERE dc.event_id = 'reengagement-2026-27' AND dc.is_used = 1
      ORDER BY dc.used_at DESC
    `).all(),
    db.prepare(`
      SELECT es.campaign_id, es.status, es.created_at, es.opened_at, c2.email
      FROM email_sends es LEFT JOIN contacts c2 ON c2.id = es.contact_id
      WHERE es.campaign_id IN ('reengage2026e1','reengage2026e2','reengage2026e3')
      ORDER BY es.created_at DESC LIMIT 25
    `).all(),
    db.prepare(`
      SELECT id, name, subject, status, scheduled_at, sent_at, total_sent, total_delivered, total_opened, total_clicked
      FROM email_campaigns WHERE template_type = 'city_drip' ORDER BY scheduled_at
    `).all(),
    // Live city-drip audience count — mirrors the event_participants scope
    // in email.ts (every event/app email, 7+ days old, not unsubscribed)
    // D1 caps compound SELECTs at 5 terms — hence the two nested 3-term unions
    db.prepare(`
      SELECT COUNT(DISTINCT email) as n FROM (
        SELECT email FROM (
          SELECT LOWER(TRIM(er.email1)) as email FROM event_registrations er WHERE er.email1 LIKE '%_@_%' AND er.created_at <= datetime('now','-7 days')
          UNION ALL SELECT LOWER(TRIM(er.email2)) FROM event_registrations er WHERE er.email2 LIKE '%_@_%' AND er.created_at <= datetime('now','-7 days')
          UNION ALL SELECT LOWER(TRIM(er.coach_email)) FROM event_registrations er WHERE er.coach_email LIKE '%_@_%' AND er.created_at <= datetime('now','-7 days')
        )
        UNION ALL
        SELECT email FROM (
          SELECT LOWER(TRIM(u.email)) as email FROM users u WHERE u.is_active = 1 AND u.email LIKE '%_@_%' AND u.email NOT LIKE '%@system.internal' AND u.created_at <= datetime('now','-7 days')
          UNION ALL SELECT LOWER(TRIM(ltc.email)) FROM legacy_team_contacts ltc WHERE ltc.email LIKE '%_@_%'
          UNION ALL SELECT LOWER(TRIM(c.email)) FROM contacts c WHERE c.source IN ('registration','players_2025_26','airtable_regs','reengagement') AND c.email LIKE '%_@_%' AND c.created_at <= datetime('now','-7 days')
        )
      ) p WHERE email NOT IN (SELECT LOWER(email) FROM contacts WHERE is_subscribed_email = 0 AND email IS NOT NULL)
    `).first(),
    db.prepare(`
      SELECT date(e1_sent_at, '+7 days') as day, COUNT(*) as n FROM reengagement_targets
      WHERE status = 'active' AND e2_sent_at IS NULL AND e1_sent_at IS NOT NULL GROUP BY day
    `).all(),
    db.prepare(`
      SELECT date(e2_sent_at, '+11 days') as day, COUNT(*) as n FROM reengagement_targets
      WHERE status = 'active' AND e3_sent_at IS NULL AND e2_sent_at IS NOT NULL GROUP BY day
    `).all(),
    db.prepare("SELECT COUNT(*) as n FROM reengagement_targets WHERE status = 'pending' AND e1_sent_at IS NULL").first(),
    // Coupon reminder lane — tolerate the table not existing yet
    db.prepare("SELECT COUNT(*) as n FROM coupon_reminder_targets WHERE status = 'pending' AND sent_at IS NULL").first().catch(() => ({ n: 0 })),
    db.prepare("SELECT id, name, total_sent, total_delivered, total_opened, total_clicked FROM email_campaigns WHERE id = 'couponrem2026'").first().catch(() => null),
  ]);

  return c.json({
    success: true,
    data: {
      campaigns: campaigns.results || [],
      statuses: statuses.results || [],
      cohorts: cohorts.results || [],
      daily: daily.results || [],
      redemptions: redemptions.results || [],
      recent: recent.results || [],
      cityDrip: cityDrip.results || [],
      cityDripAudience: (audienceCount as any)?.n || 0,
      reengageE2Due: e2due.results || [],
      reengageE3Due: e3due.results || [],
      reengagePendingE1: (pendingE1 as any)?.n || 0,
      couponPending: (couponPending as any)?.n || 0,
      couponCampaign: couponCampaign || null,
    },
  });
});
