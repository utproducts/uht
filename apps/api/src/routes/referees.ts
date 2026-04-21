import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const refereeRoutes = new Hono<{ Bindings: Env }>();

// ══════════════════════════════════════
// PUBLIC: REFEREE INTEREST FORM
// ══════════════════════════════════════

const interestSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  city_id: z.string().min(1),
  experience: z.string().optional(),
  certifications: z.string().optional(),
  message: z.string().optional(),
});

refereeRoutes.post('/interest', zValidator('json', interestSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  // Store as an inactive referee with a note about how they came in
  const inviteToken = crypto.randomUUID().replace(/-/g, '');
  const notes = [
    data.experience ? `Experience: ${data.experience}` : null,
    data.certifications ? `Certifications: ${data.certifications}` : null,
    data.message ? `Message: ${data.message}` : null,
    'Source: Public interest form',
  ].filter(Boolean).join(' | ');

  await db.prepare(`
    INSERT INTO referees (id, type, first_name, last_name, email, phone, city_id, notes, invite_token, is_active)
    VALUES (?, 'individual', ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind(id, data.first_name, data.last_name, data.email, data.phone || null,
    data.city_id, notes, inviteToken, 0
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ══════════════════════════════════════
// REFEREE RATES
// ══════════════════════════════════════

// List rates (optionally filter by season)
refereeRoutes.get('/rates', async (c) => {
  const db = c.env.DB;
  const season = c.req.query('season');
  const sql = season
    ? 'SELECT * FROM referee_rates WHERE season = ? ORDER BY age_group, role'
    : 'SELECT * FROM referee_rates ORDER BY season DESC, age_group, role';
  const result = season
    ? await db.prepare(sql).bind(season).all()
    : await db.prepare(sql).all();
  return c.json({ success: true, data: result.results });
});

// Upsert rate (create or update)
const upsertRateSchema = z.object({
  age_group: z.string().min(1),
  role: z.enum(['referee', 'linesman']),
  rate_cents: z.number().int().min(0),
  season: z.string().min(1),
});

refereeRoutes.post('/rates', authMiddleware, requireRole('admin'), zValidator('json', upsertRateSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  // Upsert: try insert, on conflict update
  await db.prepare(`
    INSERT INTO referee_rates (id, age_group, role, rate_cents, season)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(age_group, role, season) DO UPDATE SET
      rate_cents = excluded.rate_cents,
      updated_at = datetime('now')
  `).bind(id, data.age_group, data.role, data.rate_cents, data.season).run();

  return c.json({ success: true });
});

// Delete rate
refereeRoutes.delete('/rates/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.prepare('DELETE FROM referee_rates WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ══════════════════════════════════════
// REFEREES / ASSIGNERS
// ══════════════════════════════════════

// List all referees (with optional type filter)
refereeRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const type = c.req.query('type'); // 'individual' or 'assigner'
  const cityId = c.req.query('city_id');

  let sql = `
    SELECT r.*, c.name as city_name, c.state as city_state
    FROM referees r
    LEFT JOIN cities c ON r.city_id = c.id
    WHERE r.is_active = 1
  `;
  const binds: string[] = [];

  if (type) {
    sql += ' AND r.type = ?';
    binds.push(type);
  }
  if (cityId) {
    sql += ' AND r.city_id = ?';
    binds.push(cityId);
  }

  sql += ' ORDER BY r.last_name, r.first_name';

  const stmt = db.prepare(sql);
  const result = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();
  return c.json({ success: true, data: result.results });
});

// Get single referee with assignments and payments summary
refereeRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const referee = await db.prepare(`
    SELECT r.*, c.name as city_name, c.state as city_state
    FROM referees r
    LEFT JOIN cities c ON r.city_id = c.id
    WHERE r.id = ?
  `).bind(id).first();

  if (!referee) return c.json({ success: false, error: 'Referee not found' }, 404);

  // Get assignment stats
  const assignmentStats = await db.prepare(`
    SELECT
      COUNT(*) as total_games,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_games,
      SUM(CASE WHEN status = 'completed' THEN rate_cents ELSE 0 END) as total_earned_cents
    FROM referee_game_assignments WHERE referee_id = ?
  `).bind(id).first();

  // Get payment stats
  const paymentStats = await db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN amount_cents ELSE 0 END) as total_paid_cents,
      SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END) as pending_cents
    FROM referee_payments WHERE referee_id = ?
  `).bind(id).first();

  return c.json({
    success: true,
    data: {
      ...referee,
      stats: {
        ...assignmentStats,
        ...paymentStats,
      },
    },
  });
});

// Create referee
const createRefereeSchema = z.object({
  type: z.enum(['individual', 'assigner']),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  city_id: z.string().optional(),
  notes: z.string().optional(),
});

refereeRoutes.post('/', authMiddleware, requireRole('admin'), zValidator('json', createRefereeSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  const inviteToken = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO referees (id, type, first_name, last_name, email, phone, city_id, notes, invite_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.type, data.first_name, data.last_name, data.email,
    data.phone || null, data.city_id || null, data.notes || null, inviteToken
  ).run();

  return c.json({ success: true, data: { id, invite_token: inviteToken } }, 201);
});

// Update referee
const updateRefereeSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  city_id: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['individual', 'assigner']).optional(),
});

refereeRoutes.put('/:id', authMiddleware, requireRole('admin'), zValidator('json', updateRefereeSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const sets: string[] = [];
  const vals: any[] = [];

  if (data.first_name) { sets.push('first_name = ?'); vals.push(data.first_name); }
  if (data.last_name) { sets.push('last_name = ?'); vals.push(data.last_name); }
  if (data.email) { sets.push('email = ?'); vals.push(data.email); }
  if (data.phone !== undefined) { sets.push('phone = ?'); vals.push(data.phone || null); }
  if (data.city_id !== undefined) { sets.push('city_id = ?'); vals.push(data.city_id || null); }
  if (data.notes !== undefined) { sets.push('notes = ?'); vals.push(data.notes || null); }
  if (data.type) { sets.push('type = ?'); vals.push(data.type); }

  if (sets.length === 0) return c.json({ success: true });

  sets.push("updated_at = datetime('now')");
  vals.push(id);

  await db.prepare(`UPDATE referees SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ success: true });
});

// Soft delete referee
refereeRoutes.delete('/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.prepare('UPDATE referees SET is_active = 0 WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ══════════════════════════════════════
// ASSIGNER CONTRACTS
// ══════════════════════════════════════

// List contracts for an event
refereeRoutes.get('/contracts/event/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT rc.*, r.first_name, r.last_name, r.email
    FROM referee_assigner_contracts rc
    JOIN referees r ON rc.referee_id = r.id
    WHERE rc.event_id = ?
    ORDER BY r.last_name
  `).bind(eventId).all();
  return c.json({ success: true, data: result.results });
});

// Create/update assigner contract
const contractSchema = z.object({
  referee_id: z.string(),
  event_id: z.string(),
  flat_fee_cents: z.number().int().min(0),
  notes: z.string().optional(),
});

refereeRoutes.post('/contracts', authMiddleware, requireRole('admin'), zValidator('json', contractSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO referee_assigner_contracts (id, referee_id, event_id, flat_fee_cents, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(referee_id, event_id) DO UPDATE SET
      flat_fee_cents = excluded.flat_fee_cents,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).bind(id, data.referee_id, data.event_id, data.flat_fee_cents, data.notes || null).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ══════════════════════════════════════
// GAME ASSIGNMENTS
// ══════════════════════════════════════

// List assignments for a game
refereeRoutes.get('/assignments/game/:gameId', async (c) => {
  const gameId = c.req.param('gameId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT rga.*, r.first_name, r.last_name, r.email
    FROM referee_game_assignments rga
    JOIN referees r ON rga.referee_id = r.id
    WHERE rga.game_id = ?
    ORDER BY rga.role, r.last_name
  `).bind(gameId).all();
  return c.json({ success: true, data: result.results });
});

// List assignments for a referee
refereeRoutes.get('/assignments/referee/:refereeId', async (c) => {
  const refereeId = c.req.param('refereeId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT rga.*, g.game_number, g.start_time, g.home_team_name, g.away_team_name, g.rink_name
    FROM referee_game_assignments rga
    JOIN games g ON rga.game_id = g.id
    WHERE rga.referee_id = ?
    ORDER BY g.start_time
  `).bind(refereeId).all();
  return c.json({ success: true, data: result.results });
});

// Assign referee to game
const assignSchema = z.object({
  referee_id: z.string(),
  game_id: z.string(),
  role: z.enum(['referee', 'linesman']).default('referee'),
});

refereeRoutes.post('/assignments', authMiddleware, requireRole('admin'), zValidator('json', assignSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  // Look up the rate for this game's age group
  const game = await db.prepare(`
    SELECT g.event_division_id, ed.age_group, e.season
    FROM games g
    JOIN event_divisions ed ON g.event_division_id = ed.id
    JOIN events e ON g.event_id = e.id
    WHERE g.id = ?
  `).bind(data.game_id).first() as any;

  let rateCents: number | null = null;
  if (game) {
    const rate = await db.prepare(`
      SELECT rate_cents FROM referee_rates
      WHERE age_group = ? AND role = ? AND season = ?
    `).bind(game.age_group, data.role, game.season).first() as any;
    if (rate) rateCents = rate.rate_cents;
  }

  await db.prepare(`
    INSERT INTO referee_game_assignments (id, referee_id, game_id, role, rate_cents)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(referee_id, game_id) DO UPDATE SET
      role = excluded.role,
      rate_cents = excluded.rate_cents
  `).bind(id, data.referee_id, data.game_id, data.role, rateCents).run();

  return c.json({ success: true, data: { id, rate_cents: rateCents } }, 201);
});

// Update assignment status
refereeRoutes.put('/assignments/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { status: string };
  const db = c.env.DB;

  await db.prepare('UPDATE referee_game_assignments SET status = ? WHERE id = ?')
    .bind(body.status, id).run();
  return c.json({ success: true });
});

// Remove assignment
refereeRoutes.delete('/assignments/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  await db.prepare('DELETE FROM referee_game_assignments WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ══════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════

// List payments for a referee
refereeRoutes.get('/payments/:refereeId', async (c) => {
  const refereeId = c.req.param('refereeId');
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT rp.*, e.name as event_name
    FROM referee_payments rp
    LEFT JOIN events e ON rp.event_id = e.id
    WHERE rp.referee_id = ?
    ORDER BY rp.created_at DESC
  `).bind(refereeId).all();
  return c.json({ success: true, data: result.results });
});

// Create payment record
const createPaymentSchema = z.object({
  referee_id: z.string(),
  event_id: z.string().optional(),
  amount_cents: z.number().int().min(1),
  payment_type: z.enum(['game_pay', 'assigner_contract', 'adjustment', 'bonus']),
  description: z.string().optional(),
});

refereeRoutes.post('/payments', authMiddleware, requireRole('admin'), zValidator('json', createPaymentSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO referee_payments (id, referee_id, event_id, amount_cents, payment_type, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, data.referee_id, data.event_id || null, data.amount_cents, data.payment_type, data.description || null).run();

  return c.json({ success: true, data: { id } }, 201);
});

// Update payment status (for when Stripe processes it)
refereeRoutes.put('/payments/:id/status', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { status: string; stripe_transfer_id?: string };
  const db = c.env.DB;

  await db.prepare(`
    UPDATE referee_payments SET
      status = ?,
      stripe_transfer_id = COALESCE(?, stripe_transfer_id),
      paid_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE paid_at END,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.status, body.stripe_transfer_id || null, body.status, id).run();

  return c.json({ success: true });
});
