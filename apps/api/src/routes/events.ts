import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { optionalAuth } from '../middleware/auth';

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
  const { filter = 'upcoming' } = c.req.query();
  const today = new Date().toISOString().split('T')[0];

  let dateCondition = '';
  if (filter === 'upcoming') {
    dateCondition = `AND e.end_date >= '${today}'`;
  } else if (filter === 'past') {
    dateCondition = `AND e.end_date < '${today}'`;
  }

  const result = await db.prepare(`
    SELECT e.*,
      t.name as tournament_name, t.location as tournament_location,
      (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id) as registration_count,
      (SELECT SUM(er2.payment_amount_cents) FROM event_registrations er2 WHERE er2.event_id = e.id AND er2.payment_amount_cents IS NOT NULL) as total_revenue_cents
    FROM events e
    LEFT JOIN tournaments t ON t.id = e.tournament_id
    WHERE 1=1 ${dateCondition}
    ORDER BY e.start_date ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Get single event detail with registrations
// ==================
eventRoutes.get('/admin/detail/:id', async (c) => {
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

  // Get registrations grouped by age_group
  const registrations = await db.prepare(`
    SELECT * FROM event_registrations
    WHERE event_id = ?
    ORDER BY age_group ASC, team_name ASC
  `).bind(id).all();

  // Get registration summary by age group
  const summary = await db.prepare(`
    SELECT age_group, COUNT(*) as team_count,
      SUM(CASE WHEN payment_amount_cents IS NOT NULL THEN payment_amount_cents ELSE 0 END) as revenue_cents
    FROM event_registrations
    WHERE event_id = ?
    GROUP BY age_group
    ORDER BY age_group ASC
  `).bind(id).all();

  return c.json({
    success: true,
    data: {
      ...event,
      registrations: registrations.results,
      registration_summary: summary.results,
    },
  });
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
