import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, UserRole } from '../types';
import { hashPassword, verifyPassword, generateToken } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';

export const authRoutes = new Hono<{ Bindings: Env }>();

// ==================
// REGISTER
// ==================
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['organization', 'coach', 'manager', 'parent']).default('parent'),
});

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check if email already exists
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(data.email.toLowerCase()).first();
  if (existing) {
    return c.json({ success: false, error: 'An account with this email already exists' }, 409);
  }

  const passwordHash = await hashPassword(data.password);
  const userId = crypto.randomUUID().replace(/-/g, '');

  try {
    // Create user
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null).run();

    // Assign role
    await db.prepare(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), userId, data.role).run();

    // Generate token
    const token = await generateToken(
      { id: userId, email: data.email.toLowerCase(), roles: [data.role as UserRole] },
      c.env.JWT_SECRET
    );

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: userId,
          email: data.email.toLowerCase(),
          firstName: data.firstName,
          lastName: data.lastName,
          roles: [data.role],
        },
      },
    }, 201);
  } catch (err) {
    console.error('Registration error:', err);
    return c.json({ success: false, error: 'Failed to create account' }, 500);
  }
});

// ==================
// LOGIN
// ==================
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const db = c.env.DB;

  // Find user
  const user = await db.prepare(`
    SELECT id, email, password_hash, first_name, last_name, is_active
    FROM users WHERE email = ?
  `).bind(email.toLowerCase()).first<{
    id: string; email: string; password_hash: string;
    first_name: string; last_name: string; is_active: number;
  }>();

  if (!user || !user.is_active) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  // Get roles
  const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .bind(user.id).all<{ role: UserRole }>();
  const roles = rolesResult.results?.map(r => r.role) || [];

  // Generate token
  const token = await generateToken({ id: user.id, email: user.email, roles }, c.env.JWT_SECRET);

  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles,
      },
    },
  });
});

// ==================
// GET CURRENT USER
// ==================
authRoutes.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const db = c.env.DB;

  const user = await db.prepare(`
    SELECT id, email, first_name, last_name, phone, avatar_url, created_at
    FROM users WHERE id = ?
  `).bind(authUser.id).first();

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .bind(authUser.id).all<{ role: UserRole }>();

  return c.json({
    success: true,
    data: {
      ...user,
      roles: rolesResult.results?.map(r => r.role) || [],
    },
  });
});

// ==================
// SCOREKEEPER PIN LOGIN
// ==================
const pinLoginSchema = z.object({
  pin: z.string().length(4),
});

authRoutes.post('/scorekeeper-pin', zValidator('json', pinLoginSchema), async (c) => {
  const { pin } = c.req.valid('json');
  const db = c.env.DB;

  const pinRecord = await db.prepare(`
    SELECT sp.event_id, e.name as event_name, e.slug as event_slug
    FROM scorekeeper_pins sp
    JOIN events e ON e.id = sp.event_id
    WHERE sp.pin_code = ? AND sp.is_active = 1
  `).bind(pin).first<{ event_id: string; event_name: string; event_slug: string }>();

  if (!pinRecord) {
    return c.json({ success: false, error: 'Invalid PIN code' }, 401);
  }

  // Generate a limited-scope token for scorekeeper
  const token = await generateToken(
    { id: `scorekeeper-${pin}`, email: `scorekeeper@${pinRecord.event_slug}`, roles: ['scorekeeper'] },
    c.env.JWT_SECRET
  );

  return c.json({
    success: true,
    data: {
      token,
      eventId: pinRecord.event_id,
      eventName: pinRecord.event_name,
    },
  });
});
