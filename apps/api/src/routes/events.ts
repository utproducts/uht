import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { optionalAuth } from '../middleware/auth';
import { sendApprovalEmail } from '../lib/approval-email';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';

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
    (SELECT GROUP_CONCAT(DISTINCT ed2.age_group) FROM event_divisions ed2 WHERE ed2.event_id = e.id) as age_groups
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
// PUBLIC: Get single event by slug
// ==================
eventRoutes.get('/:slug', optionalAuth, async (c) => {
  const slug = c.req.param('slug');
  const db = c.env.DB;

  const event = await db.prepare(`
    SELECT e.*, v.name as venue_name, v.address as venue_address,
           v.city as venue_city, v.state as venue_state
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    WHERE e.slug = ?
  `).bind(slug).first();

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

  return c.json({
    success: true,
    data: {
      ...event,
      divisions: divisions.results,
    },
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
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'approved') as registration_count,
      (SELECT COALESCE(SUM(COALESCE(r2.amount_cents, ed2.price_cents)), 0) FROM registrations r2 LEFT JOIN event_divisions ed2 ON ed2.id = r2.event_division_id WHERE r2.event_id = e.id AND r2.payment_status = 'paid' AND r2.status = 'approved') as total_revenue_cents
    FROM events e
    LEFT JOIN tournaments t ON t.id = e.tournament_id
    WHERE 1=1 ${dateCondition} ${searchCondition}
    ORDER BY e.start_date DESC
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
      ed.age_group,
      ed.division_level as division,
      r.hotel_assigned,
      r.notes,
      r.event_division_id,
      r.created_at, r.updated_at
    FROM registrations r
    LEFT JOIN teams t ON t.id = r.team_id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE r.event_id = ?
    ORDER BY ed.age_group ASC, t.name ASC
  `).bind(id).all();

  // Also check legacy event_registrations table for any data there
  const legacyRegs = await db.prepare(`
    SELECT * FROM event_registrations
    WHERE event_id = ?
    ORDER BY age_group ASC, team_name ASC
  `).bind(id).all();

  // Merge: use normalized registrations, fall back to legacy if normalized is empty
  const allRegs = registrations.results.length > 0 ? registrations.results : legacyRegs.results;

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
  })),
});

eventRoutes.put('/admin/:id/divisions', zValidator('json', saveDivisionsSchema), async (c) => {
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
        UPDATE event_divisions SET age_group = ?, division_level = ?, max_teams = ?, price_cents = ?
        WHERE id = ? AND event_id = ?
      `).bind(
        div.age_group, div.division_level || null, div.max_teams || null,
        div.price_cents,
        div.id, eventId
      ).run();
      currentMap.delete(div.id);
    } else {
      // Insert new
      const newId = div.id || crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO event_divisions (id, event_id, age_group, division_level, max_teams, price_cents)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        newId, eventId, div.age_group, div.division_level || null,
        div.max_teams || null, div.price_cents
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

eventRoutes.patch('/admin/update/:id', zValidator('json', updateEventSchema), async (c) => {
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
});

eventRoutes.post('/admin/create', zValidator('json', createEventSimpleSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  await db.prepare(`
    INSERT INTO events (id, name, slug, city, state, start_date, end_date, tournament_id, venue_id, status,
      description, information, price_cents, deposit_cents, slots_count, age_groups, divisions,
      season, timezone, registration_open_date, registration_deadline, scorekeeper_pin,
      rules_url, logo_url, banner_url, hide_availability, show_participants, multi_event_discount_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.name, slug, data.city, data.state, data.start_date, data.end_date,
    data.tournament_id || null, data.venue_id || null, data.status || 'draft',
    data.description || null, data.information || null,
    data.price_cents || null, data.deposit_cents || null, data.slots_count || 100,
    data.age_groups || null, data.divisions || null,
    data.season || null, data.timezone || 'Central (CST)',
    data.registration_open_date || null, data.registration_deadline || null, pin,
    data.rules_url || null, data.logo_url || null, data.banner_url || null,
    data.hide_availability || 0, data.show_participants ?? 1, data.multi_event_discount_pct || 0
  ).run();

  return c.json({ success: true, data: { id, slug, scorekeeper_pin: pin } }, 201);
});

// ==================
// ADMIN: Delete event
// ==================
eventRoutes.delete('/admin/delete/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'Event not found' }, 404);

  // Delete registrations first
  await db.prepare('DELETE FROM event_registrations WHERE event_id = ?').bind(id).run();
  // Delete the event
  await db.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

  return c.json({ success: true, data: { deleted: existing.name } });
});

// ==================
// ADMIN: Duplicate event (simple copy)
// ==================
eventRoutes.post('/admin/duplicate/:id', async (c) => {
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
    SELECT id, name, city, state, start_date, end_date, price_cents, deposit_cents, multi_event_discount_pct, logo_url
    FROM events
    WHERE id != ? AND status IN ('registration_open', 'active')
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
  const result = await db.prepare(`
    SELECT id, hotel_name, city, state, rate_description, booking_url
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
    const rinks = venue ? await db.prepare('SELECT * FROM venue_rinks WHERE venue_id = ?').bind(venue.id).all() : { results: [] };
    return c.json({ success: true, data: venue ? [{ ...venue, rinks: rinks.results }] : [] });
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
eventRoutes.put('/admin/event-venues/:eventId', async (c) => {
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
eventRoutes.patch('/event-info/:eventId', async (c) => {
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
eventRoutes.post('/ai-generate-description/:eventId', async (c) => {
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
    'SELECT id, name, city, state, start_date, end_date, status, price_cents, deposit_cents FROM events WHERE id = ?'
  ).bind(data.eventId).first<any>();

  if (!event) {
    return c.json({ success: false, error: 'Event not found' }, 404);
  }
  if (event.status !== 'registration_open' && event.status !== 'active' && event.status !== 'published') {
    return c.json({ success: false, error: 'Registration is not open for this event' }, 400);
  }

  // Check if team is already registered for primary event
  const existing = await db.prepare(
    "SELECT id FROM event_registrations WHERE event_id = ? AND team_name = ? AND status != 'denied'"
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
        "SELECT id FROM event_registrations WHERE event_id = ? AND team_name = ? AND status != 'denied'"
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

  // Create registration for primary event with 'pending' status
  const regIds: string[] = [];
  const regId = crypto.randomUUID().replace(/-/g, '');
  regIds.push(regId);

  await db.prepare(`
    INSERT INTO event_registrations (id, event_id, team_name, age_group, division, manager_first_name, manager_last_name, email1, phone, status, payment_status, hotel_choice_1, hotel_choice_2, hotel_choice_3)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).bind(
    regId, data.eventId, data.teamName, data.ageGroup, data.division || null,
    data.managerFirstName || null, data.managerLastName || null,
    data.email, data.phone || null,
    data.paymentChoice === 'pay_now' ? 'unpaid' : 'unpaid',
    data.hotelChoice1 || null, data.hotelChoice2 || null, data.hotelChoice3 || null
  ).run();

  // Create registrations for additional events
  for (const addEvent of additionalEvents) {
    const addRegId = crypto.randomUUID().replace(/-/g, '');
    regIds.push(addRegId);

    await db.prepare(`
      INSERT INTO event_registrations (id, event_id, team_name, age_group, division, manager_first_name, manager_last_name, email1, phone, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      addRegId, addEvent.id, data.teamName, data.ageGroup, data.division || null,
      data.managerFirstName || null, data.managerLastName || null,
      data.email, data.phone || null,
      data.paymentChoice === 'pay_now' ? 'unpaid' : 'unpaid'
    ).run();
  }

  // Send confirmation email
  const startDate = new Date(event.start_date + 'T12:00:00');
  const endDate = new Date(event.end_date + 'T12:00:00');
  const eventDateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  let emailResult = { success: false, error: 'not sent' };
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
    });
  } catch (err: any) {
    console.error('Registration confirmation email error:', err);
  }

  return c.json({
    success: true,
    data: {
      primaryRegistrationId: regId,
      allRegistrationIds: regIds,
      eventsRegistered: eventIds.length,
      status: 'pending',
      email_sent: emailResult.success,
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
  status: z.enum(['pending', 'approved', 'denied', 'waitlisted', 'withdrawn', 'rejected']).optional(),
  payment_status: z.enum(['unpaid', 'paid', 'partial', 'refunded', 'comp']).optional(),
  payment_amount_cents: z.number().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  hotel_assigned: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  event_division_id: z.string().optional(),
  team_name: z.string().optional(),
});

eventRoutes.patch('/admin/registration/:regId', zValidator('json', updateRegistrationSchema), async (c) => {
  const regId = c.req.param('regId');
  const data = c.req.valid('json');
  const db = c.env.DB;

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
  if (useNormalized && data.event_division_id !== undefined) {
    setClauses.push('event_division_id = ?');
    params.push(data.event_division_id);
  }
  // Update team name if provided (normalized only)
  if (useNormalized && data.team_name !== undefined) {
    // Get team_id from registration, then update team name
    const regForTeam = await db.prepare('SELECT team_id FROM registrations WHERE id = ?').bind(regId).first<any>();
    if (regForTeam?.team_id) {
      await db.prepare("UPDATE teams SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(data.team_name, regForTeam.team_id).run();
    }
  }

  if (setClauses.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  setClauses.push("updated_at = datetime('now')");
  params.push(regId);

  const tableName = useNormalized ? 'registrations' : 'event_registrations';
  await db.prepare(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();

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

        // Collect CC emails (manager email2, coach emails if available)
        const ccEmails: string[] = [];
        if (updated.email2) ccEmails.push(updated.email2);

        const emailResult = await sendApprovalEmail(c.env, {
          recipientEmail: updated.email1,
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
        });

        // Include email status in response
        (updated as any).email_sent = emailResult.success;
        if (!emailResult.success) {
          (updated as any).email_error = emailResult.error;
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
  // Auto-migrate: add price_per_night if missing
  try { await db.prepare("ALTER TABLE event_hotels ADD COLUMN price_per_night INTEGER").run(); } catch (_) { /* already exists */ }
  const result = await db.prepare(`
    SELECT * FROM event_hotels WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC, hotel_name ASC
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
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
  sort_order: z.number().optional(),
});

eventRoutes.post('/admin/event-hotels', zValidator('json', addHotelSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO event_hotels (id, event_id, hotel_name, address, city, state, phone, rate_description, booking_url, booking_code, room_block_count, price_per_night, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.event_id, data.hotel_name, data.address || null, data.city || null, data.state || null,
    data.phone || null, data.rate_description || null, data.booking_url || null, data.booking_code || null,
    data.room_block_count || null, data.price_per_night || null, data.sort_order || 0
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
});

eventRoutes.patch('/admin/event-hotels/:id', zValidator('json', updateHotelSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

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
eventRoutes.delete('/admin/event-hotels/:id', async (c) => {
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
eventRoutes.post('/admin/bulk-import-registrations', async (c) => {
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
// ADMIN: Seed registrations with hotel assignments (temporary migration helper)
// ==================
eventRoutes.post('/admin/seed-registrations', async (c) => {
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
          "INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at) VALUES (?, ?, ?, 'Open', 0, 'open', datetime('now'))"
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
eventRoutes.post('/admin/seed-event-hotels', async (c) => {
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
eventRoutes.post('/admin/fix-age-groups', async (c) => {
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
          "INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at) VALUES (?, ?, ?, 'Open', 0, 'open', datetime('now'))"
        ).bind(divId, event_id, ag).run();
      } catch (e: any) {
        // Try without specific ID
        const altId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(
          "INSERT INTO event_divisions (id, event_id, age_group, division_level, price_cents, status, created_at) VALUES (?, ?, ?, 'Open', 0, 'open', datetime('now'))"
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
