import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';
import { sendApprovalEmail } from '../lib/approval-email';
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
    const event = await db.prepare('SELECT name, city, state, start_date, end_date, price_cents, deposit_cents FROM events WHERE id = ?')
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

  let query = `
    SELECT r.*,
      t.name as team_name, t.age_group as team_age_group, t.city as team_city, t.state as team_state,
      t.logo_url as team_logo_url,
      ed.age_group as division_age_group, ed.division_level,
      u.first_name as registered_by_first, u.last_name as registered_by_last, u.email as registered_by_email, u.phone as registered_by_phone,
      (SELECT COUNT(*) FROM registration_rosters rr WHERE rr.registration_id = r.id) as roster_count,
      h1.hotel_name as hotel_choice_1_name, h1.id as hotel_choice_1_id,
      h2.hotel_name as hotel_choice_2_name, h2.id as hotel_choice_2_id,
      h3.hotel_name as hotel_choice_3_name, h3.id as hotel_choice_3_id
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    JOIN users u ON u.id = r.registered_by
    LEFT JOIN event_hotels h1 ON h1.id = r.hotel_choice_1
    LEFT JOIN event_hotels h2 ON h2.id = r.hotel_choice_2
    LEFT JOIN event_hotels h3 ON h3.id = r.hotel_choice_3
    WHERE r.event_id = ?
  `;
  const params: string[] = [eventId];

  if (status) {
    query += ' AND r.status = ?';
    params.push(status);
  }
  if (division_id) {
    query += ' AND r.event_division_id = ?';
    params.push(division_id);
  }

  query += ' ORDER BY r.created_at DESC';

  const result = await db.prepare(query).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN/DIRECTOR: Approve registration
// ==================
registrationRoutes.post('/:id/approve', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({})) as { hotelId?: string };

  const reg = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(regId).first<any>();
  if (!reg) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }

  if (reg.status !== 'pending' && reg.status !== 'waitlisted') {
    return c.json({ success: false, error: `Cannot approve a registration with status: ${reg.status}` }, 400);
  }

  // Check if team is local or non-local
  const team = await db.prepare('SELECT name, age_group, city, state, head_coach_name, head_coach_email FROM teams WHERE id = ?')
    .bind(reg.team_id).first<any>();
  const event = await db.prepare('SELECT name, city, state, start_date, end_date, price_cents FROM events WHERE id = ?')
    .bind(reg.event_id).first<any>();

  // Non-local teams require hotel selection
  const isLocal = team && event && team.state && event.state && team.state.toUpperCase() === event.state.toUpperCase();
  if (!isLocal && !body.hotelId) {
    return c.json({ success: false, error: 'Hotel selection required for non-local teams', requiresHotel: true }, 400);
  }

  // If hotel provided, look it up for the email
  let hotelInfo: any = null;
  if (body.hotelId) {
    hotelInfo = await db.prepare('SELECT * FROM event_hotels WHERE id = ?').bind(body.hotelId).first<any>();
    // Save hotel assignment on the registration
    try { await db.prepare("ALTER TABLE registrations ADD COLUMN hotel_assigned TEXT").run(); } catch (_) {}
    await db.prepare('UPDATE registrations SET hotel_assigned = ? WHERE id = ?').bind(body.hotelId, regId).run();
  }

  // Update registration
  await db.prepare(`
    UPDATE registrations SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(user.id, regId).run();

  // Increment division team count
  await db.prepare(`
    UPDATE event_divisions SET current_team_count = current_team_count + 1 WHERE id = ?
  `).bind(reg.event_division_id).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'registration.approved', 'registration', ?, ?)
  `).bind(crypto.randomUUID().replace(/-/g, ''), user.id, regId, JSON.stringify({ team_id: reg.team_id, hotel_id: body.hotelId || null })).run();

  // Send approval email
  let emailSent = false;
  try {
    const division = await db.prepare('SELECT age_group, division_level FROM event_divisions WHERE id = ?')
      .bind(reg.event_division_id).first<any>();

    if (team && event) {
      const startDate = new Date(event.start_date + 'T12:00:00');
      const eventDateStr = startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      const recipientEmail = team.head_coach_email || user.email;
      const recipientName = team.head_coach_name || team.name;

      // Determine payment status from the registration
      let paymentStatus = 'unpaid';
      if (reg.paid_cents && reg.amount_cents && reg.paid_cents >= reg.amount_cents) {
        paymentStatus = 'paid';
      } else if (reg.paid_cents && reg.paid_cents > 0) {
        paymentStatus = 'partial';
      }

      // Fetch admin-customized template overrides from DB
      const approvalTemplateId = paymentStatus === 'paid' ? 'approval_paid' : paymentStatus === 'partial' ? 'approval_deposit' : 'approval_unpaid';
      const approvalOverrides = await getResolvedFields(c.env.DB, approvalTemplateId);

      const result = await sendApprovalEmail(c.env, {
        recipientEmail,
        recipientName,
        teamName: team.name,
        ageGroup: division?.age_group || team.age_group,
        division: division?.division_level || undefined,
        eventName: event.name,
        eventDate: eventDateStr,
        eventCity: `${event.city}, ${event.state}`,
        paymentStatus,
        priceCents: event.price_cents || undefined,
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
        } : undefined,
        _overrides: approvalOverrides,
      } as any);
      emailSent = result.success;
    }
  } catch (err: any) {
    console.error('Approval email error:', err);
  }

  return c.json({ success: true, message: 'Registration approved', email_sent: emailSent });
});

// ==================
// ADMIN/DIRECTOR: Reject registration
// ==================
registrationRoutes.post('/:id/reject', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const regId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));

  await db.prepare(`
    UPDATE registrations SET status = 'rejected', notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.reason || null, regId).run();

  await db.prepare(`
    INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'registration.rejected', 'registration', ?, ?)
  `).bind(crypto.randomUUID().replace(/-/g, ''), user.id, regId, JSON.stringify({ reason: body.reason })).run();

  return c.json({ success: true, message: 'Registration rejected' });
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
    await db.prepare(`
      INSERT INTO teams (id, name, age_group, division_level, city, state,
        head_coach_name, head_coach_email, head_coach_phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      teamId, data.newTeam.name, data.newTeam.ageGroup,
      data.newTeam.divisionLevel || null, data.newTeam.city || null, data.newTeam.state || null,
      data.newTeam.headCoachName || null, data.newTeam.headCoachEmail || null, data.newTeam.headCoachPhone || null
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
