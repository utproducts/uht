import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const contactRoutes = new Hono<{ Bindings: Env }>();

// List contacts with filtering
contactRoutes.get('/', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { search, tag, source, page = '1', per_page = '50' } = c.req.query();

  let query = 'SELECT * FROM contacts WHERE 1=1';
  const params: string[] = [];

  if (search) {
    query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (tag) {
    query += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }
  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }

  const countQ = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = (await db.prepare(countQ).bind(...params).first<{ total: number }>())?.total || 0;

  const pageNum = parseInt(page);
  const perPage = parseInt(per_page);
  query += ' ORDER BY last_name ASC, first_name ASC LIMIT ? OFFSET ?';
  params.push(perPage.toString(), ((pageNum - 1) * perPage).toString());

  const result = await db.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
    pagination: { page: pageNum, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

// Create/import contacts
const createContactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  organizationName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

contactRoutes.post('/', authMiddleware, requireRole('admin'), zValidator('json', createContactSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO contacts (id, email, phone, first_name, last_name, organization_name, city, state, source, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.email || null, data.phone || null, data.firstName || null, data.lastName || null,
    data.organizationName || null, data.city || null, data.state || null,
    data.source || 'manual', JSON.stringify(data.tags || [])
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// Bulk import contacts (from CSV)
contactRoutes.post('/import', authMiddleware, requireRole('admin'), async (c) => {
  const body = await c.req.json();
  const contacts = body.contacts as any[];
  const db = c.env.DB;

  let imported = 0;
  let skipped = 0;

  for (const contact of contacts) {
    try {
      // Skip if email already exists
      if (contact.email) {
        const existing = await db.prepare('SELECT id FROM contacts WHERE email = ?').bind(contact.email.toLowerCase()).first();
        if (existing) { skipped++; continue; }
      }

      const id = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO contacts (id, email, phone, first_name, last_name, organization_name, city, state, source, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', '[]')
      `).bind(id, contact.email?.toLowerCase() || null, contact.phone || null,
        contact.firstName || contact.first_name || null,
        contact.lastName || contact.last_name || null,
        contact.organization || null, contact.city || null, contact.state || null
      ).run();
      imported++;
    } catch { skipped++; }
  }

  return c.json({ success: true, data: { imported, skipped, total: contacts.length } });
});

// Get contact lists (saved filters)
contactRoutes.get('/lists', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM contact_lists ORDER BY name ASC').all();
  return c.json({ success: true, data: result.results });
});
