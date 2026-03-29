import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

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

  // TODO: Trigger SendGrid confirmation email
  // await sendRegistrationConfirmation(c.env, regId);

  return c.json({
    success: true,
    data: {
      id: regId,
      status: 'pending',
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

  let query = `
    SELECT r.*,
      t.name as team_name, t.age_group as team_age_group, t.city as team_city, t.state as team_state,
      t.logo_url as team_logo_url,
      ed.age_group as division_age_group, ed.division_level,
      u.first_name as registered_by_first, u.last_name as registered_by_last, u.email as registered_by_email, u.phone as registered_by_phone,
      (SELECT COUNT(*) FROM registration_rosters rr WHERE rr.registration_id = r.id) as roster_count
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    JOIN users u ON u.id = r.registered_by
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

  const reg = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(regId).first<any>();
  if (!reg) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }

  if (reg.status !== 'pending' && reg.status !== 'waitlisted') {
    return c.json({ success: false, error: `Cannot approve a registration with status: ${reg.status}` }, 400);
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
  `).bind(crypto.randomUUID().replace(/-/g, ''), user.id, regId, JSON.stringify({ team_id: reg.team_id })).run();

  // TODO: Trigger approval email + add to event communications
  // await sendRegistrationApproval(c.env, regId);

  return c.json({ success: true, message: 'Registration approved' });
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
