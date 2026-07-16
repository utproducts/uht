import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

/*
 * ==========================================
 * DATABASE MIGRATION — run this SQL on D1:
 * ==========================================
 *
 * CREATE TABLE IF NOT EXISTS coupon_codes (
 *   id TEXT PRIMARY KEY,
 *   code TEXT UNIQUE NOT NULL,
 *   discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
 *   discount_amount INTEGER NOT NULL,
 *   max_uses INTEGER,
 *   current_uses INTEGER DEFAULT 0,
 *   is_active INTEGER DEFAULT 1,
 *   event_id TEXT,
 *   expires_at TEXT,
 *   created_at TEXT DEFAULT (datetime('now')),
 *   created_by TEXT
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_coupon_codes_code ON coupon_codes(code);
 * CREATE INDEX IF NOT EXISTS idx_coupon_codes_event_id ON coupon_codes(event_id);
 */

export const couponRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// Helper: generate a random 8-char alphanumeric code
// ==========================================
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==========================================
// ADMIN: List all coupon codes
// ==========================================
couponRoutes.get('/admin', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  try {
    const result = await db.prepare(`
      SELECT cc.*, e.name as event_name
      FROM coupon_codes cc
      LEFT JOIN events e ON e.id = cc.event_id
      ORDER BY cc.created_at DESC
    `).all();

    return c.json({ success: true, data: result.results });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to fetch coupons' }, 500);
  }
});

// ==========================================
// ADMIN: Create a new coupon code
// ==========================================
const createCouponSchema = z.object({
  code: z.string().min(1).max(50).optional().nullable(),
  discount_type: z.enum(['fixed', 'percent']),
  discount_amount: z.number().int().min(1),
  max_uses: z.number().int().min(1).optional().nullable(),
  event_id: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

couponRoutes.post('/admin', authMiddleware, requireRole('admin', 'director'), zValidator('json', createCouponSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const user = c.get('user') as any;

  try {
    const id = crypto.randomUUID().replace(/-/g, '').toLowerCase();
    let code = data.code?.trim().toUpperCase();

    // Auto-generate code if not provided
    if (!code) {
      code = generateCode();
      // Ensure uniqueness
      let attempts = 0;
      while (attempts < 10) {
        const existing = await db.prepare('SELECT id FROM coupon_codes WHERE code = ?').bind(code).first();
        if (!existing) break;
        code = generateCode();
        attempts++;
      }
    }

    // Validate percent discount is <= 100
    if (data.discount_type === 'percent' && data.discount_amount > 100) {
      return c.json({ success: false, error: 'Percentage discount cannot exceed 100%' }, 400);
    }

    // Check for duplicate code
    const existingCode = await db.prepare('SELECT id FROM coupon_codes WHERE code = ?').bind(code).first();
    if (existingCode) {
      return c.json({ success: false, error: 'A coupon with this code already exists' }, 409);
    }

    await db.prepare(`
      INSERT INTO coupon_codes (id, code, discount_type, discount_amount, max_uses, event_id, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      code,
      data.discount_type,
      data.discount_amount,
      data.max_uses || null,
      data.event_id || null,
      data.expires_at || null,
      user?.email || 'admin'
    ).run();

    return c.json({ success: true, data: { id, code } }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to create coupon' }, 500);
  }
});

// ==========================================
// ADMIN: Update a coupon code
// ==========================================
const updateCouponSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  discount_type: z.enum(['fixed', 'percent']).optional(),
  discount_amount: z.number().int().min(1).optional(),
  max_uses: z.number().int().min(1).optional().nullable(),
  is_active: z.number().min(0).max(1).optional(),
  event_id: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

couponRoutes.put('/admin/:id', authMiddleware, requireRole('admin', 'director'), zValidator('json', updateCouponSchema), async (c) => {
  const couponId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Check coupon exists
    const existing = await db.prepare('SELECT id FROM coupon_codes WHERE id = ?').bind(couponId).first();
    if (!existing) {
      return c.json({ success: false, error: 'Coupon not found' }, 404);
    }

    // Validate percent discount
    if (data.discount_type === 'percent' && data.discount_amount && data.discount_amount > 100) {
      return c.json({ success: false, error: 'Percentage discount cannot exceed 100%' }, 400);
    }

    // Check for duplicate code if code is being changed
    if (data.code) {
      const duplicate = await db.prepare('SELECT id FROM coupon_codes WHERE code = ? AND id != ?')
        .bind(data.code.trim().toUpperCase(), couponId).first();
      if (duplicate) {
        return c.json({ success: false, error: 'A coupon with this code already exists' }, 409);
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.code !== undefined) { updates.push('code = ?'); params.push(data.code.trim().toUpperCase()); }
    if (data.discount_type !== undefined) { updates.push('discount_type = ?'); params.push(data.discount_type); }
    if (data.discount_amount !== undefined) { updates.push('discount_amount = ?'); params.push(data.discount_amount); }
    if (data.max_uses !== undefined) { updates.push('max_uses = ?'); params.push(data.max_uses); }
    if (data.is_active !== undefined) { updates.push('is_active = ?'); params.push(data.is_active); }
    if (data.event_id !== undefined) { updates.push('event_id = ?'); params.push(data.event_id); }
    if (data.expires_at !== undefined) { updates.push('expires_at = ?'); params.push(data.expires_at); }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400);
    }

    params.push(couponId);
    await db.prepare(`UPDATE coupon_codes SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update coupon' }, 500);
  }
});

// ==========================================
// ADMIN: Delete a coupon code
// ==========================================
couponRoutes.delete('/admin/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const couponId = c.req.param('id');
  const db = c.env.DB;

  try {
    const existing = await db.prepare('SELECT id FROM coupon_codes WHERE id = ?').bind(couponId).first();
    if (!existing) {
      return c.json({ success: false, error: 'Coupon not found' }, 404);
    }

    await db.prepare('DELETE FROM coupon_codes WHERE id = ?').bind(couponId).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to delete coupon' }, 500);
  }
});

// ==========================================
// PUBLIC: Validate a coupon code
// ==========================================
const validateCouponSchema = z.object({
  code: z.string().min(1),
  event_id: z.string().optional(),
});

couponRoutes.post('/validate', zValidator('json', validateCouponSchema), async (c) => {
  const { code, event_id } = c.req.valid('json');
  const db = c.env.DB;

  try {
    const coupon = await db.prepare(
      'SELECT * FROM coupon_codes WHERE UPPER(code) = UPPER(?)'
    ).bind(code.trim()).first() as any;

    if (!coupon) {
      return c.json({ success: false, error: 'Invalid coupon code' }, 404);
    }

    // Check if active
    if (!coupon.is_active) {
      return c.json({ success: false, error: 'This coupon code is no longer active' }, 400);
    }

    // Check expiration
    if (coupon.expires_at) {
      const expiresAt = new Date(coupon.expires_at);
      if (expiresAt < new Date()) {
        return c.json({ success: false, error: 'This coupon code has expired' }, 400);
      }
    }

    // Check max uses
    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return c.json({ success: false, error: 'This coupon code has reached its usage limit' }, 400);
    }

    // Check event restriction
    if (coupon.event_id && event_id && coupon.event_id !== event_id) {
      return c.json({ success: false, error: 'This coupon code is not valid for this event' }, 400);
    }

    return c.json({
      success: true,
      data: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_amount: coupon.discount_amount,
        event_id: coupon.event_id,
        valid: true,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to validate coupon' }, 500);
  }
});
