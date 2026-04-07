import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, UserRole } from '../types';
import { authMiddleware, requireRole, hashPassword } from '../middleware/auth';

export const userRoutes = new Hono<{ Bindings: Env }>();

// ==================
// SCHEMAS
// ==================
const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  password: z.string().min(8),
  roles: z.array(z.enum(['admin', 'director', 'organization', 'coach', 'manager', 'parent', 'scorekeeper', 'referee'])).min(1),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
});

const updateRolesSchema = z.object({
  roles: z.array(z.enum(['admin', 'director', 'organization', 'coach', 'manager', 'parent', 'scorekeeper', 'referee'])).min(1),
});

const updateStatusSchema = z.object({
  is_active: z.number().int().min(0).max(1),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  role: z.enum(['admin', 'director', 'organization', 'coach', 'manager', 'parent', 'scorekeeper', 'referee']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.string().default('1').transform(v => Math.max(1, parseInt(v) || 1)),
  per_page: z.string().default('20').transform(v => Math.min(100, Math.max(1, parseInt(v) || 20))),
});

// ==================
// LIST USERS
// ==================
userRoutes.get('/',
  authMiddleware,
  requireRole('admin'),
  zValidator('query', listQuerySchema),
  async (c) => {
    const { q, role, status, page, per_page } = c.req.valid('query');
    const db = c.env.DB;

    let baseQuery = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.avatar_url,
        u.email_verified,
        u.is_active,
        u.created_at,
        u.updated_at,
        GROUP_CONCAT(ur.role, ',') as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE 1=1
    `;

    const params: (string | number)[] = [];

    // Search by name or email
    if (q) {
      baseQuery += ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Filter by status
    if (status === 'active') {
      baseQuery += ` AND u.is_active = 1`;
    } else if (status === 'inactive') {
      baseQuery += ` AND u.is_active = 0`;
    }

    // Filter by role (need to use HAVING after GROUP_CONCAT)
    let havingClause = '';
    if (role) {
      havingClause = ` HAVING roles LIKE ?`;
      params.push(`%${role}%`);
    }

    // Count total before pagination
    const countQuery = `SELECT COUNT(DISTINCT u.id) as count FROM users u LEFT JOIN user_roles ur ON u.id = ur.user_id WHERE 1=1${
      q ? ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)` : ''
    }${status === 'active' ? ` AND u.is_active = 1` : status === 'inactive' ? ` AND u.is_active = 0` : ''}`;

    const countParams = q ? [
      `%${q}%`,
      `%${q}%`,
      `%${q}%`,
    ] : [];

    const countResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();
    const total = countResult?.count || 0;

    // Add pagination
    baseQuery += ` GROUP BY u.id${havingClause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    const offset = (page - 1) * per_page;
    params.push(per_page, offset);

    const results = await db.prepare(baseQuery).bind(...params).all<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      avatar_url: string | null;
      email_verified: number;
      is_active: number;
      created_at: string;
      updated_at: string;
      roles: string | null;
    }>();

    const users = (results.results || []).map(u => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      phone: u.phone,
      avatarUrl: u.avatar_url,
      emailVerified: u.email_verified === 1,
      isActive: u.is_active === 1,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      roles: u.roles ? u.roles.split(',') as UserRole[] : [],
    }));

    const totalPages = Math.ceil(total / per_page);

    return c.json({
      success: true,
      data: users,
      pagination: {
        page,
        perPage: per_page,
        total,
        totalPages,
      },
    });
  }
);

// ==================
// GET USER BY ID
// ==================
userRoutes.get('/:userId',
  authMiddleware,
  requireRole('admin'),
  async (c) => {
    const userId = c.req.param('userId');
    const db = c.env.DB;

    const user = await db.prepare(`
      SELECT id, email, first_name, last_name, phone, avatar_url, email_verified, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).bind(userId).first<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      avatar_url: string | null;
      email_verified: number;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role')
      .bind(userId).all<{ role: UserRole }>();

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        emailVerified: user.email_verified === 1,
        isActive: user.is_active === 1,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        roles: rolesResult.results?.map(r => r.role) || [],
      },
    });
  }
);

// ==================
// CREATE USER
// ==================
userRoutes.post('/',
  authMiddleware,
  requireRole('admin'),
  zValidator('json', createUserSchema),
  async (c) => {
    const data = c.req.valid('json');
    const db = c.env.DB;

    // Check if email already exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?')
      .bind(data.email.toLowerCase()).first();

    if (existing) {
      return c.json({ success: false, error: 'An account with this email already exists' }, 409);
    }

    const userId = crypto.randomUUID().replace(/-/g, '');
    const passwordHash = await hashPassword(data.password);
    const now = new Date().toISOString();

    try {
      // Create user
      await db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        data.email.toLowerCase(),
        passwordHash,
        data.firstName,
        data.lastName,
        data.phone || null,
        now,
        now
      ).run();

      // Insert roles
      for (const role of data.roles) {
        const roleId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`
          INSERT INTO user_roles (id, user_id, role, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(roleId, userId, role, now).run();
      }

      return c.json({
        success: true,
        data: {
          id: userId,
          email: data.email.toLowerCase(),
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          roles: data.roles,
        },
      }, 201);
    } catch (err) {
      console.error('User creation error:', err);
      return c.json({ success: false, error: 'Failed to create user' }, 500);
    }
  }
);

// ==================
// UPDATE USER
// ==================
userRoutes.put('/:userId',
  authMiddleware,
  requireRole('admin'),
  zValidator('json', updateUserSchema),
  async (c) => {
    const userId = c.req.param('userId');
    const data = c.req.valid('json');
    const db = c.env.DB;

    // Check if user exists
    const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    // Check if email is already taken by another user
    if (data.email) {
      const emailExists = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .bind(data.email.toLowerCase(), userId).first();
      if (emailExists) {
        return c.json({ success: false, error: 'An account with this email already exists' }, 409);
      }
    }

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.email) {
      updates.push('email = ?');
      params.push(data.email.toLowerCase());
    }
    if (data.firstName) {
      updates.push('first_name = ?');
      params.push(data.firstName);
    }
    if (data.lastName) {
      updates.push('last_name = ?');
      params.push(data.lastName);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      params.push(data.phone);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active);
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(userId);

    try {
      await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params).run();

      // Fetch updated user
      const updated = await db.prepare(`
        SELECT id, email, first_name, last_name, phone, avatar_url, email_verified, is_active, created_at, updated_at
        FROM users WHERE id = ?
      `).bind(userId).first<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        avatar_url: string | null;
        email_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>();

      const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role')
        .bind(userId).all<{ role: UserRole }>();

      return c.json({
        success: true,
        data: {
          id: updated!.id,
          email: updated!.email,
          firstName: updated!.first_name,
          lastName: updated!.last_name,
          phone: updated!.phone,
          avatarUrl: updated!.avatar_url,
          emailVerified: updated!.email_verified === 1,
          isActive: updated!.is_active === 1,
          createdAt: updated!.created_at,
          updatedAt: updated!.updated_at,
          roles: rolesResult.results?.map(r => r.role) || [],
        },
      });
    } catch (err) {
      console.error('User update error:', err);
      return c.json({ success: false, error: 'Failed to update user' }, 500);
    }
  }
);

// ==================
// UPDATE USER ROLES
// ==================
userRoutes.put('/:userId/roles',
  authMiddleware,
  requireRole('admin'),
  zValidator('json', updateRolesSchema),
  async (c) => {
    const userId = c.req.param('userId');
    const { roles } = c.req.valid('json');
    const db = c.env.DB;

    // Check if user exists
    const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    try {
      // Delete existing roles
      await db.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId).run();

      // Insert new roles
      const now = new Date().toISOString();
      for (const role of roles) {
        const roleId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`
          INSERT INTO user_roles (id, user_id, role, created_at)
          VALUES (?, ?, ?, ?)
        `).bind(roleId, userId, role, now).run();
      }

      // Fetch updated user
      const userRecord = await db.prepare(`
        SELECT id, email, first_name, last_name, phone, avatar_url, email_verified, is_active, created_at, updated_at
        FROM users WHERE id = ?
      `).bind(userId).first<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        avatar_url: string | null;
        email_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>();

      return c.json({
        success: true,
        data: {
          id: userRecord!.id,
          email: userRecord!.email,
          firstName: userRecord!.first_name,
          lastName: userRecord!.last_name,
          phone: userRecord!.phone,
          avatarUrl: userRecord!.avatar_url,
          emailVerified: userRecord!.email_verified === 1,
          isActive: userRecord!.is_active === 1,
          createdAt: userRecord!.created_at,
          updatedAt: userRecord!.updated_at,
          roles,
        },
      });
    } catch (err) {
      console.error('Role update error:', err);
      return c.json({ success: false, error: 'Failed to update user roles' }, 500);
    }
  }
);

// ==================
// UPDATE USER STATUS
// ==================
userRoutes.put('/:userId/status',
  authMiddleware,
  requireRole('admin'),
  zValidator('json', updateStatusSchema),
  async (c) => {
    const userId = c.req.param('userId');
    const { is_active } = c.req.valid('json');
    const db = c.env.DB;

    // Check if user exists
    const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    try {
      const now = new Date().toISOString();
      await db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
        .bind(is_active, now, userId).run();

      // Fetch updated user
      const updated = await db.prepare(`
        SELECT id, email, first_name, last_name, phone, avatar_url, email_verified, is_active, created_at, updated_at
        FROM users WHERE id = ?
      `).bind(userId).first<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        avatar_url: string | null;
        email_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>();

      const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role')
        .bind(userId).all<{ role: UserRole }>();

      return c.json({
        success: true,
        data: {
          id: updated!.id,
          email: updated!.email,
          firstName: updated!.first_name,
          lastName: updated!.last_name,
          phone: updated!.phone,
          avatarUrl: updated!.avatar_url,
          emailVerified: updated!.email_verified === 1,
          isActive: updated!.is_active === 1,
          createdAt: updated!.created_at,
          updatedAt: updated!.updated_at,
          roles: rolesResult.results?.map(r => r.role) || [],
        },
      });
    } catch (err) {
      console.error('Status update error:', err);
      return c.json({ success: false, error: 'Failed to update user status' }, 500);
    }
  }
);
