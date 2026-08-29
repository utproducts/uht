import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole, isDataRestricted, redactContactInfo } from '../middleware/auth';

export const teamRoutes = new Hono<{ Bindings: Env }>();

// ==================
// ADMIN: Get events for filter dropdown
// ==================
teamRoutes.get('/admin/events-list', async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT e.id, e.name,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) as team_count
    FROM events e
    WHERE e.status != 'cancelled'
    ORDER BY e.name ASC
  `).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Merge teams into an organization
// Takes an array of team IDs and assigns them to the same organization
// ==================
teamRoutes.post('/admin/merge-org', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    team_ids: string[];
    org_name: string;
    org_id?: string; // existing org ID, or will create new
  }>();

  if (!body.team_ids?.length || !body.org_name) {
    return c.json({ error: 'team_ids and org_name required' }, 400);
  }

  let orgId = body.org_id;

  // If no existing org_id, check if org with this name exists or create new
  if (!orgId) {
    const existing = await db.prepare(
      `SELECT id FROM organizations WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active = 1`
    ).bind(body.org_name).first<{ id: string }>();

    if (existing) {
      orgId = existing.id;
    } else {
      orgId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO organizations (id, name, owner_id, is_active)
        VALUES (?, ?, 'system_migration_user', 1)
      `).bind(orgId, body.org_name).run();
    }
  }

  // Link all specified teams to this org (keep original team names)
  let linked = 0;
  for (const teamId of body.team_ids) {
    const result = await db.prepare(`
      UPDATE teams SET organization_id = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(orgId, teamId).run();
    linked += result.meta.changes;
  }

  return c.json({ success: true, org_id: orgId, org_name: body.org_name, teams_linked: linked });
});

// ==================
// ADMIN: List all teams with filters
// ==================
teamRoutes.get('/admin/list', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { search, state, age_group, active, has_contact, season, event_id, page = '1', per_page = '50', sort = 'name', order = 'asc' } = c.req.query();

  // When filtering by event, we need a JOIN to registrations
  const eventJoin = event_id ? ' INNER JOIN registrations reg ON reg.team_id = t.id AND reg.event_id = ?' : '';
  const eventParams: string[] = event_id ? [event_id] : [];

  let whereClause = ' WHERE t.is_active = 1';
  const params: string[] = [...eventParams];

  // new_only=true filters to only teams created through new infrastructure
  const { new_only } = c.req.query();
  if (new_only === 'true') {
    whereClause += ' AND t.created_by IS NOT NULL';
  }

  if (search) {
    whereClause += ` AND (LOWER(t.name) LIKE ? OR LOWER(t.city) LIKE ? OR LOWER(t.head_coach_name) LIKE ? OR LOWER(t.head_coach_email) LIKE ?)`;
    const term = `%${search.toLowerCase()}%`;
    params.push(term, term, term, term);
  }
  if (state) {
    whereClause += ` AND t.state = ?`;
    params.push(state);
  }
  if (age_group && age_group !== 'all') {
    whereClause += ` AND t.age_group = ?`;
    params.push(age_group);
  }
  if (season) {
    if (season === 'none') {
      whereClause += ` AND (t.season IS NULL OR t.season = '')`;
    } else {
      whereClause += ` AND t.season = ?`;
      params.push(season);
    }
  }
  if (active !== undefined) {
    whereClause += ` AND t.is_active = ?`;
    params.push(active);
  }
  if (has_contact === 'yes') {
    whereClause += ` AND t.head_coach_email IS NOT NULL AND t.head_coach_email != ''`;
  } else if (has_contact === 'no') {
    whereClause += ` AND (t.head_coach_email IS NULL OR t.head_coach_email = '')`;
  }

  // Count
  const countParams = [...params];
  const countResult = await db.prepare(`SELECT COUNT(DISTINCT t.id) as total FROM teams t ${eventJoin} ${whereClause}`).bind(...countParams).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Sort
  const validSorts: Record<string, string> = { name: 't.name', age_group: 't.age_group', city: 't.city', state: 't.state', created_at: 't.created_at', coach: 't.head_coach_name' };
  const sortCol = validSorts[sort] || 't.name';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

  // Paginate
  const pageNum = Math.max(1, parseInt(page));
  // Admin views load the whole roster of teams in one screen, so the cap has to
  // clear the total team count. At 100 the admin Teams page silently truncated
  // (198 teams, first 100 shown) — teams after 'Lake Central' just vanished.
  const perPage = Math.min(500, Math.max(10, parseInt(per_page)));
  const offset = (pageNum - 1) * perPage;

  const result = await db.prepare(`
    SELECT DISTINCT t.*, o.name as organization_name,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count
    FROM teams t
    ${eventJoin}
    LEFT JOIN organizations o ON o.id = t.organization_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `).bind(...params, perPage.toString(), offset.toString()).all();

  // Stats (only on first page load without filters, for efficiency)
  let stats = null;
  if (pageNum === 1 && !search && (!age_group || age_group === 'all') && !state && !has_contact) {
    const statsResult = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN age_group != 'Unknown' THEN 1 ELSE 0 END) as categorized,
        SUM(CASE WHEN age_group = 'Unknown' THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN head_coach_email IS NOT NULL AND head_coach_email != '' THEN 1 ELSE 0 END) as with_contact,
        SUM(CASE WHEN contact_type = 'coach' THEN 1 ELSE 0 END) as coaches,
        SUM(CASE WHEN contact_type = 'manager' THEN 1 ELSE 0 END) as managers,
        SUM(CASE WHEN contact_type = 'parent' THEN 1 ELSE 0 END) as parents,
        COUNT(DISTINCT LOWER(TRIM(name))) as unique_orgs
      FROM teams WHERE is_active = 1
    `).first();
    stats = statsResult;
  }

  const listRestricted = await isDataRestricted(c);
  return c.json({
    success: true,
    data: listRestricted ? redactContactInfo(result.results) : result.results,
    pagination: { page: pageNum, perPage, total, totalPages: Math.ceil(total / perPage) },
    stats,
  });
});

// ==================
// ADMIN: Data export for cleanup matching
// ==================
teamRoutes.get('/admin/export-for-cleanup', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const { season } = c.req.query();

  let whereClause = 'WHERE t.is_active = 1';
  const params: string[] = [];
  if (season) {
    whereClause += ' AND t.season = ?';
    params.push(season);
  }

  const result = await db.prepare(`
    SELECT t.id, t.name, t.head_coach_name, t.head_coach_email, t.head_coach_phone,
           t.age_group, t.city, t.state, t.season, t.organization_id,
           GROUP_CONCAT(DISTINCT e.name) as event_names
    FROM teams t
    LEFT JOIN registrations r ON r.team_id = t.id
    LEFT JOIN events e ON e.id = r.event_id
    ${whereClause}
    GROUP BY t.id
    ORDER BY t.name
  `).bind(...params).all();

  return c.json({ success: true, data: result.results, count: result.results.length });
});

// ==================
// ADMIN: Bulk update teams (for data cleanup)
// ==================
teamRoutes.post('/admin/bulk-update', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ updates: Array<{ id: string; name?: string; head_coach_name?: string; head_coach_email?: string; head_coach_phone?: string; organization_id?: string | null }> }>();

  if (!body.updates || !Array.isArray(body.updates)) {
    return c.json({ error: 'updates array required' }, 400);
  }

  let updated = 0;
  for (const u of body.updates) {
    const sets: string[] = [];
    const vals: string[] = [];
    if (u.name !== undefined) { sets.push('name = ?'); vals.push(u.name); }
    if (u.head_coach_name !== undefined) { sets.push('head_coach_name = ?'); vals.push(u.head_coach_name); }
    if (u.head_coach_email !== undefined) { sets.push('head_coach_email = ?'); vals.push(u.head_coach_email); }
    if (u.head_coach_phone !== undefined) { sets.push('head_coach_phone = ?'); vals.push(u.head_coach_phone); }
    if (u.organization_id !== undefined) { sets.push('organization_id = ?'); vals.push(u.organization_id as string); }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      await db.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, u.id).run();
      updated++;
    }
  }

  return c.json({ success: true, updated });
});

// ==================
// ADMIN: Organization-grouped view
// ==================
teamRoutes.get('/admin/orgs', async (c) => {
  const db = c.env.DB;
  const { search, season, event_id, page = '1', per_page = '30' } = c.req.query();

  // Event filter: join registrations if filtering by event
  const eventJoin = event_id ? 'INNER JOIN registrations reg ON reg.team_id = t.id AND reg.event_id = ?' : '';
  const eventParams: string[] = event_id ? [event_id] : [];

  let whereClause = 'WHERE t.is_active = 1';
  const params: string[] = [...eventParams];

  if (search && search.trim().length >= 2) {
    whereClause += ` AND LOWER(t.name) LIKE ?`;
    params.push(`%${search.toLowerCase()}%`);
  }
  if (season) {
    if (season === 'none') {
      whereClause += ` AND (t.season IS NULL OR t.season = '')`;
    } else {
      whereClause += ` AND t.season = ?`;
      params.push(season);
    }
  }

  // Get org count — use organization_id if teams are linked, fall back to name grouping
  const countParams = [...params];
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM (
      SELECT COALESCE(t.organization_id, LOWER(TRIM(t.name))) as org_key
      FROM teams t ${eventJoin} ${whereClause}
      GROUP BY org_key
    )
  `).bind(...countParams).first<{ total: number }>();
  const total = countResult?.total || 0;

  const pageNum = Math.max(1, parseInt(page));
  const perPage = Math.min(50, Math.max(10, parseInt(per_page)));
  const offset = (pageNum - 1) * perPage;

  const orgs = await db.prepare(`
    SELECT
      COALESCE(t.organization_id, LOWER(TRIM(t.name))) as org_key,
      COALESCE(o.name, MIN(t.name)) as name,
      t.organization_id,
      COUNT(DISTINCT t.id) as team_count,
      COUNT(DISTINCT t.age_group) as age_groups,
      GROUP_CONCAT(DISTINCT t.age_group) as age_group_list,
      GROUP_CONCAT(DISTINCT t.city) as cities,
      GROUP_CONCAT(DISTINCT t.state) as states,
      GROUP_CONCAT(DISTINCT t.season) as seasons,
      MAX(t.season) as latest_season,
      SUM(CASE WHEN t.head_coach_email IS NOT NULL AND t.head_coach_email != '' THEN 1 ELSE 0 END) as contacts_count,
      SUM(CASE WHEN t.contact_type = 'coach' THEN 1 ELSE 0 END) as coach_count,
      SUM(CASE WHEN t.contact_type = 'parent' THEN 1 ELSE 0 END) as parent_count,
      SUM(CASE WHEN t.contact_type = 'manager' THEN 1 ELSE 0 END) as manager_count,
      COUNT(DISTINCT t.head_coach_email) as unique_contacts
    FROM teams t
    ${eventJoin}
    LEFT JOIN organizations o ON o.id = t.organization_id
    ${whereClause}
    GROUP BY org_key
    ORDER BY team_count DESC, name ASC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage.toString(), offset.toString()).all();

  return c.json({
    success: true,
    data: orgs.results,
    pagination: { page: pageNum, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
});

// ADMIN: Get teams for a specific organization (by org_id or name)
teamRoutes.get('/admin/org-teams/:orgKey', async (c) => {
  const db = c.env.DB;
  const orgKey = decodeURIComponent(c.req.param('orgKey'));

  // Try to find by organization_id first, then fall back to name matching
  let result;
  const orgCheck = await db.prepare('SELECT id FROM organizations WHERE id = ?').bind(orgKey).first();

  if (orgCheck) {
    // orgKey is an organization_id — get all teams linked to this org
    result = await db.prepare(`
      SELECT t.*, o.name as organization_name,
        (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count
      FROM teams t
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE t.organization_id = ? AND t.is_active = 1
      ORDER BY t.age_group, t.name ASC, t.created_at DESC
    `).bind(orgKey).all();
  } else {
    // orgKey is a team name — legacy fallback
    result = await db.prepare(`
      SELECT t.*, o.name as organization_name,
        (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count
      FROM teams t
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(?)) AND t.is_active = 1
      ORDER BY t.age_group, t.created_at DESC
    `).bind(orgKey).all();
  }

  return c.json({ success: true, data: result.results });
});

// ==================
// ADMIN: Get team roster (players + guardians) for expand view
// ==================
teamRoutes.get('/admin/team-roster/:teamId', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param('teamId');

  // Get players on this team (include claim fields for parent contact)
  const players = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.usa_hockey_number,
           p.jersey_number, p.position, p.shoots,
           p.claimed_by, p.parent_name, p.parent_email, p.parent_phone,
           tp.status as roster_status, tp.added_at
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ? AND tp.status IN ('active', 'rostered')
    ORDER BY CAST(p.jersey_number AS INTEGER), p.last_name ASC
  `).bind(teamId).all();

  // Get guardian/parent contacts for each player (from player_guardians table)
  const guardians = await db.prepare(`
    SELECT pg.player_id, pg.relationship, u.id as user_id,
           u.first_name, u.last_name, u.email, u.phone
    FROM player_guardians pg
    JOIN users u ON u.id = pg.user_id
    JOIN team_players tp ON tp.player_id = pg.player_id
    WHERE tp.team_id = ? AND tp.status IN ('active', 'rostered')
    ORDER BY pg.player_id, u.last_name
  `).bind(teamId).all();

  // Merge guardians into players — use player_guardians first, fall back to claim fields
  const guardianMap: Record<string, any[]> = {};
  for (const g of (guardians.results || [])) {
    const pid = g.player_id as string;
    if (!guardianMap[pid]) guardianMap[pid] = [];
    guardianMap[pid].push(g);
  }

  const roster = (players.results || []).map((p: any) => {
    let playerGuardians = guardianMap[p.id] || [];
    // If no player_guardians records but player was claimed, use claim data
    if (playerGuardians.length === 0 && p.claimed_by && p.parent_name) {
      const nameParts = (p.parent_name as string).split(' ');
      playerGuardians = [{
        player_id: p.id,
        relationship: 'Parent/Guardian',
        user_id: p.claimed_by,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        email: p.parent_email || null,
        phone: p.parent_phone || null,
      }];
    }
    return {
      ...p,
      guardians: playerGuardians,
    };
  });

  return c.json({ success: true, data: roster, count: roster.length });
});

// ==================
// ADMIN: Bulk import teams
// ==================
teamRoutes.post('/admin/bulk-import', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();
  const teams = body.teams; // Array of [team_name, coach_name, phone, event_count]

  if (!Array.isArray(teams)) {
    return c.json({ success: false, error: 'teams must be an array' }, 400);
  }

  let inserted = 0;
  let skipped = 0;

  for (const t of teams) {
    const name = t[0]?.trim();
    const coach = t[1]?.trim() || null;
    const phone = t[2]?.trim() || null;
    const eventCount = t[3] || 0;

    if (!name) { skipped++; continue; }

    // Check for exact duplicate
    const existing = await db.prepare(`SELECT id FROM teams WHERE name = ?`).bind(name).first();
    if (existing) { skipped++; continue; }

    const teamId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO teams (id, name, age_group, city, state, is_active)
      VALUES (?, ?, 'Unknown', NULL, NULL, 1)
    `).bind(teamId, name).run();
    inserted++;
  }

  return c.json({ success: true, inserted, skipped, total: teams.length });
});

// ==================
// ADMIN: Update team
// ==================
teamRoutes.patch('/admin/:id', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json();

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = ['name', 'age_group', 'division_level', 'city', 'state', 'organization_id', 'usa_hockey_team_id', 'logo_url', 'is_active', 'head_coach_name', 'head_coach_email', 'head_coach_phone', 'manager_name', 'manager_email', 'manager_phone', 'contact_type', 'season'];
  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      fields.push(`${f} = ?`);
      params.push(body[f]);
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  fields.push(`updated_at = datetime('now')`);
  params.push(id);

  await db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true });
});

// ==================
// Coach/Manager: Update own team
// ==================
teamRoutes.patch('/:teamId', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const teamId = c.req.param('teamId');

  // Admins/directors can edit any team; coaches/managers must own or be staff on it
  const isAdmin = user.roles?.includes('admin') || user.roles?.includes('director');
  let team: any;
  if (isAdmin) {
    team = await db.prepare(`SELECT id FROM teams WHERE id = ?`).bind(teamId).first();
  } else {
    team = await db.prepare(`
      SELECT t.id FROM teams t
      LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
      LEFT JOIN team_managers tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ? AND (t.created_by = ? OR tc.user_id = ? OR tm.user_id = ?)
    `).bind(user.id, user.id, teamId, user.id, user.id, user.id).first();
  }

  if (!team) return c.json({ success: false, error: 'Not authorized to edit this team' }, 403);

  const body = await c.req.json();
  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields: Record<string, string> = {
    ageGroup: 'age_group',
    divisionLevel: 'division_level',
    city: 'city',
    state: 'state',
    website: 'website',
    hometownLeague: 'hometown_league',
    teamType: 'team_type',
    season: 'season',
    headCoachName: 'head_coach_name',
    headCoachEmail: 'head_coach_email',
    headCoachPhone: 'head_coach_phone',
    managerName: 'manager_name',
    managerEmail: 'manager_email',
    managerPhone: 'manager_phone',
    seasonRecord: 'season_record',
    name: 'name',
    logoUrl: 'logo_url',
    usaHockeyRosterUrl: 'usa_hockey_roster_url',
    mhrUrl: 'mhr_url',
  };

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      params.push(body[jsKey] || null);
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  fields.push(`updated_at = datetime('now')`);
  params.push(teamId);

  await db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();

  // Changing or clearing the MHR link invalidates the cached rating
  if (body.mhrUrl !== undefined) {
    await db.prepare("UPDATE teams SET mhr_rating = NULL, mhr_rating_updated_at = NULL WHERE id = ? AND (mhr_url IS NULL OR mhr_url = '')")
      .bind(teamId).run().catch(() => {});
  }
  return c.json({ success: true });
});

// ==================
// Upload team logo
// ==================
teamRoutes.post('/:teamId/logo', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const storage = c.env.STORAGE;
  const teamId = c.req.param('teamId');

  // Verify ownership or admin
  const isAdmin = user.roles?.includes('admin') || user.roles?.includes('director');
  let team: any;
  if (isAdmin) {
    team = await db.prepare(`SELECT id FROM teams WHERE id = ?`).bind(teamId).first();
  } else {
    team = await db.prepare(`
      SELECT t.id FROM teams t
      LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
      LEFT JOIN team_managers tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ? AND (t.created_by = ? OR tc.user_id = ? OR tm.user_id = ?)
    `).bind(user.id, user.id, teamId, user.id, user.id, user.id).first();
  }

  if (!team) return c.json({ success: false, error: 'Not authorized' }, 403);

  const formData = await c.req.formData();
  const file = formData.get('logo') as File | null;
  if (!file) return c.json({ success: false, error: 'No image provided' }, 400);

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return c.json({ success: false, error: 'Invalid image type. Use JPEG, PNG, or WebP.' }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ success: false, error: 'Image too large. Max 5MB.' }, 400);
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `team-logos/${teamId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  await storage.put(key, arrayBuffer, { httpMetadata: { contentType: file.type } });

  const apiBase = c.env.API_URL || 'https://uht.chad-157.workers.dev';
  const logoUrl = `${apiBase}/api/assets/${key}?v=${Date.now()}`;

  await db.prepare("UPDATE teams SET logo_url = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(logoUrl, teamId).run();

  return c.json({ success: true, data: { logo_url: logoUrl } });
});

// ==================
// Upload team logo (base64 — mobile app)
// ==================
teamRoutes.post('/:teamId/logo-base64', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const storage = c.env.STORAGE;
  const teamId = c.req.param('teamId');

  // Verify ownership or admin
  const isAdmin = user.roles?.includes('admin') || user.roles?.includes('director');
  let team: any;
  if (isAdmin) {
    team = await db.prepare(`SELECT id, organization_id FROM teams WHERE id = ?`).bind(teamId).first();
  } else {
    team = await db.prepare(`
      SELECT t.id, t.organization_id FROM teams t
      LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
      LEFT JOIN team_managers tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ? AND (t.created_by = ? OR tc.user_id = ? OR tm.user_id = ?)
    `).bind(user.id, user.id, teamId, user.id, user.id, user.id).first();
  }

  if (!team) return c.json({ success: false, error: 'Not authorized' }, 403);

  // Only coaches and admins can upload team logos (not parents/players)
  const userRoles = user.roles || [];
  const canUpload = isAdmin || userRoles.includes('coach') || userRoles.includes('manager');
  if (!canUpload) {
    return c.json({ success: false, error: 'Only coaches and managers can upload team logos' }, 403);
  }

  const body = await c.req.json() as { data: string; mimeType: string };
  if (!body.data || !body.mimeType) {
    return c.json({ success: false, error: 'Missing data or mimeType' }, 400);
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(body.mimeType)) {
    return c.json({ success: false, error: 'Invalid image type. Use JPEG, PNG, or WebP.' }, 400);
  }

  // Decode base64
  const binaryString = atob(body.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (bytes.length > 5 * 1024 * 1024) {
    return c.json({ success: false, error: 'Image too large. Max 5MB.' }, 400);
  }

  const ext = body.mimeType === 'image/png' ? 'png' : body.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const key = `team-logos/${teamId}.${ext}`;

  await storage.put(key, bytes.buffer, { httpMetadata: { contentType: body.mimeType } });

  const apiBase = c.env.API_URL || 'https://uht.chad-157.workers.dev';
  const logoUrl = `${apiBase}/api/assets/${key}?v=${Date.now()}`;

  // Save to the team only — org logos are managed by admins
  await db.prepare("UPDATE teams SET logo_url = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(logoUrl, teamId).run();

  return c.json({ success: true, data: { logo_url: logoUrl } });
});

// ==================
// Get org logos — returns logo_url from other teams in the same org
// ==================
teamRoutes.get('/:teamId/org-logos', authMiddleware, async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param('teamId');

  const team = await db.prepare(`SELECT organization_id FROM teams WHERE id = ?`).bind(teamId).first() as any;
  if (!team?.organization_id) {
    return c.json({ success: true, data: [] });
  }

  const logos = await db.prepare(`
    SELECT DISTINCT logo_url FROM teams
    WHERE organization_id = ? AND id != ? AND logo_url IS NOT NULL AND logo_url != ''
    LIMIT 5
  `).bind(team.organization_id, teamId).all();

  return c.json({ success: true, data: (logos.results || []).map((r: any) => r.logo_url) });
});

// ==================
// ADMIN: Delete team (soft)
// ==================
teamRoutes.delete('/admin/:id', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare(`UPDATE teams SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// ==================
// Coach/Manager: Delete (soft) own team
// ==================
teamRoutes.delete('/:teamId', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as any;
  const teamId = c.req.param('teamId');

  // Check ownership: created_by, team_coaches, or team_managers — or admin/director
  const isAdmin = user.roles?.includes('admin') || user.roles?.includes('director');
  let team: any;
  if (isAdmin) {
    team = await db.prepare(`SELECT id, name FROM teams WHERE id = ? AND is_active = 1`).bind(teamId).first();
  } else {
    team = await db.prepare(`
      SELECT t.id, t.name FROM teams t
      LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
      LEFT JOIN team_managers tm ON tm.team_id = t.id AND tm.user_id = ?
      WHERE t.id = ? AND t.is_active = 1 AND (t.created_by = ? OR tc.user_id = ? OR tm.user_id = ?)
    `).bind(user.id, user.id, teamId, user.id, user.id, user.id).first();
  }

  if (!team) {
    return c.json({ success: false, error: 'Team not found or not authorized' }, 404);
  }

  // Check if team has active registrations (registrations table uses team_id, event_registrations uses team_name)
  const activeReg = await db.prepare(`
    SELECT COUNT(*) as cnt FROM registrations
    WHERE team_id = ? AND status NOT IN ('cancelled', 'withdrawn', 'denied', 'rejected')
  `).bind(teamId).first() as any;

  const activeEventReg = await db.prepare(`
    SELECT COUNT(*) as cnt FROM event_registrations
    WHERE team_name = ? AND status NOT IN ('cancelled', 'withdrawn', 'denied', 'rejected')
  `).bind(team.name).first() as any;

  const totalActive = (activeReg?.cnt || 0) + (activeEventReg?.cnt || 0);
  if (totalActive > 0) {
    return c.json({
      success: false,
      error: `This team has ${totalActive} active event registration${totalActive > 1 ? 's' : ''}. Please withdraw from events before deleting.`
    }, 400);
  }

  // Soft delete
  await db.prepare(`UPDATE teams SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).bind(teamId).run();
  return c.json({ success: true, message: `Team "${team.name}" has been deleted.` });
});

// ==================
// ADMIN: Deduplicate teams (single SQL)
// ==================
teamRoutes.post('/admin/dedup', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  // Single SQL: delete all rows where there's another row with the same name and a smaller rowid
  const result = await db.prepare(`
    DELETE FROM teams WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM teams GROUP BY name
    )
  `).run();

  const remaining = await db.prepare(`SELECT COUNT(*) as cnt FROM teams`).first();

  return c.json({ success: true, deleted: result.meta.changes, remaining: (remaining as any)?.cnt });
});

// ==================
// ADMIN: Soft-delete teams with no email contact
// ==================
teamRoutes.post('/admin/purge-no-contact', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    UPDATE teams SET is_active = 0, updated_at = datetime('now')
    WHERE is_active = 1 AND (head_coach_email IS NULL OR head_coach_email = '')
  `).run();

  const remaining = await db.prepare(`SELECT COUNT(*) as cnt FROM teams WHERE is_active = 1`).first();

  return c.json({ success: true, deactivated: result.meta.changes, remaining_active: (remaining as any)?.cnt });
});

// ==================
// PUBLIC: Get existing teams by org + age group + division level (for duplicate prevention)
// ==================
teamRoutes.get('/by-org-division', async (c) => {
  const db = c.env.DB;
  const orgId = c.req.query('orgId');
  const ageGroup = c.req.query('ageGroup');
  const divisionLevel = c.req.query('divisionLevel');

  if (!orgId || !ageGroup) {
    return c.json({ success: true, data: [] });
  }

  let sql = `
    SELECT t.id, t.name, t.age_group, t.division_level, t.city, t.state,
           t.head_coach_name, t.invite_code,
           o.name as organization_name,
           (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.organization_id = ? AND t.age_group = ? AND t.is_active = 1 AND t.created_by IS NOT NULL
  `;
  const params: any[] = [orgId, ageGroup];

  if (divisionLevel) {
    sql += ` AND t.division_level = ?`;
    params.push(divisionLevel);
  }

  sql += ` ORDER BY t.name ASC`;

  const result = await db.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get active teams for an organization (for mobile app team follow)
// ==================
teamRoutes.get('/by-org/:orgId', async (c) => {
  const db = c.env.DB;
  const orgId = c.req.param('orgId');

  const result = await db.prepare(`
    SELECT t.id, t.name, t.age_group, t.division_level, t.city, t.state,
           o.name as organization_name
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.organization_id = ? AND t.is_active = 1 AND t.created_by IS NOT NULL
    ORDER BY t.age_group ASC, t.name ASC
  `).bind(orgId).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Search teams by name (for mobile app)
// ==================
teamRoutes.get('/search', async (c) => {
  const db = c.env.DB;
  const q = c.req.query('q') || '';
  if (q.length < 2) return c.json({ success: true, data: [] });

  const result = await db.prepare(`
    SELECT t.id, t.name, t.age_group, t.city, t.state,
           o.name as organization_name
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.is_active = 1 AND t.created_by IS NOT NULL AND LOWER(t.name) LIKE LOWER(?)
    ORDER BY
      CASE WHEN LOWER(t.name) = LOWER(?) THEN 0
           WHEN LOWER(t.name) LIKE LOWER(?) THEN 1
           ELSE 2 END,
      t.name ASC
    LIMIT 25
  `).bind('%' + q + '%', q, q + '%').all();

  return c.json({ success: true, data: result.results });
});

// ==================
// Get teams by IDs (for coach/manager dashboard with localStorage team IDs)
// ==================
teamRoutes.get('/by-ids', async (c) => {
  const db = c.env.DB;
  const idsParam = c.req.query('ids');
  if (!idsParam) return c.json({ success: true, data: [] });

  const ids = idsParam.split(',').slice(0, 50); // max 50
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT id, name, age_group, division_level, city, state, head_coach_name, head_coach_email,
           manager_name, usa_hockey_team_id, website, hometown_league, team_type, season_record,
           created_at
    FROM teams WHERE id IN (${placeholders}) AND is_active = 1
    ORDER BY name ASC
  `).bind(...ids).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// Get claimed players for current parent user
// ==================
teamRoutes.get('/my-players', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position, p.shoots,
           p.usa_hockey_number, p.date_of_birth, p.avatar_id, p.parent_name, p.parent_email,
           t.id as team_id, t.name as team_name, t.age_group, t.division_level,
           t.city as team_city, t.state as team_state, o.name as org_name
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id AND tp.status = 'active'
    JOIN teams t ON t.id = tp.team_id AND t.is_active = 1
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE p.claimed_by = ?
    ORDER BY p.last_name ASC, p.first_name ASC
  `).bind(user.id).all();

  return c.json({ success: true, data: result.results || [] });
});

// ==================
// Update player details (parent can edit their claimed player)
// ==================
teamRoutes.put('/players/:playerId', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const playerId = c.req.param('playerId');
  const body = await c.req.json<{
    firstName?: string; lastName?: string; jerseyNumber?: string;
    position?: string; shoots?: string; dateOfBirth?: string;
  }>();

  // Verify this player is claimed by this user
  const player = await db.prepare('SELECT id, claimed_by FROM players WHERE id = ?').bind(playerId).first<{ id: string; claimed_by: string | null }>();
  if (!player) return c.json({ success: false, error: 'Player not found' }, 404);
  if (player.claimed_by !== user.id) return c.json({ success: false, error: 'You can only edit your own players' }, 403);

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (body.firstName !== undefined) { updates.push('first_name = ?'); values.push(body.firstName.trim()); }
  if (body.lastName !== undefined) { updates.push('last_name = ?'); values.push(body.lastName.trim()); }
  if (body.jerseyNumber !== undefined) { updates.push('jersey_number = ?'); values.push(body.jerseyNumber.trim() || null); }
  if (body.position !== undefined) {
    const normalizePos = (p: string): string | null => {
      const lp = p.toLowerCase().trim();
      if (lp.startsWith('f') || lp === 'c' || lp === 'lw' || lp === 'rw' || lp === 'center' || lp === 'wing') return 'forward';
      if (lp.startsWith('d') || lp === 'ld' || lp === 'rd') return 'defense';
      if (lp.startsWith('g')) return 'goalie';
      return null;
    };
    updates.push('position = ?');
    values.push(body.position ? normalizePos(body.position) : null);
  }
  if (body.shoots !== undefined) { updates.push('shoots = ?'); values.push(body.shoots || null); }
  if (body.dateOfBirth !== undefined) { updates.push('date_of_birth = ?'); values.push(body.dateOfBirth || null); }

  if (updates.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400);

  updates.push("updated_at = datetime('now')");
  values.push(playerId);

  await db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json({ success: true });
});

// ==================
// Set player avatar
// ==================
teamRoutes.put('/players/:playerId/avatar', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const playerId = c.req.param('playerId');
  const body = await c.req.json<{ avatarId: string | null }>();

  const player = await db.prepare('SELECT id, claimed_by FROM players WHERE id = ?').bind(playerId).first<{ id: string; claimed_by: string | null }>();
  if (!player) return c.json({ success: false, error: 'Player not found' }, 404);
  if (player.claimed_by !== user.id) return c.json({ success: false, error: 'You can only set avatars for your own players' }, 403);

  await db.prepare(`UPDATE players SET avatar_id = ?, updated_at = datetime('now') WHERE id = ?`).bind(body.avatarId, playerId).run();

  return c.json({ success: true });
});

// ==================
// Set roster_pending flag on a team
// ==================
teamRoutes.put('/set-roster-pending/:teamId', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const teamId = c.req.param('teamId');
  const body = await c.req.json<{ roster_pending: boolean }>();

  // Verify user owns or coaches this team
  const team = await db.prepare(`
    SELECT t.id FROM teams t
    LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
    WHERE t.id = ? AND (t.created_by = ? OR tc.user_id = ?)
  `).bind(user.id, teamId, user.id, user.id).first();

  if (!team) return c.json({ success: false, error: 'Not authorized' }, 403);

  await db.prepare(`UPDATE teams SET roster_pending = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(body.roster_pending ? 1 : 0, teamId).run();

  return c.json({ success: true });
});

// ==================
// Invite a coach or manager to a team via email
// ==================
teamRoutes.post('/invite-staff/:teamId', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const teamId = c.req.param('teamId');
  const body = await c.req.json<{ name: string; email: string; role: 'coach' | 'manager' }>();

  if (!body.name?.trim() || !body.email?.trim() || !['coach', 'manager'].includes(body.role)) {
    return c.json({ success: false, error: 'name, email, and role (coach/manager) are required' }, 400);
  }

  // Verify user owns, coaches, or manages this team
  const team = await db.prepare(`
    SELECT t.id, t.name, t.invite_code, t.age_group FROM teams t
    LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
    LEFT JOIN team_managers tm ON tm.team_id = t.id AND tm.user_id = ?
    WHERE t.id = ? AND (t.created_by = ? OR tc.user_id = ? OR tm.user_id = ?)
  `).bind(user.id, user.id, teamId, user.id, user.id, user.id).first<{
    id: string; name: string; invite_code: string | null; age_group: string;
  }>();

  if (!team) return c.json({ success: false, error: 'Not authorized' }, 403);

  const email = body.email.trim().toLowerCase();
  const name = body.name.trim();
  const firstName = name.split(' ')[0];
  const lastName = name.split(' ').slice(1).join(' ') || '';

  // Check if user already exists
  const existingUser = await db.prepare(`SELECT id, first_name, last_name FROM users WHERE LOWER(email) = ?`)
    .bind(email).first<{ id: string; first_name: string; last_name: string }>();

  if (existingUser) {
    // Link them directly
    if (body.role === 'coach') {
      await db.prepare(`INSERT OR IGNORE INTO team_coaches (id, team_id, user_id, role) VALUES (?, ?, ?, 'assistant')`)
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingUser.id).run();
    } else {
      await db.prepare(`INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)`)
        .bind(crypto.randomUUID().replace(/-/g, ''), teamId, existingUser.id).run();
    }
    // Add their role
    await db.prepare(`INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)`)
      .bind(crypto.randomUUID().replace(/-/g, ''), existingUser.id, body.role).run();
  }

  // Create invite record
  const inviteId = crypto.randomUUID().replace(/-/g, '');
  const inviteCode = team.invite_code || Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    await db.prepare(`
      INSERT INTO team_invites (id, team_id, email, invited_role, invite_code, status, invited_by)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).bind(inviteId, teamId, email, body.role, inviteCode, user.id).run();
  } catch (e: any) {
    // UNIQUE constraint — already invited
    if (e.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: 'This person has already been invited to this team' }, 409);
    }
    throw e;
  }

  // Send invite email via Resend
  try {
    const inviterName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'A coach';
    const roleLabel = body.role === 'coach' ? 'Coach' : 'Team Manager';
    const siteBase = c.env.SITE_URL || 'https://ultimatetournaments.com';
    const signupUrl = `${siteBase}/signup?invite=${inviteCode}&email=${encodeURIComponent(email)}&role=${body.role}`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.RESEND_API}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ultimate Tournaments <noreply@ultimatetournaments.com>',
        to: [email],
        subject: `You've been invited as ${roleLabel} for ${team.name}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
            <div style="background: linear-gradient(135deg, #003e79, #005599); padding: 25px 30px; border-radius: 16px 16px 0 0; text-align: center;">
              <h1 style="color: white; font-size: 22px; margin: 0;">Ultimate Hockey Tournaments</h1>
            </div>
            <div style="background: white; padding: 30px; border: 1px solid #e8e8ed; border-top: none; border-radius: 0 0 16px 16px;">
              <h2 style="color: #1d1d1f; font-size: 20px; margin-top: 0;">Hi ${firstName}!</h2>
              <p style="color: #6e6e73; font-size: 15px; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${team.name}</strong> (${team.age_group}) as a <strong>${roleLabel}</strong>.
              </p>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${signupUrl}" style="background: #003e79; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
                  ${existingUser ? 'Sign In to Accept' : 'Create Your Account'}
                </a>
              </div>
              <div style="background: #f5f5f7; border-radius: 12px; padding: 16px; text-align: center; margin-top: 20px;">
                <p style="color: #86868b; font-size: 13px; margin: 0 0 6px 0;">Your Team Code</p>
                <p style="color: #003e79; font-size: 28px; font-weight: bold; font-family: monospace; letter-spacing: 4px; margin: 0;">${inviteCode}</p>
              </div>
              <p style="color: #aeaeb2; font-size: 12px; text-align: center; margin-top: 20px;">
                You can also sign up at ultimatetournaments.com and use this team code to join.
              </p>
              <div style="margin-top: 32px; padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
                <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
                <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
              </div>
            </div>
          </div>
        `,
      }),
    });
  } catch (emailErr) {
    console.error('Failed to send invite email:', emailErr);
    // Don't fail the request — invite was created
  }

  return c.json({
    success: true,
    data: {
      inviteId,
      email,
      role: body.role,
      existingUser: !!existingUser,
      emailSent: true,
    }
  });
});

// ==================
// Get teams for current user (coach/manager/org)
// ==================
teamRoutes.get('/my-teams', authMiddleware, async (c) => {
  try {
  const user = c.get('user');
  const db = c.env.DB;

  // Get teams where user is creator, coach, manager, team_member, org owner, OR following
  // NOTE: org.owner_id intentionally excluded — org-owned teams belong in the org dashboard,
  // not the home screen. Including it caused teams to reappear after unfollow.
  const result = await db.prepare(`
    SELECT DISTINCT t.*, o.name as organization_name,
      COALESCE(t.logo_url, o.logo_url) as effective_logo_url,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.team_id = t.id AND r.status IN ('pending', 'approved')) as active_registrations
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    LEFT JOIN team_coaches tc ON tc.team_id = t.id
    LEFT JOIN team_managers tm ON tm.team_id = t.id
    LEFT JOIN team_members tmem ON tmem.team_id = t.id AND tmem.status = 'active'
    LEFT JOIN user_follows uf ON uf.team_id = t.id AND uf.user_id = ?
    LEFT JOIN organization_admins oa ON oa.organization_id = t.organization_id AND oa.user_id = ?
    WHERE t.is_active = 1 AND (t.created_by = ? OR tc.user_id = ? OR tm.user_id = ? OR tmem.user_id = ? OR uf.id IS NOT NULL OR oa.user_id IS NOT NULL)
    ORDER BY t.age_group ASC, t.name ASC
  `).bind(user.id, user.id, user.id, user.id, user.id, user.id).all();

  // Enrich each team with its registered events (from both tables)
  const teams = result.results || [];
  for (const team of teams) {
    const teamEvents: any[] = [];

    // From normalized registrations table (by team_id)
    try {
      const normRegs = await db.prepare(`
        SELECT r.id as reg_id, r.status, r.payment_status, e.id as event_id, e.name as event_name,
          e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url,
          r.hotel_assigned,
          eh.hotel_name as hotel_name, eh.booking_url as hotel_booking_url,
          eh.booking_code as hotel_booking_code, eh.rate_description as hotel_rate,
          eh.price_per_night as hotel_price_per_night, eh.phone as hotel_phone,
          eh.address as hotel_address, eh.city as hotel_city, eh.state as hotel_state
        FROM registrations r
        JOIN events e ON e.id = r.event_id
        LEFT JOIN event_hotels eh ON eh.id = r.hotel_assigned
        WHERE r.team_id = ? AND r.status NOT IN ('withdrawn','denied','rejected')
        ORDER BY e.start_date ASC
      `).bind((team as any).id).all();
      for (const r of (normRegs.results || [])) {
        teamEvents.push(r);
      }
    } catch {}

    // From event_registrations table (by team_name match)
    try {
      const legacyRegs = await db.prepare(`
        SELECT er.id as reg_id, er.status, er.payment_status, e.id as event_id, e.name as event_name,
          e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url,
          er.hotel_assigned,
          eh.hotel_name as hotel_name, eh.booking_url as hotel_booking_url,
          eh.booking_code as hotel_booking_code, eh.rate_description as hotel_rate,
          eh.price_per_night as hotel_price_per_night, eh.phone as hotel_phone,
          eh.address as hotel_address, eh.city as hotel_city, eh.state as hotel_state
        FROM event_registrations er
        JOIN events e ON e.id = er.event_id
        LEFT JOIN event_hotels eh ON eh.id = er.hotel_assigned
        WHERE er.team_name = ? AND er.status NOT IN ('withdrawn','denied','rejected')
        ORDER BY e.start_date ASC
      `).bind((team as any).name).all();
      // Deduplicate by event_id
      const existingEventIds = new Set(teamEvents.map((te: any) => te.event_id));
      for (const r of (legacyRegs.results || [])) {
        if (!existingEventIds.has((r as any).event_id)) {
          teamEvents.push(r);
        }
      }
    } catch {}

    (team as any).registered_events = teamEvents;

    // Enrich with coaches
    try {
      const coachRows = await db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone, tc.role
        FROM users u JOIN team_coaches tc ON tc.user_id = u.id
        WHERE tc.team_id = ?
      `).bind((team as any).id).all();
      (team as any).coaches = coachRows.results || [];
    } catch { (team as any).coaches = []; }

    // Enrich with managers
    try {
      const mgrRows = await db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone
        FROM users u JOIN team_managers tm ON tm.user_id = u.id
        WHERE tm.team_id = ?
      `).bind((team as any).id).all();
      (team as any).managers = mgrRows.results || [];
    } catch { (team as any).managers = []; }

    // Count claimed vs unclaimed players
    try {
      const claimStats = await db.prepare(`
        SELECT
          COUNT(*) as total_players,
          SUM(CASE WHEN p.claimed_by IS NOT NULL THEN 1 ELSE 0 END) as claimed_players
        FROM players p JOIN team_players tp ON tp.player_id = p.id
        WHERE tp.team_id = ? AND tp.status = 'active'
      `).bind((team as any).id).first<{ total_players: number; claimed_players: number }>();
      (team as any).claimed_players = claimStats?.claimed_players || 0;
      (team as any).total_players = claimStats?.total_players || 0;
    } catch {
      (team as any).claimed_players = 0;
      (team as any).total_players = 0;
    }
  }

  return c.json({ success: true, data: teams });
  } catch (err: any) {
    return c.json({ error: 'my-teams failed', detail: err?.message || String(err) }, 500);
  }
});

// ==================
// PUBLIC: Get team roster by share token (NO auth required)
// ==================
teamRoutes.get('/roster/share/:token', async (c) => {
  const token = c.req.param('token');
  const db = c.env.DB;

  const team = await db.prepare(`
    SELECT t.id, t.name, t.age_group, t.division_level, t.city, t.state,
           t.head_coach_name, o.name as org_name
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.roster_share_token = ? AND t.is_active = 1
  `).bind(token).first<{
    id: string; name: string; age_group: string; division_level: string | null;
    city: string | null; state: string | null; head_coach_name: string | null;
    org_name: string | null;
  }>();

  if (!team) {
    return c.json({ success: false, error: 'Team not found or link is invalid' }, 404);
  }

  const players = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position,
           p.shoots, p.usa_hockey_number, p.claimed_by, p.parent_name, p.parent_email, p.avatar_id
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ? AND tp.status = 'active'
    ORDER BY CAST(COALESCE(NULLIF(p.jersey_number, ''), '999') AS INTEGER), p.last_name
  `).bind(team.id).all<{
    id: string; first_name: string; last_name: string; jersey_number: string | null;
    position: string | null; shoots: string | null; usa_hockey_number: string | null;
    claimed_by: string | null; parent_name: string | null; parent_email: string | null;
    avatar_id: string | null;
  }>();

  return c.json({
    success: true,
    data: {
      team: {
        id: team.id, name: team.name, ageGroup: team.age_group,
        divisionLevel: team.division_level, city: team.city, state: team.state,
        headCoachName: team.head_coach_name, orgName: team.org_name,
      },
      players: (players.results || []).map(p => ({
        id: p.id, firstName: p.first_name, lastName: p.last_name,
        jerseyNumber: p.jersey_number, position: p.position, shoots: p.shoots,
        usaHockeyNumber: p.usa_hockey_number, claimed: !!p.claimed_by,
        parentName: p.parent_name,
        parentEmail: p.claimed_by && p.parent_email
          ? p.parent_email.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
        avatarId: p.avatar_id,
      })),
    },
  });
});

// ==================
// PUBLIC: Claim a player on the roster (creates parent account)
// ==================
teamRoutes.post('/roster/share/:token/claim', async (c) => {
  const token = c.req.param('token');
  const db = c.env.DB;
  const body = await c.req.json<{
    playerId: string; parentFirstName: string; parentLastName: string;
    email: string; phone: string;
  }>();

  if (!body.playerId || !body.parentFirstName || !body.parentLastName || !body.email) {
    return c.json({ success: false, error: 'Player ID, parent name, and email are required' }, 400);
  }

  const team = await db.prepare(`
    SELECT id, name FROM teams WHERE roster_share_token = ? AND is_active = 1
  `).bind(token).first<{ id: string; name: string }>();
  if (!team) return c.json({ success: false, error: 'Invalid roster link' }, 404);

  const player = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.claimed_by
    FROM players p JOIN team_players tp ON tp.player_id = p.id
    WHERE p.id = ? AND tp.team_id = ? AND tp.status = 'active'
  `).bind(body.playerId, team.id).first<{
    id: string; first_name: string; last_name: string; claimed_by: string | null;
  }>();
  if (!player) return c.json({ success: false, error: 'Player not found on this team' }, 404);
  if (player.claimed_by) return c.json({ success: false, error: 'This player has already been claimed by another parent' }, 409);

  const email = body.email.toLowerCase().trim();
  const parentName = `${body.parentFirstName.trim()} ${body.parentLastName.trim()}`;

  let userId: string;
  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();

  if (existingUser) {
    userId = existingUser.id;
    try { await db.prepare(`INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'parent')`).bind(crypto.randomUUID().replace(/-/g, ''), userId).run(); } catch {}
    if (body.phone) await db.prepare(`UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?`).bind(body.phone, userId).run();
  } else {
    userId = crypto.randomUUID().replace(/-/g, '');
    const dummyHash = await (async () => {
      const data = new TextEncoder().encode(crypto.randomUUID());
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    })();
    await db.prepare(`INSERT INTO users (id, email, password_hash, first_name, last_name, phone, email_verified) VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .bind(userId, email, dummyHash, body.parentFirstName.trim(), body.parentLastName.trim(), body.phone || null).run();
    await db.prepare(`INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'parent')`)
      .bind(crypto.randomUUID().replace(/-/g, ''), userId, 'parent').run();
  }

  await db.prepare(`UPDATE players SET claimed_by = ?, parent_name = ?, parent_email = ?, parent_phone = ? WHERE id = ?`)
    .bind(userId, parentName, email, body.phone || null, body.playerId).run();

  try {
    const memberId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via) VALUES (?, ?, ?, 'parent', 'active', 'roster_claim')`)
      .bind(memberId, team.id, userId).run();
  } catch {}

  return c.json({ success: true, data: {
    playerId: body.playerId, playerName: `${player.first_name} ${player.last_name}`,
    parentName, email, teamName: team.name,
  }});
});

// ==================
// PUBLIC: Register a NEW player not on roster (creates parent account + player)
// ==================
teamRoutes.post('/roster/share/:token/register', async (c) => {
  const token = c.req.param('token');
  const db = c.env.DB;
  const body = await c.req.json<{
    playerFirstName: string; playerLastName: string; jerseyNumber?: string; position?: string;
    parentFirstName: string; parentLastName: string; email: string; phone: string;
  }>();

  if (!body.playerFirstName || !body.playerLastName || !body.parentFirstName || !body.parentLastName || !body.email) {
    return c.json({ success: false, error: 'Player name, parent name, and email are required' }, 400);
  }

  const team = await db.prepare(`SELECT id, name FROM teams WHERE roster_share_token = ? AND is_active = 1`)
    .bind(token).first<{ id: string; name: string }>();
  if (!team) return c.json({ success: false, error: 'Invalid roster link' }, 404);

  const email = body.email.toLowerCase().trim();
  const parentName = `${body.parentFirstName.trim()} ${body.parentLastName.trim()}`;

  let userId: string;
  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (existingUser) {
    userId = existingUser.id;
    try { await db.prepare(`INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'parent')`).bind(crypto.randomUUID().replace(/-/g, ''), userId).run(); } catch {}
    if (body.phone) await db.prepare(`UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?`).bind(body.phone, userId).run();
  } else {
    userId = crypto.randomUUID().replace(/-/g, '');
    const dummyHash = await (async () => {
      const data = new TextEncoder().encode(crypto.randomUUID());
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    })();
    await db.prepare(`INSERT INTO users (id, email, password_hash, first_name, last_name, phone, email_verified) VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .bind(userId, email, dummyHash, body.parentFirstName.trim(), body.parentLastName.trim(), body.phone || null).run();
    await db.prepare(`INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'parent')`)
      .bind(crypto.randomUUID().replace(/-/g, ''), userId, 'parent').run();
  }

  const playerId = crypto.randomUUID().replace(/-/g, '');
  const normalizePos = (p?: string): string | null => {
    if (!p) return null;
    const lp = p.toLowerCase().trim();
    if (lp.startsWith('f') || lp === 'c' || lp === 'lw' || lp === 'rw') return 'forward';
    if (lp.startsWith('d') || lp === 'ld' || lp === 'rd') return 'defense';
    if (lp.startsWith('g')) return 'goalie';
    return null;
  };

  await db.prepare(`INSERT INTO players (id, first_name, last_name, jersey_number, position, claimed_by, parent_name, parent_email, parent_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(playerId, body.playerFirstName.trim(), body.playerLastName.trim(), body.jerseyNumber || null, normalizePos(body.position), userId, parentName, email, body.phone || null).run();

  const tpId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`INSERT INTO team_players (id, team_id, player_id, status) VALUES (?, ?, ?, 'active')`)
    .bind(tpId, team.id, playerId).run();

  try {
    const memberId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via) VALUES (?, ?, ?, 'parent', 'active', 'roster_register')`)
      .bind(memberId, team.id, userId).run();
  } catch {}

  return c.json({ success: true, data: {
    playerId, playerName: `${body.playerFirstName.trim()} ${body.playerLastName.trim()}`,
    parentName, email, teamName: team.name,
  }});
});

// ==================
// Get single team with roster
// ==================
// ==================
// Get discount/coupon codes for logged-in user
// ==================
teamRoutes.get('/my-discount-codes', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  // Get user email
  const userRecord = await db.prepare('SELECT email FROM users WHERE id = ?').bind(user.id).first<{ email: string }>();
  const userEmail = userRecord?.email || '';

  if (!userEmail) {
    return c.json({ success: true, data: [] });
  }

  // Ensure discount_codes table exists
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      registration_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      team_id TEXT,
      event_id TEXT NOT NULL,
      email TEXT NOT NULL,
      discount_local_cents INTEGER NOT NULL DEFAULT 10000,
      discount_hotel_cents INTEGER NOT NULL DEFAULT 20000,
      is_used INTEGER NOT NULL DEFAULT 0,
      used_registration_id TEXT,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch {}

  const codes = await db.prepare(`
    SELECT dc.id, dc.code, dc.team_name, dc.age_group, dc.event_id, dc.discount_local_cents,
      dc.discount_hotel_cents, dc.is_used, dc.used_at, dc.created_at,
      e.name as event_name, e.city as event_city, e.state as event_state,
      e.start_date as event_start_date
    FROM discount_codes dc
    LEFT JOIN events e ON e.id = dc.event_id
    WHERE dc.email = ?
    ORDER BY dc.created_at DESC
  `).bind(userEmail).all();

  return c.json({ success: true, data: codes.results || [] });
});

// ==================
// Get team by ID
// ==================
teamRoutes.get('/:id', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;

  const team = await db.prepare(`
    SELECT t.*, o.name as organization_name
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ?
  `).bind(teamId).first();

  if (!team) {
    return c.json({ success: false, error: 'Team not found' }, 404);
  }

  // Get players
  const players = await db.prepare(`
    SELECT p.*, tp.status, tp.added_at
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ?
    ORDER BY p.last_name ASC
  `).bind(teamId).all();

  // Get coaches
  const coaches = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone, tc.role
    FROM users u
    JOIN team_coaches tc ON tc.user_id = u.id
    WHERE tc.team_id = ?
  `).bind(teamId).all();

  // Get managers
  const managers = await db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone
    FROM users u
    JOIN team_managers tm ON tm.user_id = u.id
    WHERE tm.team_id = ?
  `).bind(teamId).all();

  // Get registration history
  const registrations = await db.prepare(`
    SELECT r.*, e.name as event_name, e.start_date, e.end_date, ed.age_group, ed.division_level
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE r.team_id = ?
    ORDER BY e.start_date DESC
  `).bind(teamId).all();

  return c.json({
    success: true,
    data: {
      ...team,
      players: players.results,
      coaches: coaches.results,
      managers: managers.results,
      registrations: registrations.results,
    },
  });
});

// ==================
// Get team's registered events (for mobile TeamDetailScreen)
// ==================
teamRoutes.get('/:id/events', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;

  const teamEvents: any[] = [];

  // From normalized registrations table (by team_id)
  try {
    const normRegs = await db.prepare(`
      SELECT r.id as reg_id, r.status, r.payment_status, e.id as event_id, e.name as event_name,
        e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.team_id = ? AND r.status NOT IN ('withdrawn','denied','rejected')
      ORDER BY e.start_date ASC
    `).bind(teamId).all();
    for (const r of (normRegs.results || [])) {
      teamEvents.push(r);
    }
  } catch {}

  // From event_registrations table (by team_id OR team_name fallback)
  try {
    // Get team name for fallback matching
    const team = await db.prepare('SELECT name FROM teams WHERE id = ?').bind(teamId).first<any>();
    const teamName = team?.name;

    let erQuery = `
      SELECT er.id as reg_id, er.status, er.payment_status, e.id as event_id, e.name as event_name,
        e.slug, e.city, e.state, e.start_date, e.end_date, e.logo_url
      FROM event_registrations er
      JOIN events e ON e.id = er.event_id
      WHERE (er.team_id = ?${teamName ? ' OR er.team_name = ?' : ''}) AND er.status NOT IN ('withdrawn','denied','rejected')
      ORDER BY e.start_date ASC
    `;

    const bindings = teamName ? [teamId, teamName] : [teamId];
    const legacyRegs = await db.prepare(erQuery).bind(...bindings).all();

    // Deduplicate by event_id
    const existingEventIds = new Set(teamEvents.map((te: any) => te.event_id));
    for (const r of (legacyRegs.results || [])) {
      if (!existingEventIds.has((r as any).event_id)) {
        teamEvents.push(r);
      }
    }
  } catch {}

  return c.json({ success: true, data: teamEvents });
});

// ==================
// Check for duplicate teams before creation
// ==================
teamRoutes.get('/check-duplicate', async (c) => {
  const db = c.env.DB;
  const name = c.req.query('name')?.trim();
  const ageGroup = c.req.query('ageGroup')?.trim();

  if (!name || !ageGroup) {
    return c.json({ success: true, duplicates: [] });
  }

  // Search for teams with similar names and matching age group
  // Use LIKE for fuzzy matching (handles slight variations)
  const results = await db.prepare(`
    SELECT t.id, t.name, t.age_group, t.city, t.state, t.invite_code,
      t.head_coach_name, t.head_coach_email, t.created_by,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count,
      (SELECT COUNT(*) FROM event_registrations er WHERE er.team_name = t.name AND er.status NOT IN ('denied','withdrawn')) as reg_count
    FROM teams t
    WHERE LOWER(t.name) = LOWER(?) AND LOWER(t.age_group) = LOWER(?)
    AND t.is_active = 1
    ORDER BY t.created_at DESC
    LIMIT 5
  `).bind(name, ageGroup).all();

  // Also check for close matches (same name, different age group)
  const similarResults = await db.prepare(`
    SELECT t.id, t.name, t.age_group, t.city, t.state, t.invite_code,
      t.head_coach_name, t.created_by
    FROM teams t
    WHERE LOWER(t.name) = LOWER(?) AND LOWER(t.age_group) != LOWER(?)
    AND t.is_active = 1
    ORDER BY t.age_group ASC
    LIMIT 5
  `).bind(name, ageGroup).all();

  return c.json({
    success: true,
    exactMatches: results.results || [],
    similarMatches: similarResults.results || [],
    hasDuplicates: (results.results?.length || 0) > 0,
  });
});

// ==================
// Create team (full — with coach/manager/league info)
// ==================
const createTeamSchema = z.object({
  name: z.string().min(1),
  ageGroup: z.string(),
  divisionLevel: z.string().optional(),
  organizationId: z.string().optional(),
  usaHockeyTeamId: z.string().optional(),
  usaHockeyRosterUrl: z.string().optional(),
  mhrUrl: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  website: z.string().optional(),
  hometownLeague: z.string().optional(),
  teamType: z.string().optional(),
  seasonRecord: z.string().optional(),
  headCoachName: z.string().optional(),
  headCoachEmail: z.string().optional(),
  headCoachPhone: z.string().optional(),
  managerName: z.string().optional(),
  managerEmail: z.string().optional(),
  managerPhone: z.string().optional(),
  skipDuplicateCheck: z.boolean().optional(),
});

teamRoutes.post('/', authMiddleware, zValidator('json', createTeamSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Duplicate team prevention — DISABLED for launch (was blocking coaches from creating teams)
  // Teams with same name + age group are allowed; coaches know their own team names
  // TODO: Re-enable as a non-blocking warning after launch

  const teamId = crypto.randomUUID().replace(/-/g, '');

  // Generate a short invite code for the team (6 chars, uppercase alphanumeric)
  const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let inviteCode = '';
  const randBytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) inviteCode += codeChars[randBytes[i] % codeChars.length];

  // Generate a separate parent invite code (6 chars, different from coach code)
  let parentInviteCode = '';
  const parentRandBytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) parentInviteCode += codeChars[parentRandBytes[i] % codeChars.length];
  // Ensure parent code differs from coach code
  if (parentInviteCode === inviteCode) {
    const extraBytes = crypto.getRandomValues(new Uint8Array(6));
    parentInviteCode = '';
    for (let i = 0; i < 6; i++) parentInviteCode += codeChars[extraBytes[i] % codeChars.length];
  }

  // Generate a roster share token (URL-safe, 12 chars) for parent/player claim link
  const tokenChars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let rosterShareToken = '';
  const tokenRandBytes = crypto.getRandomValues(new Uint8Array(12));
  for (let i = 0; i < 12; i++) rosterShareToken += tokenChars[tokenRandBytes[i] % tokenChars.length];

  // Resolve user from auth middleware
  const authUser = c.get('user') as { id: string; email: string; roles: string[] } | undefined;
  const createdByUserId = authUser?.id || null;
  const creatorEmail = authUser?.email || null;
  const roles = authUser?.roles || [];
  const creatorRole = roles.includes('coach') ? 'coach' : roles.includes('manager') ? 'manager' : 'coach';

  await db.prepare(`
    INSERT INTO teams (id, organization_id, name, age_group, division_level,
      usa_hockey_team_id, usa_hockey_roster_url, mhr_url, city, state,
      website, hometown_league, team_type, season_record,
      head_coach_name, head_coach_email, head_coach_phone,
      manager_name, manager_email, manager_phone, created_by, invite_code, parent_invite_code, roster_share_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    teamId, data.organizationId || null, data.name, data.ageGroup,
    data.divisionLevel || null, data.usaHockeyTeamId || null,
    data.usaHockeyRosterUrl || null, data.mhrUrl || null, data.city || null, data.state || null,
    data.website || null, data.hometownLeague || null,
    data.teamType || null, data.seasonRecord || null,
    data.headCoachName || null, data.headCoachEmail || null, data.headCoachPhone || null,
    data.managerName || null, data.managerEmail || null, data.managerPhone || null,
    createdByUserId, inviteCode, parentInviteCode, rosterShareToken
  ).run();

  // Link creator as coach + manager + team_member
  if (createdByUserId) {
    try {
      // Add to team_coaches so team shows in /my-teams coach query
      const coachLinkId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT OR IGNORE INTO team_coaches (team_id, user_id, role)
        VALUES (?, ?, 'head_coach')
      `).bind(teamId, createdByUserId).run();

      // Legacy junction table (team_managers)
      const linkId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO team_managers (id, team_id, user_id)
        VALUES (?, ?, ?)
      `).bind(linkId, teamId, createdByUserId).run();

      // New team_members table
      const memberId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via)
        VALUES (?, ?, ?, ?, 'active', 'creator')
      `).bind(memberId, teamId, createdByUserId, creatorRole || 'coach').run();
    } catch {}
  }

  // Auto-invite: if coach email is provided and differs from creator, invite them
  const coachEmail = data.headCoachEmail?.toLowerCase()?.trim();
  if (coachEmail && coachEmail !== creatorEmail?.toLowerCase()) {
    try {
      // Check if they already have an account
      const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(coachEmail).first<{ id: string }>();

      if (existingUser) {
        // DISABLED for launch — auto-linking adds teams to other users' accounts without consent
        // They can join via invite code instead
        console.log(`Skipping auto-link for existing coach user ${existingUser.id} — they can join via invite code`);
      }
      // Always create invite (whether user exists or not)
      {
        // Create invite record
        const invId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`
          INSERT OR IGNORE INTO team_invites (id, team_id, email, phone, invited_role, invite_code, status, invited_by)
          VALUES (?, ?, ?, ?, 'coach', ?, 'pending', ?)
        `).bind(invId, teamId, coachEmail, data.headCoachPhone || null, inviteCode, createdByUserId).run();

        // Send invite email
        if (c.env.RESEND_API) {
          const siteBase = c.env.SITE_URL || 'https://ultimatetournaments.com';
          const signupUrl = existingUser
            ? `${siteBase}/login?redirect=${encodeURIComponent('/dashboard/coach/teams')}`
            : `${siteBase}/signup?invite=${inviteCode}&email=${encodeURIComponent(coachEmail)}&role=coach`;
          const ctaLabel = existingUser ? 'Sign In to Accept' : `Join ${data.name}`;
          const introCopy = existingUser
            ? 'You already have a UHT account — sign in, then use the team code below under My Teams &rarr; Join a Team to accept.'
            : 'Create your account to manage your team, view schedules, and register for events.';
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Ultimate Tournaments <registration@ultimatetournaments.com>',
                to: [coachEmail],
                subject: `You've been invited to join ${data.name} on Ultimate Tournaments`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                    <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="UHT" width="140" style="width: 140px; height: auto; margin-bottom: 24px;" />
                    <h2 style="color: #1d1d1f; margin-bottom: 8px;">You've been invited!</h2>
                    <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
                      You've been added as a <strong>Head Coach</strong> for <strong>${data.name}</strong>${data.name.includes(data.ageGroup) ? '' : ` (${data.ageGroup})`} on Ultimate Tournaments.
                    </p>
                    <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
                      ${introCopy}
                    </p>
                    <a href="${signupUrl}" style="display: inline-block; background: #003e79; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 24px 0;">
                      ${ctaLabel}
                    </a>
                    <p style="color: #aeaeb2; font-size: 13px; margin-top: 24px;">
                      Or use team code <strong>${inviteCode}</strong> to join from the dashboard.
                    </p>
                    <div style="margin-top: 32px; padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                      <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
                      <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
                      <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
                    </div>
                  </div>
                `,
              }),
            });
          } catch (err: any) {
            console.error('Resend invite (coach) error:', err?.message || String(err));
          }
        }
      }
    } catch (err: any) {
      console.error('Auto-invite coach error:', err?.message || String(err));
    }
  }

  // Auto-invite: if manager email is provided and differs from creator, invite them
  const mgrEmail = data.managerEmail?.toLowerCase()?.trim();
  if (mgrEmail && mgrEmail !== creatorEmail?.toLowerCase() && mgrEmail !== coachEmail) {
    try {
      const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(mgrEmail).first<{ id: string }>();

      if (existingUser) {
        // DISABLED for launch — auto-linking adds teams to other users' accounts without consent
        console.log(`Skipping auto-link for existing manager user ${existingUser.id} — they can join via invite code`);
      }
      // Always create invite (whether user exists or not)
      {
        const invId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`
          INSERT OR IGNORE INTO team_invites (id, team_id, email, phone, invited_role, invite_code, status, invited_by)
          VALUES (?, ?, ?, ?, 'manager', ?, 'pending', ?)
        `).bind(invId, teamId, mgrEmail, data.managerPhone || null, inviteCode, createdByUserId).run();

        if (c.env.RESEND_API) {
          const siteBase = c.env.SITE_URL || 'https://ultimatetournaments.com';
          const signupUrl = existingUser
            ? `${siteBase}/login?redirect=${encodeURIComponent('/dashboard/manager/teams')}`
            : `${siteBase}/signup?invite=${inviteCode}&email=${encodeURIComponent(mgrEmail)}&role=manager`;
          const ctaLabel = existingUser ? 'Sign In to Accept' : `Join ${data.name}`;
          const introCopy = existingUser
            ? 'You already have a UHT account — sign in, then use the team code below under My Teams &rarr; Join a Team to accept.'
            : 'Create your account to manage your team, view schedules, and register for events.';
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Ultimate Tournaments <registration@ultimatetournaments.com>',
                to: [mgrEmail],
                subject: `You've been invited to join ${data.name} on Ultimate Tournaments`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                    <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="UHT" width="140" style="width: 140px; height: auto; margin-bottom: 24px;" />
                    <h2 style="color: #1d1d1f; margin-bottom: 8px;">You've been invited!</h2>
                    <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
                      You've been added as a <strong>Team Manager</strong> for <strong>${data.name}</strong>${data.name.includes(data.ageGroup) ? '' : ` (${data.ageGroup})`} on Ultimate Tournaments.
                    </p>
                    <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
                      ${introCopy}
                    </p>
                    <a href="${signupUrl}" style="display: inline-block; background: #003e79; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 24px 0;">
                      ${ctaLabel}
                    </a>
                    <p style="color: #aeaeb2; font-size: 13px; margin-top: 24px;">
                      Or use team code <strong>${inviteCode}</strong> to join from the dashboard.
                    </p>
                    <div style="margin-top: 32px; padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                      <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
                      <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
                      <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
                    </div>
                  </div>
                `,
              }),
            });
          } catch (err: any) {
            console.error('Resend invite (manager) error:', err?.message || String(err));
          }
        }
      }
    } catch (err: any) {
      console.error('Auto-invite manager error:', err?.message || String(err));
    }
  }

  return c.json({ success: true, data: { id: teamId, inviteCode, rosterShareToken } }, 201);
});

// ==================
// Scrape roster from USA Hockey URL
// ==================
teamRoutes.post('/:id/import-roster', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json<{ url?: string; pastedData?: string }>();

  // Verify team exists and user has access
  const user = c.get('user');
  const team = await db.prepare('SELECT id, created_by FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) return c.json({ success: false, error: 'Team not found' }, 404);

  let players: Array<{
    firstName: string; lastName: string; jerseyNumber?: string;
    position?: string; shoots?: string; dateOfBirth?: string;
    usaHockeyNumber?: string;
  }> = [];

  // Strategy 1: Scrape from URL
  if (body.url) {
    try {
      const resp = await fetch(body.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!resp.ok) {
        return c.json({ success: false, error: `Could not fetch URL (HTTP ${resp.status}). The page may require login. Try pasting your roster data instead.` }, 400);
      }
      const html = await resp.text();

      // Try to parse roster from HTML tables
      // Look for table rows with player-like data (jersey #, name, position)
      const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();

      const rows: string[][] = [];
      let rowMatch;
      while ((rowMatch = tableRowRegex.exec(html)) !== null) {
        const cells: string[] = [];
        let cellMatch;
        const rowHtml = rowMatch[1];
        const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
          cells.push(stripTags(cellMatch[1]));
        }
        if (cells.length >= 2) rows.push(cells);
      }

      // Detect which columns contain what based on header row or data patterns
      if (rows.length > 1) {
        // Try to find header row
        const headerRow = rows[0].map(h => h.toLowerCase());
        let nameCol = -1, jerseyCol = -1, posCol = -1, dobCol = -1, numCol = -1;

        for (let i = 0; i < headerRow.length; i++) {
          const h = headerRow[i];
          if (h.includes('name') || h.includes('player')) nameCol = i;
          else if (h.includes('jersey') || h === '#' || h === 'no' || h === 'number') jerseyCol = i;
          else if (h.includes('pos')) posCol = i;
          else if (h.includes('birth') || h.includes('dob') || h.includes('date')) dobCol = i;
          else if (h.includes('usa') || h.includes('reg') || h.includes('member')) numCol = i;
        }

        // If no header detected, guess by patterns
        if (nameCol === -1 && rows.length > 2) {
          for (let i = 0; i < rows[1].length; i++) {
            const val = rows[1][i];
            if (/^[A-Za-z]+(,?\s+[A-Za-z]+)+$/.test(val) && nameCol === -1) nameCol = i;
            else if (/^\d{1,2}$/.test(val) && jerseyCol === -1) jerseyCol = i;
            else if (/^(F|D|G|C|LW|RW|LD|RD|forward|defense|goalie)/i.test(val) && posCol === -1) posCol = i;
          }
        }

        // Parse data rows (skip header)
        const startRow = (nameCol !== -1 || jerseyCol !== -1) ? 1 : 0;
        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          let firstName = '', lastName = '';

          if (nameCol !== -1 && row[nameCol]) {
            const name = row[nameCol].trim();
            // Handle "Last, First" or "First Last"
            if (name.includes(',')) {
              const parts = name.split(',').map(s => s.trim());
              lastName = parts[0];
              firstName = parts[1] || '';
            } else {
              const parts = name.split(/\s+/);
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
            }
          }

          if (!firstName && !lastName) continue;

          const normalizePos = (p: string): string | undefined => {
            if (!p) return undefined;
            const lp = p.toLowerCase().trim();
            if (lp.startsWith('f') || lp === 'c' || lp === 'lw' || lp === 'rw') return 'forward';
            if (lp.startsWith('d') || lp === 'ld' || lp === 'rd') return 'defense';
            if (lp.startsWith('g')) return 'goalie';
            return undefined;
          };

          players.push({
            firstName,
            lastName,
            jerseyNumber: jerseyCol !== -1 ? row[jerseyCol]?.trim() || undefined : undefined,
            position: posCol !== -1 ? normalizePos(row[posCol]) : undefined,
            dateOfBirth: dobCol !== -1 ? row[dobCol]?.trim() || undefined : undefined,
            usaHockeyNumber: numCol !== -1 ? row[numCol]?.trim() || undefined : undefined,
          });
        }
      }

      if (players.length === 0) {
        return c.json({
          success: false,
          error: 'Could not find roster data on that page. The page may be JavaScript-rendered or require login. Try pasting your roster data instead.',
        }, 400);
      }
    } catch (e: any) {
      return c.json({
        success: false,
        error: `Failed to fetch URL: ${e.message}. Try pasting your roster data instead.`,
      }, 400);
    }
  }

  // Strategy 2: Parse pasted text data
  if (body.pastedData && players.length === 0) {
    const lines = body.pastedData.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Try tab-separated or comma-separated
      let parts = line.includes('\t') ? line.split('\t') : line.split(',');
      parts = parts.map(p => p.trim()).filter(Boolean);

      if (parts.length === 0) continue;

      // Try to parse each line
      let firstName = '', lastName = '', jerseyNumber: string | undefined;
      let position: string | undefined;

      // Check if first part is a number (jersey)
      if (/^\d{1,2}$/.test(parts[0])) {
        jerseyNumber = parts[0];
        parts = parts.slice(1);
      }

      // Name handling
      if (parts.length >= 1) {
        const name = parts[0];
        if (name.includes(',')) {
          const np = name.split(',').map(s => s.trim());
          lastName = np[0];
          firstName = np[1] || '';
        } else {
          const np = name.split(/\s+/);
          if (parts.length === 1 && np.length >= 2) {
            firstName = np[0];
            lastName = np.slice(1).join(' ');
          } else if (parts.length >= 2) {
            firstName = parts[0];
            lastName = parts[1];
          } else {
            firstName = np[0];
          }
        }
      }

      // Position from remaining parts
      if (parts.length >= 3) {
        const posStr = parts[2]?.toLowerCase();
        if (posStr && (posStr.startsWith('f') || posStr === 'c' || posStr === 'lw' || posStr === 'rw')) position = 'forward';
        else if (posStr && (posStr.startsWith('d') || posStr === 'ld' || posStr === 'rd')) position = 'defense';
        else if (posStr && posStr.startsWith('g')) position = 'goalie';
      }

      // Jersey from later parts if not found
      if (!jerseyNumber && parts.length >= 3) {
        for (let i = 2; i < parts.length; i++) {
          if (/^\d{1,2}$/.test(parts[i])) { jerseyNumber = parts[i]; break; }
        }
      }

      if (firstName || lastName) {
        players.push({ firstName, lastName, jerseyNumber, position });
      }
    }
  }

  if (players.length === 0) {
    return c.json({ success: false, error: 'No player data found. Please provide a URL or paste roster data.' }, 400);
  }

  // Insert players into DB and link to team
  let added = 0;
  const addedPlayers: any[] = [];

  for (const p of players) {
    if (!p.firstName && !p.lastName) continue;

    // Check if player already on this team (by name match)
    const existing = await db.prepare(`
      SELECT p.id FROM players p
      JOIN team_players tp ON tp.player_id = p.id
      WHERE tp.team_id = ? AND tp.status = 'active'
        AND LOWER(p.first_name) = LOWER(?) AND LOWER(p.last_name) = LOWER(?)
    `).bind(teamId, p.firstName, p.lastName).first();

    if (existing) continue; // Skip duplicates

    const playerId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO players (id, first_name, last_name, date_of_birth, usa_hockey_number, jersey_number, position, shoots)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      playerId, p.firstName, p.lastName, p.dateOfBirth || null,
      p.usaHockeyNumber || null, p.jerseyNumber || null,
      p.position || null, p.shoots || null
    ).run();

    await db.prepare(`
      INSERT INTO team_players (id, team_id, player_id, status)
      VALUES (?, ?, ?, 'active')
    `).bind(crypto.randomUUID().replace(/-/g, ''), teamId, playerId).run();

    addedPlayers.push({ id: playerId, ...p });
    added++;
  }

  return c.json({ success: true, data: { added, players: addedPlayers, total_parsed: players.length } });
});

// ==================
// Bulk add players to team (from manual entry form)
// ==================
teamRoutes.post('/:id/players/bulk', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;
  const body = await c.req.json<{ players: Array<{
    firstName: string; lastName: string; jerseyNumber?: string;
    awayJerseyNumber?: string; position?: string; shoots?: string;
    dateOfBirth?: string; usaHockeyNumber?: string;
  }> }>();

  if (!body.players?.length) {
    return c.json({ success: false, error: 'No players provided' }, 400);
  }

  let added = 0;
  const addedPlayers: any[] = [];

  for (const p of body.players) {
    if (!p.firstName?.trim() && !p.lastName?.trim()) continue;

    // Check duplicate
    const existing = await db.prepare(`
      SELECT p.id FROM players p
      JOIN team_players tp ON tp.player_id = p.id
      WHERE tp.team_id = ? AND tp.status = 'active'
        AND LOWER(p.first_name) = LOWER(?) AND LOWER(p.last_name) = LOWER(?)
    `).bind(teamId, p.firstName.trim(), p.lastName.trim()).first();

    if (existing) continue;

    const playerId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO players (id, first_name, last_name, date_of_birth, usa_hockey_number, jersey_number, away_jersey_number, position, shoots)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      playerId, p.firstName.trim(), p.lastName.trim(), p.dateOfBirth || null,
      p.usaHockeyNumber || null, p.jerseyNumber || null, p.awayJerseyNumber || null,
      p.position || null, p.shoots || null
    ).run();

    await db.prepare(`
      INSERT INTO team_players (id, team_id, player_id, status)
      VALUES (?, ?, ?, 'active')
    `).bind(crypto.randomUUID().replace(/-/g, ''), teamId, playerId).run();

    addedPlayers.push({ id: playerId, ...p });
    added++;
  }

  return c.json({ success: true, data: { added, players: addedPlayers } });
});

// ==================
// Update a player's details
// ==================
teamRoutes.patch('/:teamId/players/:playerId', authMiddleware, async (c) => {
  const { teamId, playerId } = c.req.param();
  const db = c.env.DB;
  const body = await c.req.json();

  const fields: string[] = [];
  const vals: any[] = [];
  const allowed = ['first_name', 'last_name', 'jersey_number', 'position', 'shoots', 'date_of_birth', 'usa_hockey_number'];

  for (const f of allowed) {
    if (body[f] !== undefined) {
      fields.push(`${f} = ?`);
      vals.push(body[f]);
    }
  }
  // Also accept camelCase keys
  const camelMap: Record<string, string> = {
    firstName: 'first_name', lastName: 'last_name', jerseyNumber: 'jersey_number',
    dateOfBirth: 'date_of_birth', usaHockeyNumber: 'usa_hockey_number',
  };
  for (const [camel, snake] of Object.entries(camelMap)) {
    if (body[camel] !== undefined && !vals.includes(body[camel])) {
      fields.push(`${snake} = ?`);
      vals.push(body[camel]);
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  vals.push(playerId);
  await db.prepare(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ success: true });
});

// ==================
// Get team roster (for coach/manager dashboard)
// ==================
teamRoutes.get('/:id/roster', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;

  const players = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.usa_hockey_number,
           p.jersey_number, p.away_jersey_number, p.position, p.shoots, p.avatar_id,
           p.claimed_by, p.parent_name, p.parent_email, p.parent_phone,
           tp.status as roster_status, tp.added_at
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ? AND tp.status IN ('active', 'rostered')
    ORDER BY CAST(COALESCE(p.jersey_number, '999') AS INTEGER), p.last_name ASC
  `).bind(teamId).all();

  return c.json({ success: true, data: players.results, count: players.results.length });
});

// ==================
// Add player to team
// ==================
const addPlayerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  usaHockeyNumber: z.string().optional(),
  jerseyNumber: z.string().optional(),
  awayJerseyNumber: z.string().optional(),
  position: z.enum(['forward', 'defense', 'goalie']).optional(),
  shoots: z.enum(['left', 'right']).optional(),
});

teamRoutes.post('/:id/players', authMiddleware, zValidator('json', addPlayerSchema), async (c) => {
  const teamId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check duplicate
  const existing = await db.prepare(`
    SELECT p.id FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ? AND tp.status = 'active'
      AND LOWER(p.first_name) = LOWER(?) AND LOWER(p.last_name) = LOWER(?)
  `).bind(teamId, data.firstName, data.lastName).first();

  if (existing) {
    return c.json({ success: false, error: 'Player already on this team' }, 409);
  }

  const playerId = crypto.randomUUID().replace(/-/g, '');

  // Create player
  await db.prepare(`
    INSERT INTO players (id, first_name, last_name, date_of_birth, usa_hockey_number, jersey_number, away_jersey_number, position, shoots)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    playerId, data.firstName, data.lastName, data.dateOfBirth || null,
    data.usaHockeyNumber || null, data.jerseyNumber || null, data.awayJerseyNumber || null,
    data.position || null, data.shoots || null
  ).run();

  // Link to team
  await db.prepare(`
    INSERT INTO team_players (id, team_id, player_id, status)
    VALUES (?, ?, ?, 'active')
  `).bind(crypto.randomUUID().replace(/-/g, ''), teamId, playerId).run();

  return c.json({ success: true, data: { id: playerId } }, 201);
});

// ==================
// Remove player from team
// ==================
teamRoutes.delete('/:teamId/players/:playerId', authMiddleware, requireRole('admin', 'organization', 'coach'), async (c) => {
  const { teamId, playerId } = c.req.param();
  const db = c.env.DB;

  await db.prepare(`
    UPDATE team_players SET status = 'inactive' WHERE team_id = ? AND player_id = ?
  `).bind(teamId, playerId).run();

  return c.json({ success: true, message: 'Player removed from team' });
});

// ==================
// ADMIN: Bulk consolidate organizations
// Accepts a mapping of { org_id -> { name, city, state, variant_names[] } }
// Creates org records and links all teams with matching names
// ==================
teamRoutes.post('/admin/consolidate-orgs', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    owner_id: string;
    orgs: Array<{
      id: string;
      name: string;
      city?: string | null;
      state?: string | null;
      variant_names: string[];
    }>;
  }>();

  if (!body.orgs || !Array.isArray(body.orgs)) {
    return c.json({ error: 'orgs array required' }, 400);
  }

  const ownerId = body.owner_id || 'system_migration_user';
  let orgsCreated = 0;
  let teamsLinked = 0;
  const errors: string[] = [];

  // Process in chunks to avoid D1 limits
  for (const org of body.orgs) {
    try {
      // Insert organization (skip if exists)
      await db.prepare(`
        INSERT OR IGNORE INTO organizations (id, name, owner_id, city, state, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).bind(org.id, org.name, ownerId, org.city || null, org.state || null).run();
      orgsCreated++;

      // Link all teams with any of the variant names
      for (const variantName of org.variant_names) {
        const result = await db.prepare(`
          UPDATE teams SET organization_id = ?, updated_at = datetime('now')
          WHERE name = ? AND (organization_id IS NULL OR organization_id = '')
        `).bind(org.id, variantName).run();
        teamsLinked += result.meta.changes;
      }
    } catch (e: any) {
      errors.push(`Org ${org.name}: ${e.message}`);
    }
  }

  return c.json({
    success: true,
    orgs_created: orgsCreated,
    teams_linked: teamsLinked,
    errors: errors.length > 0 ? errors : undefined
  });
});

// ==================
// JOIN TEAM via invite code
// ==================
const joinTeamSchema = z.object({
  inviteCode: z.string().min(4).max(10),
});

teamRoutes.post('/join', authMiddleware, zValidator('json', joinTeamSchema), async (c) => {
  const { inviteCode } = c.req.valid('json');
  const user = c.get('user');
  const db = c.env.DB;
  const code = inviteCode.toUpperCase().trim();

  // Find the team with this coach invite code (NOT parent code)
  const team = await db.prepare(`
    SELECT id, name, age_group, invite_code FROM teams WHERE invite_code = ? AND is_active = 1
  `).bind(code).first<{ id: string; name: string; age_group: string; invite_code: string }>();

  if (!team) {
    // Check if they used a parent code by mistake
    const parentMatch = await db.prepare(`
      SELECT id, name FROM teams WHERE parent_invite_code = ? AND is_active = 1
    `).bind(code).first();
    if (parentMatch) {
      return c.json({ success: false, error: 'This is a parent/family code. To join as a coach, ask the team admin for the coach invite code.' }, 400);
    }
    return c.json({ success: false, error: 'Invalid invite code. Please check the code and try again.' }, 404);
  }

  // Check if already a member
  const existing = await db.prepare(`
    SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
  `).bind(team.id, user.id).first();

  if (existing) {
    return c.json({ success: false, error: 'You are already a member of this team.' }, 409);
  }

  // Determine role: check if there's a pending invite for this user's email
  let role = 'coach'; // default
  const invite = await db.prepare(`
    SELECT id, invited_role FROM team_invites WHERE team_id = ? AND email = ? AND status = 'pending'
  `).bind(team.id, user.email).first<{ id: string; invited_role: string }>();

  if (invite) {
    role = invite.invited_role || 'coach';
    // Mark invite as accepted
    await db.prepare(`
      UPDATE team_invites SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now')
      WHERE id = ?
    `).bind(user.id, invite.id).run();
  }

  // Add to team_members
  const memberId = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO team_members (id, team_id, user_id, role, status, joined_via)
    VALUES (?, ?, ?, ?, 'active', 'invite_code')
  `).bind(memberId, team.id, user.id, role).run();

  // Also link via legacy junction tables
  try {
    const jId = crypto.randomUUID().replace(/-/g, '');
    if (role === 'manager') {
      await db.prepare(`INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, team.id, user.id).run();
    } else {
      await db.prepare(`INSERT OR IGNORE INTO team_coaches (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, team.id, user.id).run();
    }
  } catch {}

  // Ensure user has the right role in user_roles
  try {
    const hasRole = await db.prepare(`SELECT id FROM user_roles WHERE user_id = ? AND role = ?`).bind(user.id, role).first();
    if (!hasRole) {
      const roleId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)`).bind(roleId, user.id, role).run();
    }
  } catch {}

  return c.json({
    success: true,
    data: { teamId: team.id, teamName: team.name, ageGroup: team.age_group, role },
    message: `You've joined ${team.name} as ${role}!`,
  });
});

// ==================
// LEAVE TEAM — remove user from all associations (follows, coaches, managers, members)
// ==================
teamRoutes.delete('/:teamId/leave', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const teamId = c.req.param('teamId');

  const team = await db.prepare(`SELECT id, name, created_by FROM teams WHERE id = ? AND is_active = 1`).bind(teamId).first<{ id: string; name: string; created_by: string }>();
  if (!team) {
    return c.json({ success: false, error: 'Team not found' }, 404);
  }

  // Remove from ALL association tables AND clear created_by
  await db.batch([
    db.prepare(`DELETE FROM user_follows WHERE user_id = ? AND team_id = ?`).bind(user.id, teamId),
    db.prepare(`DELETE FROM team_coaches WHERE user_id = ? AND team_id = ?`).bind(user.id, teamId),
    db.prepare(`DELETE FROM team_managers WHERE user_id = ? AND team_id = ?`).bind(user.id, teamId),
    db.prepare(`DELETE FROM team_members WHERE user_id = ? AND team_id = ?`).bind(user.id, teamId),
    db.prepare(`UPDATE teams SET created_by = NULL WHERE id = ? AND created_by = ?`).bind(teamId, user.id),
  ]);

  return c.json({ success: true, message: `You have left ${team.name}.` });
});

// ==================
// CHECK PENDING INVITES for a user's email (called on signup/login)
// ==================
teamRoutes.get('/invites/check', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const invites = await db.prepare(`
    SELECT ti.id, ti.team_id, ti.invited_role, ti.invite_code, ti.created_at,
           t.name as team_name, t.age_group
    FROM team_invites ti
    JOIN teams t ON t.id = ti.team_id AND t.is_active = 1
    WHERE ti.email = ? AND ti.status = 'pending'
    ORDER BY ti.created_at DESC
  `).bind(user.email).all();

  return c.json({ success: true, data: invites.results });
});

// ==================
// AUTO-ACCEPT all pending invites for a user (called after signup)
// ==================
teamRoutes.post('/invites/accept-all', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  let linked = 0;

  const invites = await db.prepare(`
    SELECT ti.id, ti.team_id, ti.invited_role, ti.invite_code
    FROM team_invites ti
    JOIN teams t ON t.id = ti.team_id AND t.is_active = 1
    WHERE ti.email = ? AND ti.status = 'pending'
  `).bind(user.email).all<{ id: string; team_id: string; invited_role: string; invite_code: string }>();

  for (const inv of invites.results || []) {
    try {
      // Check not already a member
      const exists = await db.prepare(`SELECT id FROM team_members WHERE team_id = ? AND user_id = ?`).bind(inv.team_id, user.id).first();
      if (exists) continue;

      // Add to team_members
      const memberId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO team_members (id, team_id, user_id, role, status, joined_via)
        VALUES (?, ?, ?, ?, 'active', 'invite_auto')
      `).bind(memberId, inv.team_id, user.id, inv.invited_role).run();

      // Legacy junction table
      const jId = crypto.randomUUID().replace(/-/g, '');
      if (inv.invited_role === 'manager') {
        await db.prepare(`INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, inv.team_id, user.id).run();
      } else {
        await db.prepare(`INSERT OR IGNORE INTO team_coaches (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, inv.team_id, user.id).run();
      }

      // Mark invite accepted
      await db.prepare(`
        UPDATE team_invites SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now')
        WHERE id = ?
      `).bind(user.id, inv.id).run();

      // Ensure user has the role
      const hasRole = await db.prepare(`SELECT id FROM user_roles WHERE user_id = ? AND role = ?`).bind(user.id, inv.invited_role).first();
      if (!hasRole) {
        const roleId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)`).bind(roleId, user.id, inv.invited_role).run();
      }

      linked++;
    } catch (err: any) {
      console.error(`Auto-accept invite ${inv.id} error:`, err?.message || String(err));
    }
  }

  return c.json({ success: true, linked, message: linked > 0 ? `Linked to ${linked} team(s)!` : 'No pending invites.' });
});

// ==================
// GET team invite code (for displaying on team cards)
// ==================
teamRoutes.get('/:id/invite-code', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const user = c.get('user');
  const db = c.env.DB;

  // Verify user has access to this team
  const access = await db.prepare(`
    SELECT t.invite_code, t.parent_invite_code FROM teams t
    LEFT JOIN team_members tmem ON tmem.team_id = t.id AND tmem.user_id = ?
    LEFT JOIN team_coaches tc ON tc.team_id = t.id AND tc.user_id = ?
    LEFT JOIN team_managers tm ON tm.team_id = t.id AND tm.user_id = ?
    WHERE t.id = ? AND (t.created_by = ? OR tmem.user_id IS NOT NULL OR tc.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
  `).bind(user.id, user.id, user.id, teamId, user.id).first<{ invite_code: string; parent_invite_code: string }>();

  if (!access) {
    return c.json({ success: false, error: 'Team not found or access denied' }, 404);
  }

  return c.json({ success: true, data: { inviteCode: access.invite_code, parentInviteCode: access.parent_invite_code } });
});

// ==================
// ADMIN: Backfill invite codes for existing teams
// ==================
teamRoutes.post('/admin/backfill-invite-codes', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // Ensure parent_invite_code column exists
  try {
    await db.prepare(`ALTER TABLE teams ADD COLUMN parent_invite_code TEXT`).run();
  } catch (e: any) {
    // Column already exists — expected
  }

  // Backfill coach invite codes
  const teamsNoCode = await db.prepare(`SELECT id FROM teams WHERE (invite_code IS NULL OR invite_code = '') AND is_active = 1 LIMIT 100`).all<{ id: string }>();
  let updated = 0;
  for (const team of teamsNoCode.results || []) {
    let code = '';
    const randBytes = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) code += codeChars[randBytes[i] % codeChars.length];
    await db.prepare(`UPDATE teams SET invite_code = ? WHERE id = ?`).bind(code, team.id).run();
    updated++;
  }

  // Backfill parent invite codes
  const teamsNoParentCode = await db.prepare(`SELECT id, invite_code FROM teams WHERE (parent_invite_code IS NULL OR parent_invite_code = '') AND is_active = 1 LIMIT 500`).all<{ id: string; invite_code: string }>();
  let parentUpdated = 0;
  for (const team of teamsNoParentCode.results || []) {
    let parentCode = '';
    const randBytes = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) parentCode += codeChars[randBytes[i] % codeChars.length];
    // Ensure different from coach code
    if (parentCode === team.invite_code) {
      const extraBytes = crypto.getRandomValues(new Uint8Array(6));
      parentCode = '';
      for (let i = 0; i < 6; i++) parentCode += codeChars[extraBytes[i] % codeChars.length];
    }
    await db.prepare(`UPDATE teams SET parent_invite_code = ? WHERE id = ?`).bind(parentCode, team.id).run();
    parentUpdated++;
  }

  return c.json({ success: true, updated, parentUpdated });
});

// ==================
// MIGRATION: Add roster_share_token and claimed_by columns
// ==================
teamRoutes.post('/admin/migrate-roster-claim', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const results: string[] = [];

  // Add roster_share_token to teams
  try {
    await db.prepare(`ALTER TABLE teams ADD COLUMN roster_share_token TEXT`).run();
    results.push('Added roster_share_token to teams');
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) results.push('roster_share_token already exists');
    else results.push(`roster_share_token error: ${e.message}`);
  }

  // Add claimed_by (user_id) to players
  try {
    await db.prepare(`ALTER TABLE players ADD COLUMN claimed_by TEXT REFERENCES users(id)`).run();
    results.push('Added claimed_by to players');
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) results.push('claimed_by already exists');
    else results.push(`claimed_by error: ${e.message}`);
  }

  // Add parent_email and parent_phone to players for contact info
  try {
    await db.prepare(`ALTER TABLE players ADD COLUMN parent_email TEXT`).run();
    results.push('Added parent_email to players');
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) results.push('parent_email already exists');
    else results.push(`parent_email error: ${e.message}`);
  }
  try {
    await db.prepare(`ALTER TABLE players ADD COLUMN parent_phone TEXT`).run();
    results.push('Added parent_phone to players');
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) results.push('parent_phone already exists');
    else results.push(`parent_phone error: ${e.message}`);
  }

  // Add parent_name to players
  try {
    await db.prepare(`ALTER TABLE players ADD COLUMN parent_name TEXT`).run();
    results.push('Added parent_name to players');
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) results.push('parent_name already exists');
    else results.push(`parent_name error: ${e.message}`);
  }

  // Backfill roster_share_token for existing teams (batch of 50 to avoid timeout)
  const tokenChars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const teams = await db.prepare(`SELECT id FROM teams WHERE (roster_share_token IS NULL OR roster_share_token = '') AND is_active = 1 LIMIT 50`).all<{ id: string }>();
  let backfilled = 0;
  for (const team of teams.results || []) {
    let token = '';
    const rb = crypto.getRandomValues(new Uint8Array(12));
    for (let i = 0; i < 12; i++) token += tokenChars[rb[i] % tokenChars.length];
    await db.prepare(`UPDATE teams SET roster_share_token = ? WHERE id = ?`).bind(token, team.id).run();
    backfilled++;
  }
  const remaining = await db.prepare(`SELECT COUNT(*) as cnt FROM teams WHERE (roster_share_token IS NULL OR roster_share_token = '') AND is_active = 1`).first<{ cnt: number }>();
  results.push(`Backfilled ${backfilled} roster_share_tokens (${remaining?.cnt || 0} remaining — run again if needed)`);

  return c.json({ success: true, results });
});

// ==================
// Get roster share token for a team (auth required — coach/manager only)
// ==================
teamRoutes.get('/:id/roster-link', authMiddleware, async (c) => {
  const teamId = c.req.param('id');
  const db = c.env.DB;

  const team = await db.prepare(`
    SELECT roster_share_token, name FROM teams WHERE id = ? AND is_active = 1
  `).bind(teamId).first<{ roster_share_token: string | null; name: string }>();

  if (!team) {
    return c.json({ success: false, error: 'Team not found' }, 404);
  }

  // Generate token if missing
  let token = team.roster_share_token;
  if (!token) {
    const tokenChars = 'abcdefghijkmnpqrstuvwxyz23456789';
    token = '';
    const rb = crypto.getRandomValues(new Uint8Array(12));
    for (let i = 0; i < 12; i++) token += tokenChars[rb[i] % tokenChars.length];
    await db.prepare(`UPDATE teams SET roster_share_token = ? WHERE id = ?`).bind(token, teamId).run();
  }

  const siteUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';

  return c.json({
    success: true,
    data: {
      token,
      url: `${siteUrl}/roster/claim?t=${token}`,
      teamName: team.name,
    },
  });
});
