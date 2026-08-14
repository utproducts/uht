import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { optionalAuth } from '../middleware/auth';
import { sendApprovalEmail } from '../lib/approval-email';
import { sendHotelConfirmationEmail } from '../lib/hotel-confirmation-email';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';
import { getResolvedFields } from '../lib/template-overrides';

export const eventRoutes = new Hono<{ Bindings: Env }>();

// ==================
// PUBLIC: List events (with filters)
// ==================
eventRoutes.get('/', optionalAuth, async (c) => {
  const db = c.env.DB;
  const { city, state, status, season, age_group, page = '1', per_page = '20' } = c.req.query();

  let query = `
    SELECT e.*, v.name as venue_name, v.city as venue_city,
    (SELECT COUNT(*) FROM event_divisions ed WHERE ed.event_id = e.id) as division_count,
    (SELECT GROUP_CONCAT(DISTINCT ed2.age_group) FROM event_divisions ed2 WHERE ed2.event_id = e.id) as age_groups,
    (SELECT MIN(ed3.price_cents) FROM event_divisions ed3 WHERE ed3.event_id = e.id AND ed3.price_cents > 0) as price_min_cents,
    (SELECT MAX(ed4.price_cents) FROM event_divisions ed4 WHERE ed4.event_id = e.id AND ed4.price_cents > 0) as price_max_cents
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.status NOT IN ('draft')
  `;
  const params: string[] = [];

  if (city) {
    query += ' AND LOWER(e.city) = LOWER(?)';
    params.push(city);
  }
  if (state) {
    query += ' AND LOWER(e.state) = LOWER(?)';
    params.push(state);
  }
  if (status) {
    query += ' AND e.status = ?';
    params.push(status);
  }
  if (season) {
    query += ' AND e.season = ?';
    params.push(season);
  }

  // Count total
  const countQuery = query.replace(/SELECT e\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Paginate
  const pageNum = parseInt(page);
  const perPage = parseInt(per_page);
  query += ' ORDER BY e.start_date ASC LIMIT ? OFFSET ?';
  params.push(perPage.toString(), ((pageNum - 1) * perPage).toString());

  const result = await db.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
    pagination: {
      page: pageNum,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  });
});

// ==================
// AUTH: Get events the current user's teams are registered for
// ==================
eventRoutes.get('/my-registered', authMiddleware, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user') as any;
  const userId = authUser?.id;

  if (!userId) {
    return c.json({ success: true, data: [] });
  }

  // Get user email for matching event_registrations
  const userRecord = await db.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string }>();
  const userEmail = userRecord?.email || authUser?.email || '';

  const eventMap = new Map<string, any>();

  // 1) Registrations table — teams linked via created_by or team_managers
  try {
    const regEvents = await db.prepare(`
      SELECT DISTINCT e.id, e.name, e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url, e.status,
        GROUP_CONCAT(DISTINCT t.name) as team_names
      FROM events e
      INNER JOIN registrations r ON r.event_id = e.id AND r.status NOT IN ('denied', 'withdrawn')
      INNER JOIN teams t ON t.id = r.team_id
      LEFT JOIN team_managers tm ON tm.team_id = t.id
      WHERE t.created_by = ? OR tm.user_id = ?
      GROUP BY e.id
    `).bind(userId, userId).all();
    for (const ev of (regEvents.results || [])) {
      eventMap.set(ev.id, ev);
    }
  } catch {}

  // 2) Event_registrations table — match by user email
  if (userEmail) {
    try {
      const consumerEvents = await db.prepare(`
        SELECT DISTINCT e.id, e.name, e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url, e.status,
          GROUP_CONCAT(DISTINCT er.team_name) as team_names
        FROM events e
        INNER JOIN event_registrations er ON er.event_id = e.id AND er.status NOT IN ('denied', 'withdrawn')
        WHERE er.email1 = ?
        GROUP BY e.id
      `).bind(userEmail).all();
      for (const ev of (consumerEvents.results || [])) {
        if (!eventMap.has(ev.id)) {
          eventMap.set(ev.id, ev);
        } else {
          const existing = eventMap.get(ev.id);
          const existingNames = (existing.team_names || '').split(',').filter(Boolean);
          const newNames = (ev.team_names || '').split(',').filter(Boolean);
          existing.team_names = [...new Set([...existingNames, ...newNames])].join(', ');
        }
      }
    } catch {}
  }

  const data = Array.from(eventMap.values()).sort((a, b) =>
    (b.start_date || '').localeCompare(a.start_date || '')
  );

  return c.json({ success: true, data });
});

// ==================
// PUBLIC: Get single event by slug OR id
// ==================
// PUBLIC: is a Super Saver promo currently running? (Drives the register-page
// upsell banner — promos run in short windows a few times a year.)
eventRoutes.get('/super-saver-active', async (c) => {
  const db = c.env.DB;
  try {
    const promo = await db.prepare(
      "SELECT discount_cents, ends_at, min_event_start FROM super_saver_promos WHERE is_active = 1 AND datetime('now') <= ends_at ORDER BY created_at DESC LIMIT 1"
    ).first<any>();
    if (!promo) return c.json({ success: true, data: { active: false } });
    return c.json({
      success: true,
      data: { active: true, discount_cents: promo.discount_cents || 40000, ends_at: promo.ends_at, min_event_start: promo.min_event_start || null },
    });
  } catch {
    return c.json({ success: true, data: { active: false } });
  }
});

eventRoutes.get('/:slugOrId', optionalAuth, async (c) => {
  const slugOrId = c.req.param('slugOrId');
  const db = c.env.DB;

  const event = await db.prepare(`
    SELECT e.*, v.name as venue_name, v.address as venue_address,
           v.city as venue_city, v.state as venue_state,
           (SELECT MIN(ed3.price_cents) FROM event_divisions ed3 WHERE ed3.event_id = e.id AND ed3.price_cents > 0) as price_min_cents,
           (SELECT MAX(ed4.price_cents) FROM event_divisions ed4 WHERE ed4.event_id = e.id AND ed4.price_cents > 0) as price_max_cents
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.slug = ? OR e.id = ?
  `).bind(slugOrId, slugOrId).first();

  if (!event) {
    return c.json({ success: false, error: 'Event not found' }, 404);
  }

  // Get divisions with availability
  const divisions = await db.prepare(`
    SELECT ed.*,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id AND r.status IN ('approved', 'pending')) as registered_count
    FROM event_divisions ed
    WHERE ed.event_id = ?
    ORDER BY ed.age_group ASC
  `).bind((event as any).id).all();

  // Get event venues with rinks
  const eventVenues = await db.prepare(`
    SELECT ev.venue_id, v.name as venue_name, v.address, v.city, v.state, v.zip
    FROM event_venues ev
    JOIN venues v ON v.id = ev.venue_id
    WHERE ev.event_id = ?
    ORDER BY v.name ASC
  `).bind((event as any).id).all();

  // Get rinks for each venue
  const venuesWithRinks = [];
  for (const venue of eventVenues.results as any[]) {
    let rinkResults: any[] = [];
    try {
      const rinks = await db.prepare(`
        SELECT id, name, surface_size FROM venue_rinks WHERE venue_id = ? ORDER BY name ASC
      `).bind(venue.venue_id).all();
      rinkResults = rinks.results as any[];
    } catch (_) { /* table may not exist */ }
    venuesWithRinks.push({ ...venue, rinks: rinkResults });
  }

  // Get event hotels
  let eventHotels: any[] = [];
  try {
    const hotels = await db.prepare(`
      SELECT id, hotel_name, city, state, rate_description, booking_url, price_per_night, image_url
      FROM event_hotels WHERE event_id = ? AND is_active = 1
      ORDER BY sort_order ASC, hotel_name ASC
    `).bind((event as any).id).all();
    eventHotels = hotels.results as any[];
  } catch (_) { /* table may not exist */ }

  // Get registered teams count (for Who's Coming)
  let registeredTeams: any[] = [];
  try {
    const regs = await db.prepare(`
      SELECT t.name as team_name, t.city, t.state, o.name as org_name, ed.age_group, ed.division_level
      FROM registrations r
      JOIN teams t ON t.id = r.team_id
      LEFT JOIN organizations o ON o.id = t.organization_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      WHERE r.event_id = ? AND r.status = 'approved'
      ORDER BY ed.age_group ASC, t.name ASC
    `).bind((event as any).id).all();
    registeredTeams = regs.results as any[];
  } catch (_) { /* fallback */ }

  // Also try event_registrations table for legacy data
  if (registeredTeams.length === 0) {
    try {
      const legacyRegs = await db.prepare(`
        SELECT team_name, city, state, age_group, division_level
        FROM event_registrations
        WHERE event_id = ? AND status = 'approved'
        ORDER BY age_group ASC, team_name ASC
      `).bind((event as any).id).all();
      registeredTeams = legacyRegs.results as any[];
    } catch (_) { /* table may not exist */ }
  }

  return c.json({
    success: true,
    data: {
      ...event,
      divisions: divisions.results,
      venues: venuesWithRinks,
      hotels: eventHotels,
      registered_teams: registeredTeams,
    },
  });
});

// ==================
// DEBUG: Check registration data (temporary)
// ==================
eventRoutes.get('/debug/registrations/:eventId', async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');

  const regs = await db.prepare('SELECT er.id, er.team_name, er.status, er.email1, er.age_group, er.created_at, (SELECT code FROM discount_codes WHERE registration_id = er.id LIMIT 1) as discount_code, (SELECT is_used FROM discount_codes WHERE registration_id = er.id LIMIT 1) as discount_code_used FROM event_registrations er WHERE er.event_id = ?').bind(eventId).all();
  const normalizedRegs = await db.prepare('SELECT r.id, t.name as team_name, r.status, r.created_at FROM registrations r LEFT JOIN teams t ON t.id = r.team_id WHERE r.event_id = ?').bind(eventId).all();

  return c.json({
    event_registrations: regs.results,
    registrations: normalizedRegs.results,
    event_registrations_count: regs.results?.length || 0,
    registrations_count: normalizedRegs.results?.length || 0,
  });
});

// ==================
// PUBLIC: Get cities with event counts
// ==================
eventRoutes.get('/meta/cities', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT city, state, COUNT(*) as event_count,
    MIN(start_date) as next_event_date
    FROM events
    WHERE status NOT IN ('draft', 'cancelled', 'completed')
    GROUP BY city, state
    ORDER BY city ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get states with event counts (for map)
// ==================
eventRoutes.get('/meta/states', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT state, COUNT(*) as event_count,
    COUNT(DISTINCT city) as city_count
    FROM events
    WHERE status NOT IN ('draft', 'cancelled')
    GROUP BY state
    ORDER BY state ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: List events (with registration counts, upcoming/past)
// ==================
eventRoutes.get('/admin/list', async (c) => {
  const db = c.env.DB;
  const { filter = 'all', search, per_page, page = '1' } = c.req.query();
  const today = new Date().toISOString().split('T')[0];

  let dateCondition = '';
  if (filter === 'upcoming') {
    dateCondition = `AND e.end_date >= '${today}'`;
  } else if (filter === 'past') {
    dateCondition = `AND e.end_date < '${today}'`;
  }

  let searchCondition = '';
  const params: string[] = [];
  if (search && search.trim().length >= 2) {
    searchCondition = `AND (LOWER(e.name) LIKE ? OR LOWER(e.city) LIKE ? OR LOWER(e.state) LIKE ? OR e.season LIKE ?)`;
    const term = `%${search.trim().toLowerCase()}%`;
    params.push(term, term, term, term);
  }

  const countQuery = `SELECT COUNT(*) as total FROM events e WHERE 1=1 ${dateCondition} ${searchCondition}`;
  const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  const limit = per_page ? parseInt(per_page) : 200;
  const offset = (parseInt(page) - 1) * limit;

  const result = await db.prepare(`
    SELECT e.*,
      t.name as tournament_name, t.location as tournament_location,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status NOT IN ('denied','withdrawn','awaiting_payment')) + (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status NOT IN ('denied','withdrawn','awaiting_payment')) as registration_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) + (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) as total_registration_count,
      (SELECT COALESCE(SUM(COALESCE(r2.amount_cents, ed2.price_cents)), 0) FROM registrations r2 LEFT JOIN event_divisions ed2 ON ed2.id = r2.event_division_id WHERE r2.event_id = e.id AND r2.payment_status = 'paid' AND r2.status = 'approved') + (SELECT COALESCE(SUM(COALESCE(er2.payment_amount_cents, 0)), 0) FROM event_registrations er2 WHERE er2.event_id = e.id AND er2.payment_status = 'paid' AND er2.status = 'approved') as total_revenue_cents
    FROM events e
    LEFT JOIN tournaments t ON t.id = e.tournament_id
    WHERE 1=1 ${dateCondition} ${searchCondition}
    ORDER BY e.start_date ASC
    LIMIT ? OFFSET ?
  `).bind(...params, limit.toString(), offset.toString()).all();

  return c.json({ success: true, data: result.results, pagination: { total, page: parseInt(page), perPage: limit } });
});

// ==================
// ADMIN: Get single event detail with registrations
// ==================
eventRoutes.get('/admin/detail/:id', async (c) => {
  try {
  const id = c.req.param('id');
  const db = c.env.DB;

  const event = await db.prepare(`
    SELECT e.*, t.name as tournament_name, t.location as tournament_location, t.organizer as tournament_organizer
    FROM events e
    LEFT JOIN tournaments t ON t.id = e.tournament_id
    WHERE e.id = ?
  `).bind(id).first();

  if (!event) {
    return c.json({ success: false, error: 'Event not found' }, 404);
  }

  // Get registrations from normalized tables, mapped to field names the frontend expects
  const registrations = await db.prepare(`
    SELECT r.id, r.event_id, r.status, r.payment_status,
      r.amount_cents as payment_amount_cents,
      t.name as team_name,
      r.team_id,
      COALESCE(t.schedule_name, CASE WHEN t.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = t.organization_id), t.name) || ' (' || TRIM(SUBSTR(t.head_coach_name, INSTR(t.head_coach_name, ' '))) || ')' ELSE t.name END) as display_name,
      t.head_coach_name, t.head_coach_email, t.head_coach_phone,
      t.manager_name, t.manager_email, t.manager_phone,
      t.mhr_url, t.mhr_rating,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = r.team_id AND tp.status = 'active') as roster_count,
      COALESCE(ed.age_group, t.age_group) as age_group,
      COALESCE(ed.division_level, t.division_level) as division,
      r.hotel_assigned,
      ha.hotel_name as hotel_assigned_name,
      r.notes,
      r.event_division_id,
      r.created_at, r.updated_at,
      'normalized' as source
    FROM registrations r
    LEFT JOIN teams t ON t.id = r.team_id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    LEFT JOIN event_hotels ha ON ha.id = r.hotel_assigned
    WHERE r.event_id = ?
    ORDER BY ed.age_group ASC, t.name ASC
  `).bind(id).all();

  // Also check event_registrations table (consumer registration flow)
  const legacyRegs = await db.prepare(`
    SELECT er.id, er.event_id, er.team_name,
      COALESCE(ed2.age_group, er.age_group) as age_group,
      COALESCE(ed2.division_level, er.division, ct.division_level) as division,
      er.manager_first_name, er.manager_last_name, er.email1 as email,
      er.phone, er.status, er.payment_status,
      er.payment_amount_cents,
      COALESCE(er.team_id, (SELECT t9.id FROM teams t9 WHERE LOWER(t9.name) = LOWER(er.team_name) AND t9.is_active = 1 LIMIT 1)) as team_id,
      COALESCE(ct.schedule_name, CASE WHEN ct.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ct.organization_id), ct.name) || ' (' || TRIM(SUBSTR(ct.head_coach_name, INSTR(ct.head_coach_name, ' '))) || ')' ELSE ct.name END, er.team_name) as display_name,
      COALESCE(ct.head_coach_name, er.coach_name) as head_coach_name,
      COALESCE(ct.head_coach_email, er.coach_email) as head_coach_email,
      COALESCE(ct.head_coach_phone, er.coach_phone) as head_coach_phone,
      COALESCE(ct.manager_name, NULLIF(TRIM(COALESCE(er.manager_first_name, '') || ' ' || COALESCE(er.manager_last_name, '')), '')) as manager_name,
      COALESCE(ct.manager_email, er.email1) as manager_email,
      COALESCE(ct.manager_phone, er.phone) as manager_phone,
      CASE WHEN er.team_id IS NOT NULL THEN ct.mhr_url ELSE (SELECT t8.mhr_url FROM teams t8 WHERE LOWER(t8.name) = LOWER(er.team_name) AND t8.mhr_url IS NOT NULL AND t8.mhr_url != '' LIMIT 1) END as mhr_url,
      CASE WHEN er.team_id IS NOT NULL THEN ct.mhr_rating ELSE (SELECT t6.mhr_rating FROM teams t6 WHERE LOWER(t6.name) = LOWER(er.team_name) AND t6.mhr_rating IS NOT NULL LIMIT 1) END as mhr_rating,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.status = 'active' AND tp.team_id = COALESCE(er.team_id, (SELECT t7.id FROM teams t7 WHERE LOWER(t7.name) = LOWER(er.team_name) AND t7.is_active = 1 LIMIT 1))) as roster_count,
      er.hotel_assigned,
      ha.hotel_name as hotel_assigned_name,
      er.notes,
      er.event_division_id,
      er.created_at, er.updated_at,
      'consumer' as source
    FROM event_registrations er
    LEFT JOIN teams ct ON ct.id = er.team_id
    LEFT JOIN event_divisions ed2 ON ed2.id = er.event_division_id
    LEFT JOIN event_hotels ha ON ha.id = er.hotel_assigned
    WHERE er.event_id = ?
    ORDER BY age_group ASC, team_name ASC
  `).bind(id).all();

  // Merge BOTH tables — always include registrations from both sources
  const allRegs = [...registrations.results, ...legacyRegs.results];

  // Get registration summary by age group (approved only — pending regs excluded from overview)
  const approvedRegs = allRegs.filter((r: any) => r.status === 'approved');
  const summary = approvedRegs.length > 0 ? (() => {
    const groups: Record<string, { team_count: number; revenue_cents: number }> = {};
    approvedRegs.forEach((r: any) => {
      const ag = r.age_group || 'Unknown';
      if (!groups[ag]) groups[ag] = { team_count: 0, revenue_cents: 0 };
      groups[ag].team_count++;
      groups[ag].revenue_cents += (r.payment_amount_cents || 0);
    });
    return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([age_group, data]) => ({
      age_group, ...data
    }));
  })() : [];

  // Get assigned venues
  const assignedVenues = await db.prepare(`
    SELECT ev.venue_id, ev.is_primary, ev.sort_order,
      v.name as venue_name, v.city as venue_city, v.state as venue_state, v.address as venue_address
    FROM event_venues ev
    JOIN venues v ON v.id = ev.venue_id
    WHERE ev.event_id = ?
    ORDER BY ev.is_primary DESC, ev.sort_order ASC
  `).bind(id).all().catch(() => ({ results: [] }));

  return c.json({
    success: true,
    data: {
      ...event,
      registrations: allRegs,
      registration_summary: summary,
      venues: assignedVenues.results,
    },
  });
  } catch (e: any) {
    return c.json({ success: false, error: e.message, stack: e.stack?.substring(0, 500) }, 500);
  }
});

// ==================
// ADMIN: Get tournaments list
// ==================
eventRoutes.get('/admin/tournaments', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM events e WHERE e.tournament_id = t.id) as event_count
    FROM tournaments t
    ORDER BY t.name ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Update event
// ==================
const updateEventSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.string().optional(),
  tournament_id: z.string().nullable().optional(),
  venue_id: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  information: z.string().nullable().optional(),
  price_cents: z.number().nullable().optional(),
  deposit_cents: z.number().nullable().optional(),
  slots_count: z.number().nullable().optional(),
  is_sold_out: z.number().optional(),
  hide_availability: z.number().optional(),
  show_participants: z.number().optional(),
  registration_open_date: z.string().nullable().optional(),
  registration_deadline: z.string().nullable().optional(),
  age_groups: z.string().nullable().optional(),
  divisions: z.string().nullable().optional(),
  season: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  rules_url: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
  multi_event_discount_pct: z.number().nullable().optional(),
  sanction_number: z.string().nullable().optional(),
});

// ==================
// ADMIN: Get event divisions with pricing
// ==================
eventRoutes.get('/admin/:id/divisions', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const divisions = await db.prepare(`
    SELECT ed.*,
    (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id AND r.status IN ('approved', 'pending')) as registered_count
    FROM event_divisions ed
    WHERE ed.event_id = ?
    ORDER BY ed.age_group ASC, ed.division_level ASC
  `).bind(id).all();

  return c.json({ success: true, data: divisions.results });
});

// ==================
// ADMIN: Save event divisions (upsert all)
// ==================
const saveDivisionsSchema = z.object({
  divisions: z.array(z.object({
    id: z.string().optional(),
    age_group: z.string(),
    division_level: z.string().optional().nullable(),
    max_teams: z.number().optional().nullable(),
    price_cents: z.number(),
    period_length_minutes: z.number().optional().nullable(),
  })),
});

eventRoutes.put('/admin/:id/divisions', authMiddleware, requireRole('admin', 'director'), zValidator('json', saveDivisionsSchema), async (c) => {
  const eventId = c.req.param('id');
  const { divisions } = c.req.valid('json');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first();
  if (!existing) return c.json({ success: false, error: 'Event not found' }, 404);

  // Get current divisions to preserve any with registrations
  const current = await db.prepare('SELECT ed.id, (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id) as reg_count FROM event_divisions ed WHERE ed.event_id = ?').bind(eventId).all<any>();
  const currentMap = new Map(current.results.map((d: any) => [d.id, d.reg_count]));

  // Upsert each division
  for (const div of divisions) {
    if (div.id && currentMap.has(div.id)) {
      // Update existing
      await db.prepare(`
        UPDATE event_divisions SET age_group = ?, division_level = ?, max_teams = ?, price_cents = ?, period_length_minutes = ?
        WHERE id = ? AND event_id = ?
      `).bind(
        div.age_group, div.division_level || null, div.max_teams || null,
        div.price_cents, div.period_length_minutes ?? null,
        div.id, eventId
      ).run();
      currentMap.delete(div.id);
    } else {
      // Insert new
      const newId = div.id || crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO event_divisions (id, event_id, age_group, division_level, max_teams, price_cents, period_length_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newId, eventId, div.age_group, div.division_level || null,
        div.max_teams || null, div.price_cents, div.period_length_minutes ?? null
      ).run();
    }
  }

  // Delete removed divisions that have no registrations
  for (const [divId, regCount] of currentMap) {
    if (regCount === 0) {
      await db.prepare('DELETE FROM event_divisions WHERE id = ? AND event_id = ?').bind(divId, eventId).run();
    }
  }

  // Return updated divisions
  const updated = await db.prepare(`
    SELECT ed.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = ed.id AND r.status IN ('approved', 'pending')) as registered_count
    FROM event_divisions ed WHERE ed.event_id = ? ORDER BY ed.age_group ASC, ed.division_level ASC
  `).bind(eventId).all();

  return c.json({ success: true, data: updated.results });
});

eventRoutes.patch('/admin/update/:id', authMiddleware, requireRole('admin', 'director'), zValidator('json', updateEventSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: 'Event not found' }, 404);

  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(val as any);
    }
  }

  if (setClauses.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

  // Auto-update slug if name changes
  if (data.name) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setClauses.push('slug = ?');
    params.push(slug);
  }

  setClauses.push("updated_at = datetime('now')");
  params.push(id);

  await db.prepare(`UPDATE events SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: updated });
});

// ==================
// ADMIN: Create event (simple)
// ==================
const createEventSimpleSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  start_date: z.string(),
  end_date: z.string(),
  tournament_id: z.string().nullable().optional(),
  venue_id: z.string().nullable().optional(),
  status: z.string().optional(),
  description: z.string().nullable().optional(),
  information: z.string().nullable().optional(),
  price_cents: z.number().nullable().optional(),
  deposit_cents: z.number().nullable().optional(),
  slots_count: z.number().nullable().optional(),
  age_groups: z.string().nullable().optional(),
  divisions: z.string().nullable().optional(),
  season: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  registration_open_date: z.string().nullable().optional(),
  registration_deadline: z.string().nullable().optional(),
  rules_url: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
  hide_availability: z.number().optional(),
  show_participants: z.number().optional(),
  multi_event_discount_pct: z.number().nullable().optional(),
  sanction_number: z.string().nullable().optional(),
});

eventRoutes.post('/admin/create', authMiddleware, requireRole('admin', 'director'), zValidator('json', createEventSimpleSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  await db.prepare(`
    INSERT INTO events (id, name, slug, city, state, start_date, end_date, tournament_id, venue_id, status,
      description, information, price_cents, deposit_cents, slots_count, age_groups, divisions,
      season, timezone, registration_open_date, registration_deadline, scorekeeper_pin,
      rules_url, logo_url, banner_url, hide_availability, show_participants, multi_event_discount_pct, sanction_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.name, slug, data.city, data.state, data.start_date, data.end_date,
    data.tournament_id || null, data.venue_id || null, data.status || 'draft',
    data.description || null, data.information || null,
    data.price_cents || null, data.deposit_cents || null, data.slots_count || 100,
    data.age_groups || null, data.divisions || null,
    data.season || null, data.timezone || 'Central (CST)',
    data.registration_open_date || null, data.registration_deadline || null, pin,
    data.rules_url || null, data.logo_url || null, data.banner_url || null,
    data.hide_availability || 0, data.show_participants ?? 1, data.multi_event_discount_pct || 0,
    data.sanction_number || null
  ).run();

  return c.json({ success: true, data: { id, slug, scorekeeper_pin: pin } }, 201);
});

// ==================
// ADMIN: Bulk import events (from Excel template JSON)
// ==================
eventRoutes.post('/admin/bulk-import', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const body = await c.req.json() as { events: any[] };
  const db = c.env.DB;

  if (!body.events?.length) {
    return c.json({ success: false, error: 'No events provided' }, 400);
  }

  const results: { name: string; id?: string; slug?: string; error?: string }[] = [];

  for (const evt of body.events) {
    try {
      if (!evt.name || !evt.city || !evt.state || !evt.start_date || !evt.end_date) {
        results.push({ name: evt.name || '(unnamed)', error: 'Missing required fields (name, city, state, start_date, end_date)' });
        continue;
      }

      const id = crypto.randomUUID().replace(/-/g, '');
      const slug = evt.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const priceCents = evt.price_cents || (evt.price_dollars ? Math.round(evt.price_dollars * 100) : null);
      const depositCents = evt.deposit_cents || (evt.deposit_dollars ? Math.round(evt.deposit_dollars * 100) : null);

      await db.prepare(`
        INSERT INTO events (id, name, slug, city, state, start_date, end_date, status,
          description, price_cents, deposit_cents, slots_count, age_groups,
          season, registration_open_date, registration_deadline, scorekeeper_pin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, evt.name, slug, evt.city, evt.state, evt.start_date, evt.end_date,
        evt.status || 'draft', evt.description || null,
        priceCents, depositCents, evt.slots_count || 100,
        evt.age_groups || null, evt.season || null,
        evt.registration_open_date || null, evt.registration_deadline || null, pin
      ).run();

      // Create scorekeeper pin record
      await db.prepare(`INSERT INTO scorekeeper_pins (id, event_id, pin_code) VALUES (?, ?, ?)`)
        .bind(crypto.randomUUID().replace(/-/g, ''), id, pin).run();

      // Auto-create divisions from age_groups
      if (evt.age_groups) {
        const ageGroups = evt.age_groups.split(',').map((ag: string) => ag.trim()).filter(Boolean);
        for (const ag of ageGroups) {
          const divId = crypto.randomUUID().replace(/-/g, '');
          await db.prepare(`
            INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at)
            VALUES (?, ?, ?, NULL, ?, 'open', datetime('now'))
          `).bind(divId, id, ag, priceCents || 0).run();
        }
      }

      results.push({ name: evt.name, id, slug });
    } catch (e: any) {
      results.push({ name: evt.name || '(unnamed)', error: e.message });
    }
  }

  const created = results.filter(r => r.id).length;
  const failed = results.filter(r => r.error).length;

  return c.json({ success: true, data: { created, failed, total: body.events.length, results } });
});

// ==================
// ADMIN: Delete event
// ==================
eventRoutes.delete('/admin/delete/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'Event not found' }, 404);

  // Cascade delete all related records
  const tables = [
    'event_registrations', 'registrations', 'event_divisions', 'event_hotels',
    'event_venues', 'scorekeeper_pins', 'games', 'promoted_events',
    'special_requests', 'game_slots', 'schedule_rules', 'audit_log',
  ];
  for (const table of tables) {
    try {
      await db.prepare(`DELETE FROM ${table} WHERE event_id = ?`).bind(id).run();
    } catch (_) { /* table may not exist or no event_id column */ }
  }

  // Delete the event itself
  await db.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

  return c.json({ success: true, data: { deleted: existing.name } });
});

// ==================
// ADMIN: Duplicate event (simple copy)
// ==================
eventRoutes.post('/admin/duplicate/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const sourceId = c.req.param('id');
  const db = c.env.DB;

  const source = await db.prepare('SELECT * FROM events WHERE id = ?').bind(sourceId).first<any>();
  if (!source) return c.json({ success: false, error: 'Source event not found' }, 404);

  const newId = crypto.randomUUID().replace(/-/g, '');
  const newPin = String(Math.floor(1000 + Math.random() * 9000));

  // Bump dates by 1 year
  const bumpYear = (d: string) => {
    if (!d) return null;
    const dt = new Date(d + 'T12:00:00');
    dt.setFullYear(dt.getFullYear() + 1);
    return dt.toISOString().split('T')[0];
  };

  const newStart = bumpYear(source.start_date);
  const newEnd = bumpYear(source.end_date);
  const newSlug = source.slug + '-' + (newStart ? newStart.slice(0, 4) : 'copy');

  await db.prepare(`
    INSERT INTO events (id, name, slug, city, state, start_date, end_date, tournament_id, status,
      description, information, price_cents, deposit_cents, slots_count, age_groups, divisions,
      season, scorekeeper_pin, source_event_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId, source.name, newSlug, source.city, source.state, newStart, newEnd,
    source.tournament_id, source.description, source.information,
    source.price_cents, source.deposit_cents, source.slots_count || 100,
    source.age_groups, source.divisions, source.season, newPin, sourceId
  ).run();

  return c.json({ success: true, data: { id: newId, slug: newSlug, start_date: newStart, end_date: newEnd, scorekeeper_pin: newPin } }, 201);
});

// ==================
// CONSUMER: Get upcoming events for upsell (excluding current event)
// ==================
eventRoutes.get('/upcoming-for-upsell/:eventId', optionalAuth, async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT id, slug, name, city, state, start_date, end_date, price_cents, deposit_cents, multi_event_discount_pct, logo_url
    FROM events
    WHERE id != ? AND status IN ('registration_open', 'active', 'published')
      AND start_date >= date('now')
    ORDER BY start_date ASC
  `).bind(eventId).all();

  return c.json({
    success: true,
    data: result.results || [],
  });
});

// ==================
// PUBLIC: Get hotels available for an event (for registration hotel picker)
// ==================
eventRoutes.get('/event-hotels/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  // Auto-migrate
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN image_url TEXT").run(); } catch (_) { /* already exists */ }
  // NOTE: booking_url/booking_code are deliberately NOT exposed publicly —
  // teams pick hotel preferences at registration and UHT assigns them
  // (hotel partnerships depend on bookings going through assignment).
  // Assigned teams get their booking link/code in their dashboard.
  const result = await db.prepare(`
    SELECT id, hotel_name, city, state, rate_description, price_per_night as rate_cents, image_url
    FROM event_hotels WHERE event_id = ? AND is_active = 1
    ORDER BY sort_order ASC, hotel_name ASC
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get event divisions with pricing (for More Info page)
// ==================
eventRoutes.get('/event-divisions/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT id, age_group, division_level, price_cents, game_format, period_length_minutes, num_periods, max_teams, status,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_division_id = event_divisions.id AND r.status != 'denied') as registered_count
    FROM event_divisions WHERE event_id = ? AND status != 'cancelled'
    ORDER BY
      CASE age_group
        WHEN 'Mite' THEN 1 WHEN 'Squirt' THEN 2 WHEN 'Pee Wee' THEN 3
        WHEN 'Bantam' THEN 4 WHEN 'Midget' THEN 5 WHEN '16u' THEN 6
        WHEN '16u/JV' THEN 7 WHEN '18u' THEN 8 WHEN '18u/Var.' THEN 9
        ELSE 10 END,
      division_level ASC
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get venues/rinks for an event's city (for More Info page)
// ==================
eventRoutes.get('/event-venues/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Get event city/state
  const event = await db.prepare('SELECT city, state, venue_id FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Check multi-venue junction table first
  try {
    const multiVenues = await db.prepare(`
      SELECT v.* FROM event_venues ev
      JOIN venues v ON v.id = ev.venue_id AND v.is_active = 1
      WHERE ev.event_id = ?
      ORDER BY ev.is_primary DESC, ev.sort_order ASC
    `).bind(eventId).all();

    if (multiVenues.results.length > 0) {
      const venuesWithRinks = [];
      for (const v of multiVenues.results as any[]) {
        const rinks = await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ?').bind(v.id).all();
        venuesWithRinks.push({ ...v, rinks: rinks.results });
      }
      return c.json({ success: true, data: venuesWithRinks });
    }
  } catch (_) {}

  // Fallback: If event has a specific venue_id (legacy single venue)
  if (event.venue_id) {
    const venue = await db.prepare('SELECT * FROM venues WHERE id = ? AND is_active = 1').bind(event.venue_id).first<any>();
    if (venue) {
      const rinks = await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ?').bind(venue.id).all();
      return c.json({ success: true, data: [{ ...venue, rinks: rinks.results }] });
    }
    // If venue_id points to an inactive/deleted venue, fall through to city-match
  }

  // Map full state names to abbreviations (events use full names, venues use abbreviations)
  const stateAbbrevMap: Record<string, string> = {
    'illinois': 'IL', 'indiana': 'IN', 'michigan': 'MI', 'missouri': 'MO',
    'wisconsin': 'WI', 'colorado': 'CO', 'ohio': 'OH', 'minnesota': 'MN',
  };
  const stateAbbrev = stateAbbrevMap[event.state.toLowerCase()] || event.state;

  // Return all venues in the event's metro area
  const cityLower = event.city.toLowerCase();
  let venues;
  if (cityLower.includes('chicago')) {
    // Chicago events use rinks across the metro area
    venues = await db.prepare(`
      SELECT * FROM venues WHERE is_active = 1 AND LOWER(state) = LOWER(?)
      ORDER BY name ASC
    `).bind(stateAbbrev).all();
  } else if (cityLower.includes('wis dells') || cityLower.includes('wisconsin dells')) {
    venues = await db.prepare(`
      SELECT * FROM venues WHERE is_active = 1 AND
        LOWER(city) IN ('wisconsin dells', 'baraboo')
      ORDER BY name ASC
    `).all();
  } else if (cityLower.includes('st. louis') || cityLower.includes('st louis')) {
    venues = await db.prepare(`
      SELECT * FROM venues WHERE is_active = 1 AND LOWER(state) = LOWER(?)
      ORDER BY name ASC
    `).bind(stateAbbrev).all();
  } else if (cityLower.includes('madison')) {
    venues = await db.prepare(`
      SELECT * FROM venues WHERE is_active = 1 AND LOWER(city) = 'madison'
      ORDER BY name ASC
    `).all();
  } else {
    venues = await db.prepare(`
      SELECT * FROM venues WHERE is_active = 1 AND LOWER(city) = LOWER(?)
      ORDER BY name ASC
    `).bind(event.city).all();
  }

  // Fetch rinks for each venue
  const venuesWithRinks = [];
  for (const v of venues.results as any[]) {
    const rinks = await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ?').bind(v.id).all();
    venuesWithRinks.push({ ...v, rinks: rinks.results });
  }

  return c.json({ success: true, data: venuesWithRinks });
});

// ==================
// ADMIN: Get assigned venues for an event (multi-venue)
// ==================
eventRoutes.get('/admin/event-venues/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Auto-create table
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS event_venues (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        venue_id TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(event_id, venue_id)
      )
    `).run();
  } catch (_) {}

  const venues = await db.prepare(`
    SELECT ev.id, ev.venue_id, ev.is_primary, ev.sort_order,
      v.name, v.city, v.state, v.address, v.num_rinks,
      (SELECT COUNT(*) FROM venue_rinks vr WHERE vr.venue_id = v.id) as rink_count
    FROM event_venues ev
    JOIN venues v ON v.id = ev.venue_id
    WHERE ev.event_id = ?
    ORDER BY ev.is_primary DESC, ev.sort_order ASC
  `).bind(eventId).all();

  return c.json({ success: true, data: venues.results });
});

// ==================
// ADMIN: Set venues for an event (replace all)
// ==================
eventRoutes.put('/admin/event-venues/:eventId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const body = await c.req.json() as { venue_ids: string[]; primary_venue_id?: string };

  // Auto-create table
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS event_venues (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        venue_id TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(event_id, venue_id)
      )
    `).run();
  } catch (_) {}

  // Delete existing assignments
  await db.prepare('DELETE FROM event_venues WHERE event_id = ?').bind(eventId).run();

  // Insert new assignments
  for (let i = 0; i < body.venue_ids.length; i++) {
    const vid = body.venue_ids[i];
    const isPrimary = body.primary_venue_id ? (vid === body.primary_venue_id ? 1 : 0) : (i === 0 ? 1 : 0);
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO event_venues (id, event_id, venue_id, is_primary, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, eventId, vid, isPrimary, i).run();
  }

  // Also update the legacy venue_id field to the primary venue
  const primaryId = body.primary_venue_id || body.venue_ids[0] || null;
  await db.prepare("UPDATE events SET venue_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(primaryId, eventId).run();

  // Return updated list
  const venues = await db.prepare(`
    SELECT ev.id, ev.venue_id, ev.is_primary, ev.sort_order,
      v.name, v.city, v.state, v.address, v.num_rinks,
      (SELECT COUNT(*) FROM venue_rinks vr WHERE vr.venue_id = v.id) as rink_count
    FROM event_venues ev
    JOIN venues v ON v.id = ev.venue_id
    WHERE ev.event_id = ?
    ORDER BY ev.is_primary DESC, ev.sort_order ASC
  `).bind(eventId).all();

  return c.json({ success: true, data: venues.results });
});

// ==================
// ADMIN: Update event description/information (WYSIWYG)
// ==================
eventRoutes.patch('/event-info/:eventId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const body = await c.req.json() as any;

  const setClauses: string[] = [];
  const params: (string | null)[] = [];

  if (body.description !== undefined) {
    setClauses.push('description = ?');
    params.push(body.description || null);
  }
  if (body.information !== undefined) {
    setClauses.push('information = ?');
    params.push(body.information || null);
  }

  if (setClauses.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

  setClauses.push("updated_at = datetime('now')");
  params.push(eventId);

  await db.prepare(`UPDATE events SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await db.prepare('SELECT id, description, information FROM events WHERE id = ?').bind(eventId).first();
  return c.json({ success: true, data: updated });
});

// ==================
// AI: Generate event description
// ==================
eventRoutes.post('/ai-generate-description/:eventId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Get divisions for context
  const divisions = await db.prepare('SELECT age_group, division_level, price_cents, game_format, period_length_minutes FROM event_divisions WHERE event_id = ?').bind(eventId).all();

  // Get venues for context
  const venues = await db.prepare(`SELECT name, city, state, address FROM venues WHERE is_active = 1 AND LOWER(state) = LOWER(?)`)
    .bind(event.state).all();

  const ageGroups = divisions.results.map((d: any) => d.age_group);
  const venueNames = venues.results.map((v: any) => v.name);
  const priceRange = divisions.results
    .filter((d: any) => d.price_cents > 0)
    .map((d: any) => d.price_cents);
  const minPrice = priceRange.length > 0 ? Math.min(...priceRange) : 0;
  const maxPrice = priceRange.length > 0 ? Math.max(...priceRange) : 0;

  const description = `Join us for the ${event.name}! This exciting youth hockey tournament takes place ${event.start_date} through ${event.end_date} in ${event.city}, ${event.state}. ` +
    (ageGroups.length > 0 ? `We welcome teams from ${ageGroups.join(', ')} age groups. ` : '') +
    `Every team is guaranteed a minimum of 4 games (3 pool play + bracket play). ` +
    (minPrice > 0 ? `Registration ranges from $${(minPrice/100).toLocaleString()} to $${(maxPrice/100).toLocaleString()} per team depending on age group. ` : '') +
    (venueNames.length > 0 ? `Games will be played at top-quality facilities including ${venueNames.slice(0, 3).join(', ')}${venueNames.length > 3 ? ' and more' : ''}. ` : '') +
    `All games are USA Hockey sanctioned. Don't miss out — register your team today!`;

  return c.json({ success: true, data: { description } });
});

// ==================
// CONSUMER: Register team for an event (from events page)
// ==================
const consumerRegisterSchema = z.object({
  eventId: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  ageGroup: z.string(),
  division: z.string().optional(),
  managerFirstName: z.string().optional(),
  managerLastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  headCoachName: z.string().optional(),
  paymentChoice: z.enum(['pay_now', 'pay_deposit', 'pay_later']),
  additionalEventIds: z.array(z.string()).optional(),
  hotelChoice1: z.string().optional(),
  hotelChoice2: z.string().optional(),
  hotelChoice3: z.string().optional(),
  needsHotel: z.boolean().optional(),
  scheduleRequests: z.string().max(2000).optional(),
});

eventRoutes.post('/register', zValidator('json', consumerRegisterSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Collect all event IDs to register for
  const eventIds = [data.eventId];
  if (data.additionalEventIds && data.additionalEventIds.length > 0) {
    eventIds.push(...data.additionalEventIds);
  }

  // Verify primary event exists and is open for registration
  const event = await db.prepare(
    'SELECT id, name, city, state, start_date, end_date, status, price_cents, deposit_cents, logo_url FROM events WHERE id = ?'
  ).bind(data.eventId).first<any>();

  if (!event) {
    return c.json({ success: false, error: 'Event not found' }, 404);
  }
  if (event.status !== 'registration_open' && event.status !== 'active' && event.status !== 'published') {
    return c.json({ success: false, error: 'Registration is not open for this event' }, 400);
  }

  // Check if team is already registered for primary event
  // Ignore 'denied', 'rejected', 'withdrawn', and 'awaiting_payment' (abandoned checkouts)
  const existing = await db.prepare(
    "SELECT id FROM event_registrations WHERE event_id = ? AND team_name = ? AND status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')"
  ).bind(data.eventId, data.teamName).first();

  if (existing) {
    return c.json({ success: false, error: 'This team is already registered for this event' }, 409);
  }

  // Verify all additional events exist and are open
  const additionalEvents: any[] = [];
  if (data.additionalEventIds && data.additionalEventIds.length > 0) {
    for (const addEventId of data.additionalEventIds) {
      const addEvent = await db.prepare(
        'SELECT id, name, city, state, start_date, end_date, status FROM events WHERE id = ?'
      ).bind(addEventId).first<any>();

      if (!addEvent) {
        return c.json({ success: false, error: `Event ${addEventId} not found` }, 404);
      }
      if (addEvent.status !== 'registration_open' && addEvent.status !== 'active' && addEvent.status !== 'published') {
        return c.json({ success: false, error: `Registration is not open for event ${addEvent.name}` }, 400);
      }

      // Check if team is already registered for this additional event
      const addExisting = await db.prepare(
        "SELECT id FROM event_registrations WHERE event_id = ? AND team_name = ? AND status NOT IN ('denied', 'rejected', 'withdrawn', 'awaiting_payment')"
      ).bind(addEventId, data.teamName).first();

      if (addExisting) {
        return c.json({ success: false, error: `This team is already registered for ${addEvent.name}` }, 409);
      }

      additionalEvents.push(addEvent);
    }
  }

  // Ensure hotel preference columns exist (auto-migrate)
  try {
    await db.prepare("ALTER TABLE event_registrations ADD COLUMN hotel_choice_1 TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE event_registrations ADD COLUMN hotel_choice_2 TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE event_registrations ADD COLUMN hotel_choice_3 TEXT").run();
  } catch {}
  // Ensure needs_hotel column exists (auto-migrate)
  try {
    await db.prepare("ALTER TABLE event_registrations ADD COLUMN needs_hotel INTEGER DEFAULT 0").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE registrations ADD COLUMN needs_hotel INTEGER DEFAULT 0").run();
  } catch {}

  // Auto-migrate: discount_codes table
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      registration_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      team_id TEXT,
      event_id TEXT NOT NULL,
      email TEXT NOT NULL,
      discount_local_cents INTEGER NOT NULL DEFAULT 10000,
      discount_hotel_cents INTEGER NOT NULL DEFAULT 20000,
      is_used INTEGER NOT NULL DEFAULT 0,
      used_registration_id TEXT,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch {}

  // Helper: match a team's age group (e.g. "Squirt AA", "Squirt Red 1") to an event division
  // by checking if the division's age_group is a prefix of the team's age_group (case-insensitive)
  const findMatchingDivision = async (eventId: string, teamAgeGroup: string): Promise<string | null> => {
    if (!teamAgeGroup) return null;
    const divs = await db.prepare(
      `SELECT id, age_group FROM event_divisions WHERE event_id = ? AND status = 'open' ORDER BY age_group ASC`
    ).bind(eventId).all<{ id: string; age_group: string }>();
    const teamAg = teamAgeGroup.toLowerCase().trim();
    // Try exact match first, then prefix match (longest prefix wins)
    let bestMatch: { id: string; len: number } | null = null;
    for (const d of (divs.results || [])) {
      const divAg = d.age_group.toLowerCase().trim();
      if (teamAg === divAg) return d.id; // exact match
      if (teamAg.startsWith(divAg) && (!bestMatch || divAg.length > bestMatch.len)) {
        bestMatch = { id: d.id, len: divAg.length };
      }
    }
    return bestMatch?.id || null;
  };

  // Create registration — status depends on payment choice:
  // pay_now/pay_deposit → 'awaiting_payment' (not yet registered until they pay)
  // pay_later → 'pending' (registered, awaiting admin review)
  const regIds: string[] = [];
  const regId = crypto.randomUUID().replace(/-/g, '');
  regIds.push(regId);

  const initialStatus = data.paymentChoice === 'pay_later' ? 'pending' : 'awaiting_payment';
  const initialPaymentStatus = data.paymentChoice === 'pay_later' ? 'pay_later' : 'unpaid';

  // Auto-match division
  const matchedDivisionId = await findMatchingDivision(data.eventId, data.ageGroup);

  // Sanity-check the submitted team link: if the selected team's name doesn't
  // match the registered team name, the client likely had a stale selection
  // (e.g. registering two teams back-to-back). Prefer the exact-name team.
  let resolvedTeamId = data.teamId || null;
  if (resolvedTeamId) {
    try {
      const linked = await db.prepare('SELECT name FROM teams WHERE id = ?').bind(resolvedTeamId).first<{ name: string }>();
      if (!linked || linked.name.trim().toLowerCase() !== data.teamName.trim().toLowerCase()) {
        const exact = await db.prepare('SELECT id FROM teams WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active = 1 LIMIT 1')
          .bind(data.teamName).first<{ id: string }>();
        if (exact) resolvedTeamId = exact.id;
      }
    } catch {}
  }

  await db.prepare(`
    INSERT INTO event_registrations (id, event_id, team_id, team_name, age_group, division, manager_first_name, manager_last_name, email1, phone, status, payment_status, hotel_choice_1, hotel_choice_2, hotel_choice_3, event_division_id, needs_hotel, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    regId, data.eventId, resolvedTeamId, data.teamName, data.ageGroup, data.division || null,
    data.managerFirstName || null, data.managerLastName || null,
    data.email, data.phone || null,
    initialStatus, initialPaymentStatus,
    data.hotelChoice1 || null, data.hotelChoice2 || null, data.hotelChoice3 || null,
    matchedDivisionId,
    data.needsHotel ? 1 : 0,
    (data.scheduleRequests || '').trim() || null
  ).run();

  // Create registrations for additional events
  for (const addEvent of additionalEvents) {
    const addRegId = crypto.randomUUID().replace(/-/g, '');
    regIds.push(addRegId);

    const addMatchedDivId = await findMatchingDivision(addEvent.id, data.ageGroup);

    await db.prepare(`
      INSERT INTO event_registrations (id, event_id, team_id, team_name, age_group, division, manager_first_name, manager_last_name, email1, phone, status, payment_status, event_division_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      addRegId, addEvent.id, resolvedTeamId, data.teamName, data.ageGroup, data.division || null,
      data.managerFirstName || null, data.managerLastName || null,
      data.email, data.phone || null,
      initialStatus, initialPaymentStatus,
      addMatchedDivId,
      (data.scheduleRequests || '').trim() || null
    ).run();
  }

  // Generate discount code for this registration
  const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const generateCode = () => {
    let code = '';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 6; i++) code += SAFE_CHARS[arr[i] % SAFE_CHARS.length];
    return `UHT-${code}`;
  };

  let discountCode = generateCode();
  const discountCodeId = crypto.randomUUID().replace(/-/g, '');
  // Ensure uniqueness — retry up to 5 times
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.prepare(`
        INSERT INTO discount_codes (id, code, registration_id, team_name, team_id, event_id, email, age_group)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        discountCodeId, discountCode, regId, data.teamName, data.teamId || null, data.eventId, data.email, data.ageGroup || null
      ).run();
      break;
    } catch (e: any) {
      if (attempt < 4 && e?.message?.includes('UNIQUE')) {
        discountCode = generateCode();
      } else {
        console.error('Failed to generate discount code:', e);
        discountCode = ''; // silently fail, don't block registration
        break;
      }
    }
  }

  // Send confirmation email — only for pay_later (already registered).
  // For pay_now/pay_deposit, the email is sent after payment succeeds in the confirm-payment endpoint.
  let emailResult = { success: false, error: 'not sent' };
  if (data.paymentChoice === 'pay_later') {
    const startDate = new Date(event.start_date + 'T12:00:00');
    const endDate = new Date(event.end_date + 'T12:00:00');
    const eventDateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    try {
      emailResult = await sendRegistrationConfirmationEmail(c.env, {
        recipientEmail: data.email,
        recipientName: data.managerFirstName
          ? `${data.managerFirstName} ${data.managerLastName || ''}`.trim()
          : data.teamName,
        teamName: data.teamName,
        ageGroup: data.ageGroup,
        division: data.division || undefined,
        eventName: event.name,
        eventDate: eventDateStr,
        eventCity: `${event.city}, ${event.state}`,
        headCoachName: data.headCoachName || undefined,
        priceCents: event.price_cents || undefined,
        depositCents: event.deposit_cents || undefined,
        eventLogoUrl: event.logo_url || undefined,
        discountCode: discountCode || undefined,
        _overrides: await getResolvedFields(db, 'registration_confirmation'),
      } as any);
    } catch (err: any) {
      console.error('Registration confirmation email error:', err);
    }
  }

  return c.json({
    success: true,
    data: {
      primaryRegistrationId: regId,
      allRegistrationIds: regIds,
      eventsRegistered: eventIds.length,
      status: 'pending',
      email_sent: emailResult.success,
      discountCode: discountCode || undefined,
      message: eventIds.length > 1
        ? `Registered for ${eventIds.length} events! You will receive a confirmation email shortly. Our team reviews registrations within 24-48 hours.`
        : 'Registration received! You will receive a confirmation email shortly. Our team reviews registrations within 24-48 hours.',
    },
  }, 201);
});

// ==================
// ADMIN: Update registration (payment, hotel assignment, notes)
// ==================
const updateRegistrationSchema = z.object({
  status: z.enum(['pending', 'approved', 'denied', 'waitlisted', 'withdrawn', 'rejected', 'awaiting_payment']).optional(),
  payment_status: z.enum(['unpaid', 'paid', 'partial', 'refunded', 'comp', 'pay_later', 'pending_payment']).optional(),
  payment_amount_cents: z.number().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  hotel_assigned: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  event_division_id: z.string().nullable().optional(),
  division_age_group: z.string().nullable().optional(),
  division_level: z.string().nullable().optional(),
  allow_create_division: z.boolean().optional(),
  team_name: z.string().optional(),
  event_id: z.string().optional(),
  schedule_name: z.string().nullable().optional(),
  coach_name: z.string().nullable().optional(),
  coach_email: z.string().nullable().optional(),
  coach_phone: z.string().nullable().optional(),
  manager_name: z.string().nullable().optional(),
  manager_email: z.string().nullable().optional(),
  manager_phone: z.string().nullable().optional(),
  usa_hockey_url: z.string().nullable().optional(),
  mhr_url: z.string().nullable().optional(),
});

// ── Manual payments (Venmo / check / cash …) recorded by admins ──
// Loads a registration from either table with everything needed to compute
// the expected price and what's been paid so far.
async function loadRegPaymentContext(db: D1Database, regId: string) {
  let reg = await db.prepare(`
    SELECT er.id, er.event_id, er.event_division_id, er.payment_status, er.stripe_payment_id,
      er.payment_amount_cents as charged_cents, er.amount_paid_cents, er.card_paid_cents,
      ed.price_cents as division_price_cents, e.price_cents as event_price_cents
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
    WHERE er.id = ?`).bind(regId).first<any>();
  let table = 'event_registrations';
  if (!reg) {
    reg = await db.prepare(`
      SELECT r.id, r.event_id, r.event_division_id, r.payment_status, r.stripe_payment_id,
        r.amount_cents as charged_cents, r.amount_paid_cents, r.card_paid_cents,
        ed.price_cents as division_price_cents, e.price_cents as event_price_cents
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      WHERE r.id = ?`).bind(regId).first<any>();
    table = 'registrations';
  }
  return reg ? { reg, table } : null;
}

async function computeAndApplyPaymentStatus(db: D1Database, regId: string) {
  const ctx = await loadRegPaymentContext(db, regId);
  if (!ctx) return null;
  const { reg, table } = ctx;

  const manual = await db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) as total FROM registration_payments WHERE registration_id = ?'
  ).bind(regId).first<{ total: number }>();
  const manualCents = manual?.total || 0;
  // Card money lives in its own accumulator so manual payments can never be
  // misattributed to the card line, and removals correctly lower the total.
  const stripeCents = reg.card_paid_cents ?? (reg.stripe_payment_id ? (reg.charged_cents || 0) : 0);
  const totalPaid = stripeCents + manualCents;
  const expected = reg.division_price_cents || reg.event_price_cents || reg.charged_cents || 0;

  let newStatus: string | null = null;
  if (totalPaid > 0) {
    newStatus = expected > 0 && totalPaid < expected ? 'partial' : 'paid';
  } else if (reg.payment_status === 'paid' || reg.payment_status === 'partial') {
    // Everything was removed — nothing is actually paid anymore
    newStatus = 'unpaid';
  }
  if (newStatus) {
    await db.prepare(`UPDATE ${table} SET payment_status = ?, amount_paid_cents = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(newStatus, totalPaid, regId).run().catch(() => {});
  }
  return {
    expected_cents: expected,
    stripe_paid_cents: stripeCents,
    manual_paid_cents: manualCents,
    total_paid_cents: totalPaid,
    balance_cents: Math.max(0, expected - totalPaid),
    payment_status: newStatus || reg.payment_status,
  };
}

// ── Resend a registration's earned reward code (UHT-XXXXXX) by email.
// Teams lose these constantly; admins re-send from the registration editor.
eventRoutes.post('/admin/registration/:regId/resend-discount-code', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('regId');
  const db = c.env.DB;
  let overrideEmail: string | null = null;
  try {
    const body = await c.req.json<{ email?: string }>();
    if (body?.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) overrideEmail = body.email.trim();
  } catch {}

  const dc = await db.prepare(
    'SELECT code, team_name, email, discount_local_cents, discount_hotel_cents, is_used FROM discount_codes WHERE registration_id = ?'
  ).bind(regId).first<any>();
  if (!dc) return c.json({ success: false, error: 'No reward code exists for this registration' }, 404);
  if (dc.is_used) return c.json({ success: false, error: 'This code has already been redeemed — nothing to resend' }, 400);

  const to = overrideEmail || dc.email;
  if (!to) return c.json({ success: false, error: 'No email on file — pass one in the request' }, 400);

  const local = Math.round((dc.discount_local_cents || 10000) / 100);
  const hotel = Math.round((dc.discount_hotel_cents || 20000) / 100);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
        to: [to],
        subject: `Your UHT discount code for ${dc.team_name}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
            <div style="background: linear-gradient(135deg, #003e79, #005599); padding: 25px 30px; border-radius: 16px 16px 0 0; text-align: center;">
              <h1 style="color: white; font-size: 22px; margin: 0;">Ultimate Hockey Tournaments</h1>
            </div>
            <div style="background: white; padding: 30px; border: 1px solid #e8e8ed; border-top: none; border-radius: 0 0 16px 16px;">
              <p style="color: #6e6e73; font-size: 15px; line-height: 1.6;">
                Here's your discount code for <strong>${dc.team_name}</strong> — good for your next UHT event registration:
              </p>
              <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                <p style="color: #003e79; font-size: 30px; font-weight: bold; font-family: monospace; letter-spacing: 3px; margin: 0;">${dc.code}</p>
              </div>
              <p style="color: #1d1d1f; font-size: 14px; line-height: 1.7;">
                💵 <strong>$${local} off</strong> for local teams<br/>
                🏨 <strong>$${hotel} off</strong> when your team stays at a partner hotel<br/><br/>
                Enter the code in the discount box when you register (or pay) for your next tournament.
                It's one-time use and applies to a different event than the one it was earned from.
              </p>
            </div>
          </div>`,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Resend discount-code email failed:', res.status, errText);
      return c.json({ success: false, error: 'Email service rejected the send — try again' }, 502);
    }
  } catch (err: any) {
    return c.json({ success: false, error: 'Failed to send the email — try again' }, 502);
  }
  return c.json({ success: true, message: `Code ${dc.code} sent to ${to}` });
});

// ── MHR ratings refresh: pull each linked team's current MyHockeyRankings
// rating. MHR sits behind a bot challenge, so pages are fetched through the
// r.jina.ai reader proxy; failures leave the stored rating untouched.
eventRoutes.post('/admin/:eventId/refresh-mhr', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Distinct teams registered for this event that have an MHR link
  const teams = await db.prepare(`
    SELECT DISTINCT t.id, t.mhr_url FROM teams t
    WHERE t.mhr_url IS NOT NULL AND t.mhr_url != '' AND t.id IN (
      SELECT r.team_id FROM registrations r WHERE r.event_id = ? AND r.team_id IS NOT NULL
      UNION
      SELECT er.team_id FROM event_registrations er WHERE er.event_id = ? AND er.team_id IS NOT NULL
      UNION
      SELECT t2.id FROM event_registrations er2 JOIN teams t2 ON LOWER(t2.name) = LOWER(er2.team_name)
      WHERE er2.event_id = ? AND er2.team_id IS NULL
    )
  `).bind(eventId, eventId, eventId).all<any>();

  let updated = 0, failed = 0;
  const results: any[] = [];
  for (const team of (teams.results || [])) {
    try {
      const url = String(team.mhr_url).trim();
      const target = url.startsWith('http') ? url : `https://${url}`;
      const res = await fetch(`https://r.jina.ai/${target}`, {
        headers: { 'Accept': 'text/plain' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { failed++; results.push({ team_id: team.id, ok: false, status: res.status }); continue; }
      const text = await res.text();
      const m = text.match(/#+\s*Rating\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i) || text.match(/\bRating\b[^0-9]{0,40}([0-9]{1,3}\.[0-9])/i);
      if (m) {
        const rating = parseFloat(m[1]);
        if (rating > 0 && rating < 200) {
          await db.prepare("UPDATE teams SET mhr_rating = ?, mhr_rating_updated_at = datetime('now') WHERE id = ?")
            .bind(rating, team.id).run();
          updated++;
          results.push({ team_id: team.id, ok: true, rating });
          continue;
        }
      }
      failed++;
      results.push({ team_id: team.id, ok: false, reason: 'rating not found on page' });
    } catch (err: any) {
      failed++;
      results.push({ team_id: team.id, ok: false, reason: err?.message || 'fetch failed' });
    }
  }

  return c.json({ success: true, data: { linked_teams: (teams.results || []).length, updated, failed, results } });
});

eventRoutes.get('/admin/registration/:regId/payments', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('regId');
  const db = c.env.DB;
  const ctx = await loadRegPaymentContext(db, regId);
  if (!ctx) return c.json({ success: false, error: 'Registration not found' }, 404);

  const rows = await db.prepare(
    'SELECT * FROM registration_payments WHERE registration_id = ? ORDER BY created_at ASC'
  ).bind(regId).all();
  const manualCents = (rows.results || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);
  const stripeCents = ctx.reg.card_paid_cents ?? (ctx.reg.stripe_payment_id ? (ctx.reg.charged_cents || 0) : 0);
  const expected = ctx.reg.division_price_cents || ctx.reg.event_price_cents || ctx.reg.charged_cents || 0;

  return c.json({
    success: true,
    data: {
      payments: rows.results || [],
      summary: {
        expected_cents: expected,
        stripe_paid_cents: stripeCents,
        manual_paid_cents: manualCents,
        total_paid_cents: stripeCents + manualCents,
        balance_cents: Math.max(0, expected - stripeCents - manualCents),
        payment_status: ctx.reg.payment_status,
      },
    },
  });
});

const addPaymentSchema = z.object({
  amount_cents: z.number().int().positive(),
  method: z.enum(['venmo', 'check', 'cash', 'zelle', 'other']),
  reference: z.string().optional(),
  note: z.string().optional(),
});

eventRoutes.post('/admin/registration/:regId/payments', authMiddleware, requireRole('admin', 'director'), zValidator('json', addPaymentSchema), async (c) => {
  const regId = c.req.param('regId');
  const data = c.req.valid('json');
  const db = c.env.DB;
  const ctx = await loadRegPaymentContext(db, regId);
  if (!ctx) return c.json({ success: false, error: 'Registration not found' }, 404);

  const user = c.get('user') as any;
  const payId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO registration_payments (id, registration_id, amount_cents, method, reference, note, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(payId, regId, data.amount_cents, data.method, data.reference || null, data.note || null, user?.email || user?.id || 'admin').run();

  const summary = await computeAndApplyPaymentStatus(db, regId);
  const fresh = await db.prepare(
    'SELECT * FROM registration_payments WHERE registration_id = ? ORDER BY created_at ASC'
  ).bind(regId).all();
  return c.json({ success: true, data: { id: payId, summary, payments: fresh.results || [] } }, 201);
});

eventRoutes.delete('/admin/registration/:regId/payments/:paymentId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('regId');
  const paymentId = c.req.param('paymentId');
  const db = c.env.DB;
  await db.prepare('DELETE FROM registration_payments WHERE id = ? AND registration_id = ?').bind(paymentId, regId).run();
  const summary = await computeAndApplyPaymentStatus(db, regId);
  const fresh = await db.prepare(
    'SELECT * FROM registration_payments WHERE registration_id = ? ORDER BY created_at ASC'
  ).bind(regId).all();
  return c.json({ success: true, data: { summary, payments: fresh.results || [] } });
});

eventRoutes.patch('/admin/registration/:regId', authMiddleware, requireRole('admin', 'director'), zValidator('json', updateRegistrationSchema), async (c) => {
  const regId = c.req.param('regId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Auto-migrate: ensure event_division_id column exists on event_registrations
  try { await db.prepare("ALTER TABLE event_registrations ADD COLUMN event_division_id TEXT").run(); } catch (_) {}

  // Check both tables for the registration
  let useNormalized = false;
  let existing = await db.prepare('SELECT id, status, event_id FROM registrations WHERE id = ?').bind(regId).first<{ id: string; status: string; event_id: string }>();
  if (existing) {
    useNormalized = true;
  } else {
    existing = await db.prepare('SELECT id, status, event_id FROM event_registrations WHERE id = ?').bind(regId).first<{ id: string; status: string; event_id: string }>();
  }
  if (!existing) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }
  const previousStatus = existing.status;

  // ── EVENT TRANSFER: move the registration to a different event ──
  // Payment rides along (no refund needed). Division and hotel assignment are
  // event-specific, so they reset — the auto-assign below then tries to place
  // the team in a matching division of the NEW event.
  let transferredEvent = false;
  if (data.event_id !== undefined && data.event_id && data.event_id !== existing.event_id) {
    const newEvent = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(data.event_id).first<{ id: string; name: string }>();
    if (!newEvent) {
      return c.json({ success: false, error: 'Target event not found' }, 404);
    }
    const tbl = useNormalized ? 'registrations' : 'event_registrations';
    // Free up the old division's slot
    const oldDiv = await db.prepare(`SELECT event_division_id FROM ${tbl} WHERE id = ?`).bind(regId).first<any>();
    if (oldDiv?.event_division_id) {
      await db.prepare('UPDATE event_divisions SET current_team_count = MAX(0, current_team_count - 1) WHERE id = ?')
        .bind(oldDiv.event_division_id).run().catch(() => {});
    }
    await db.prepare(`UPDATE ${tbl} SET event_id = ?, event_division_id = NULL, hotel_assigned = NULL, updated_at = datetime('now') WHERE id = ?`)
      .bind(data.event_id, regId).run();
    transferredEvent = true;
  }

  // Build dynamic SET clause
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.status !== undefined) {
    setClauses.push('status = ?');
    params.push(data.status);
  }
  if (data.payment_status !== undefined) {
    setClauses.push('payment_status = ?');
    params.push(data.payment_status);
  }
  if (data.payment_amount_cents !== undefined) {
    // Column name differs between tables
    setClauses.push(useNormalized ? 'amount_cents = ?' : 'payment_amount_cents = ?');
    params.push(data.payment_amount_cents);
  }
  if (data.payment_method !== undefined) {
    if (!useNormalized) {
      setClauses.push('payment_method = ?');
      params.push(data.payment_method || null);
    }
  }
  if (data.hotel_assigned !== undefined) {
    setClauses.push('hotel_assigned = ?');
    params.push(data.hotel_assigned);
  }
  if (data.notes !== undefined) {
    setClauses.push('notes = ?');
    params.push(data.notes);
  }
  if (data.event_division_id !== undefined) {
    setClauses.push('event_division_id = ?');
    params.push(data.event_division_id);
  }
  // Registered team name — updates the registration row only (form-based regs).
  // Deliberately does NOT rename the linked team: the org's team identity and
  // stats attribution must survive schedule renames.
  if (!useNormalized && data.team_name !== undefined && data.team_name.trim()) {
    await db.prepare('UPDATE event_registrations SET team_name = ? WHERE id = ?')
      .bind(data.team_name.trim(), regId).run().catch(() => {});
  }

  // Coach + manager contact info
  if (!useNormalized) {
    if (data.coach_name !== undefined || data.coach_email !== undefined || data.coach_phone !== undefined) {
      await db.prepare(`UPDATE event_registrations SET
        coach_name = COALESCE(?, coach_name), coach_email = COALESCE(?, coach_email), coach_phone = COALESCE(?, coach_phone)
        WHERE id = ?`).bind(data.coach_name ?? null, data.coach_email ?? null, data.coach_phone ?? null, regId).run().catch(() => {});
    }
    if (data.manager_name !== undefined || data.manager_email !== undefined || data.manager_phone !== undefined) {
      const nameParts = (data.manager_name || '').trim().split(/\s+/);
      const first = nameParts[0] || null;
      const last = nameParts.slice(1).join(' ') || null;
      await db.prepare(`UPDATE event_registrations SET
        manager_first_name = CASE WHEN ? IS NOT NULL THEN ? ELSE manager_first_name END,
        manager_last_name = CASE WHEN ? IS NOT NULL THEN ? ELSE manager_last_name END,
        email1 = COALESCE(?, email1), phone = COALESCE(?, phone)
        WHERE id = ?`).bind(
          data.manager_name ?? null, first, data.manager_name ?? null, last,
          data.manager_email ?? null, data.manager_phone ?? null, regId
        ).run().catch(() => {});
    }
  }

  // Team-linked updates: schedule name + coach/manager on the teams row
  {
    const teamRow = useNormalized
      ? await db.prepare('SELECT team_id FROM registrations WHERE id = ?').bind(regId).first<any>()
      : await db.prepare('SELECT team_id FROM event_registrations WHERE id = ?').bind(regId).first<any>();
    const teamId = teamRow?.team_id;
    if (teamId) {
      if (data.schedule_name !== undefined) {
        // Empty string clears the override (schedules fall back to the team name)
        const val = (data.schedule_name || '').trim() || null;
        await db.prepare("UPDATE teams SET schedule_name = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(val, teamId).run().catch(() => {});
      }
      if (data.coach_name !== undefined || data.coach_email !== undefined || data.coach_phone !== undefined) {
        await db.prepare(`UPDATE teams SET
          head_coach_name = COALESCE(?, head_coach_name),
          head_coach_email = COALESCE(?, head_coach_email),
          head_coach_phone = COALESCE(?, head_coach_phone),
          updated_at = datetime('now') WHERE id = ?`)
          .bind(data.coach_name ?? null, data.coach_email ?? null, data.coach_phone ?? null, teamId).run().catch(() => {});
      }
      if (data.manager_name !== undefined || data.manager_email !== undefined || data.manager_phone !== undefined) {
        await db.prepare(`UPDATE teams SET
          manager_name = COALESCE(?, manager_name),
          manager_email = COALESCE(?, manager_email),
          manager_phone = COALESCE(?, manager_phone),
          updated_at = datetime('now') WHERE id = ?`)
          .bind(data.manager_name ?? null, data.manager_email ?? null, data.manager_phone ?? null, teamId).run().catch(() => {});
      }
      if (data.usa_hockey_url !== undefined || data.mhr_url !== undefined) {
        const newMhr = (data.mhr_url || '').trim() || null;
        await db.prepare(`UPDATE teams SET
          usa_hockey_roster_url = CASE WHEN ? THEN ? ELSE usa_hockey_roster_url END,
          mhr_url = CASE WHEN ? THEN ? ELSE mhr_url END,
          updated_at = datetime('now') WHERE id = ?`)
          .bind(data.usa_hockey_url !== undefined ? 1 : 0, (data.usa_hockey_url || '').trim() || null,
                data.mhr_url !== undefined ? 1 : 0, newMhr, teamId).run().catch(() => {});
        // Removing (or changing) the link invalidates the cached rating
        if (data.mhr_url !== undefined) {
          await db.prepare("UPDATE teams SET mhr_rating = NULL, mhr_rating_updated_at = NULL WHERE id = ? AND (mhr_url IS NULL OR mhr_url = '' OR mhr_url != COALESCE(?, ''))")
            .bind(teamId, newMhr).run().catch(() => {});
        }
      }
    }
  }

  // ── Age group + level assignment (from the split selectors) ──
  // Resolves to an existing event_division row, or creates one so the schedule
  // builder can pull it later. Runs against the (possibly just-transferred) event.
  if (data.division_age_group !== undefined && data.division_age_group) {
    const tbl = useNormalized ? 'registrations' : 'event_registrations';
    const regRow = await db.prepare(`SELECT event_id FROM ${tbl} WHERE id = ?`).bind(regId).first<any>();
    const targetEventId = regRow?.event_id;
    if (targetEventId) {
      const ag = data.division_age_group.trim();
      const lvl = (data.division_level || '').trim();
      let div = await db.prepare(
        "SELECT id FROM event_divisions WHERE event_id = ? AND age_group = ? AND COALESCE(TRIM(division_level), '') = ?"
      ).bind(targetEventId, ag, lvl).first<any>();
      // Fall back to the bare age-group division (no level) before creating anything
      if (!div && lvl) {
        div = await db.prepare(
          "SELECT id FROM event_divisions WHERE event_id = ? AND age_group = ? AND COALESCE(TRIM(division_level), '') = ''"
        ).bind(targetEventId, ag).first<any>();
      }
      if (!div) {
        // Creating a division is an explicit admin action — never a side effect
        // of prefilled fields (a save once auto-created a \$0 'Pee Wee A Gold').
        if (!data.allow_create_division) {
          return c.json({ success: false, error: `No '${ag}${lvl ? ' ' + lvl : ''}' division exists on this event. Adjust the division fields to create it, or pick an existing one.` }, 400);
        }
        const ev = await db.prepare('SELECT price_cents FROM events WHERE id = ?').bind(targetEventId).first<any>();
        const newDivId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(
          'INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents) VALUES (?, ?, ?, ?, ?)'
        ).bind(newDivId, targetEventId, ag, lvl || null, ev?.price_cents || 0).run();
        div = { id: newDivId };
      }
      setClauses.push('event_division_id = ?');
      params.push(div.id);
    }
  }

  // Auto-assign division if not set and we have an age_group to match
  if (!data.event_division_id && data.division_age_group === undefined) {
    const fullReg = useNormalized
      ? await db.prepare('SELECT event_id, event_division_id FROM registrations WHERE id = ?').bind(regId).first<any>()
      : await db.prepare('SELECT event_id, age_group, event_division_id FROM event_registrations WHERE id = ?').bind(regId).first<any>();

    if (fullReg && !fullReg.event_division_id) {
      // Get the age_group to match — for normalized regs, get it from the team
      let ageGroup: string | null = null;
      if (useNormalized) {
        const regTeam = await db.prepare('SELECT t.age_group FROM registrations r JOIN teams t ON t.id = r.team_id WHERE r.id = ?').bind(regId).first<any>();
        ageGroup = regTeam?.age_group || null;
      } else {
        ageGroup = fullReg.age_group || null;
      }

      if (ageGroup && fullReg.event_id) {
        // Try exact match first, then prefix match (e.g. "Mite (8U)" matches "Mite" or "8U")
        let div = await db.prepare('SELECT id FROM event_divisions WHERE event_id = ? AND age_group = ?')
          .bind(fullReg.event_id, ageGroup).first<any>();

        if (!div) {
          // Try matching by extracting the code from parentheses, e.g. "Mite (8U)" -> "8U"
          const codeMatch = ageGroup.match(/\(([^)]+)\)/);
          const nameMatch = ageGroup.match(/^([^(]+)/);
          if (codeMatch) {
            div = await db.prepare('SELECT id FROM event_divisions WHERE event_id = ? AND age_group = ?')
              .bind(fullReg.event_id, codeMatch[1].trim()).first<any>();
          }
          if (!div && nameMatch) {
            div = await db.prepare('SELECT id FROM event_divisions WHERE event_id = ? AND age_group = ?')
              .bind(fullReg.event_id, nameMatch[1].trim()).first<any>();
          }
          // Try prefix match as last resort
          if (!div) {
            div = await db.prepare("SELECT id FROM event_divisions WHERE event_id = ? AND (? LIKE age_group || '%' OR age_group LIKE ? || '%')")
              .bind(fullReg.event_id, ageGroup, ageGroup.split(' ')[0]).first<any>();
          }
        }

        if (div) {
          setClauses.push('event_division_id = ?');
          params.push(div.id);
          // A transferred team takes a slot in the new event's division
          if (transferredEvent) {
            await db.prepare('UPDATE event_divisions SET current_team_count = current_team_count + 1 WHERE id = ?')
              .bind(div.id).run().catch(() => {});
          }
        }
      }
    }
  }

  // Contact/name/schedule edits are handled outside the SET clause, so an
  // empty clause is fine as long as one of those fields was provided.
  const hasSideEdits = transferredEvent || [data.team_name, data.schedule_name, data.coach_name, data.coach_email, data.coach_phone,
    data.manager_name, data.manager_email, data.manager_phone, data.usa_hockey_url, data.mhr_url].some(v => v !== undefined);
  if (setClauses.length === 0 && !hasSideEdits) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  if (setClauses.length > 0) {
    setClauses.push("updated_at = datetime('now')");
    params.push(regId);

    const tableName = useNormalized ? 'registrations' : 'event_registrations';
    await db.prepare(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  }

  // Return updated registration with all fields the frontend needs
  let updated: any;
  if (useNormalized) {
    updated = await db.prepare(`
      SELECT r.id, r.event_id, r.status, r.payment_status,
        r.amount_cents as payment_amount_cents,
        t.name as team_name,
        ed.age_group,
        ed.division_level as division,
        r.hotel_assigned,
        r.notes,
        r.event_division_id,
        r.created_at, r.updated_at
      FROM registrations r
      LEFT JOIN teams t ON t.id = r.team_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      WHERE r.id = ?
    `).bind(regId).first<any>();
  } else {
    updated = await db.prepare('SELECT * FROM event_registrations WHERE id = ?').bind(regId).first<any>();
  }

  // If status just changed to 'approved', send acceptance email
  if (data.status === 'approved' && previousStatus !== 'approved' && updated) {
    try {
      // Get event details for the email
      const event = await db.prepare('SELECT name, city, state, start_date, end_date, price_cents FROM events WHERE id = ?')
        .bind(existing.event_id).first<any>();

      if (event && updated.email1) {
        const startDate = new Date(event.start_date + 'T12:00:00');
        const eventDateStr = startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

        // Recipient: linked team's head coach when known, else the registrant.
        // CC: manager + all registration contacts (dedup, exclude recipient).
        let linkedCoachEmail: string | null = null;
        let linkedManagerEmail: string | null = null;
        if (updated.team_id) {
          const lt = await db.prepare('SELECT head_coach_email, manager_email FROM teams WHERE id = ?')
            .bind(updated.team_id).first<any>();
          if (lt) { linkedCoachEmail = lt.head_coach_email; linkedManagerEmail = lt.manager_email; }
        }
        const toEmail = linkedCoachEmail || updated.email1;
        const ccEmails = [...new Set([updated.email1, updated.email2, linkedManagerEmail]
          .filter((e): e is string => !!e && e.includes('@'))
          .map(e => e.toLowerCase()))]
          .filter(e => e !== (toEmail || '').toLowerCase());

        // Look up the assigned hotel so the acceptance carries hotel + contact info.
        // hotel_assigned holds an event_hotels id on newer records and a hotel name on
        // legacy ones — match on either. Contact falls back to the master hotel record.
        let hotelRow: any = null;
        if (updated.hotel_assigned) {
          hotelRow = await db.prepare(`
            SELECT eh.*,
              COALESCE(eh.contact_name, mh.contact_name) as contact_name,
              COALESCE(eh.contact_title, mh.contact_title) as contact_title,
              COALESCE(eh.contact_phone, mh.contact_phone) as contact_phone,
              COALESCE(eh.contact_email, mh.contact_email) as contact_email,
              COALESCE(eh.phone, mh.phone) as phone
            FROM event_hotels eh
            LEFT JOIN master_hotels mh ON mh.id = eh.master_hotel_id
            WHERE eh.event_id = ? AND (eh.id = ? OR eh.hotel_name = ?)
            LIMIT 1
          `).bind(existing.event_id, updated.hotel_assigned, updated.hotel_assigned).first<any>().catch(() => null);
        }

        const emailResult = await sendApprovalEmail(c.env, {
          recipientEmail: toEmail,
          recipientName: updated.manager_first_name
            ? `${updated.manager_first_name} ${updated.manager_last_name || ''}`.trim()
            : updated.team_name,
          ccEmails,
          teamName: updated.team_name,
          ageGroup: updated.age_group,
          division: updated.division || undefined,
          eventName: event.name,
          eventDate: eventDateStr,
          eventCity: `${event.city}, ${event.state}`,
          paymentStatus: updated.payment_status || 'unpaid',
          priceCents: event.price_cents || undefined,
          hotelInfo: hotelRow ? {
            name: hotelRow.hotel_name,
            address: hotelRow.address,
            city: hotelRow.city,
            state: hotelRow.state,
            phone: hotelRow.phone,
            rateDescription: hotelRow.rate_description,
            bookingUrl: hotelRow.booking_url,
            bookingCode: hotelRow.booking_code,
            pricePerNight: hotelRow.price_per_night,
            bookingCutoffDate: hotelRow.booking_cutoff_date,
            importantNotes: hotelRow.important_notes,
            contactName: hotelRow.contact_name,
            contactTitle: hotelRow.contact_title,
            contactPhone: hotelRow.contact_phone,
            contactEmail: hotelRow.contact_email,
          } : undefined,
          _overrides: await getResolvedFields(db,
            updated.payment_status === 'paid' ? 'approval_paid'
              : updated.payment_status === 'partial' ? 'approval_deposit'
              : 'approval_unpaid'),
        } as any);

        // Include email status in response
        (updated as any).email_sent = emailResult.success;
        if (!emailResult.success) {
          (updated as any).email_error = emailResult.error;
        }

        // Notify the hotel contact that a team has been assigned to them.
        // Mirrors the Registrations-page approve flow so acceptances sent from
        // here reach the hotel too.
        if (hotelRow && hotelRow.contact_email) {
          try {
            let coachName = '';
            let coachEmail = '';
            let coachPhone = '';
            let managerName = '';
            let managerEmail = '';
            let managerPhone = '';

            if (updated.team_id) {
              const lt = await db.prepare(`
                SELECT head_coach_name, head_coach_email, head_coach_phone,
                  manager_name, manager_email, manager_phone
                FROM teams WHERE id = ?
              `).bind(updated.team_id).first<any>();
              if (lt) {
                coachName = lt.head_coach_name || '';
                coachEmail = lt.head_coach_email || '';
                coachPhone = lt.head_coach_phone || '';
                managerName = lt.manager_name || '';
                managerEmail = lt.manager_email || '';
                managerPhone = lt.manager_phone || '';
              }
            }

            // Fall back to the registration's own contacts
            if (!coachEmail) coachEmail = updated.email1 || '';
            if (!coachPhone) coachPhone = updated.phone || '';
            if (!coachName) {
              coachName = [updated.manager_first_name, updated.manager_last_name].filter(Boolean).join(' ');
            }
            if (!managerEmail) managerEmail = updated.email2 || '';
            if (!managerPhone) managerPhone = updated.phone2 || '';

            // Last resort: pull a name from users by email so the hotel never
            // gets a bare email address with no name attached.
            const nameFromEmail = async (email: string): Promise<string> => {
              if (!email) return '';
              try {
                const u = await db.prepare('SELECT first_name, last_name FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1')
                  .bind(email).first<any>();
                return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : '';
              } catch { return ''; }
            };
            if (!coachName) coachName = await nameFromEmail(coachEmail);
            if (!managerName) managerName = await nameFromEmail(managerEmail);

            // Don't list the same person twice
            const sameContact = managerEmail && coachEmail
              && managerEmail.toLowerCase() === coachEmail.toLowerCase();

            const hotelEmailResult = await sendHotelConfirmationEmail(c.env, {
              hotelContactEmail: hotelRow.contact_email,
              hotelContactName: hotelRow.contact_name || '',
              hotelName: hotelRow.hotel_name,
              teamName: updated.team_name,
              ageGroup: updated.age_group || '',
              division: updated.division || undefined,
              eventName: event.name,
              eventDate: eventDateStr,
              eventCity: `${event.city}, ${event.state}`,
              coachName,
              coachEmail,
              coachPhone,
              managerName: sameContact ? '' : managerName,
              managerEmail: sameContact ? '' : managerEmail,
              managerPhone: sameContact ? '' : managerPhone,
            });
            (updated as any).hotel_email_sent = hotelEmailResult.success;
          } catch (hotelErr: any) {
            console.error('Hotel confirmation email error:', hotelErr);
            (updated as any).hotel_email_sent = false;
          }
        }
      }
    } catch (emailErr: any) {
      console.error('Approval email error:', emailErr);
      (updated as any).email_sent = false;
      (updated as any).email_error = emailErr.message;
    }
  }

  return c.json({ success: true, data: updated });
});

// ==================
// ADMIN: Get available hotels for an event (for dropdown)
// ==================
eventRoutes.get('/admin/hotels/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Collect hotel names from multiple sources (legacy prefs, event_hotels table, normalized registrations)
  const hotels = new Set<string>();

  // 1. Legacy event_registrations preferences
  try {
    const legacy = await db.prepare(`
      SELECT DISTINCT hotel FROM (
        SELECT hotel_pref_1 as hotel FROM event_registrations WHERE event_id = ? AND hotel_pref_1 IS NOT NULL
        UNION SELECT hotel_pref_2 FROM event_registrations WHERE event_id = ? AND hotel_pref_2 IS NOT NULL
        UNION SELECT hotel_pref_3 FROM event_registrations WHERE event_id = ? AND hotel_pref_3 IS NOT NULL
        UNION SELECT hotel_assigned FROM event_registrations WHERE event_id = ? AND hotel_assigned IS NOT NULL
        UNION SELECT hotel_choice FROM event_registrations WHERE event_id = ? AND hotel_choice IS NOT NULL
      )
    `).bind(eventId, eventId, eventId, eventId, eventId).all();
    legacy.results.forEach((r: any) => { if (r.hotel) hotels.add(r.hotel); });
  } catch (e) { /* table may not exist */ }

  // 2. event_hotels table
  try {
    const eh = await db.prepare(`
      SELECT hotel_name FROM event_hotels WHERE event_id = ? AND is_active = 1
    `).bind(eventId).all();
    eh.results.forEach((r: any) => { if (r.hotel_name) hotels.add(r.hotel_name); });
  } catch (e) { /* table may not exist */ }

  // 3. Normalized registrations hotel_assigned
  try {
    const nr = await db.prepare(`
      SELECT DISTINCT hotel_assigned FROM registrations WHERE event_id = ? AND hotel_assigned IS NOT NULL
    `).bind(eventId).all();
    nr.results.forEach((r: any) => { if (r.hotel_assigned) hotels.add(r.hotel_assigned); });
  } catch (e) { /* column may not exist */ }

  return c.json({ success: true, data: Array.from(hotels).sort() });
});

// ==================
// ADMIN: Get event hotels (from event_hotels table)
// ==================
eventRoutes.get('/admin/event-hotels/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  // Auto-migrate: add columns if missing
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN price_per_night INTEGER").run(); } catch (_) { /* already exists */ }
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN image_url TEXT").run(); } catch (_) { /* already exists */ }
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN important_notes TEXT").run(); } catch (_) { /* already exists */ }
  const result = await db.prepare(`
    SELECT * FROM event_hotels WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC, hotel_name ASC
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Upload hotel image to R2
// ==================
eventRoutes.post('/admin/hotel-image/:hotelId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const hotelId = c.req.param('hotelId');
  const db = c.env.DB;
  const storage = c.env.STORAGE;

  // Verify hotel exists
  const hotel = await db.prepare('SELECT id FROM event_hotels WHERE id = ?').bind(hotelId).first();
  if (!hotel) return c.json({ success: false, error: 'Hotel not found' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return c.json({ success: false, error: 'No image provided' }, 400);

  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return c.json({ success: false, error: 'Invalid image type. Use JPEG, PNG, or WebP.' }, 400);
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ success: false, error: 'Image too large. Max 5MB.' }, 400);
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `hotels/${hotelId}.${ext}`;

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  await storage.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  // Build public URL via Worker proxy
  const apiBase = c.env.API_URL || 'https://uht.chad-157.workers.dev';
  const imageUrl = `${apiBase}/api/assets/${key}`;

  // Save URL to database
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN image_url TEXT").run(); } catch (_) { /* already exists */ }
  await db.prepare('UPDATE event_hotels SET image_url = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(imageUrl, hotelId).run();

  return c.json({ success: true, data: { image_url: imageUrl } });
});

// ==================
// ADMIN: Add hotel to event
// ==================
const addHotelSchema = z.object({
  event_id: z.string(),
  hotel_name: z.string().min(1),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  rate_description: z.string().nullable().optional(),
  booking_url: z.string().nullable().optional(),
  booking_code: z.string().nullable().optional(),
  room_block_count: z.number().nullable().optional(),
  price_per_night: z.number().nullable().optional(),
  important_notes: z.string().nullable().optional(),
  sort_order: z.number().optional(),
});

eventRoutes.post('/admin/event-hotels', authMiddleware, requireRole('admin', 'director'), zValidator('json', addHotelSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN important_notes TEXT").run(); } catch (_) { /* already exists */ }
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO event_hotels (id, event_id, hotel_name, address, city, state, phone, rate_description, booking_url, booking_code, room_block_count, price_per_night, important_notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.event_id, data.hotel_name, data.address || null, data.city || null, data.state || null,
    data.phone || null, data.rate_description || null, data.booking_url || null, data.booking_code || null,
    data.room_block_count || null, data.price_per_night || null, data.important_notes || null, data.sort_order || 0
  ).run();
  const hotel = await db.prepare('SELECT * FROM event_hotels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: hotel }, 201);
});

// ==================
// ADMIN: Update hotel
// ==================
const updateHotelSchema = z.object({
  hotel_name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  rate_description: z.string().nullable().optional(),
  booking_url: z.string().nullable().optional(),
  booking_code: z.string().nullable().optional(),
  room_block_count: z.number().nullable().optional(),
  price_per_night: z.number().nullable().optional(),
  sort_order: z.number().optional(),
  is_active: z.number().optional(),
  image_url: z.string().nullable().optional(),
  booking_cutoff_date: z.string().nullable().optional(),
  important_notes: z.string().nullable().optional(),
});

eventRoutes.patch('/admin/event-hotels/:id', authMiddleware, requireRole('admin', 'director'), zValidator('json', updateHotelSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN important_notes TEXT").run(); } catch (_) { /* already exists */ }

  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) { setClauses.push(`${key} = ?`); params.push(val as any); }
  }
  if (setClauses.length === 0) return c.json({ success: false, error: 'No fields' }, 400);
  setClauses.push("updated_at = datetime('now')");
  params.push(id);
  await db.prepare(`UPDATE event_hotels SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await db.prepare('SELECT * FROM event_hotels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: updated });
});

// ==================
// ADMIN: Delete hotel from event
// ==================
eventRoutes.delete('/admin/event-hotels/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const existing = await db.prepare('SELECT id, hotel_name FROM event_hotels WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'Hotel not found' }, 404);
  await db.prepare('DELETE FROM event_hotels WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { deleted: existing.hotel_name } });
});

// ==================
// ADMIN: Get venues list
// ==================
eventRoutes.get('/admin/venues', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT id, name, city, state, address, num_rinks FROM venues WHERE is_active = 1 ORDER BY name ASC').all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Create event
// ==================
const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  venueId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  registrationOpenDate: z.string().optional(),
  registrationDeadline: z.string().optional(),
  season: z.string().optional(),
  divisions: z.array(z.object({
    ageGroup: z.string(),
    divisionLevel: z.string().optional(),
    maxTeams: z.number().optional(),
    priceCents: z.number(),
    gameFormat: z.string().optional(),
    periodLengthMinutes: z.number().optional(),
    numPeriods: z.number().optional(),
  })).optional(),
});

eventRoutes.post('/', authMiddleware, requireRole('admin', 'director'), zValidator('json', createEventSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const user = c.get('user');

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Generate 4-digit scorekeeper PIN
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  try {
    // Create event
    await db.prepare(`
      INSERT INTO events (id, name, slug, description, city, state, venue_id, start_date, end_date,
        registration_open_date, registration_deadline, season, scorekeeper_pin, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).bind(
      eventId, data.name, slug, data.description || null, data.city, data.state,
      data.venueId || null, data.startDate, data.endDate,
      data.registrationOpenDate || null, data.registrationDeadline || null,
      data.season || null, pin
    ).run();

    // Create scorekeeper pin record
    await db.prepare(`
      INSERT INTO scorekeeper_pins (id, event_id, pin_code)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), eventId, pin).run();

    // Create divisions if provided
    if (data.divisions?.length) {
      for (const div of data.divisions) {
        await db.prepare(`
          INSERT INTO event_divisions (id, event_id, age_group, division_level, max_teams, price_cents,
            game_format, period_length_minutes, num_periods)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID().replace(/-/g, ''), eventId, div.ageGroup,
          div.divisionLevel || null, div.maxTeams || null, div.priceCents,
          div.gameFormat || '5v5', div.periodLengthMinutes || 12, div.numPeriods || 3
        ).run();
      }
    }

    // Audit log
    await db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'event.created', 'event', ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), user.id, eventId, JSON.stringify({ name: data.name })).run();

    return c.json({
      success: true,
      data: { id: eventId, slug, scorekeeperPin: pin },
    }, 201);
  } catch (err) {
    console.error('Create event error:', err);
    return c.json({ success: false, error: 'Failed to create event' }, 500);
  }
});

// ==================
// ADMIN: Duplicate event from prior year
// ==================
eventRoutes.post('/:id/duplicate', authMiddleware, requireRole('admin'), async (c) => {
  const sourceId = c.req.param('id');
  const db = c.env.DB;

  const source = await db.prepare('SELECT * FROM events WHERE id = ?').bind(sourceId).first<any>();
  if (!source) {
    return c.json({ success: false, error: 'Source event not found' }, 404);
  }

  // Auto-calculate next year's dates (same weekend)
  const sourceStart = new Date(source.start_date);
  const sourceEnd = new Date(source.end_date);

  // Find the same weekday in the next year
  const nextYearStart = new Date(sourceStart);
  nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
  // Adjust to same day of week
  const dayDiff = sourceStart.getDay() - nextYearStart.getDay();
  nextYearStart.setDate(nextYearStart.getDate() + dayDiff);

  const duration = sourceEnd.getTime() - sourceStart.getTime();
  const nextYearEnd = new Date(nextYearStart.getTime() + duration);

  const newId = crypto.randomUUID().replace(/-/g, '');
  const newSlug = source.slug + '-' + nextYearStart.getFullYear();
  const newPin = String(Math.floor(1000 + Math.random() * 9000));

  // Calculate new season
  const month = nextYearStart.getMonth();
  const year = nextYearStart.getFullYear();
  const seasonName = month >= 8 ? 'fall' : month >= 3 ? 'spring' : 'winter';
  const newSeason = `${seasonName}-${year}`;

  await db.prepare(`
    INSERT INTO events (id, name, slug, description, city, state, venue_id, start_date, end_date,
      registration_open_date, registration_deadline, season, scorekeeper_pin, source_event_id, status, logo_url, banner_url, rules_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
  `).bind(
    newId, source.name, newSlug, source.description, source.city, source.state,
    source.venue_id, nextYearStart.toISOString().split('T')[0], nextYearEnd.toISOString().split('T')[0],
    null, null, newSeason, newPin, sourceId, source.logo_url, source.banner_url, source.rules_url
  ).run();

  // Duplicate divisions
  const divisions = await db.prepare('SELECT * FROM event_divisions WHERE event_id = ?').bind(sourceId).all<any>();
  for (const div of divisions.results || []) {
    await db.prepare(`
      INSERT INTO event_divisions (id, event_id, age_group, division_level, max_teams, min_teams, price_cents,
        game_format, period_length_minutes, num_periods)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().replace(/-/g, ''), newId, div.age_group, div.division_level,
      div.max_teams, div.min_teams, div.price_cents, div.game_format,
      div.period_length_minutes, div.num_periods
    ).run();
  }

  // Create scorekeeper pin
  await db.prepare(`
    INSERT INTO scorekeeper_pins (id, event_id, pin_code)
    VALUES (?, ?, ?)
  `).bind(crypto.randomUUID().replace(/-/g, ''), newId, newPin).run();

  return c.json({
    success: true,
    data: {
      id: newId,
      slug: newSlug,
      startDate: nextYearStart.toISOString().split('T')[0],
      endDate: nextYearEnd.toISOString().split('T')[0],
      season: newSeason,
      scorekeeperPin: newPin,
      message: `Duplicated from ${source.name}. Dates auto-adjusted to ${nextYearStart.toISOString().split('T')[0]}.`,
    },
  }, 201);
});

// ==================
// ADMIN: Bulk import registrations from source site
// ==================
eventRoutes.post('/admin/bulk-import-registrations', authMiddleware, requireRole('admin'), async (c) => {
  try {
  const db = c.env.DB;
  const body = await c.req.json<{
    events: Array<{
      d1Id: string;
      teams: Array<{
        n: string; // team name
        s: string; // status: approved, withdrawn, pending
        p: string; // payment: paid, partial, unpaid
        a: number; // amount_cents
      }>;
    }>;
  }>();

  const results: any[] = [];
  const systemUserId = 'import';

  for (const evt of body.events) {
    // Get all divisions for this event
    const divs = await db.prepare(
      `SELECT id, age_group FROM event_divisions WHERE event_id = ? ORDER BY age_group`
    ).bind(evt.d1Id).all<{ id: string; age_group: string }>();

    if (!divs.results.length) {
      results.push({ eventId: evt.d1Id, error: 'no divisions found', inserted: 0 });
      continue;
    }

    // Default to first division
    const defaultDiv = divs.results[0];

    let inserted = 0;
    for (const team of evt.teams) {
      try {
        // Find or create team by name
        let existingTeam = await db.prepare(
          `SELECT id FROM teams WHERE name = ? AND is_active = 1 LIMIT 1`
        ).bind(team.n).first<{ id: string }>();

        let teamId: string;
        if (existingTeam) {
          teamId = existingTeam.id;
        } else {
          // Create new team with default age_group from division
          const newId = crypto.randomUUID().replace(/-/g, '');
          await db.prepare(
            `INSERT INTO teams (id, name, age_group, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`
          ).bind(newId, team.n, defaultDiv.age_group).run();
          teamId = newId;
        }

        // Insert registration
        const regId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(
          `INSERT INTO registrations (id, event_id, event_division_id, team_id, registered_by, status, payment_status, amount_cents, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(regId, evt.d1Id, defaultDiv.id, teamId, systemUserId, team.s, team.p, team.a || null).run();
        inserted++;
      } catch (e: any) {
        // Skip individual failures
        continue;
      }
    }

    results.push({ eventId: evt.d1Id, inserted });
  }

  return c.json({ success: true, results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message, stack: e.stack?.substring(0, 500) }, 500);
  }
});

// ==================
// ADMIN: Publish / unpublish schedule
// ==================
eventRoutes.post('/:eventId/publish-schedule', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Verify event exists
  const event = await db.prepare('SELECT id, name, schedule_published FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Toggle: if already published, unpublish; otherwise publish
  const body = await c.req.json().catch(() => ({}));
  const publish = typeof body.publish === 'boolean' ? body.publish : (event.schedule_published !== 1);

  await db.prepare('UPDATE events SET schedule_published = ? WHERE id = ?')
    .bind(publish ? 1 : 0, eventId)
    .run();

  return c.json({
    success: true,
    data: {
      schedule_published: publish ? 1 : 0,
      message: publish ? 'Schedule published — now visible to the public.' : 'Schedule unpublished — hidden from public.',
    },
  });
});

// ==================
// PUBLIC: Get schedule for an event (no auth required)
// ==================
eventRoutes.get('/:eventId/schedule', async (c) => {
  const eventId = c.req.param('eventId');
  const teamId = c.req.query('team_id');
  const db = c.env.DB;

  // Check if schedule is published
  const event = await db.prepare('SELECT id, schedule_published FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);
  if (!event.schedule_published) {
    return c.json({ success: true, data: [] });
  }

  let query = `
    SELECT g.id, g.game_number, g.event_id, g.event_division_id,
      g.home_team_id, g.away_team_id, g.venue_id, g.rink_id,
      g.start_time, g.end_time, g.status, g.game_type, g.pool_name,
      g.home_score, g.away_score, g.period, g.is_overtime, g.is_shootout,
      g.home_locker_room, g.away_locker_room,
      g.delay_minutes, g.delay_note,
      COALESCE(ht.schedule_name, CASE WHEN ht.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = ht.organization_id), ht.name) || ' (' || TRIM(SUBSTR(ht.head_coach_name, INSTR(ht.head_coach_name, ' '))) || ')' ELSE ht.name END) as home_team_name,
      COALESCE(at2.schedule_name, CASE WHEN at2.head_coach_name LIKE '% %' THEN COALESCE((SELECT og.name FROM organizations og WHERE og.id = at2.organization_id), at2.name) || ' (' || TRIM(SUBSTR(at2.head_coach_name, INSTR(at2.head_coach_name, ' '))) || ')' ELSE at2.name END) as away_team_name,
      vr.name as rink_name,
      v.name as venue_name,
      ed.age_group, ed.division_level,
      (ed.age_group || ' ' || COALESCE(ed.division_level, '')) as division_name
    FROM games g
    LEFT JOIN teams ht ON ht.id = g.home_team_id
    LEFT JOIN teams at2 ON at2.id = g.away_team_id
    LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
    LEFT JOIN venues v ON v.id = g.venue_id
    LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
    WHERE g.event_id = ?
  `;
  const bindings: any[] = [eventId];

  if (teamId) {
    query += ` AND (g.home_team_id = ? OR g.away_team_id = ?)`;
    bindings.push(teamId, teamId);
  }

  query += ` ORDER BY g.start_time ASC, g.game_number ASC`;

  const result = await db.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Seed registrations with hotel assignments (temporary migration helper)
// ==================
eventRoutes.post('/admin/seed-registrations', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { event_id, teams } = body;
  // teams: [{ team_name, event_division_id, hotel_assigned, status, payment_status }]

  if (!event_id || !teams || !Array.isArray(teams)) {
    return c.json({ success: false, error: 'event_id and teams[] required' }, 400);
  }

  // Step 1: Ensure hotel_assigned column exists on registrations
  try {
    await db.prepare("ALTER TABLE registrations ADD COLUMN hotel_assigned TEXT").run();
  } catch (e: any) {
    // Column already exists — that's fine
    console.log('ALTER TABLE note:', e.message);
  }

  // Step 2: Ensure system-import user exists (for registered_by FK)
  try {
    await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, created_at) VALUES ('system-import', 'system@import.local', 'no-login', 'System', 'Import', datetime('now'))").run();
  } catch (e: any) {
    console.log('System user note:', e.message);
  }

  // Step 3: Auto-create event_divisions if needed
  const divisionSet = new Set(teams.map((t: any) => t.event_division_id));
  for (const divId of divisionSet) {
    const exists = await db.prepare("SELECT id FROM event_divisions WHERE id = ?").bind(divId).first();
    if (!exists) {
      // Parse age group from the div ID suffix
      const parts = (divId as string).split('-');
      const ageSlug = parts.slice(1).join('-'); // e.g. "pee-wee", "16ujv", "18uvar"
      const ageMap: Record<string, string> = {
        'bantam': 'Bantam', 'mite': 'Mite', 'pee-wee': 'Pee Wee', 'squirt': 'Squirt',
        '16ujv': '16u/JV', '18uvar': '18u/Var.'
      };
      const ageGroup = ageMap[ageSlug] || ageSlug;
      try {
        await db.prepare(
          "INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at) VALUES (?, ?, ?, NULL, 0, 'open', datetime('now'))"
        ).bind(divId, event_id, ageGroup).run();
        console.log(`Created division: ${divId} => ${ageGroup}`);
      } catch (e: any) {
        console.log('Division create note:', e.message);
      }
    }
  }

  // Step 4: Disable foreign keys temporarily for hotel_assigned (new column, no FK)
  const results: any[] = [];

  for (const t of teams) {
    try {
      // Create or find team
      let team = await db.prepare("SELECT id FROM teams WHERE name = ?").bind(t.team_name).first<any>();
      if (!team) {
        const teamId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare("INSERT INTO teams (id, name, created_at) VALUES (?, ?, datetime('now'))").bind(teamId, t.team_name).run();
        team = { id: teamId };
      }

      // Check for existing registration
      const existing = await db.prepare(
        "SELECT id FROM registrations WHERE event_id = ? AND team_id = ? AND event_division_id = ?"
      ).bind(event_id, team.id, t.event_division_id).first();

      if (existing) {
        results.push({ team: t.team_name, status: 'skipped', reason: 'already exists' });
        continue;
      }

      // Verify all FKs exist before inserting
      const divCheck = await db.prepare("SELECT id FROM event_divisions WHERE id = ?").bind(t.event_division_id).first();
      const eventCheck = await db.prepare("SELECT id FROM events WHERE id = ?").bind(event_id).first();
      const userCheck = await db.prepare("SELECT id FROM users WHERE id = ?").bind('system-import').first();

      if (!divCheck || !eventCheck || !userCheck) {
        results.push({ team: t.team_name, status: 'error', error: `FK check: div=${!!divCheck}, event=${!!eventCheck}, user=${!!userCheck}, divId=${t.event_division_id}` });
        continue;
      }

      // Create registration - skip hotel_assigned if column doesn't exist yet
      const regId = crypto.randomUUID().replace(/-/g, '');
      try {
        await db.prepare(`
          INSERT INTO registrations (id, event_id, event_division_id, team_id, registered_by, status, payment_status, amount_cents, hotel_assigned, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'system-import', ?, ?, 0, ?, datetime('now'), datetime('now'))
        `).bind(
          regId, event_id, t.event_division_id, team.id,
          t.status || 'approved',
          t.payment_status || 'paid',
          t.hotel_assigned || null
        ).run();
      } catch (insertErr: any) {
        // If hotel_assigned column doesn't exist, try without it
        if (insertErr.message?.includes('hotel_assigned')) {
          await db.prepare(`
            INSERT INTO registrations (id, event_id, event_division_id, team_id, registered_by, status, payment_status, amount_cents, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'system-import', ?, ?, 0, datetime('now'), datetime('now'))
          `).bind(
            regId, event_id, t.event_division_id, team.id,
            t.status || 'approved',
            t.payment_status || 'paid'
          ).run();
        } else {
          throw insertErr;
        }
      }

      results.push({ team: t.team_name, status: 'inserted', regId });
    } catch (e: any) {
      results.push({ team: t.team_name, status: 'error', error: e.message });
    }
  }

  return c.json({ success: true, inserted: results.filter(r => r.status === 'inserted').length, total: teams.length, results });
});

// ==================
// ADMIN: Bulk create event_hotels from names (for importing hotel data)
// ==================
eventRoutes.post('/admin/seed-event-hotels', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { event_id, hotels } = body;
  // hotels: [{ hotel_name, city, state }]

  if (!event_id || !hotels || !Array.isArray(hotels)) {
    return c.json({ success: false, error: 'event_id and hotels[] required' }, 400);
  }

  // Ensure event_hotels table exists
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS event_hotels (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id),
        master_hotel_id TEXT REFERENCES master_hotels(id),
        hotel_name TEXT NOT NULL,
        address TEXT, city TEXT, state TEXT, phone TEXT,
        rate_description TEXT, booking_url TEXT, booking_code TEXT,
        room_block_count INTEGER,
        price_per_night INTEGER,
        contact_name TEXT, contact_email TEXT, contact_phone TEXT, contact_title TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
  } catch (e: any) {
    console.log('event_hotels table note:', e.message);
  }

  const results: any[] = [];
  let sortOrder = 0;

  for (const h of hotels) {
    try {
      const existing = await db.prepare(
        "SELECT id FROM event_hotels WHERE event_id = ? AND hotel_name = ?"
      ).bind(event_id, h.hotel_name).first();

      if (existing) {
        results.push({ hotel: h.hotel_name, status: 'skipped' });
        continue;
      }

      const id = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO event_hotels (id, event_id, hotel_name, city, state, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, event_id, h.hotel_name, h.city || 'South Bend', h.state || 'Indiana', sortOrder++).run();

      results.push({ hotel: h.hotel_name, status: 'inserted' });
    } catch (e: any) {
      results.push({ hotel: h.hotel_name, status: 'error', error: e.message });
    }
  }

  return c.json({ success: true, results });
});

// ==================
// ADMIN: Fix registration age groups by matching team names
// ==================
eventRoutes.post('/admin/fix-age-groups', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const { event_id, teams } = body;
  // teams: [{ team_name, age_group }]

  if (!event_id || !teams || !Array.isArray(teams)) {
    return c.json({ success: false, error: 'event_id and teams[] required' }, 400);
  }

  // Get all unique age groups needed
  const ageGroups = [...new Set(teams.map((t: any) => t.age_group))];

  // Ensure event_divisions exist for each age group
  const divMap: Record<string, string> = {};
  for (const ag of ageGroups) {
    const slug = ag.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const divId = event_id.substring(0, 16) + '-' + slug;

    const existing = await db.prepare("SELECT id FROM event_divisions WHERE id = ?").bind(divId).first();
    if (!existing) {
      try {
        await db.prepare(
          "INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at) VALUES (?, ?, ?, NULL, 0, 'open', datetime('now'))"
        ).bind(divId, event_id, ag).run();
      } catch (e: any) {
        // Try without specific ID
        const altId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(
          "INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at) VALUES (?, ?, ?, NULL, 0, 'open', datetime('now'))"
        ).bind(altId, event_id, ag).run();
        divMap[ag] = altId;
        continue;
      }
    }
    divMap[ag] = divId;
  }

  // Get all registrations for this event with team names
  const regs = await db.prepare(`
    SELECT r.id, t.name as team_name, r.event_division_id
    FROM registrations r
    LEFT JOIN teams t ON t.id = r.team_id
    WHERE r.event_id = ?
  `).bind(event_id).all();

  const results: any[] = [];
  let updated = 0;

  // For each registration, find matching team in the provided list and update division
  for (const reg of regs.results as any[]) {
    const teamName = reg.team_name;
    const match = teams.find((t: any) => t.team_name === teamName);

    if (match) {
      const correctDivId = divMap[match.age_group];
      if (correctDivId && correctDivId !== reg.event_division_id) {
        await db.prepare("UPDATE registrations SET event_division_id = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(correctDivId, reg.id).run();
        updated++;
        results.push({ team: teamName, status: 'updated', from: reg.event_division_id, to: correctDivId, age: match.age_group });
      } else {
        results.push({ team: teamName, status: 'already_correct' });
      }
    } else {
      results.push({ team: teamName, status: 'no_match' });
    }
  }

  // Clean up old unused event_divisions for this event
  await db.prepare(`
    DELETE FROM event_divisions
    WHERE event_id = ?
    AND id NOT IN (SELECT DISTINCT event_division_id FROM registrations WHERE event_id = ?)
  `).bind(event_id, event_id).run();

  return c.json({ success: true, updated, total: regs.results.length, divMap, results });
});

// ==================
// PUBLIC: Validate a discount code
// ==================
eventRoutes.post('/validate-discount-code', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json() as { code: string; teamId?: string; eventId?: string };
  const { code, eventId } = body;

  if (!code) {
    return c.json({ success: false, error: 'Code is required' }, 400);
  }

  // Auto-migrate
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, registration_id TEXT NOT NULL,
      team_name TEXT NOT NULL, team_id TEXT, event_id TEXT NOT NULL, email TEXT NOT NULL,
      discount_local_cents INTEGER NOT NULL DEFAULT 10000, discount_hotel_cents INTEGER NOT NULL DEFAULT 20000,
      is_used INTEGER NOT NULL DEFAULT 0, used_registration_id TEXT, used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch {}

  const dc = await db.prepare(
    'SELECT id, code, team_name, team_id, event_id, discount_local_cents, discount_hotel_cents, is_used FROM discount_codes WHERE code = ?'
  ).bind(code.trim().toUpperCase()).first<any>();

  if (dc) {
    if (dc.is_used) {
      return c.json({ success: false, error: 'This code has already been used' }, 400);
    }
    // Reward codes apply to the team's NEXT event, never the one that earned them
    if (eventId && dc.event_id === eventId) {
      return c.json({ success: false, error: 'This code was earned from this event — it applies when you register for your next event.' }, 400);
    }
    return c.json({
      success: true,
      data: {
        code_id: dc.id,
        code: dc.code,
        team_name: dc.team_name,
        discount_local_cents: dc.discount_local_cents,
        discount_hotel_cents: dc.discount_hotel_cents,
      },
    });
  }

  // Fallback: check admin coupon_codes table
  try {
    const coupon = await db.prepare(
      'SELECT * FROM coupon_codes WHERE UPPER(code) = UPPER(?)'
    ).bind(code.trim()).first<any>();

    if (coupon) {
      if (!coupon.is_active) {
        return c.json({ success: false, error: 'This coupon code is no longer active' }, 400);
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return c.json({ success: false, error: 'This coupon code has expired' }, 400);
      }
      if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
        return c.json({ success: false, error: 'This coupon code has reached its usage limit' }, 400);
      }

      // For fixed: discount_amount is in cents
      // For percent: pass 0 as cents, frontend will calculate from percentage
      const fixedCents = coupon.discount_type === 'fixed' ? coupon.discount_amount : 0;

      return c.json({
        success: true,
        data: {
          code_id: coupon.id,
          code: coupon.code,
          type: 'coupon',
          discount_type: coupon.discount_type,
          discount_amount: coupon.discount_amount,
          discount_local_cents: fixedCents,
          discount_hotel_cents: fixedCents,
        },
      });
    }
  } catch {}

  // Fallback: check meeting_rewards table
  try {
    const reward = await db.prepare(
      'SELECT id, code, amount, redeemed FROM meeting_rewards WHERE UPPER(code) = UPPER(?)'
    ).bind(code.trim()).first<any>();

    if (reward) {
      if (reward.redeemed === 1) {
        return c.json({ success: false, error: 'This code has already been used' }, 400);
      }
      const rewardCents = (reward.amount || 0) * 100;
      return c.json({
        success: true,
        data: {
          code_id: reward.id,
          code: reward.code,
          type: 'meeting_reward',
          amount: reward.amount,
          discount_local_cents: rewardCents,
          discount_hotel_cents: rewardCents,
        },
      });
    }
  } catch {}

  return c.json({ success: false, error: 'Invalid discount code' }, 404);
});

// ==================
// PUBLIC: Redeem a discount code
// ==================
eventRoutes.post('/redeem-discount-code', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json() as { code: string; registrationId: string };
  const { code, registrationId } = body;

  if (!code || !registrationId) {
    return c.json({ success: false, error: 'Code and registrationId are required' }, 400);
  }

  const dc = await db.prepare(
    'SELECT id, is_used, event_id, registration_id FROM discount_codes WHERE code = ?'
  ).bind(code.trim().toUpperCase()).first<any>();

  if (!dc) {
    return c.json({ success: false, error: 'Invalid discount code' }, 404);
  }
  if (dc.is_used) {
    return c.json({ success: false, error: 'This code has already been used' }, 400);
  }
  // Never redeemable on the event that earned it (or the earning registration)
  const redeemReg = await db.prepare(
    'SELECT event_id FROM event_registrations WHERE id = ?'
  ).bind(registrationId).first<any>();
  if (registrationId === dc.registration_id || (redeemReg?.event_id && redeemReg.event_id === dc.event_id)) {
    return c.json({ success: false, error: 'This code was earned from this event — it applies when you register for your next event.' }, 400);
  }

  await db.prepare(
    "UPDATE discount_codes SET is_used = 1, used_registration_id = ?, used_at = datetime('now') WHERE id = ?"
  ).bind(registrationId, dc.id).run();

  return c.json({ success: true, message: 'Discount code redeemed' });
});

// ==================
// ADMIN: Discount code stats
// ==================
eventRoutes.get('/discount-code-stats', async (c) => {
  const db = c.env.DB;

  // Auto-migrate
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, registration_id TEXT NOT NULL,
      team_name TEXT NOT NULL, team_id TEXT, event_id TEXT NOT NULL, email TEXT NOT NULL,
      discount_local_cents INTEGER NOT NULL DEFAULT 10000, discount_hotel_cents INTEGER NOT NULL DEFAULT 20000,
      is_used INTEGER NOT NULL DEFAULT 0, used_registration_id TEXT, used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch {}

  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total_created,
      SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) as total_redeemed,
      SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END) as total_unredeemed,
      SUM(CASE WHEN is_used = 1 THEN discount_local_cents ELSE 0 END) as total_local_savings_cents,
      SUM(CASE WHEN is_used = 1 THEN discount_hotel_cents ELSE 0 END) as total_hotel_savings_cents
    FROM discount_codes
  `).first<any>();

  return c.json({
    success: true,
    data: {
      total_created: stats?.total_created || 0,
      total_redeemed: stats?.total_redeemed || 0,
      total_unredeemed: stats?.total_unredeemed || 0,
      total_local_savings_cents: stats?.total_local_savings_cents || 0,
      total_hotel_savings_cents: stats?.total_hotel_savings_cents || 0,
    },
  });
});

// ==================
// PUBLIC: Get discount codes for a registration
// ==================
eventRoutes.get('/discount-codes/:registrationId', async (c) => {
  const db = c.env.DB;
  const registrationId = c.req.param('registrationId');

  // Auto-migrate
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, registration_id TEXT NOT NULL,
      team_name TEXT NOT NULL, team_id TEXT, event_id TEXT NOT NULL, email TEXT NOT NULL,
      discount_local_cents INTEGER NOT NULL DEFAULT 10000, discount_hotel_cents INTEGER NOT NULL DEFAULT 20000,
      is_used INTEGER NOT NULL DEFAULT 0, used_registration_id TEXT, used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch {}

  const codes = await db.prepare(
    'SELECT id, code, team_name, discount_local_cents, discount_hotel_cents, is_used, used_at, created_at FROM discount_codes WHERE registration_id = ?'
  ).bind(registrationId).all();

  return c.json({ success: true, data: codes.results || [] });
});

// ==================
// NOTIFY: Send hotel notification emails to teams who need hotels
// ==================
eventRoutes.post('/:eventId/notify-hotels', authMiddleware, async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');

  // Auto-migrate columns
  try {
    await db.prepare("ALTER TABLE events ADD COLUMN hotels_notified_at TEXT").run();
  } catch {}
  try {
    await db.prepare("ALTER TABLE event_registrations ADD COLUMN needs_hotel INTEGER DEFAULT 0").run();
  } catch {}

  // Get event info
  const event = await db.prepare('SELECT id, name, city, state, start_date, end_date, logo_url FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Find registrations that need hotel but haven't selected one yet
  const regs = await db.prepare(
    `SELECT id, team_name, email1, manager_first_name, manager_last_name
     FROM event_registrations
     WHERE event_id = ? AND needs_hotel = 1 AND (hotel_choice_1 IS NULL OR hotel_choice_1 = '')
     AND status NOT IN ('denied', 'rejected', 'withdrawn')`
  ).bind(eventId).all<any>();

  const registrations = regs.results || [];
  if (registrations.length === 0) {
    return c.json({ success: true, data: { emailsSent: 0, message: 'No teams need hotel notifications.' } });
  }

  const siteBase = c.env.SITE_URL || 'https://ultimatetournaments.com';
  let sentCount = 0;

  for (const reg of registrations) {
    if (!reg.email1) continue;

    const startDate = new Date(event.start_date + 'T12:00:00');
    const endDate = new Date(event.end_date + 'T12:00:00');
    const dateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const recipientName = reg.manager_first_name ? `${reg.manager_first_name} ${reg.manager_last_name || ''}`.trim() : reg.team_name;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #003e79, #001f3f); padding: 32px; text-align: center;">
              <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="Ultimate Tournaments" width="180" style="height: auto; margin-bottom: 16px;">
              <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">Hotels Now Available!</h1>
              <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0 0;">Book your team's hotel for the tournament</p>
            </td>
          </tr>

          ${event.logo_url ? `<tr>
            <td style="padding: 24px 32px 0 32px; text-align: center;">
              <img src="${event.logo_url}" alt="${event.name}" width="100" height="100" style="border-radius: 14px; object-fit: cover; display: inline-block;">
            </td>
          </tr>` : ''}

          <!-- Event Badge -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #6e6e73; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Event</p>
                    <p style="margin: 4px 0 0 0; font-size: 18px; color: #003e79; font-weight: 700;">${event.name}</p>
                    <p style="margin: 4px 0 0 0; font-size: 14px; color: #6e6e73;">${dateStr} &middot; ${event.city}, ${event.state}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 20px 16px 20px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color: #003e79; color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">${reg.team_name}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px 32px 0 32px; font-size: 15px; line-height: 1.6; color: #1d1d1f;">
              <p style="margin: 0 0 16px 0;">Hi ${recipientName},</p>
              <p style="margin: 0 0 16px 0;">Great news! Hotel booking is now open for the <strong>${event.name}</strong>. We've partnered with local hotels to offer special tournament rates for your team.</p>
              <p style="margin: 0 0 24px 0;">Click below to view available hotels and select your top preferences. Rooms fill up fast, so we recommend booking early!</p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 32px 24px 32px;" align="center">
              <a href="${siteBase}/register/update-hotel?reg=${reg.id}&event=${eventId}"
                 style="display: inline-block; background: linear-gradient(135deg, #00ccff, #0099cc); color: #ffffff; font-size: 16px; font-weight: 700; padding: 14px 40px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 12px rgba(0,204,255,0.3);">
                Select Your Hotel
              </a>
            </td>
          </tr>

          <!-- Info Box -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #92400e;">How It Works</p>
                    <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.6;">
                      Select your top 3 hotel preferences and we'll do our best to accommodate your first choice. Tournament hotel rates are typically lower than standard rates.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- App Download -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
                    <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
                    <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f7; padding: 24px 32px; border-top: 1px solid #e8e8ed;">
              <p style="margin: 0; font-size: 12px; color: #86868b; text-align: center;">
                Ultimate Hockey Tournaments &middot; ultimatetournaments.com
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #aeaeb2; text-align: center;">
                You're receiving this because you registered for ${event.name} and indicated you need a hotel.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.RESEND_API}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
          to: [reg.email1],
          subject: `Hotels Now Available for ${event.name}!`,
          html,
        }),
      });
      if (response.ok) sentCount++;
    } catch (err) {
      console.error(`Failed to send hotel email to ${reg.email1}:`, err);
    }
  }

  // Update event with notification timestamp
  try {
    await db.prepare("UPDATE events SET hotels_notified_at = datetime('now') WHERE id = ?").bind(eventId).run();
  } catch (err) {
    console.error('Failed to update hotels_notified_at:', err);
  }

  return c.json({
    success: true,
    data: {
      emailsSent: sentCount,
      totalEligible: registrations.length,
      message: `Sent ${sentCount} hotel notification email${sentCount !== 1 ? 's' : ''}.`,
    },
  });
});

// ==================
// PUBLIC: Update registration hotel choices (from hotel notification email link)
// ==================
eventRoutes.patch('/registration/:regId/hotels', async (c) => {
  const db = c.env.DB;
  const regId = c.req.param('regId');
  const body = await c.req.json() as any;

  const { hotelChoice1, hotelChoice2, hotelChoice3 } = body;

  // Verify registration exists
  const reg = await db.prepare('SELECT id FROM event_registrations WHERE id = ?').bind(regId).first();
  if (!reg) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }

  await db.prepare(`
    UPDATE event_registrations
    SET hotel_choice_1 = ?, hotel_choice_2 = ?, hotel_choice_3 = ?, needs_hotel = 0
    WHERE id = ?
  `).bind(
    hotelChoice1 || null, hotelChoice2 || null, hotelChoice3 || null,
    regId
  ).run();

  return c.json({ success: true, data: { message: 'Hotel preferences updated!' } });
});

// ==================
// PUBLIC: Get registration info for hotel update page
// ==================
eventRoutes.get('/registration/:regId/info', async (c) => {
  const db = c.env.DB;
  const regId = c.req.param('regId');

  const reg = await db.prepare(
    'SELECT id, event_id, team_name, age_group, email1, hotel_choice_1, hotel_choice_2, hotel_choice_3, needs_hotel FROM event_registrations WHERE id = ?'
  ).bind(regId).first<any>();

  if (!reg) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }

  return c.json({ success: true, data: reg });
});

// ==================
// ADMIN: Get count of teams needing hotel notifications
// ==================
eventRoutes.get('/admin/needs-hotel-count/:eventId', async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');

  // Auto-migrate
  try {
    await db.prepare("ALTER TABLE event_registrations ADD COLUMN needs_hotel INTEGER DEFAULT 0").run();
  } catch {}

  const result = await db.prepare(
    `SELECT COUNT(*) as count FROM event_registrations
     WHERE event_id = ? AND needs_hotel = 1 AND (hotel_choice_1 IS NULL OR hotel_choice_1 = '')
     AND status NOT IN ('denied', 'rejected', 'withdrawn')`
  ).bind(eventId).first<any>();

  return c.json({ success: true, data: { count: result?.count || 0 } });
});
