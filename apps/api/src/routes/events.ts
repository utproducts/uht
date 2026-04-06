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
  if (event.status !== 'registration_open' && event.status !== 'active') {
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
      if (addEvent.status !== 'registration_open' && addEvent.status !== 'active') {
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

  // Create registration for primary event with 'pending' status
  const regIds: string[] = [];
  const regId = crypto.randomUUID().replace(/-/g, '');
  regIds.push(regId);

  await db.prepare(`
    INSERT INTO event_registrations (id, event_id, team_name, age_group, division, manager_first_name, manager_last_name, email1, phone, status, payment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    regId, data.eventId, data.teamName, data.ageGroup, data.division || null,
    data.managerFirstName || null, data.managerLastName || null,
    data.email, data.phone || null,
    data.paymentChoice === 'pay_now' ? 'unpaid' : 'unpaid'
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
  status: z.enum(['pending', 'approved', 'denied', 'waitlisted']).optional(),
  payment_status: z.enum(['unpaid', 'paid', 'partial', 'refunded', 'comp']).optional(),
  payment_amount_cents: z.number().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  hotel_assigned: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

eventRoutes.patch('/admin/registration/:regId', zValidator('json', updateRegistrationSchema), async (c) => {
  const regId = c.req.param('regId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Verify registration exists and get current status for email trigger
  const existing = await db.prepare('SELECT id, status, event_id FROM event_registrations WHERE id = ?').bind(regId).first<{ id: string; status: string; event_id: string }>();
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
    setClauses.push('payment_amount_cents = ?');
    params.push(data.payment_amount_cents);
  }
  if (data.payment_method !== undefined) {
    setClauses.push('payment_method = ?');
    params.push(data.payment_method || null);
  }
  if (data.hotel_assigned !== undefined) {
    setClauses.push('hotel_assigned = ?');
    params.push(data.hotel_assigned);
  }
  if (data.notes !== undefined) {
    setClauses.push('notes = ?');
    params.push(data.notes);
  }

  if (setClauses.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  setClauses.push("updated_at = datetime('now')");
  params.push(regId);

  await db.prepare(`UPDATE event_registrations SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();

  // Return updated registration
  const updated = await db.prepare('SELECT * FROM event_registrations WHERE id = ?').bind(regId).first<any>();

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

  // Get distinct hotel names from preferences for this event
  const result = await db.prepare(`
    SELECT DISTINCT hotel FROM (
      SELECT hotel_pref_1 as hotel FROM event_registrations WHERE event_id = ? AND hotel_pref_1 IS NOT NULL
      UNION SELECT hotel_pref_2 FROM event_registrations WHERE event_id = ? AND hotel_pref_2 IS NOT NULL
      UNION SELECT hotel_pref_3 FROM event_registrations WHERE event_id = ? AND hotel_pref_3 IS NOT NULL
      UNION SELECT hotel_assigned FROM event_registrations WHERE event_id = ? AND hotel_assigned IS NOT NULL
      UNION SELECT hotel_choice FROM event_registrations WHERE event_id = ? AND hotel_choice IS NOT NULL
    ) ORDER BY hotel ASC
  `).bind(eventId, eventId, eventId, eventId, eventId).all();

  return c.json({ success: true, data: result.results.map((r: any) => r.hotel).filter(Boolean) });
});

// ==================
// ADMIN: Get event hotels (from event_hotels table)
// ==================
eventRoutes.get('/admin/event-hotels/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
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
  sort_order: z.number().optional(),
});

eventRoutes.post('/admin/event-hotels', zValidator('json', addHotelSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO event_hotels (id, event_id, hotel_name, address, city, state, phone, rate_description, booking_url, booking_code, room_block_count, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.event_id, data.hotel_name, data.address || null, data.city || null, data.state || null,
    data.phone || null, data.rate_description || null, data.booking_url || null, data.booking_code || null,
    data.room_block_count || null, data.sort_order || 0
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
