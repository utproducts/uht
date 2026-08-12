import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const organizationRoutes = new Hono<{ Bindings: Env }>();

// A user can administer an org if they're the legacy owner_id OR have an
// organization_admins row (multi-owner support, populated via owner invites).
async function isOrgAdmin(db: D1Database, orgId: string, userId: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT 1 FROM organizations o
    WHERE o.id = ? AND (o.owner_id = ? OR EXISTS (
      SELECT 1 FROM organization_admins oa WHERE oa.organization_id = o.id AND oa.user_id = ?
    ))
  `).bind(orgId, userId, userId).first();
  return !!row;
}

// ==================
// Dashboard — comprehensive stats for org owner
// ==================
organizationRoutes.get('/dashboard', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  // Get org(s) owned by user (legacy owner_id or invited org admin)
  const orgs = await db.prepare(`
    SELECT DISTINCT o.* FROM organizations o
    LEFT JOIN organization_admins oa ON oa.organization_id = o.id AND oa.user_id = ?
    WHERE (o.owner_id = ? OR oa.user_id IS NOT NULL) AND o.is_active = 1
  `).bind(user.id, user.id).all();

  if (!orgs.results.length) {
    return c.json({ success: true, data: { org: null, stats: null } });
  }

  const org = orgs.results[0] as any;
  const orgId = org.id;

  // Aggregate stats in parallel
  const [teamCount, playerCount, coachCount, managerCount, eventCount, balanceDue] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM teams WHERE organization_id = ? AND is_active = 1').bind(orgId).first<{ c: number }>(),
    db.prepare(`
      SELECT COUNT(DISTINCT tp.player_id) as c FROM team_players tp
      JOIN teams t ON t.id = tp.team_id WHERE t.organization_id = ? AND t.is_active = 1 AND tp.status = 'active'
    `).bind(orgId).first<{ c: number }>(),
    db.prepare(`
      SELECT COUNT(DISTINCT tc.user_id) as c FROM team_coaches tc
      JOIN teams t ON t.id = tc.team_id WHERE t.organization_id = ? AND t.is_active = 1
    `).bind(orgId).first<{ c: number }>(),
    db.prepare(`
      SELECT COUNT(DISTINCT tm.user_id) as c FROM team_managers tm
      JOIN teams t ON t.id = tm.team_id WHERE t.organization_id = ? AND t.is_active = 1
    `).bind(orgId).first<{ c: number }>(),
    db.prepare(`
      SELECT COUNT(DISTINCT r.event_id) as c FROM registrations r
      JOIN teams t ON t.id = r.team_id WHERE t.organization_id = ? AND t.is_active = 1 AND r.status != 'cancelled'
    `).bind(orgId).first<{ c: number }>(),
    db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN r.payment_status != 'paid' THEN COALESCE(ed.price, 0) ELSE 0 END), 0) as c
      FROM registrations r
      JOIN teams t ON t.id = r.team_id
      LEFT JOIN event_divisions ed ON ed.event_id = r.event_id AND ed.id = r.division_id
      WHERE t.organization_id = ? AND t.is_active = 1 AND r.status != 'cancelled'
    `).bind(orgId).first<{ c: number }>(),
  ]);

  // Recent registrations (last 5)
  const recentRegs = await db.prepare(`
    SELECT r.id, r.status, r.payment_status, r.created_at,
      t.name as team_name, t.age_group,
      e.name as event_name, e.start_date, e.end_date
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN events e ON e.id = r.event_id
    WHERE t.organization_id = ? AND t.is_active = 1
    ORDER BY r.created_at DESC LIMIT 5
  `).bind(orgId).all();

  return c.json({
    success: true,
    data: {
      org,
      stats: {
        teams: teamCount?.c || 0,
        players: playerCount?.c || 0,
        coaches: coachCount?.c || 0,
        managers: managerCount?.c || 0,
        events: eventCount?.c || 0,
        balanceDueCents: balanceDue?.c || 0,
      },
      recentRegistrations: recentRegs.results,
    },
  });
});

// ==================
// Get current user's organization(s)
// ==================
organizationRoutes.get('/mine', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT DISTINCT o.*,
      (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id AND t.is_active = 1) as team_count
    FROM organizations o
    LEFT JOIN organization_admins oa ON oa.organization_id = o.id AND oa.user_id = ?
    WHERE (o.owner_id = ? OR oa.user_id IS NOT NULL) AND o.is_active = 1
  `).bind(user.id, user.id).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// Public: Search organizations by name (with optional state filter)
// Must be before /:id routes to avoid parameter matching
// ==================
// State code to full name mapping for flexible matching
const STATE_MAP: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  // Canadian provinces/territories
  AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',
  NL:'Newfoundland and Labrador',NS:'Nova Scotia',NT:'Northwest Territories',
  NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',
  SK:'Saskatchewan',YT:'Yukon',
};

organizationRoutes.get('/search', async (c) => {
  const db = c.env.DB;
  const q = c.req.query('q') || '';
  const state = c.req.query('state') || '';

  if (q.length < 2 && !state) {
    return c.json({ success: true, data: [] });
  }

  // Resolve state: if a 2-letter code is passed, also match full name (and vice-versa)
  const stateUpper = state.toUpperCase();
  const stateFull = STATE_MAP[stateUpper] || '';
  // stateValues: all forms to match against (code, full name)
  const stateValues = [state];
  if (stateFull) stateValues.push(stateFull);
  // Also handle if someone passes full name — reverse lookup
  if (!stateFull && state.length > 2) {
    const code = Object.entries(STATE_MAP).find(([, v]) => v.toLowerCase() === state.toLowerCase())?.[0];
    if (code) stateValues.push(code);
  }

  let sql = '';
  const params: string[] = [];

  if (q && state) {
    // Search by name + state (match any form of the state)
    const statePlaceholders = stateValues.map(() => 'LOWER(state) = LOWER(?)').join(' OR ');
    sql = `
      SELECT id, name, city, state, logo_url
      FROM organizations
      WHERE is_active = 1
        AND LOWER(name) LIKE LOWER(?)
        AND (${statePlaceholders} OR state IS NULL OR state = '')
      ORDER BY
        CASE WHEN (${statePlaceholders}) THEN 0 ELSE 1 END,
        CASE WHEN LOWER(name) = LOWER(?) THEN 0
             WHEN LOWER(name) LIKE LOWER(?) THEN 1
             ELSE 2 END,
        name ASC
      LIMIT 25
    `;
    params.push(`%${q}%`, ...stateValues, ...stateValues, q, `${q}%`);
  } else if (q) {
    sql = `
      SELECT id, name, city, state, logo_url
      FROM organizations
      WHERE is_active = 1 AND LOWER(name) LIKE LOWER(?)
      ORDER BY
        CASE WHEN LOWER(name) = LOWER(?) THEN 0
             WHEN LOWER(name) LIKE LOWER(?) THEN 1
             ELSE 2 END,
        name ASC
      LIMIT 25
    `;
    params.push(`%${q}%`, q, `${q}%`);
  } else if (state) {
    // Match any form of the state value (code or full name)
    const statePlaceholders = stateValues.map(() => 'LOWER(state) = LOWER(?)').join(' OR ');
    sql = `
      SELECT id, name, city, state, logo_url
      FROM organizations
      WHERE is_active = 1 AND (${statePlaceholders})
      ORDER BY name ASC
      LIMIT 500
    `;
    params.push(...stateValues);
  }

  const results = await db.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: results.results });
});

// ==================
// Quick-create organization (any authenticated user — used during team creation)
// Only requires name + state. Checks for duplicates first.
// ==================
organizationRoutes.post('/quick-create', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const body = await c.req.json<{ name: string; city?: string; state?: string }>();

  if (!body.name || body.name.trim().length < 2) {
    return c.json({ error: 'Organization name is required (min 2 characters)' }, 400);
  }

  const trimmedName = body.name.trim();

  // Check for duplicate (case-insensitive)
  const existing = await db.prepare(
    `SELECT id, name, city, state FROM organizations WHERE LOWER(TRIM(name)) = LOWER(?) AND is_active = 1`
  ).bind(trimmedName).first<{ id: string; name: string; city: string; state: string }>();

  if (existing) {
    return c.json({ success: true, data: existing, existed: true });
  }

  // Create new org
  const orgId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO organizations (id, name, city, state, owner_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).bind(orgId, trimmedName, body.city || null, body.state || null, 'system_migration_user').run();
  // NOTE: quick-create is for labeling teams with an org — it deliberately does NOT
  // grant the creator ownership. Real ownership goes through org requests/admin.

  return c.json({ success: true, data: { id: orgId, name: trimmedName, city: body.city || null, state: body.state || null }, existed: false }, 201);
});

// ==================
// Admin: List ALL organizations (ordered by state, name) with team counts
// ==================
organizationRoutes.get('/admin/list', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id AND t.is_active = 1) as team_count,
      u.email as owner_email,
      TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) as owner_name
    FROM organizations o
    LEFT JOIN users u ON u.id = o.owner_id AND o.owner_id NOT IN ('chad-owner-001', 'system_migration_user')
    WHERE o.is_active = 1
    ORDER BY o.state ASC, o.name ASC
  `).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// Admin: Assign/reassign the owner of an organization by user email
// ==================
organizationRoutes.put('/admin/:id/owner', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const orgId = c.req.param('id');
  const body = await c.req.json<{ email: string }>().catch(() => ({ email: '' }));

  if (!body.email || !body.email.trim()) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const org = await db.prepare('SELECT id, name FROM organizations WHERE id = ?').bind(orgId).first<any>();
  if (!org) return c.json({ error: 'Organization not found' }, 404);

  const newOwner = await db.prepare('SELECT id, email, first_name, last_name FROM users WHERE LOWER(email) = LOWER(?)')
    .bind(body.email.trim()).first<any>();
  if (!newOwner) return c.json({ error: 'No UHT account found with that email. They need to sign up first.' }, 404);

  await db.prepare(`UPDATE organizations SET owner_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(newOwner.id, orgId).run();
  await db.prepare(`
    INSERT OR IGNORE INTO organization_admins (organization_id, user_id, created_at)
    VALUES (?, ?, datetime('now'))
  `).bind(orgId, newOwner.id).run().catch((err: any) => console.error('org_admins insert failed (non-fatal):', err?.message));
  await db.prepare(`
    INSERT OR IGNORE INTO user_roles (user_id, role, created_at)
    VALUES (?, 'organization', datetime('now'))
  `).bind(newOwner.id).run().catch((err: any) => console.error('user_roles insert failed (non-fatal):', err?.message));

  return c.json({
    success: true,
    data: {
      owner_email: newOwner.email,
      owner_name: [newOwner.first_name, newOwner.last_name].filter(Boolean).join(' '),
    },
  });
});

// ==================
// Admin: Bulk-import organizations (skip duplicates)
// ==================
organizationRoutes.post('/admin/bulk-import', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  try {
    const body = await c.req.json<{ organizations: { name: string; state: string }[] }>();

    if (!body.organizations || !Array.isArray(body.organizations)) {
      return c.json({ error: 'organizations array is required' }, 400);
    }

    let imported = 0;
    const skippedNames: string[] = [];

    for (const org of body.organizations) {
      const trimmedName = (org.name || '').trim();
      if (!trimmedName) continue;

      const trimmedState = (org.state || '').trim();

      // Check for existing org with same name (case-insensitive)
      const existing = await db.prepare(
        `SELECT id FROM organizations WHERE LOWER(TRIM(name)) = LOWER(?) AND is_active = 1`
      ).bind(trimmedName).first();

      if (existing) {
        skippedNames.push(trimmedName);
        continue;
      }

      const orgId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO organizations (id, name, state, owner_id, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 'system_migration_user', 1, datetime('now'), datetime('now'))
      `).bind(orgId, trimmedName, trimmedState || null).run();

      imported++;
    }

    return c.json({
      success: true,
      imported,
      skipped: skippedNames.length,
      skippedNames,
    });
  } catch (err: any) {
    console.error('Bulk import error:', err);
    return c.json({ error: 'Import failed', details: err?.message || String(err) }, 500);
  }
});

// ==================
// Admin: Run migration to create organization_requests table
// ==================
organizationRoutes.post('/admin/migrate-requests', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS organization_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      requested_by_email TEXT NOT NULL,
      requested_by_name TEXT,
      requested_by_user_id TEXT,
      status TEXT DEFAULT 'pending',
      admin_notes TEXT,
      created_org_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by TEXT
    )
  `).run();

  return c.json({ success: true, message: 'organization_requests table created' });
});

// ==================
// Public: Request a new organization be created (for fall coaches)
// ==================
// The signed-in user's latest organization request (org dashboard pending state)
organizationRoutes.get('/requests/mine', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  try {
    const row = await db.prepare(`
      SELECT id, name, city, state, status, created_at, created_org_id
      FROM organization_requests
      WHERE requested_by_user_id = ? OR requested_by_email = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(user.id, (user.email || '').toLowerCase()).first();
    return c.json({ success: true, data: row || null });
  } catch {
    return c.json({ success: true, data: null });
  }
});

// ==================
// Public: check whether a requested org name matches an existing organization
// Used by the request form to warn before submitting a duplicate.
// ==================
organizationRoutes.get('/requests/check', async (c) => {
  const db = c.env.DB;
  const name = (c.req.query('name') || '').trim();
  const state = (c.req.query('state') || '').trim();
  if (name.length < 3) return c.json({ success: true, data: [] });

  const matches = await db.prepare(`
    SELECT o.id, o.name, o.city, o.state,
      (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id AND t.is_active = 1) as team_count,
      EXISTS(SELECT 1 FROM organization_admins oa WHERE oa.organization_id = o.id) as has_owner
    FROM organizations o
    WHERE o.is_active = 1 AND (
      LOWER(o.name) = LOWER(?) OR LOWER(o.name) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(o.name) || '%'
    )
    ORDER BY
      CASE WHEN LOWER(o.name) = LOWER(?) THEN 0 ELSE 1 END,
      CASE WHEN ? != '' AND LOWER(o.state) = LOWER(?) THEN 0 ELSE 1 END,
      o.name ASC
    LIMIT 5
  `).bind(name, `%${name}%`, name, name, state, state).all();

  return c.json({ success: true, data: matches.results });
});

organizationRoutes.post('/requests', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    name: string;
    city?: string;
    state?: string;
    requestedByEmail: string;
    requestedByName?: string;
    requestedByUserId?: string;
    matchedOrgId?: string;
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: 'Organization name is required' }, 400);
  }
  if (!body.requestedByEmail || !body.requestedByEmail.trim()) {
    return c.json({ error: 'Email is required' }, 400);
  }

  // Auto-create table if it doesn't exist
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS organization_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      requested_by_email TEXT NOT NULL,
      requested_by_name TEXT,
      requested_by_user_id TEXT,
      status TEXT DEFAULT 'pending',
      admin_notes TEXT,
      created_org_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewed_by TEXT
    )
  `).run();

  const id = crypto.randomUUID().replace(/-/g, '');

  // Record any existing-org match so the admin can approve-and-merge instead
  // of creating a duplicate. Use the client-confirmed match if given,
  // otherwise auto-detect an exact (case-insensitive) name match.
  let matchedOrgId: string | null = null;
  try {
    if (body.matchedOrgId) {
      const m = await db.prepare('SELECT id FROM organizations WHERE id = ? AND is_active = 1').bind(body.matchedOrgId).first<{ id: string }>();
      if (m) matchedOrgId = m.id;
    }
    if (!matchedOrgId) {
      const m = await db.prepare('SELECT id FROM organizations WHERE LOWER(name) = LOWER(?) AND is_active = 1 LIMIT 1').bind(body.name.trim()).first<{ id: string }>();
      if (m) matchedOrgId = m.id;
    }
  } catch {}

  await db.prepare(`
    INSERT INTO organization_requests (id, name, city, state, requested_by_email, requested_by_name, requested_by_user_id, status, matched_org_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(
    id,
    body.name.trim(),
    body.city || null,
    body.state || null,
    body.requestedByEmail.trim().toLowerCase(),
    body.requestedByName || null,
    body.requestedByUserId || null,
    matchedOrgId
  ).run();

  return c.json({ success: true, id, matchedOrgId }, 201);
});

// ==================
// Admin: List all organization requests
// ==================
organizationRoutes.get('/admin/requests', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  // Auto-create table if it doesn't exist
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS organization_requests (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT, state TEXT,
        requested_by_email TEXT NOT NULL, requested_by_name TEXT, requested_by_user_id TEXT,
        status TEXT DEFAULT 'pending', admin_notes TEXT, created_org_id TEXT,
        created_at TEXT DEFAULT (datetime('now')), reviewed_at TEXT, reviewed_by TEXT
      )
    `).run();
  } catch (_) {}

  const result = await db.prepare(`
    SELECT * FROM organization_requests ORDER BY created_at DESC
  `).all();

  // Attach existing-org match info: stored matched_org_id first, otherwise a
  // live exact-name match (covers requests submitted before matching existed).
  const requests = (result.results || []) as any[];
  for (const req of requests) {
    req.matched_org = null;
    if (req.status !== 'pending') continue;
    try {
      let match: any = null;
      if (req.matched_org_id) {
        match = await db.prepare(`
          SELECT o.id, o.name, o.city, o.state,
            (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id AND t.is_active = 1) as team_count
          FROM organizations o WHERE o.id = ? AND o.is_active = 1
        `).bind(req.matched_org_id).first();
      }
      if (!match) {
        match = await db.prepare(`
          SELECT o.id, o.name, o.city, o.state,
            (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id AND t.is_active = 1) as team_count
          FROM organizations o WHERE LOWER(o.name) = LOWER(?) AND o.is_active = 1 LIMIT 1
        `).bind(req.name).first();
      }
      if (match) req.matched_org = match;
    } catch {}
  }

  return c.json({ success: true, data: requests });
});

// ==================
// Admin: Approve an organization request
// ==================
organizationRoutes.post('/admin/requests/:id/approve', authMiddleware, requireRole('admin'), async (c) => {
  try {
  const requestId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json<{ adminNotes?: string; mode?: 'create' | 'merge'; makeOwner?: boolean; mergeOrgId?: string }>().catch(() => ({} as { adminNotes?: string; mode?: 'create' | 'merge'; makeOwner?: boolean; mergeOrgId?: string }));

  // Fetch the request
  const request = await db.prepare(
    'SELECT * FROM organization_requests WHERE id = ?'
  ).bind(requestId).first<any>();

  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }
  if (request.status !== 'pending') {
    return c.json({ error: `Request already ${request.status}` }, 400);
  }

  // ---- MERGE MODE: link the requester to an existing org instead of creating a duplicate ----
  if (body.mode === 'merge') {
    const targetOrgId = body.mergeOrgId || request.matched_org_id;
    if (!targetOrgId) return c.json({ error: 'No existing organization to merge into' }, 400);
    const targetOrg = await db.prepare('SELECT id, name FROM organizations WHERE id = ? AND is_active = 1').bind(targetOrgId).first<{ id: string; name: string }>();
    if (!targetOrg) return c.json({ error: 'Target organization not found' }, 404);

    // Resolve the requester's user account (may not exist yet)
    let requesterUserId: string | null = null;
    if (request.requested_by_user_id) {
      const u = await db.prepare('SELECT id FROM users WHERE id = ?').bind(request.requested_by_user_id).first<any>();
      if (u) requesterUserId = u.id;
    }
    if (!requesterUserId && request.requested_by_email) {
      const u = await db.prepare('SELECT id FROM users WHERE email = ?').bind(request.requested_by_email).first<any>();
      if (u) requesterUserId = u.id;
    }

    if (body.makeOwner) {
      if (requesterUserId) {
        await db.prepare(`
          INSERT OR IGNORE INTO organization_admins (organization_id, user_id, created_at)
          VALUES (?, ?, datetime('now'))
        `).bind(targetOrg.id, requesterUserId).run();
        await db.prepare(`
          INSERT OR IGNORE INTO user_roles (user_id, role, created_at)
          VALUES (?, 'organization', datetime('now'))
        `).bind(requesterUserId).run();
        // Transfer legacy owner_id off placeholder accounts only
        await db.prepare(`
          UPDATE organizations SET owner_id = ?, updated_at = datetime('now')
          WHERE id = ? AND owner_id IN ('chad-owner-001', 'system_migration_user')
        `).bind(requesterUserId, targetOrg.id).run();
      } else {
        // No account yet — pending org invite auto-links ownership at signup
        await db.prepare(`
          INSERT INTO organization_invites (organization_id, email, status, invited_by)
          VALUES (?, ?, 'pending', 'admin_approval')
          ON CONFLICT(organization_id, email) DO UPDATE SET status = 'pending'
        `).bind(targetOrg.id, request.requested_by_email).run();
      }
    }

    await db.prepare(`
      UPDATE organization_requests
      SET status = 'approved', created_org_id = ?, admin_notes = ?, reviewed_at = datetime('now'), reviewed_by = 'admin'
      WHERE id = ?
    `).bind(targetOrg.id, body.adminNotes || (body.makeOwner ? 'Merged into existing org as owner' : 'Merged into existing org'), requestId).run();

    // Notify the requester
    const mergeSiteUrl = (c.env as any).SITE_URL || 'https://ultimatetournaments.com';
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
          to: [request.requested_by_email],
          subject: `${targetOrg.name} is ready on Ultimate Tournaments`,
          html: body.makeOwner
            ? `<p>Good news! <strong>${targetOrg.name}</strong> was already on Ultimate Tournaments, and you've been connected as an organization owner.</p>
               <p>All of the organization's teams are linked to your account.</p>
               <p><a href="${mergeSiteUrl}/dashboard/organization" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Open Your Org Dashboard</a></p>`
            : `<p>Good news! <strong>${targetOrg.name}</strong> is already set up on Ultimate Tournaments.</p>
               <p>You can create your team and select it from the organization list, or join an existing team with an invite code from your coach or manager.</p>
               <p><a href="${mergeSiteUrl}/create-team" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Create Your Team</a></p>`,
        }),
      });
    } catch {}

    return c.json({ success: true, merged: true, orgId: targetOrg.id });
  }

  // ---- CREATE MODE (default): create a brand-new organization ----
  // Determine owner: use requesting user if they have an account, otherwise the approving admin
  const admin = c.get('user') as any;
  let ownerId: string | null = null;

  // Try requesting user first
  if (request.requested_by_user_id) {
    const reqUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(request.requested_by_user_id).first<any>();
    if (reqUser) ownerId = reqUser.id;
  }
  if (!ownerId && request.requested_by_email) {
    const emailUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(request.requested_by_email).first<any>();
    if (emailUser) ownerId = emailUser.id;
  }
  // Try the logged-in admin
  if (!ownerId && admin?.id) {
    const adminUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(admin.id).first<any>();
    if (adminUser) ownerId = adminUser.id;
  }
  // Final fallback: use Chad's known-good ID
  if (!ownerId) ownerId = 'chad-owner-001';

  // Create the organization
  const orgId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO organizations (id, name, city, state, owner_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).bind(orgId, request.name, request.city || null, request.state || null, ownerId).run();

  // Grant the requester real ownership (organization_admins) and the org role,
  // but only when the owner is the requester (not the approving admin fallback)
  const ownerIsRequester = ownerId !== 'chad-owner-001' && ownerId !== admin?.id;
  if (ownerIsRequester || (request.requested_by_user_id && ownerId === request.requested_by_user_id)) {
    await db.prepare(`
      INSERT OR IGNORE INTO organization_admins (organization_id, user_id, created_at)
      VALUES (?, ?, datetime('now'))
    `).bind(orgId, ownerId).run().catch((err: any) => console.error('org_admins insert failed (non-fatal):', err?.message));
    await db.prepare(`
      INSERT OR IGNORE INTO user_roles (user_id, role, created_at)
      VALUES (?, 'organization', datetime('now'))
    `).bind(ownerId).run().catch((err: any) => console.error('user_roles insert failed (non-fatal):', err?.message));
  }

  // Update the request
  await db.prepare(`
    UPDATE organization_requests
    SET status = 'approved', created_org_id = ?, admin_notes = ?, reviewed_at = datetime('now'), reviewed_by = 'admin'
    WHERE id = ?
  `).bind(orgId, body.adminNotes || null, requestId).run();

  // Send approval email via Resend
  const siteUrl = (c.env as any).SITE_URL || 'https://ultimatetournaments.com';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.RESEND_API}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
        to: [request.requested_by_email],
        subject: 'Your organization has been approved — create your team now!',
        html: `<p>Great news! Your organization <strong>${request.name}</strong> has been approved on Ultimate Tournaments.</p>
            <p>You can now create your team and register for events.</p>
            <p><a href="${siteUrl}/create-team" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Create Your Team</a></p>
            <p>If you have any questions, reply to this email or contact us at support@ultimatetournaments.com.</p>`,
      }),
    });
  } catch {}

  return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Approve failed', detail: err?.message || String(err) }, 500);
  }
});

// ==================
// Admin: Deny an organization request
// ==================
organizationRoutes.post('/admin/requests/:id/deny', authMiddleware, requireRole('admin'), async (c) => {
  const requestId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));

  const request = await db.prepare(
    'SELECT * FROM organization_requests WHERE id = ?'
  ).bind(requestId).first<any>();

  if (!request) {
    return c.json({ error: 'Request not found' }, 404);
  }
  if (request.status !== 'pending') {
    return c.json({ error: `Request already ${request.status}` }, 400);
  }

  await db.prepare(`
    UPDATE organization_requests
    SET status = 'denied', admin_notes = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).bind(body.reason || null, requestId).run();

  return c.json({ success: true });
});

// ==================
// Get org teams with full detail (coaches, managers, player count, registrations)
// ==================
organizationRoutes.get('/:id/teams-full', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const db = c.env.DB;

  const teams = await db.prepare(`
    SELECT t.*,
      t.invite_code,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.team_id = t.id AND r.status != 'cancelled') as registration_count
    FROM teams t WHERE t.organization_id = ? AND t.is_active = 1
    ORDER BY t.age_group ASC, t.name ASC
  `).bind(orgId).all();

  // Get coaches and managers for each team
  const teamIds = (teams.results as any[]).map(t => t.id);
  const teamsWithStaff = [];

  for (const team of teams.results as any[]) {
    const coaches = await db.prepare(`
      SELECT tc.role as coach_role, u.id as user_id, u.first_name, u.last_name, u.email, u.phone
      FROM team_coaches tc JOIN users u ON u.id = tc.user_id
      WHERE tc.team_id = ?
    `).bind(team.id).all();

    const managers = await db.prepare(`
      SELECT u.id as user_id, u.first_name, u.last_name, u.email, u.phone
      FROM team_managers tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
    `).bind(team.id).all();

    // Get upcoming events for this team
    const upcomingEvents = await db.prepare(`
      SELECT e.name, e.start_date, e.end_date, r.status as reg_status, r.payment_status
      FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.team_id = ? AND r.status != 'cancelled' AND e.end_date >= date('now')
      ORDER BY e.start_date ASC LIMIT 3
    `).bind(team.id).all();

    teamsWithStaff.push({
      ...team,
      coaches: coaches.results,
      managers: managers.results,
      upcomingEvents: upcomingEvents.results,
    });
  }

  return c.json({ success: true, data: teamsWithStaff });
});

// ==================
// Get org events — all events any org team is registered for
// ==================
organizationRoutes.get('/:id/events', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const db = c.env.DB;

  // Registrations for org teams live in BOTH tables: `registrations` (normalized,
  // by team_id) and `event_registrations` (website register flow, by team_id or
  // legacy team_name). Query both, then group by event.
  const [normRegs, formRegs] = await Promise.all([
    db.prepare(`
      SELECT r.id as reg_id, r.status as reg_status, r.payment_status, r.created_at as reg_date,
        t.id as team_id, t.name as team_name, t.age_group,
        ed.age_group as division_age, ed.division_level,
        e.id as event_id, e.name as event_name, e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url, e.status as event_status
      FROM registrations r
      JOIN teams t ON t.id = r.team_id AND t.organization_id = ? AND t.is_active = 1
      JOIN events e ON e.id = r.event_id
      LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
      WHERE r.status NOT IN ('cancelled', 'withdrawn', 'denied', 'rejected')
    `).bind(orgId).all(),
    db.prepare(`
      SELECT er.id as reg_id, er.status as reg_status, er.payment_status, er.created_at as reg_date,
        t.id as team_id, t.name as team_name, t.age_group,
        ed.age_group as division_age, ed.division_level,
        e.id as event_id, e.name as event_name, e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url, e.status as event_status
      FROM event_registrations er
      JOIN teams t ON (er.team_id = t.id OR (er.team_id IS NULL AND er.team_name = t.name))
        AND t.organization_id = ? AND t.is_active = 1
      JOIN events e ON e.id = er.event_id
      LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
      WHERE er.status NOT IN ('cancelled', 'withdrawn', 'denied', 'rejected')
    `).bind(orgId).all(),
  ]);

  // Merge, de-duplicating by registration id
  const seen = new Set<string>();
  const allRegs: any[] = [];
  for (const r of [...(normRegs.results as any[]), ...(formRegs.results as any[])]) {
    if (seen.has(r.reg_id)) continue;
    seen.add(r.reg_id);
    allRegs.push(r);
  }

  // Group by event
  const byEvent = new Map<string, any>();
  for (const r of allRegs) {
    let evt = byEvent.get(r.event_id);
    if (!evt) {
      evt = {
        id: r.event_id, name: r.event_name, slug: r.slug, city: r.city, state: r.state,
        start_date: r.start_date, end_date: r.end_date, logo_url: r.logo_url, status: r.event_status,
        teams_registered: 0, teams_paid: 0, teams_approved: 0, team_names: '', teamRegistrations: [],
      };
      byEvent.set(r.event_id, evt);
    }
    evt.teamRegistrations.push({
      reg_id: r.reg_id, team_id: r.team_id, team_name: r.team_name, age_group: r.age_group,
      reg_status: r.reg_status, payment_status: r.payment_status, reg_date: r.reg_date,
      division_age: r.division_age, division_level: r.division_level,
    });
    evt.teams_registered += 1;
    if (r.payment_status === 'paid') evt.teams_paid += 1;
    if (r.reg_status === 'approved') evt.teams_approved += 1;
    evt.team_names = evt.team_names ? `${evt.team_names},${r.team_name}` : r.team_name;
  }

  const eventsWithTeams = Array.from(byEvent.values())
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));

  return c.json({ success: true, data: eventsWithTeams });
});

// ==================
// Get all staff (coaches + managers) across org teams
// ==================
organizationRoutes.get('/:id/staff', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const db = c.env.DB;

  const coaches = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
      tc.role as coach_role, t.id as team_id, t.name as team_name, t.age_group,
      'coach' as staff_type
    FROM team_coaches tc
    JOIN users u ON u.id = tc.user_id
    JOIN teams t ON t.id = tc.team_id AND t.organization_id = ? AND t.is_active = 1
    ORDER BY u.last_name ASC
  `).bind(orgId).all();

  const managers = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
      t.id as team_id, t.name as team_name, t.age_group,
      'manager' as staff_type
    FROM team_managers tm
    JOIN users u ON u.id = tm.user_id
    JOIN teams t ON t.id = tm.team_id AND t.organization_id = ? AND t.is_active = 1
    ORDER BY u.last_name ASC
  `).bind(orgId).all();

  // Group by person
  const staffMap = new Map<string, any>();
  for (const c of coaches.results as any[]) {
    if (!staffMap.has(c.id)) {
      staffMap.set(c.id, { id: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, teams: [] });
    }
    staffMap.get(c.id).teams.push({ teamId: c.team_id, teamName: c.team_name, ageGroup: c.age_group, role: `${c.coach_role} coach` });
  }
  for (const m of managers.results as any[]) {
    if (!staffMap.has(m.id)) {
      staffMap.set(m.id, { id: m.id, firstName: m.first_name, lastName: m.last_name, email: m.email, phone: m.phone, teams: [] });
    }
    staffMap.get(m.id).teams.push({ teamId: m.team_id, teamName: m.team_name, ageGroup: m.age_group, role: 'manager' });
  }

  return c.json({ success: true, data: Array.from(staffMap.values()) });
});

// ==================
// Get all players across org teams
// ==================
organizationRoutes.get('/:id/rosters', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const db = c.env.DB;

  const players = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.usa_hockey_number,
      p.jersey_number, p.position, p.shoots,
      t.id as team_id, t.name as team_name, t.age_group
    FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    JOIN teams t ON t.id = tp.team_id AND t.organization_id = ? AND t.is_active = 1
    WHERE tp.status = 'active'
    ORDER BY t.age_group ASC, t.name ASC, p.last_name ASC
  `).bind(orgId).all();

  return c.json({ success: true, data: players.results });
});

// ==================
// Create team under org (uses same fields as main team creation)
// ==================
const createOrgTeamSchema = z.object({
  name: z.string().min(1),
  ageGroup: z.string(),
  divisionLevel: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  headCoachEmail: z.string().email().optional(),
  headCoachName: z.string().optional(),
  managerEmail: z.string().email().optional(),
  managerName: z.string().optional(),
});

organizationRoutes.post('/:id/teams', authMiddleware, zValidator('json', createOrgTeamSchema), async (c) => {
  const orgId = c.req.param('id');
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  // Verify org ownership
  if (!(await isOrgAdmin(db, orgId, user.id))) return c.json({ success: false, error: 'Organization not found or access denied' }, 403);

  const teamId = crypto.randomUUID().replace(/-/g, '');

  // Generate invite codes — separate codes for coaches (invite_code) and parents (parent_invite_code)
  const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';
  const randBytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) inviteCode += codeChars[randBytes[i] % codeChars.length];
  let parentInviteCode = '';
  const parentRandBytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) parentInviteCode += codeChars[parentRandBytes[i] % codeChars.length];

  await db.prepare(`
    INSERT INTO teams (id, organization_id, name, age_group, division_level, city, state,
      head_coach_name, head_coach_email, manager_name, manager_email, created_by, invite_code, parent_invite_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    teamId, orgId, data.name, data.ageGroup, data.divisionLevel || null,
    data.city || null, data.state || null,
    data.headCoachName || null, data.headCoachEmail || null,
    data.managerName || null, data.managerEmail || null,
    user.id, inviteCode, parentInviteCode
  ).run();

  // Auto-link org owner as team member
  const memberId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via)
    VALUES (?, ?, ?, 'organization', 'active', 'creator')
  `).bind(memberId, teamId, user.id).run();

  // If coach email provided, create invite
  if (data.headCoachEmail) {
    const existingCoach = await db.prepare('SELECT id FROM users WHERE email = ?').bind(data.headCoachEmail.toLowerCase()).first<{ id: string }>();
    if (existingCoach) {
      await db.prepare('INSERT OR IGNORE INTO team_coaches (id, team_id, user_id, role, assigned_by) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingCoach.id, 'head', user.id).run();
      await db.prepare('INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingCoach.id, 'coach', 'active', 'org_assigned').run();
    } else {
      // Create team invite
      const invId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO team_invites (id, team_id, invited_email, invited_role, invited_by, status)
        VALUES (?, ?, ?, 'coach', ?, 'pending')
      `).bind(invId, teamId, data.headCoachEmail.toLowerCase(), user.id).run();

      // Send invite email via Resend
      try {
        const siteUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
        const signupUrl = `${siteUrl}/signup?invite=${inviteCode}&email=${encodeURIComponent(data.headCoachEmail)}&role=coach`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
            to: [data.headCoachEmail],
            subject: `You've been invited to coach ${data.name}`,
            html: `<p>You've been invited to coach <strong>${data.name}</strong> on Ultimate Tournaments.</p>
                <p><a href="${signupUrl}" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Accept Invite</a></p>
                <p>Or use invite code: <strong>${inviteCode}</strong></p>`,
          }),
        });
      } catch {}
    }
  }

  // If manager email provided, create invite
  if (data.managerEmail) {
    const existingMgr = await db.prepare('SELECT id FROM users WHERE email = ?').bind(data.managerEmail.toLowerCase()).first<{ id: string }>();
    if (existingMgr) {
      await db.prepare('INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)')
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingMgr.id).run();
      await db.prepare('INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingMgr.id, 'manager', 'active', 'org_assigned').run();
    } else {
      const invId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO team_invites (id, team_id, invited_email, invited_role, invited_by, status)
        VALUES (?, ?, ?, 'manager', ?, 'pending')
      `).bind(invId, teamId, data.managerEmail.toLowerCase(), user.id).run();

      try {
        const siteUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
        const signupUrl = `${siteUrl}/signup?invite=${inviteCode}&email=${encodeURIComponent(data.managerEmail)}&role=manager`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
            to: [data.managerEmail],
            subject: `You've been invited to manage ${data.name}`,
            html: `<p>You've been invited to manage <strong>${data.name}</strong> on Ultimate Tournaments.</p>
                <p><a href="${signupUrl}" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Accept Invite</a></p>
                <p>Or use invite code: <strong>${inviteCode}</strong></p>`,
          }),
        });
      } catch {}
    }
  }

  return c.json({ success: true, data: { id: teamId, inviteCode } }, 201);
});

// ==================
// Invite staff (coach or manager) to existing team
// ==================
const inviteStaffSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['coach', 'manager']),
});

organizationRoutes.post('/:id/teams/:teamId/invite-staff', authMiddleware, zValidator('json', inviteStaffSchema), async (c) => {
  const orgId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  // Verify org ownership and team belongs to org
  if (!(await isOrgAdmin(db, orgId, user.id))) return c.json({ success: false, error: 'Team not found or access denied' }, 403);
  const team = await db.prepare(`
    SELECT t.id, t.name, t.invite_code FROM teams t
    WHERE t.id = ? AND t.organization_id = ?
  `).bind(teamId, orgId).first<{ id: string; name: string; invite_code: string }>();

  if (!team) return c.json({ success: false, error: 'Team not found or access denied' }, 403);

  const email = data.email.toLowerCase();
  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();

  if (existingUser) {
    // Direct link
    if (data.role === 'coach') {
      await db.prepare('INSERT OR IGNORE INTO team_coaches (id, team_id, user_id, role, assigned_by) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingUser.id, 'head', user.id).run();
    } else {
      await db.prepare('INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)')
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingUser.id).run();
    }
    await db.prepare('INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingUser.id, data.role, 'active', 'org_assigned').run();

    return c.json({ success: true, message: 'User linked to team', linked: true });
  }

  // Create invite
  const invId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO team_invites (id, team_id, invited_email, invited_role, invited_by, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(invId, teamId, email, data.role, user.id).run();

  // Send invite email via Resend
  try {
    const siteUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
    const signupUrl = `${siteUrl}/signup?invite=${team.invite_code}&email=${encodeURIComponent(email)}&role=${data.role}`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
        to: [email],
        subject: `You've been invited to ${data.role === 'coach' ? 'coach' : 'manage'} ${team.name}`,
        html: `<p>You've been invited to ${data.role === 'coach' ? 'coach' : 'manage'} <strong>${team.name}</strong> on Ultimate Tournaments.</p>
            <p><a href="${signupUrl}" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Accept Invite</a></p>
            <p>Or use invite code: <strong>${team.invite_code}</strong></p>`,
      }),
    });
  } catch {}

  return c.json({ success: true, message: 'Invite sent', linked: false });
});

// ==================
// Remove staff from team
// ==================
organizationRoutes.delete('/:id/teams/:teamId/staff/:userId', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const teamId = c.req.param('teamId');
  const staffUserId = c.req.param('userId');
  const user = c.get('user');
  const db = c.env.DB;

  // Verify org ownership
  if (!(await isOrgAdmin(db, orgId, user.id))) return c.json({ success: false, error: 'Access denied' }, 403);

  await db.prepare('DELETE FROM team_coaches WHERE team_id = ? AND user_id = ?').bind(teamId, staffUserId).run();
  await db.prepare('DELETE FROM team_managers WHERE team_id = ? AND user_id = ?').bind(teamId, staffUserId).run();
  await db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').bind(teamId, staffUserId).run();

  return c.json({ success: true });
});

// ==================
// List org owners/admins (including pending invites)
// ==================
organizationRoutes.get('/:id/admins', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;

  if (!(await isOrgAdmin(db, orgId, user.id))) return c.json({ success: false, error: 'Access denied' }, 403);

  const admins = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone, oa.role, oa.created_at
    FROM organization_admins oa JOIN users u ON u.id = oa.user_id
    WHERE oa.organization_id = ?
    ORDER BY oa.created_at ASC
  `).bind(orgId).all();

  const pending = await db.prepare(`
    SELECT id, email, created_at FROM organization_invites
    WHERE organization_id = ? AND status = 'pending'
    ORDER BY created_at ASC
  `).bind(orgId).all();

  return c.json({ success: true, data: { admins: admins.results, pendingInvites: pending.results } });
});

// ==================
// Invite another org owner by email
// ==================
const inviteOwnerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

organizationRoutes.post('/:id/invite-owner', authMiddleware, zValidator('json', inviteOwnerSchema), async (c) => {
  const orgId = c.req.param('id');
  const data = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;

  if (!(await isOrgAdmin(db, orgId, user.id))) return c.json({ success: false, error: 'Access denied' }, 403);

  const org = await db.prepare('SELECT id, name FROM organizations WHERE id = ? AND is_active = 1').bind(orgId).first<{ id: string; name: string }>();
  if (!org) return c.json({ success: false, error: 'Organization not found' }, 404);

  const email = data.email.toLowerCase();
  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();

  if (existingUser) {
    // Link immediately: org admin row + organization role
    await db.prepare(`
      INSERT OR IGNORE INTO organization_admins (id, organization_id, user_id, role, invited_by)
      VALUES (?, ?, ?, 'owner', ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), orgId, existingUser.id, user.id).run();
    await db.prepare('INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)')
      .bind(crypto.randomUUID().replace(/-/g, ''), existingUser.id, 'organization').run();

    // Notify them by email
    if (c.env.RESEND_API) {
      try {
        const baseUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
            to: [email],
            subject: `You're now an owner of ${org.name}`,
            html: `<p>You've been added as an owner of <strong>${org.name}</strong> on Ultimate Tournaments.</p>
              <p>All of the organization's teams are now linked to your account.</p>
              <p><a href="${baseUrl}/dashboard/organization" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Open Org Dashboard</a></p>`,
          }),
        });
      } catch {}
    }

    return c.json({ success: true, message: 'User added as org owner', linked: true });
  }

  // No account yet — create a pending invite, auto-linked when they sign up
  await db.prepare(`
    INSERT INTO organization_invites (id, organization_id, email, invited_by, status)
    VALUES (?, ?, ?, ?, 'pending')
    ON CONFLICT(organization_id, email) DO UPDATE SET status = 'pending', invited_by = excluded.invited_by
  `).bind(crypto.randomUUID().replace(/-/g, ''), orgId, email, user.id).run();

  if (c.env.RESEND_API) {
    try {
      const baseUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
      const signupUrl = `${baseUrl}/signup?email=${encodeURIComponent(email)}&role=organization`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
          to: [email],
          subject: `You've been invited to own ${org.name}`,
          html: `<p>You've been invited to be an owner of <strong>${org.name}</strong> on Ultimate Tournaments.</p>
            <p>Create your account and you'll automatically get access to all of the organization's teams.</p>
            <p><a href="${signupUrl}" style="background:#003e79;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Create Account</a></p>`,
        }),
      });
    } catch {}
  }

  return c.json({ success: true, message: 'Invite sent', linked: false });
});

// ==================
// Remove an org owner/admin
// ==================
organizationRoutes.delete('/:id/admins/:userId', authMiddleware, async (c) => {
  const orgId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  const user = c.get('user');
  const db = c.env.DB;

  if (!(await isOrgAdmin(db, orgId, user.id))) return c.json({ success: false, error: 'Access denied' }, 403);
  if (targetUserId === user.id) return c.json({ success: false, error: 'You cannot remove yourself' }, 400);

  await db.prepare('DELETE FROM organization_admins WHERE organization_id = ? AND user_id = ?').bind(orgId, targetUserId).run();
  return c.json({ success: true });
});

// ==================
// Get org with teams (basic)
// ==================
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

// ==================
// Create organization
// ==================
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
    INSERT INTO organizations (id, name, owner_id, usa_hockey_org_id, address, city, state, zip, phone, email, website, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(orgId, data.name, user.id, data.usaHockeyOrgId || null, data.address || null,
    data.city || null, data.state || null, data.zip || null, data.phone || null,
    data.email || null, data.website || null
  ).run();

  return c.json({ success: true, data: { id: orgId } }, 201);
});

// ==================
// Update organization
// ==================
organizationRoutes.patch('/:id', authMiddleware, async (c) => {
  // Admins/directors, or the org's own owners, may edit it
  {
    const user = c.get('user') as any;
    const roles: string[] = user?.roles || [];
    const isAdmin = roles.includes('admin') || roles.includes('director');
    if (!isAdmin && !(await isOrgAdmin(c.env.DB, c.req.param('id'), user.id))) {
      return c.json({ success: false, error: 'Access denied' }, 403);
    }
  }
  const db = c.env.DB;
  const orgId = c.req.param('id');
  const body = await c.req.json<{ name?: string; city?: string; state?: string; phone?: string; email?: string; website?: string; address?: string; zip?: string; is_active?: number }>();

  const fields: string[] = [];
  const params: any[] = [];

  for (const [key, col] of Object.entries({ name: 'name', city: 'city', state: 'state', phone: 'phone', email: 'email', website: 'website', address: 'address', zip: 'zip', is_active: 'is_active' })) {
    if ((body as any)[key] !== undefined) { fields.push(`${col} = ?`); params.push((body as any)[key]); }
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

  fields.push("updated_at = datetime('now')");
  params.push(orgId);

  await db.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==================
// Upload org logo (base64 — admin)
// ==================
organizationRoutes.post('/:orgId/logo-base64', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const storage = c.env.STORAGE;
  const orgId = c.req.param('orgId');

  const org = await db.prepare(`SELECT id, name FROM organizations WHERE id = ?`).bind(orgId).first();
  if (!org) return c.json({ success: false, error: 'Organization not found' }, 404);

  const body = await c.req.json() as { data: string; mimeType: string };
  if (!body.data || !body.mimeType) {
    return c.json({ success: false, error: 'Missing data or mimeType' }, 400);
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(body.mimeType)) {
    return c.json({ success: false, error: 'Invalid image type. Use JPEG, PNG, or WebP.' }, 400);
  }

  const binaryString = atob(body.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (bytes.length > 5 * 1024 * 1024) {
    return c.json({ success: false, error: 'Image too large. Max 5MB.' }, 400);
  }

  const ext = body.mimeType === 'image/png' ? 'png' : body.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const key = `org-logos/${orgId}.${ext}`;

  await storage.put(key, bytes.buffer, { httpMetadata: { contentType: body.mimeType } });

  const apiBase = c.env.API_URL || 'https://uht.chad-157.workers.dev';
  const logoUrl = `${apiBase}/api/assets/${key}?v=${Date.now()}`;

  await db.prepare("UPDATE organizations SET logo_url = ? WHERE id = ?")
    .bind(logoUrl, orgId).run();

  return c.json({ success: true, data: { logo_url: logoUrl } });
});

