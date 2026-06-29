import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const faqRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// PUBLIC: Get all FAQ categories with nested items
// ==========================================
faqRoutes.get('/', async (c) => {
  const db = c.env.DB;

  try {
    const categories = await db.prepare(`
      SELECT id, name, description, icon, sort_order
      FROM faq_categories
      ORDER BY sort_order ASC
    `).all();

    const items = await db.prepare(`
      SELECT id, category_id, question, answer, sort_order
      FROM faq_items
      ORDER BY sort_order ASC
    `).all();

    // Nest items under their categories
    const itemsByCategory: Record<string, any[]> = {};
    for (const item of (items.results || []) as any[]) {
      if (!itemsByCategory[item.category_id]) {
        itemsByCategory[item.category_id] = [];
      }
      itemsByCategory[item.category_id].push({
        id: item.id,
        question: item.question,
        answer: item.answer,
        sort_order: item.sort_order,
      });
    }

    const data = ((categories.results || []) as any[]).map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      sort_order: cat.sort_order,
      items: itemsByCategory[cat.id] || [],
    }));

    return c.json({ success: true, data });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to fetch FAQs' }, 500);
  }
});

// ==========================================
// ADMIN: Create a FAQ category
// ==========================================
faqRoutes.post('/categories', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
})), async (c) => {
  const { name, description, icon } = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Get next sort_order
    const maxOrder = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM faq_categories'
    ).first<any>();
    const sortOrder = (maxOrder?.max_order || 0) + 1;

    const id = crypto.randomUUID().replace(/-/g, '').toLowerCase();

    await db.prepare(`
      INSERT INTO faq_categories (id, name, description, icon, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, description || null, icon || null, sortOrder).run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to create category' }, 500);
  }
});

// ==========================================
// ADMIN: Update a FAQ category
// ==========================================
faqRoutes.put('/categories/:id', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  sort_order: z.number().optional(),
})), async (c) => {
  const categoryId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  try {
    const updates: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.icon !== undefined) { updates.push('icon = ?'); params.push(data.icon); }
    if (data.sort_order !== undefined) { updates.push('sort_order = ?'); params.push(data.sort_order); }

    params.push(categoryId);
    await db.prepare(`UPDATE faq_categories SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update category' }, 500);
  }
});

// ==========================================
// ADMIN: Delete a FAQ category (cascade deletes items)
// ==========================================
faqRoutes.delete('/categories/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const categoryId = c.req.param('id');
  const db = c.env.DB;

  try {
    // Delete items first, then category
    await db.prepare('DELETE FROM faq_items WHERE category_id = ?').bind(categoryId).run();
    await db.prepare('DELETE FROM faq_categories WHERE id = ?').bind(categoryId).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to delete category' }, 500);
  }
});

// ==========================================
// ADMIN: Create a FAQ item
// ==========================================
faqRoutes.post('/categories/:categoryId/items', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})), async (c) => {
  const categoryId = c.req.param('categoryId');
  const { question, answer } = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Verify category exists
    const category = await db.prepare('SELECT id FROM faq_categories WHERE id = ?').bind(categoryId).first();
    if (!category) {
      return c.json({ success: false, error: 'Category not found' }, 404);
    }

    // Get next sort_order within this category
    const maxOrder = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM faq_items WHERE category_id = ?'
    ).bind(categoryId).first<any>();
    const sortOrder = (maxOrder?.max_order || 0) + 1;

    const id = crypto.randomUUID().replace(/-/g, '').toLowerCase();

    await db.prepare(`
      INSERT INTO faq_items (id, category_id, question, answer, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, categoryId, question, answer, sortOrder).run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to create FAQ item' }, 500);
  }
});

// ==========================================
// ADMIN: Update a FAQ item
// ==========================================
faqRoutes.put('/items/:id', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  sort_order: z.number().optional(),
  category_id: z.string().optional(),
})), async (c) => {
  const itemId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  try {
    const updates: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    if (data.question !== undefined) { updates.push('question = ?'); params.push(data.question); }
    if (data.answer !== undefined) { updates.push('answer = ?'); params.push(data.answer); }
    if (data.sort_order !== undefined) { updates.push('sort_order = ?'); params.push(data.sort_order); }
    if (data.category_id !== undefined) { updates.push('category_id = ?'); params.push(data.category_id); }

    params.push(itemId);
    await db.prepare(`UPDATE faq_items SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to update FAQ item' }, 500);
  }
});

// ==========================================
// ADMIN: Delete a FAQ item
// ==========================================
faqRoutes.delete('/items/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const itemId = c.req.param('id');
  const db = c.env.DB;

  try {
    await db.prepare('DELETE FROM faq_items WHERE id = ?').bind(itemId).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to delete FAQ item' }, 500);
  }
});

// ==========================================
// ADMIN: Reorder categories or items
// ==========================================
faqRoutes.put('/reorder', authMiddleware, requireRole('admin', 'director'), zValidator('json', z.object({
  type: z.enum(['categories', 'items']),
  ids: z.array(z.string()).min(1),
})), async (c) => {
  const { type, ids } = c.req.valid('json');
  const db = c.env.DB;

  try {
    const table = type === 'categories' ? 'faq_categories' : 'faq_items';

    for (let i = 0; i < ids.length; i++) {
      await db.prepare(
        `UPDATE ${table} SET sort_order = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(i + 1, ids[i]).run();
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to reorder' }, 500);
  }
});
