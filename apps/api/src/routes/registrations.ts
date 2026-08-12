import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';
import { sendApprovalEmail } from '../lib/approval-email';
import { sendHotelConfirmationEmail } from '../lib/hotel-confirmation-email';
import { getResolvedFields } from '../lib/template-overrides';

export const registrationRoutes = new Hono<{ Bindings: Env }>();

// ==================
// Register team for event (one-click from coach/manager portal)
// ==================
const registerSchema = z.object({
  eventDivisionId: z.string(),
  teamId: z.string(),
  notes: z.string().optional(),
});

registrationRoutes.post('/', authMiddleware, requireRole('admin', 'director', 'organization', 'coach', 'manager'), zValidator('json', registerSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  // Verify division exists and is open
  const division = await db.prepare(`
    SELECT ed.*, e.name as event_name, e.id as event_id
    FROM event_divisions ed
    JOIN events e ON e.id = ed.event_id
    WHERE ed.id = ? AND ed.status = 'open'
  `).bind(data.eventDivisionId).first<any>();

  if (!division) {
    return c.json({ success: false, error: 'Division not found or registration is closed' }, 400);
  }

  // Check if team is already registered
  const existing = await db.prepare(`
    SELECT id FROM registrations
    WHERE event_division_id = ? AND team_id = ? AND status NOT IN ('rejected', 'withdrawn')
  `).bind(data.eventDivisionId, data.teamId).first();

  if (existing) {
    return c.json({ success: false, error: 'Team is already registered for this division' }, 409);
  }

  // Check capacity
  if (division.max_teams && division.current_team_count >= division.max_teams) {
    // Auto-waitlist if full
    const regId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO registrations (id, event_id, event_division_id, team_id, registered_by, status, amount_cents)
      VALUES (?, ?, ?, ?, ?, 'waitlisted', ?)
    `).bind(regId, division.event_id, data.eventDivisionId, data.teamId, user.id, division.price_cents).run();

    return c.json({
      success: true,
      data: { id: regId, status: 'waitlisted', message: 'Division is full. Team has been waitlisted.' },
    }, 201);
  }

  const regId = crypto.randomUUID().replace(/-/g, '');

  // Create registration
  await db.prepare(`
    INSERT INTO registrations (id, event_id, event_division_id, team_id, registered_by, status, amount_cents, notes)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(regId, division.event_id, data.eventDivisionId, data.teamId, user.id, division.price_cents, data.notes || null).run();

  // Snapshot current roster
  const players = await db.prepare(`
    SELECT player_id, p.jersey_number, p.position
    FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = ? AND tp.status = 'active'
  `).bind(data.teamId).all<any>();

  for (const player of players.results || []) {
    await db.prepare(`
      INSERT INTO registration_rosters (id, registration_id, player_id, jersey_number, position)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().replace(/-/g, ''), regId, player.player_id,
      player.jersey_number, player.position
    ).run();
  }

  // Send registration confirmation email
  let emailSent = false;
  try {
    const team = await db.prepare('SELECT name, age_group, head_coach_name, head_coach_email FROM teams WHERE id = ?')
      .bind(data.teamId).first<any>();
    const event = await db.prepare('SELECT name, city, state, start_date, end_date, price_cents, deposit_cents, logo_url FROM events WHERE id = ?')
      .bind(division.event_id).first<any>();

    if (team && event) {
      const startDate = new Date(event.start_date + 'T12:00:00');
      const endDate = new Date(event.end_date + 'T12:00:00');
      const eventDateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      // Send to the coach email, falling back to the registering user's email
      const recipientEmail = team.head_coach_email || user.email;
      const recipientName = team.head_coach_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || team.name;

      // Fetch admin-customized template overrides from DB
      const overrides = await getResolvedFields(c.env.DB, 'registration_confirmation');

      const result = await sendRegistrationConfirmationEmail(c.env, {
        recipientEmail,
        recipientName,
        teamName: team.name,
        ageGroup: division.age_group || team.age_group,
        division: division.division_level || undefined,
        eventName: event.name,
        eventDate: eventDateStr,
        eventCity: `${event.city}, ${event.state}`,
        headCoachName: team.head_coach_name || undefined,
        priceCents: event.price_cents || undefined,
        depositCents: event.deposit_cents || undefined,
        eventLogoUrl: event.logo_url || undefined,
        _overrides: overrides,
      } as any);
      emailSent = result.success;
    }
  } catch (err: any) {
    console.error('Registration confirmation email error:', err);
  }

  return c.json({
    success: true,
    data: {
      id: regId,
      status: 'pending',
      email_sent: emailSent,
      message: `Registration received for ${division.event_name}. You will receive a confirmation email shortly.`,
    },
  }, 201);
});

// ==================
// ADMIN/DIRECTOR: List ALL registrations across all events
// ==================
registrationRoutes.get('/all', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { status: statusFilter, search, event_id } = c.req.query();

  // Auto-migrate
  try { await db.prepare("ALTER TABLE event_registrations ADD COLUMN event_division_id TEXT").run(); } catch (_) {}

  // Normalized registrations
  let q1 = `
    SELECT r.*,
      t.name as team_name, t.age_group as team_age_group, t.city as team_city, t.state as team_state,
      t.logo_url as team_logo_url,
      t.head_coach_name, t.head_coach_email, t.head_coach_phone,
      t.manager_name, t.manager_email, t.manager_phone,
      ed.age_group as division_age_group, ed.division_level,
      u.first_name as registered_by_first, u.last_name as registered_by_last, u.email as registered_by_email, u.phone as registered_by_phone,
      e.name as event_name, e.city as event_city, e.state as event_state, e.start_date as event_start_date,
      h1.hotel_name as hotel_choice_1_name, h1.id as hotel_choice_1_id,
      h2.hotel_name as hotel_choice_2_name, h2.id as hotel_choice_2_id,
      h3.hotel_name as hotel_choice_3_name, h3.id as hotel_choice_3_id,
      'normalized' as _source
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    JOIN users u ON u.id = r.registered_by
    JOIN events e ON e.id = r.event_id
    LEFT JOIN event_hotels h1 ON h1.id = r.hotel_choice_1
    LEFT JOIN event_hotels h2 ON h2.id = r.hotel_choice_2
    LEFT JOIN event_hotels h3 ON h3.id = r.hotel_choice_3
    WHERE 1=1
  `;
  const p1: string[] = [];
  if (statusFilter) { q1 += ' AND r.status = ?'; p1.push(statusFilter); }
  if (event_id) { q1 += ' AND r.event_id = ?'; p1.push(event_id); }
  if (search) {
    q1 += ' AND (LOWER(t.name) LIKE ? OR LOWER(e.name) LIKE ?)';
    const s = `%${search.toLowerCase()}%`;
    p1.push(s, s);
  }
  q1 += ' ORDER BY r.created_at DESC';
  const norm = await db.prepare(q1).bind(...p1).all();

  // Consumer registrations
  let q2 = `
    SELECT er.*,
      er.team_name, ct.schedule_name, er.age_group as team_age_group,
      ct.city as team_city, ct.state as team_state, ct.logo_url as team_logo_url,
      ct.head_coach_name, ct.head_coach_email, ct.head_coach_phone,
      ct.manager_name, ct.manager_email, ct.manager_phone,
      COALESCE(ced.age_group, er.age_group) as division_age_group,
      COALESCE(ced.division_level, er.division) as division_level,
      er.manager_first_name as registered_by_first, er.manager_last_name as registered_by_last,
      er.email1 as registered_by_email, er.phone as registered_by_phone,
      e.name as event_name, e.city as event_city, e.state as event_state, e.start_date as event_start_date,
      ch1.hotel_name as hotel_choice_1_name, ch1.id as hotel_choice_1_id,
      ch2.hotel_name as hotel_choice_2_name, ch2.id as hotel_choice_2_id,
      ch3.hotel_name as hotel_choice_3_name, ch3.id as hotel_choice_3_id,
      'consumer' as _source
    FROM event_registrations er
    LEFT JOIN event_divisions ced ON ced.id = er.event_division_id
    LEFT JOIN teams ct ON ct.id = er.team_id
    JOIN events e ON e.id = er.event_id
    LEFT JOIN event_hotels ch1 ON ch1.id = er.hotel_choice_1
    LEFT JOIN event_hotels ch2 ON ch2.id = er.hotel_choice_2
    LEFT JOIN event_hotels ch3 ON ch3.id = er.hotel_choice_3
    WHERE 1=1
  `;
  const p2: string[] = [];
  if (statusFilter) { q2 += ' AND er.status = ?'; p2.push(statusFilter); }
  if (event_id) { q2 += ' AND er.event_id = ?'; p2.push(event_id); }
  if (search) {
    q2 += ' AND (LOWER(er.team_name) LIKE ? OR LOWER(e.name) LIKE ?)';
    const s = `%${search.toLowerCase()}%`;
    p2.push(s, s);
  }
  q2 += ' ORDER BY er.created_at DESC';
  const cons = await db.prepare(q2).bind(...p2).all();

  const all = [
    ...(norm.results || []),
    ...(cons.results || []).map((er: any) => ({
      ...er,
      team_id: er.id,
      event_division_id: er.event_division_id || null,
      amount_cents: er.payment_amount_cents || null,
      paid_cents: null,
      registered_by_name: [er.manager_first_name, er.manager_last_name].filter(Boolean).join(' ') || null,
    })),
  ];

  all.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));

  return c.json({ success: true, data: all, total: all.length });
});

// ==================
// ADMIN/DIRECTOR: List registrations for an event
// ==================
registrationRoutes.get('/event/:eventId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const { status, division_id } = c.req.query();

  // Auto-migrate: add hotel choice columns if missing
  try { await db.prepare("ALTER TABLE registrations ADD COLUMN hotel_choice_1 TEXT").run(); } catch (_) {}
  try { await db.prepare("ALTER TABLE registrations ADD COLUMN hotel_choice_2 TEXT").run(); } catch (_) {}
  try { await db.prepare("ALTER TABLE registrations ADD COLUMN hotel_choice_3 TEXT").run(); } catch (_) {}
  // Auto-migrate: add event_division_id to consumer registrations for division assignment
  try { await db.prepare("ALTER TABLE event_registrations ADD COLUMN event_division_id TEXT").run(); } catch (_) {}

  // --- Query 1: Normalized registrations (from auth flow) ---
  let query1 = `
    SELECT r.*,
      t.name as team_name, t.age_group as team_age_group, t.city as team_city, t.state as team_state,
      t.logo_url as team_logo_url,
      t.head_coach_name, t.head_coach_email, t.head_coach_phone,
      t.manager_name, t.manager_email, t.manager_phone,
      ed.age_group as division_age_group, ed.division_level,
      u.first_name as registered_by_first, u.last_name as registered_by_last, u.email as registered_by_email, u.phone as registered_by_phone,
      (SELECT COUNT(*) FROM registration_rosters rr WHERE rr.registration_id = r.id) as roster_count,
      h1.hotel_name as hotel_choice_1_name, h1.id as hotel_choice_1_id,
      h2.hotel_name as hotel_choice_2_name, h2.id as hotel_choice_2_id,
      h3.hotel_name as hotel_choice_3_name, h3.id as hotel_choice_3_id,
      'normalized' as _source
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    JOIN users u ON u.id = r.registered_by
    LEFT JOIN event_hotels h1 ON h1.id = r.hotel_choice_1
    LEFT JOIN event_hotels h2 ON h2.id = r.hotel_choice_2
    LEFT JOIN event_hotels h3 ON h3.id = r.hotel_choice_3
    WHERE r.event_id = ?
  `;
  const params1: string[] = [eventId];

  if (status) {
    query1 += ' AND r.status = ?';
    params1.push(status);
  }
  if (division_id) {
    query1 += ' AND r.event_division_id = ?';
    params1.push(division_id);
  }

  query1 += ' ORDER BY r.created_at DESC';

  const normalizedResult = await db.prepare(query1).bind(...params1).all();

  // --- Query 2: Consumer registrations (event_registrations table) ---
  let query2 = `
    SELECT er.*,
      er.team_name as team_name,
      er.age_group as team_age_group,
      ct2.city as team_city,
      ct2.state as team_state,
      ct2.logo_url as team_logo_url,
      ct2.head_coach_name, ct2.head_coach_email, ct2.head_coach_phone,
      ct2.manager_name, ct2.manager_email, ct2.manager_phone,
      COALESCE(ced.age_group, er.age_group) as division_age_group,
      COALESCE(ced.division_level, er.division) as division_level,
      er.manager_first_name as registered_by_first,
      er.manager_last_name as registered_by_last,
      er.email1 as registered_by_email,
      er.phone as registered_by_phone,
      0 as roster_count,
      ch1.hotel_name as hotel_choice_1_name, ch1.id as hotel_choice_1_id,
      ch2.hotel_name as hotel_choice_2_name, ch2.id as hotel_choice_2_id,
      ch3.hotel_name as hotel_choice_3_name, ch3.id as hotel_choice_3_id,
      'consumer' as _source
    FROM event_registrations er
    LEFT JOIN event_divisions ced ON ced.id = er.event_division_id
    LEFT JOIN teams ct2 ON ct2.id = er.team_id
    LEFT JOIN event_hotels ch1 ON ch1.id = er.hotel_choice_1
    LEFT JOIN event_hotels ch2 ON ch2.id = er.hotel_choice_2
    LEFT JOIN event_hotels ch3 ON ch3.id = er.hotel_choice_3
    WHERE er.event_id = ?
  `;
  const params2: string[] = [eventId];

  if (status) {
    query2 += ' AND er.status = ?';
    params2.push(status);
  }
  if (division_id) {
    query2 += ' AND er.event_division_id = ?';
    params2.push(division_id);
  }

  query2 += ' ORDER BY er.created_at DESC';

  const consumerResult = await db.prepare(query2).bind(...params2).all();

  // --- Merge both result sets ---
  const allRegistrations = [
    ...(normalizedResult.results || []),
    ...(consumerResult.results || []).map((er: any) => ({
      ...er,
      // Map consumer fields to match the Registration interface
      team_id: er.id, // consumer regs don't have a team_id, use reg id as placeholder
      event_division_id: er.event_division_id || null,
      amount_cents: er.payment_amount_cents || null,
      paid_cents: null,
      approved_by: null,
      approved_at: null,
      stripe_payment_intent_id: null,
      registered_by_name: [er.manager_first_name, er.manager_last_name].filter(Boolean).join(' ') || null,
    })),
  ];

  // Sort merged results by created_at DESC
  allRegistrations.sort((a: any, b: any) => {
    const dateA = a.created_at || '';
    const dateB = b.created_at || '';
    return dateB.localeCompare(dateA);
  });

  return c.json({ success: true, data: allRegistrations });
});

// ==================
// ADMIN/DIRECTOR: Approve registration
// ==================
registrationRoutes.post('/:id/approve', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({})) as { hotelId?: string; skipHotel?: boolean };

  // Check both tables for the registration
  let isConsumer = false;
  let reg = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(regId).first<any>();
  if (!reg) {
    reg = await db.prepare('SELECT * FROM event_registrations WHERE id = ?').bind(regId).first<any>();
    if (reg) isConsumer = true;
  }
  if (!reg) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }

  if (reg.status !== 'pending' && reg.status !== 'waitlisted') {
    return c.json({ success: false, error: `Cannot approve a registration with status: ${reg.status}` }, 400);
  }

  const event = await db.prepare('SELECT name, city, state, start_date, end_date, price_cents FROM events WHERE id = ?')
    .bind(reg.event_id).first<any>();

  // For consumer registrations, build a pseudo-team object from the registration data
  let team: any = null;
  if (isConsumer) {
    // Try to get team state from linked team if team_id exists
    let teamState: string | null = null;
    let teamCity: string | null = null;
    let coachPhone: string | null = null;
    let linkedCoachEmail: string | null = null;
    let linkedCoachName: string | null = null;
    let linkedManagerEmail: string | null = null;
    let linkedManagerPhone: string | null = null;
    let linkedManagerName: string | null = null;
    if (reg.team_id) {
      const linkedTeam = await db.prepare('SELECT city, state, head_coach_phone, head_coach_name, head_coach_email, manager_name, manager_email, manager_phone FROM teams WHERE id = ?')
        .bind(reg.team_id).first<any>();
      if (linkedTeam) {
        teamState = linkedTeam.state;
        teamCity = linkedTeam.city;
        coachPhone = linkedTeam.head_coach_phone;
        linkedCoachEmail = linkedTeam.head_coach_email;
        linkedCoachName = linkedTeam.head_coach_name;
        linkedManagerEmail = linkedTeam.manager_email;
        linkedManagerPhone = linkedTeam.manager_phone;
        linkedManagerName = linkedTeam.manager_name;
      }
    }
    team = {
      name: reg.team_name,
      age_group: reg.age_group,
      city: teamCity,
      state: teamState,
      // Prefer the linked team's actual head coach; fall back to the registrant.
      // The registration form does not capture a coach name, so without the
      // linked-team fallback these names come through blank on emails.
      head_coach_name: linkedCoachName || [reg.manager_first_name, reg.manager_last_name].filter(Boolean).join(' ') || null,
      head_coach_email: linkedCoachEmail || reg.email1,
      head_coach_phone: coachPhone || reg.phone || null,
      manager_name: linkedManagerName,
      manager_email: linkedManagerEmail,
      manager_phone: linkedManagerPhone,
    };
  } else {
    team = await db.prepare('SELECT name, age_group, city, state, head_coach_name, head_coach_email, head_coach_phone, manager_name, manager_email, manager_phone FROM teams WHERE id = ?')
      .bind(reg.team_id).first<any>();
  }

  // Check if event has hotels configured
  const eventHotels = await db.prepare('SELECT COUNT(*) as cnt FROM event_hotels WHERE event_id = ?')
    .bind(reg.event_id).first<any>();
  const hasHotels = eventHotels && eventHotels.cnt > 0;

  // Non-local teams require hotel selection (applies to all registration types).
  // skipHotel = admin explicitly approving without one (local team, own lodging, etc.)
  if (hasHotels && !body.hotelId && !body.skipHotel) {
    // States can be stored as abbreviations or full names ("IL" vs "Illinois") — normalize both sides
    const STATE_ABBR: Record<string, string> = {
      ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
      CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID',
      ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
      MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
      MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
      'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
      'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR',
      PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD',
      TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA',
      'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
    };
    const norm = (s: string) => { const u = (s || '').trim().toUpperCase(); return STATE_ABBR[u] || u; };
    const sameState = team && event && team.state && event.state && norm(team.state) === norm(event.state);
    // The registrant can also declare local (needs_hotel = 0) during registration
    const declaredLocal = isConsumer && reg.needs_hotel === 0 && reg.needs_hotel !== null;
    const isLocal = sameState || declaredLocal;
    if (!isLocal) {
      return c.json({ success: false, error: 'Hotel selection required for non-local teams', requiresHotel: true }, 400);
    }
  }

  // If hotel provided, look it up for the email
  let hotelInfo: any = null;
  if (body.hotelId) {
    // Pull the event hotel, falling back to the master hotel record for contact
    // details when the event-level row was created without them.
    hotelInfo = await db.prepare(`
      SELECT eh.*,
        COALESCE(eh.contact_name, mh.contact_name) as contact_name,
        COALESCE(eh.contact_title, mh.contact_title) as contact_title,
        COALESCE(eh.contact_phone, mh.contact_phone) as contact_phone,
        COALESCE(eh.contact_email, mh.contact_email) as contact_email,
        COALESCE(eh.phone, mh.phone) as phone
      FROM event_hotels eh
      LEFT JOIN master_hotels mh ON mh.id = eh.master_hotel_id
      WHERE eh.id = ?
    `).bind(body.hotelId).first<any>();
    if (isConsumer) {
      try { await db.prepare("ALTER TABLE event_registrations ADD COLUMN hotel_assigned TEXT").run(); } catch (_) {}
      await db.prepare('UPDATE event_registrations SET hotel_assigned = ? WHERE id = ?').bind(body.hotelId, regId).run();
    } else {
      try { await db.prepare("ALTER TABLE registrations ADD COLUMN hotel_assigned TEXT").run(); } catch (_) {}
      await db.prepare('UPDATE registrations SET hotel_assigned = ? WHERE id = ?').bind(body.hotelId, regId).run();
    }
  }

  // Update registration status
  if (isConsumer) {
    await db.prepare(`
      UPDATE event_registrations SET status = 'approved', updated_at = datetime('now')
      WHERE id = ?
    `).bind(regId).run();
  } else {
    await db.prepare(`
      UPDATE registrations SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(user.id, regId).run();

    // Increment division team count (only for normalized registrations with divisions)
    if (reg.event_division_id) {
      await db.prepare(`
        UPDATE event_divisions SET current_team_count = current_team_count + 1 WHERE id = ?
      `).bind(reg.event_division_id).run();
    }
  }

  // Audit log (non-fatal — a failed audit write must never block the approval or its emails)
  await db.prepare(`
    INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'registration.approved', 'registration', ?, ?)
  `).bind(crypto.randomUUID().replace(/-/g, ''), user.id, regId, JSON.stringify({ team_name: team?.name, hotel_id: body.hotelId || null, source: isConsumer ? 'consumer' : 'normalized' })).run()
    .catch((err: any) => console.error('Audit log insert failed (non-fatal), user:', user.id, err?.message));

  // Send approval email
  let emailSent = false;
  let emailCcSent: string[] = [];
  try {
    let divisionInfo: any = null;
    if (!isConsumer && reg.event_division_id) {
      divisionInfo = await db.prepare('SELECT age_group, division_level FROM event_divisions WHERE id = ?')
        .bind(reg.event_division_id).first<any>();
    }

    if (team && event) {
      const startDate = new Date(event.start_date + 'T12:00:00');
      const eventDateStr = startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      const recipientEmail = team.head_coach_email || user.email;
      const recipientName = team.head_coach_name || team.name;

      // CC the manager and any other registration contacts (dedup, exclude the recipient).
      // For team-based regs, also pull emails from team_managers.
      const ccCandidates: (string | null | undefined)[] = [team.manager_email];
      if (isConsumer) {
        ccCandidates.push(reg.email1, reg.email2);
      } else if (reg.team_id) {
        const mgrs = await db.prepare(`
          SELECT u.email FROM users u JOIN team_managers tm ON tm.user_id = u.id WHERE tm.team_id = ?
        `).bind(reg.team_id).all<{ email: string }>();
        for (const m of mgrs.results || []) ccCandidates.push(m.email);
      }
      const approvalCc = [...new Set(ccCandidates
        .filter((e): e is string => !!e && e.includes('@'))
        .map(e => e.toLowerCase()))]
        .filter(e => e !== (recipientEmail || '').toLowerCase());
      emailCcSent = approvalCc;

      // Determine payment status from the registration
      let paymentStatus = 'unpaid';
      if (!isConsumer) {
        if (reg.paid_cents && reg.amount_cents && reg.paid_cents >= reg.amount_cents) {
          paymentStatus = 'paid';
        } else if (reg.paid_cents && reg.paid_cents > 0) {
          paymentStatus = 'partial';
        }
      } else {
        // Consumer registrations use payment_status field
        if (reg.payment_status === 'paid') paymentStatus = 'paid';
        else if (reg.payment_status === 'partial') paymentStatus = 'partial';
      }

      // Fetch admin-customized template overrides from DB
      const approvalTemplateId = paymentStatus === 'paid' ? 'approval_paid' : paymentStatus === 'partial' ? 'approval_deposit' : 'approval_unpaid';
      const approvalOverrides = await getResolvedFields(c.env.DB, approvalTemplateId);

      const result = await sendApprovalEmail(c.env, {
        recipientEmail,
        recipientName,
        ccEmails: approvalCc,
        teamName: team.name,
        ageGroup: divisionInfo?.age_group || reg.age_group || team.age_group,
        division: divisionInfo?.division_level || reg.division || undefined,
        eventName: event.name,
        eventDate: eventDateStr,
        eventCity: `${event.city}, ${event.state}`,
        paymentStatus,
        priceCents: event.price_cents || undefined,
        noHotelNeeded: !hotelInfo && hasHotels,
        hotelInfo: hotelInfo ? {
          name: hotelInfo.hotel_name,
          address: hotelInfo.address,
          city: hotelInfo.city,
          state: hotelInfo.state,
          phone: hotelInfo.phone,
          rateDescription: hotelInfo.rate_description,
          bookingUrl: hotelInfo.booking_url,
          bookingCode: hotelInfo.booking_code,
          pricePerNight: hotelInfo.price_per_night,
          bookingCutoffDate: hotelInfo.booking_cutoff_date,
          importantNotes: hotelInfo.important_notes,
          contactName: hotelInfo.contact_name,
          contactTitle: hotelInfo.contact_title,
          contactPhone: hotelInfo.contact_phone,
          contactEmail: hotelInfo.contact_email,
        } : undefined,
        _overrides: approvalOverrides,
      } as any);
      emailSent = result.success;
    }
  } catch (err: any) {
    console.error('Approval email error:', err);
  }

  // Send hotel confirmation email to hotel contact
  let hotelEmailSent = false;
  if (hotelInfo && hotelInfo.contact_email) {
    try {
      // Get manager info (for consumer regs, use the registration fields)
      let managerName = '';
      let managerEmail = '';
      let managerPhone = '';
      if (isConsumer) {
        // The registrant is the manager — fall back through second contact,
        // the linked team's manager, then the primary registration contact.
        managerName = [reg.manager_first_name, reg.manager_last_name].filter(Boolean).join(' ')
          || team.manager_name || '';
        managerEmail = reg.email2 || team.manager_email || reg.email1 || '';
        managerPhone = reg.phone2 || team.manager_phone || reg.phone || '';
      } else {
        // Look up team managers
        try {
          const mgrRow = await db.prepare(`
            SELECT u.first_name, u.last_name, u.email, u.phone
            FROM users u JOIN team_managers tm ON tm.user_id = u.id
            WHERE tm.team_id = ? LIMIT 1
          `).bind(reg.team_id).first<any>();
          if (mgrRow) {
            managerName = [mgrRow.first_name, mgrRow.last_name].filter(Boolean).join(' ');
            managerEmail = mgrRow.email || '';
            managerPhone = mgrRow.phone || '';
          }
        } catch {}
        if (!managerEmail) managerEmail = team.manager_email || '';
        if (!managerPhone) managerPhone = team.manager_phone || '';
        if (!managerName && (managerEmail || managerPhone)) managerName = team.manager_name || '';
      }

      // Last resort: if we still have an email but no name, look the person up
      // in users so the hotel never gets a bare email address with no name.
      const nameFromEmail = async (email: string): Promise<string> => {
        if (!email) return '';
        try {
          const u = await db.prepare('SELECT first_name, last_name FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1')
            .bind(email).first<any>();
          return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') : '';
        } catch { return ''; }
      };

      let coachName = team.head_coach_name || '';
      if (!coachName) coachName = await nameFromEmail(team.head_coach_email || '');
      if (!managerName) managerName = await nameFromEmail(managerEmail);

      // Don't repeat the same person as both coach and manager
      const sameContact = managerEmail && team.head_coach_email
        && managerEmail.toLowerCase() === String(team.head_coach_email).toLowerCase();

      const startDate = new Date(event.start_date + 'T12:00:00');
      const hotelEventDate = startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      let divisionInfo2: any = null;
      if (!isConsumer && reg.event_division_id) {
        divisionInfo2 = await db.prepare('SELECT age_group, division_level FROM event_divisions WHERE id = ?')
          .bind(reg.event_division_id).first<any>();
      }

      const hotelResult = await sendHotelConfirmationEmail(c.env, {
        hotelContactEmail: hotelInfo.contact_email,
        hotelContactName: hotelInfo.contact_name || '',
        hotelName: hotelInfo.hotel_name,
        teamName: team.name,
        ageGroup: divisionInfo2?.age_group || reg.age_group || team.age_group || '',
        division: divisionInfo2?.division_level || reg.division || undefined,
        eventName: event.name,
        eventDate: hotelEventDate,
        eventCity: `${event.city}, ${event.state}`,
        coachName,
        coachEmail: team.head_coach_email || '',
        coachPhone: team.head_coach_phone || '',
        managerName: sameContact ? '' : managerName,
        managerEmail: sameContact ? '' : managerEmail,
        managerPhone: sameContact ? '' : managerPhone,
      });
      hotelEmailSent = hotelResult.success;
    } catch (err: any) {
      console.error('Hotel confirmation email error:', err);
    }
  }

  return c.json({
    success: true,
    message: 'Registration approved',
    email_sent: emailSent,
    email_recipient: team?.head_coach_email || null,
    email_cc: emailCcSent,
    hotel_email_sent: hotelEmailSent,
  });
});

// ==================
// ADMIN/DIRECTOR: Reject registration
// ==================
registrationRoutes.post('/:id/reject', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  // Check both tables
  let isConsumer = false;
  const normReg = await db.prepare('SELECT id FROM registrations WHERE id = ?').bind(regId).first();
  if (!normReg) {
    const consumerReg = await db.prepare('SELECT id FROM event_registrations WHERE id = ?').bind(regId).first();
    if (consumerReg) isConsumer = true;
    else return c.json({ success: false, error: 'Registration not found' }, 404);
  }

  const tableName = isConsumer ? 'event_registrations' : 'registrations';
  await db.prepare(`
    UPDATE ${tableName} SET status = 'rejected', notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.reason || null, regId).run();

  await db.prepare(`
    INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'registration.rejected', 'registration', ?, ?)
  `).bind(crypto.randomUUID().replace(/-/g, ''), user.id, regId, JSON.stringify({ reason: body.reason, source: isConsumer ? 'consumer' : 'normalized' })).run()
    .catch((err: any) => console.error('Audit log insert failed (non-fatal), user:', user.id, err?.message));

  return c.json({ success: true, message: 'Registration rejected' });
});

// ==================
// ADMIN: Delete registration (for testing/cleanup)
// ==================
registrationRoutes.delete('/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;

  try {
    // Check both tables
    let tableName = 'registrations';
    let reg = await db.prepare('SELECT id, event_id FROM registrations WHERE id = ?').bind(regId).first<any>();
    if (!reg) {
      reg = await db.prepare('SELECT id, event_id FROM event_registrations WHERE id = ?').bind(regId).first<any>();
      if (reg) tableName = 'event_registrations';
      else return c.json({ success: false, error: 'Registration not found' }, 404);
    }

    // Delete all related records first to avoid FK constraints
    await db.prepare('DELETE FROM discount_codes WHERE registration_id = ?').bind(regId).run().catch(() => {});
    await db.prepare('DELETE FROM special_requests WHERE registration_id = ?').bind(regId).run().catch(() => {});
    await db.prepare('DELETE FROM registration_rosters WHERE registration_id = ?').bind(regId).run().catch(() => {});

    // Delete the registration
    await db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).bind(regId).run();

    // Audit log (non-fatal — must not fail the delete or poison the response)
    await db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, 'registration.deleted', 'registration', ?, ?)
    `).bind(
      crypto.randomUUID().replace(/-/g, ''),
      user.id,
      regId,
      JSON.stringify({ source: tableName === 'event_registrations' ? 'consumer' : 'normalized' })
    ).run().catch((err: any) => console.error('Audit log insert failed (non-fatal), user:', user.id, err?.message));

    return c.json({ success: true, message: 'Registration deleted' });
  } catch (err: any) {
    console.error('Delete registration error:', err);
    return c.json({ success: false, error: err.message || 'Failed to delete registration' }, 500);
  }
});

// ==================
// ADMIN: Manual add team to event (existing team or create new)
// ==================
const adminAddTeamSchema = z.object({
  eventDivisionId: z.string(),
  // Either provide an existing team ID...
  teamId: z.string().optional(),
  // ...or provide details to create a new team
  newTeam: z.object({
    name: z.string().min(1),
    ageGroup: z.string().min(1),
    divisionLevel: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    headCoachName: z.string().optional(),
    headCoachEmail: z.string().optional(),
    headCoachPhone: z.string().optional(),
  }).optional(),
  autoApprove: z.boolean().optional(),
  notes: z.string().optional(),
});

registrationRoutes.post('/admin/add-team', authMiddleware, requireRole('admin', 'director'), zValidator('json', adminAddTeamSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  // Must provide either teamId or newTeam
  if (!data.teamId && !data.newTeam) {
    return c.json({ success: false, error: 'Provide either teamId or newTeam' }, 400);
  }

  // Verify division exists
  const division = await db.prepare(`
    SELECT ed.*, e.name as event_name, e.id as event_id
    FROM event_divisions ed
    JOIN events e ON e.id = ed.event_id
    WHERE ed.id = ?
  `).bind(data.eventDivisionId).first<any>();

  if (!division) {
    return c.json({ success: false, error: 'Division not found' }, 404);
  }

  let teamId = data.teamId || '';
  let teamName = '';

  // If creating a new team
  if (data.newTeam) {
    teamId = crypto.randomUUID().replace(/-/g, '');
    teamName = data.newTeam.name;
    // Separate invite codes for coaches (invite_code) and parents (parent_invite_code)
    const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let inviteCode = '';
    const randBytes = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) inviteCode += codeChars[randBytes[i] % codeChars.length];
    let parentInviteCode = '';
    const parentRandBytes = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) parentInviteCode += codeChars[parentRandBytes[i] % codeChars.length];
    await db.prepare(`
      INSERT INTO teams (id, name, age_group, division_level, city, state,
        head_coach_name, head_coach_email, head_coach_phone, invite_code, parent_invite_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      teamId, data.newTeam.name, data.newTeam.ageGroup,
      data.newTeam.divisionLevel || null, data.newTeam.city || null, data.newTeam.state || null,
      data.newTeam.headCoachName || null, data.newTeam.headCoachEmail || null, data.newTeam.headCoachPhone || null,
      inviteCode, parentInviteCode
    ).run();
  } else {
    // Verify existing team
    const team = await db.prepare('SELECT id, name FROM teams WHERE id = ?').bind(teamId).first<any>();
    if (!team) return c.json({ success: false, error: 'Team not found' }, 404);
    teamName = team.name;
  }

  // Check if already registered
  const existing = await db.prepare(`
    SELECT id FROM registrations
    WHERE event_division_id = ? AND team_id = ? AND status NOT IN ('rejected', 'withdrawn')
  `).bind(data.eventDivisionId, teamId).first();

  if (existing) {
    return c.json({ success: false, error: `${teamName} is already registered for this division` }, 409);
  }

  // Create registration
  const regId = crypto.randomUUID().replace(/-/g, '');
  const status = data.autoApprove !== false ? 'approved' : 'pending';

  await db.prepare(`
    INSERT INTO registrations (id, event_id, event_division_id, team_id, registered_by, status, amount_cents, notes,
      ${status === 'approved' ? 'approved_by, approved_at,' : ''} created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?,
      ${status === 'approved' ? '?, datetime(\'now\'),' : ''} datetime('now'), datetime('now'))
  `).bind(
    regId, division.event_id, data.eventDivisionId, teamId, user.id, status, division.price_cents, data.notes || null,
    ...(status === 'approved' ? [user.id] : [])
  ).run();

  // Increment division team count if auto-approved
  if (status === 'approved') {
    await db.prepare(`
      UPDATE event_divisions SET current_team_count = current_team_count + 1 WHERE id = ?
    `).bind(data.eventDivisionId).run();
  }

  // Audit log
  await db.prepare(`
    INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'registration.admin_added', 'registration', ?, ?)
  `).bind(
    crypto.randomUUID().replace(/-/g, ''), user.id, regId,
    JSON.stringify({ team_id: teamId, team_name: teamName, auto_approved: status === 'approved', new_team: !!data.newTeam })
  ).run();

  return c.json({
    success: true,
    data: {
      id: regId,
      team_id: teamId,
      team_name: teamName,
      status,
      message: `${teamName} added to ${division.age_group} ${division.division_level}${status === 'approved' ? ' (auto-approved)' : ''}.`,
    },
  }, 201);
});
