import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

export const hotelRoutes = new Hono<{ Bindings: Env }>();

// ==================
// ADMIN: List all master hotels (optionally filter by city/state)
// ==================
hotelRoutes.get('/master', async (c) => {
  const db = c.env.DB;
  const { city, state } = c.req.query();

  let query = 'SELECT * FROM master_hotels WHERE is_active = 1';
  const params: string[] = [];

  if (city) {
    query += ' AND LOWER(city) = LOWER(?)';
    params.push(city);
  }
  if (state) {
    query += ' AND LOWER(state) = LOWER(?)';
    params.push(state);
  }

  query += ' ORDER BY state ASC, city ASC, hotel_name ASC';
  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Get master hotels grouped by city (for overview)
// ==================
hotelRoutes.get('/master/by-city', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT city, state, COUNT(*) as hotel_count
    FROM master_hotels WHERE is_active = 1
    GROUP BY city, state
    ORDER BY state ASC, city ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Create master hotel
// ==================
const createMasterHotelSchema = z.object({
  hotel_name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  address: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  default_rate_description: z.string().nullable().optional(),
  default_booking_url: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

hotelRoutes.post('/master', zValidator('json', createMasterHotelSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO master_hotels (id, hotel_name, city, state, address, zip, phone, website,
      default_rate_description, default_booking_url, contact_name, contact_email, contact_phone, contact_title, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.hotel_name, data.city, data.state,
    data.address || null, data.zip || null, data.phone || null, data.website || null,
    data.default_rate_description || null, data.default_booking_url || null,
    data.contact_name || null, data.contact_email || null, data.contact_phone || null,
    data.contact_title || null, data.notes || null
  ).run();

  const hotel = await db.prepare('SELECT * FROM master_hotels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: hotel }, 201);
});

// ==================
// ADMIN: Update master hotel
// ==================
const updateMasterHotelSchema = z.object({
  hotel_name: z.string().min(1).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  address: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  default_rate_description: z.string().nullable().optional(),
  default_booking_url: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.number().optional(),
});

hotelRoutes.patch('/master/:id', zValidator('json', updateMasterHotelSchema), async (c) => {
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
  await db.prepare(`UPDATE master_hotels SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await db.prepare('SELECT * FROM master_hotels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: updated });
});

// ==================
// ADMIN: Delete master hotel (soft delete)
// ==================
hotelRoutes.delete('/master/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.prepare("UPDATE master_hotels SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// ==================
// ADMIN: Suggest hotels for an event (by city/state match)
// ==================
hotelRoutes.get('/suggest/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Get event city/state
  const event = await db.prepare('SELECT city, state FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Get already-linked hotel IDs for this event
  const linked = await db.prepare('SELECT master_hotel_id FROM event_hotels WHERE event_id = ? AND master_hotel_id IS NOT NULL').bind(eventId).all();
  const linkedIds = new Set(linked.results.map((r: any) => r.master_hotel_id));

  // Find master hotels in same state (broader match — same city first, then nearby)
  const result = await db.prepare(`
    SELECT *,
      CASE WHEN LOWER(city) = LOWER(?) THEN 1 ELSE 0 END as city_match
    FROM master_hotels
    WHERE is_active = 1 AND LOWER(state) = LOWER(?)
    ORDER BY city_match DESC, city ASC, hotel_name ASC
  `).bind(event.city, event.state).all();

  // Mark which ones are already linked
  const suggestions = result.results.map((h: any) => ({
    ...h,
    already_linked: linkedIds.has(h.id),
  }));

  return c.json({ success: true, data: suggestions, event_city: event.city, event_state: event.state });
});

// ==================
// ADMIN: Add master hotel to event (link with optional overrides)
// ==================
const linkHotelSchema = z.object({
  master_hotel_id: z.string(),
  rate_description: z.string().nullable().optional(),
  booking_url: z.string().nullable().optional(),
  booking_code: z.string().nullable().optional(),
  room_block_count: z.number().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_title: z.string().nullable().optional(),
});

hotelRoutes.post('/link/:eventId', zValidator('json', linkHotelSchema), async (c) => {
  const eventId = c.req.param('eventId');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Get master hotel details
  const master = await db.prepare('SELECT * FROM master_hotels WHERE id = ?').bind(data.master_hotel_id).first<any>();
  if (!master) return c.json({ success: false, error: 'Master hotel not found' }, 404);

  // Check not already linked
  const existing = await db.prepare('SELECT id FROM event_hotels WHERE event_id = ? AND master_hotel_id = ?')
    .bind(eventId, data.master_hotel_id).first();
  if (existing) return c.json({ success: false, error: 'Hotel already linked to this event' }, 409);

  const id = crypto.randomUUID().replace(/-/g, '');
  const sortOrder = await db.prepare('SELECT COUNT(*) as cnt FROM event_hotels WHERE event_id = ?').bind(eventId).first<any>();

  await db.prepare(`
    INSERT INTO event_hotels (id, event_id, master_hotel_id, hotel_name, address, city, state, phone,
      rate_description, booking_url, booking_code, room_block_count,
      contact_name, contact_email, contact_phone, contact_title, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, eventId, data.master_hotel_id,
    master.hotel_name, master.address, master.city, master.state, master.phone,
    data.rate_description || master.default_rate_description,
    data.booking_url || master.default_booking_url,
    data.booking_code || null,
    data.room_block_count || null,
    data.contact_name || master.contact_name,
    data.contact_email || master.contact_email,
    data.contact_phone || master.contact_phone,
    data.contact_title || master.contact_title,
    (sortOrder?.cnt || 0)
  ).run();

  const hotel = await db.prepare('SELECT * FROM event_hotels WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: hotel }, 201);
});

// ==================
// ADMIN: Hotel report for an event (teams assigned, roster sizes, expected nights)
// ==================
hotelRoutes.get('/report/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  // Get event info
  const event = await db.prepare('SELECT id, name, start_date, end_date FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

  // Calculate event nights
  const startDt = new Date(event.start_date + 'T12:00:00');
  const endDt = new Date(event.end_date + 'T12:00:00');
  const eventNights = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)));

  // Get all event hotels
  const hotels = await db.prepare(`
    SELECT * FROM event_hotels WHERE event_id = ? AND is_active = 1 ORDER BY sort_order ASC
  `).bind(eventId).all();

  // Get all registrations with hotel assignments
  const regs = await db.prepare(`
    SELECT er.id, er.team_name, er.age_group, er.division, er.hotel_assigned, er.hotel_choice,
      er.manager_first_name, er.manager_last_name, er.email1, er.email2, er.phone,
      (SELECT COUNT(*) FROM registration_rosters rr WHERE rr.registration_id = er.id) as roster_count
    FROM event_registrations er
    WHERE er.event_id = ?
    ORDER BY er.hotel_assigned ASC, er.team_name ASC
  `).bind(eventId).all();

  // Build hotel summary
  const hotelSummary = hotels.results.map((h: any) => {
    const assignedTeams = regs.results.filter((r: any) =>
      r.hotel_assigned === h.hotel_name || r.hotel_choice === h.hotel_name
    );
    const totalPlayers = assignedTeams.reduce((sum: number, t: any) => sum + (t.roster_count || 15), 0); // default 15 if no roster
    // Estimate: ~4 players per room, event_nights per room
    const estimatedRooms = Math.ceil(totalPlayers / 4);
    const estimatedNights = estimatedRooms * eventNights;

    return {
      hotel_id: h.id,
      hotel_name: h.hotel_name,
      contact_name: h.contact_name,
      contact_email: h.contact_email,
      contact_phone: h.contact_phone,
      rate_description: h.rate_description,
      booking_code: h.booking_code,
      room_block_count: h.room_block_count,
      teams_assigned: assignedTeams.length,
      total_players: totalPlayers,
      estimated_rooms: estimatedRooms,
      estimated_nights: estimatedNights,
      teams: assignedTeams.map((t: any) => ({
        team_name: t.team_name,
        age_group: t.age_group,
        division: t.division,
        manager_name: [t.manager_first_name, t.manager_last_name].filter(Boolean).join(' '),
        manager_email: t.email1,
        manager_email2: t.email2,
        manager_phone: t.phone,
        roster_count: t.roster_count || 15,
      })),
    };
  });

  // Unassigned teams
  const unassigned = regs.results.filter((r: any) => !r.hotel_assigned && !r.hotel_choice);
  const localTeams = regs.results.filter((r: any) =>
    r.hotel_assigned === 'Local Team' || r.hotel_choice === 'Local Team'
  );

  return c.json({
    success: true,
    data: {
      event_name: event.name,
      event_dates: `${event.start_date} to ${event.end_date}`,
      event_nights: eventNights,
      total_teams: regs.results.length,
      total_assigned: regs.results.filter((r: any) => r.hotel_assigned || r.hotel_choice).length,
      total_unassigned: unassigned.length,
      total_local: localTeams.length,
      hotels: hotelSummary,
      unassigned_teams: unassigned.map((t: any) => ({
        team_name: t.team_name,
        age_group: t.age_group,
        manager_name: [t.manager_first_name, t.manager_last_name].filter(Boolean).join(' '),
        manager_email: t.email1,
        manager_phone: t.phone,
      })),
    },
  });
});

// ==================
// ADMIN: Get hotel assignment intro email data (coach/manager ↔ hotel rep)
// ==================
hotelRoutes.get('/intro/:registrationId', async (c) => {
  const regId = c.req.param('registrationId');
  const db = c.env.DB;

  const reg = await db.prepare(`
    SELECT er.*, e.name as event_name, e.start_date, e.end_date
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    WHERE er.id = ?
  `).bind(regId).first<any>();
  if (!reg) return c.json({ success: false, error: 'Registration not found' }, 404);

  const hotelName = reg.hotel_assigned || reg.hotel_choice;
  if (!hotelName) return c.json({ success: false, error: 'No hotel assigned' }, 400);

  // Find the event hotel record for contact info
  const eventHotel = await db.prepare(`
    SELECT * FROM event_hotels WHERE event_id = ? AND hotel_name = ? AND is_active = 1
  `).bind(reg.event_id, hotelName).first<any>();

  // Get roster count
  const rosterCount = await db.prepare(
    'SELECT COUNT(*) as cnt FROM registration_rosters WHERE registration_id = ?'
  ).bind(regId).first<any>();

  // Calculate nights
  const startDt = new Date(reg.start_date + 'T12:00:00');
  const endDt = new Date(reg.end_date + 'T12:00:00');
  const eventNights = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)));
  const playerCount = rosterCount?.cnt || 15;
  const estimatedRooms = Math.ceil(playerCount / 4);

  return c.json({
    success: true,
    data: {
      // Team info
      team_name: reg.team_name,
      age_group: reg.age_group,
      manager_name: [reg.manager_first_name, reg.manager_last_name].filter(Boolean).join(' '),
      manager_email: reg.email1,
      manager_email2: reg.email2,
      manager_phone: reg.phone,
      // Hotel info
      hotel_name: hotelName,
      hotel_contact_name: eventHotel?.contact_name || null,
      hotel_contact_email: eventHotel?.contact_email || null,
      hotel_contact_phone: eventHotel?.contact_phone || null,
      hotel_contact_title: eventHotel?.contact_title || null,
      booking_code: eventHotel?.booking_code || null,
      booking_url: eventHotel?.booking_url || null,
      rate_description: eventHotel?.rate_description || null,
      // Event info
      event_name: reg.event_name,
      event_dates: `${reg.start_date} to ${reg.end_date}`,
      event_nights: eventNights,
      // Estimates
      roster_count: playerCount,
      estimated_rooms: estimatedRooms,
      estimated_nights: estimatedRooms * eventNights,
    },
  });
});
