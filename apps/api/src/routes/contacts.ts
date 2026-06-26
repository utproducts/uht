import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const contactRoutes = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────
// STATS — counts per source
// ──────────────────────────────────────
contactRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const [contactsRes, icontactsRes, usersRes, legacyRes] = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM contacts').first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) as cnt FROM email_list_contacts WHERE is_active = 1').first<{ cnt: number }>(),
    db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_active = 1').first<{ cnt: number }>(),
    db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE source = 'legacy_team'").first<{ cnt: number }>(),
  ]);
  // Source breakdown of contacts table
  const sourceBreakdown = await db.prepare(
    "SELECT COALESCE(source, 'unknown') as source, COUNT(*) as cnt FROM contacts GROUP BY source ORDER BY cnt DESC"
  ).all();

  return c.json({
    success: true,
    data: {
      contacts: contactsRes?.cnt || 0,
      icontacts: icontactsRes?.cnt || 0,
      users: usersRes?.cnt || 0,
      legacy_team: legacyRes?.cnt || 0,
      sources: sourceBreakdown.results,
    },
  });
});

// ──────────────────────────────────────
// UNIFIED LIST — combines contacts, iContacts, users
// ──────────────────────────────────────
contactRoutes.get('/all', async (c) => {
  const db = c.env.DB;
  const { search, source, page = '1', per_page = '50', state } = c.req.query();
  const pageNum = parseInt(page);
  const perPage = parseInt(per_page);
  const offset = (pageNum - 1) * perPage;

  // Build a UNION query across all three sources
  // We normalize each source into: email, first_name, last_name, phone, source_type, city, state, created_at
  const searchFilter = search ? `AND (email LIKE '%${search.replace(/'/g, "''")}%' OR first_name LIKE '%${search.replace(/'/g, "''")}%' OR last_name LIKE '%${search.replace(/'/g, "''")}%')` : '';
  const stateFilter = state ? `AND state = '${state.replace(/'/g, "''")}'` : '';

  let sourceFilter = '';
  if (source === 'legacy_team') sourceFilter = "AND source_type = 'Past Contact'";
  else if (source === 'icontact') sourceFilter = "AND source_type = 'iContact'";
  else if (source === 'registered') sourceFilter = "AND source_type = 'Registered User'";
  else if (source === 'manual') sourceFilter = "AND source_type = 'Manual'";

  const unionQuery = `
    SELECT * FROM (
      SELECT email, first_name, last_name, phone,
        CASE WHEN source = 'legacy_team' THEN 'Past Contact'
             WHEN source = 'import' THEN 'Manual'
             ELSE COALESCE(source, 'Manual') END as source_type,
        city, state, organization_name as org, created_at
      FROM contacts
      WHERE email IS NOT NULL ${searchFilter} ${stateFilter}

      UNION ALL

      SELECT email, first_name, last_name, NULL as phone,
        'iContact' as source_type,
        NULL as city, NULL as state, NULL as org, created_at
      FROM email_list_contacts
      WHERE is_active = 1 AND email NOT IN (SELECT email FROM contacts WHERE email IS NOT NULL)
        AND email NOT IN (SELECT email FROM users WHERE email IS NOT NULL)
        ${searchFilter}

      UNION ALL

      SELECT email, first_name, last_name, phone,
        'Registered User' as source_type,
        NULL as city, NULL as state, NULL as org, created_at
      FROM users
      WHERE is_active = 1
        AND email NOT IN (SELECT email FROM contacts WHERE email IS NOT NULL)
        ${searchFilter}
    ) combined
    WHERE 1=1 ${sourceFilter}
    ORDER BY
      CASE source_type
        WHEN 'Registered User' THEN 1
        WHEN 'Past Contact' THEN 2
        WHEN 'iContact' THEN 3
        ELSE 4
      END,
      last_name ASC, first_name ASC
    LIMIT ${perPage} OFFSET ${offset}
  `;

  const countQuery = `
    SELECT COUNT(*) as total FROM (
      SELECT email FROM contacts WHERE email IS NOT NULL ${searchFilter} ${stateFilter}
      ${source === 'icontact' ? '' : source === 'registered' ? '' : ''}
      UNION ALL
      SELECT email FROM email_list_contacts
      WHERE is_active = 1 AND email NOT IN (SELECT email FROM contacts WHERE email IS NOT NULL)
        AND email NOT IN (SELECT email FROM users WHERE email IS NOT NULL) ${searchFilter}
      UNION ALL
      SELECT email FROM users
      WHERE is_active = 1 AND email NOT IN (SELECT email FROM contacts WHERE email IS NOT NULL) ${searchFilter}
    ) combined
  `;

  try {
    const [results, countRes] = await Promise.all([
      db.prepare(unionQuery).all(),
      db.prepare(countQuery).first<{ total: number }>(),
    ]);
    const total = countRes?.total || 0;

    return c.json({
      success: true,
      data: results.results,
      pagination: { page: pageNum, perPage, total, totalPages: Math.ceil(total / perPage) },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ──────────────────────────────────────
// LIST — contacts table only (with filtering)
// ──────────────────────────────────────
contactRoutes.get('/', async (c) => {
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

// ──────────────────────────────────────
// CREATE single contact
// ──────────────────────────────────────
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

// ──────────────────────────────────────
// BULK IMPORT contacts (from CSV)
// ──────────────────────────────────────
contactRoutes.post('/import', authMiddleware, requireRole('admin'), async (c) => {
  const body = await c.req.json();
  const contacts = body.contacts as any[];
  const db = c.env.DB;

  let imported = 0;
  let skipped = 0;

  for (const contact of contacts) {
    try {
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

// ──────────────────────────────────────
// MIGRATE LEGACY TEAM CONTACTS
// One-time migration: extracts unique contacts from old teams (created_by IS NULL)
// ──────────────────────────────────────
contactRoutes.post('/migrate-legacy', async (c) => {
  const db = c.env.DB;

  // Get all unique coach emails from legacy teams
  const coaches = await db.prepare(`
    SELECT DISTINCT head_coach_email as email, head_coach_name as name, head_coach_phone as phone,
      city, state, name as team_name, season, contact_type
    FROM teams
    WHERE created_by IS NULL AND head_coach_email IS NOT NULL AND head_coach_email != ''
  `).all();

  // Get manager contacts too
  const managers = await db.prepare(`
    SELECT DISTINCT manager_email as email, manager_name as name, manager_phone as phone,
      city, state, name as team_name, season
    FROM teams
    WHERE created_by IS NULL AND manager_email IS NOT NULL AND manager_email != ''
  `).all();

  let imported = 0;
  let skipped = 0;
  const seenEmails = new Set<string>();

  for (const c2 of [...(coaches.results || []), ...(managers.results || [])]) {
    const contact = c2 as any;
    const email = contact.email?.toLowerCase().trim();
    if (!email || seenEmails.has(email)) { skipped++; continue; }
    seenEmails.add(email);

    // Skip if already in contacts table
    const existing = await db.prepare('SELECT id FROM contacts WHERE email = ?').bind(email).first();
    if (existing) { skipped++; continue; }

    const id = crypto.randomUUID().replace(/-/g, '');
    // Parse name into first/last
    const nameParts = (contact.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || null;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    try {
      await db.prepare(`
        INSERT INTO contacts (id, email, phone, first_name, last_name, organization_name, city, state, source, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'legacy_team', '[]')
      `).bind(id, email, contact.phone || null, firstName, lastName,
        contact.team_name || null, contact.city || null, contact.state || null
      ).run();
      imported++;
    } catch { skipped++; }
  }

  return c.json({ success: true, data: { imported, skipped, total: seenEmails.size } });
});

// ──────────────────────────────────────
// EXPORT CSV — all contacts across sources
// ──────────────────────────────────────
contactRoutes.get('/export/csv', async (c) => {
  const db = c.env.DB;
  const { source } = c.req.query();

  let rows: any[] = [];

  if (!source || source === 'all' || source === 'legacy_team' || source === 'manual') {
    const sourceFilter = source && source !== 'all' ? `AND source = '${source}'` : '';
    const r = await db.prepare(`SELECT email, first_name, last_name, phone, source, city, state, organization_name, created_at FROM contacts WHERE email IS NOT NULL ${sourceFilter} ORDER BY last_name`).all();
    rows.push(...(r.results || []).map((r: any) => ({ ...r, source_label: r.source === 'legacy_team' ? 'Past Contact' : r.source })));
  }
  if (!source || source === 'all' || source === 'icontact') {
    const r = await db.prepare("SELECT email, first_name, last_name, NULL as phone, 'iContact' as source, NULL as city, NULL as state, NULL as organization_name, created_at FROM email_list_contacts WHERE is_active = 1 ORDER BY last_name").all();
    rows.push(...(r.results || []).map((r: any) => ({ ...r, source_label: 'iContact' })));
  }
  if (!source || source === 'all' || source === 'registered') {
    const r = await db.prepare("SELECT email, first_name, last_name, phone, 'Registered' as source, NULL as city, NULL as state, NULL as organization_name, created_at FROM users WHERE is_active = 1 ORDER BY last_name").all();
    rows.push(...(r.results || []).map((r: any) => ({ ...r, source_label: 'Registered User' })));
  }

  const header = 'Email,First Name,Last Name,Phone,Source,City,State,Organization,Date Added\n';
  const csv = rows.map((r: any) =>
    `"${r.email || ''}","${r.first_name || ''}","${r.last_name || ''}","${r.phone || ''}","${r.source_label || r.source || ''}","${r.city || ''}","${r.state || ''}","${r.organization_name || ''}","${r.created_at || ''}"`
  ).join('\n');

  return new Response(header + csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="contacts-export.csv"',
    },
  });
});

// ──────────────────────────────────────
// GET contact lists (saved filters)
// ──────────────────────────────────────
contactRoutes.get('/lists', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM contact_lists ORDER BY name ASC').all();
  return c.json({ success: true, data: result.results });
});
