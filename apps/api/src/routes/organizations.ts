import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const organizationRoutes = new Hono<{ Bindings: Env }>();

// Get current user's organization(s)
organizationRoutes.get('/mine', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id AND t.is_active = 1) as team_count
    FROM organizations o
    WHERE o.owner_id = ? AND o.is_active = 1
  `).bind(user.id).all();

  return c.json({ success: true, data: result.results });
});

// Get org with teams
organizationRoutes.get('/:id', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const db = c.env.DB;

  const org = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first();
  if (!org) return c.json({ success: false, error: 'Organization not found' }, 404);

  const teams = await db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count
    FROM teams t WHERE t.organization_id = ? AND t.is_active = 1
    ORDER BY t.age_group ASC, t.name ASC
  `).bind(orgId).all();

  return c.json({ success: true, data: { ...org, teams: teams.results } });
});

// Create organization
const createOrgSchema = z.object({
  name: z.string().min(1),
  usaHockeyOrgId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
});

organizationRoutes.post('/', authMiddleware, requireRole('admin', 'organization'), zValidator('json', createOrgSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  const orgId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO organizations (id, name, owner_id, usa_hockey_org_id, address, city, state, zip, phone, email, website)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(orgId, data.name, user.id, data.usaHockeyOrgId || null, data.address || null,
    data.city || null, data.state || null, data.zip || null, data.phone || null,
    data.email || null, data.website || null
  ).run();

  return c.json({ success: true, data: { id: orgId } }, 201);
});

// Rename organization
organizationRoutes.patch('/:id', async (c) => {
  const db = c.env.DB;
  const orgId = c.req.param('id');
  const body = await c.req.json<{ name?: string; city?: string; state?: string }>();

  const fields: string[] = [];
  const params: any[] = [];

  if (body.name !== undefined) { fields.push('name = ?'); params.push(body.name); }
  if (body.city !== undefined) { fields.push('city = ?'); params.push(body.city); }
  if (body.state !== undefined) { fields.push('state = ?'); params.push(body.state); }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

  fields.push("updated_at = datetime('now')");
  params.push(orgId);

  await db.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// Create coach under organization and assign to team
const assignCoachSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  teamId: z.string(),
  coachRole: z.enum(['head', 'assistant']).default('assistant'),
});

organizationRoutes.post('/:id/coaches', authMiddleware, requireRole('admin', 'organization'), zValidator('json', assignCoachSchema), async (c) => {
  const orgId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check if user exists, if not create invite
  let coachUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(data.email.toLowerCase()).first<{ id: string }>();

  if (!coachUser) {
    // Create a placeholder user that can be claimed via email invite
    const userId = crypto.randomUUID().replace(/-/g, '');
    const tempPassword = crypto.randomUUID(); // They'll reset this
    const { hashPassword } = await import('../middleware/auth');
    const hash = await hashPassword(tempPassword);

    await db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, data.email.toLowerCase(), hash, data.firstName, data.lastName, data.phone || null).run();

    await db.prepare(`INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'coach')`)
      .bind(crypto.randomUUID().replace(/-/g, ''), userId).run();

    coachUser = { id: userId };
    // TODO: Send invite email via SendGrid
  }

  // Assign to team
  await db.prepare(`
    INSERT OR IGNORE INTO team_coaches (id, team_id, user_id, role, assigned_by)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID().replace(/-/g, ''), data.teamId, coachUser.id, data.coachRole, c.get('user').id).run();

  return c.json({ success: true, data: { userId: coachUser.id } }, 201);
});
