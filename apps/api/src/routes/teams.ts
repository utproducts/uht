import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

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
teamRoutes.post('/admin/merge-org', async (c) => {
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
teamRoutes.get('/admin/list', async (c) => {
  const db = c.env.DB;
  const { search, state, age_group, active, has_contact, season, event_id, page = '1', per_page = '50', sort = 'name', order = 'asc' } = c.req.query();

  // When filtering by event, we need a JOIN to registrations
  const eventJoin = event_id ? ' INNER JOIN registrations reg ON reg.team_id = t.id AND reg.event_id = ?' : '';
  const eventParams: string[] = event_id ? [event_id] : [];

  let whereClause = ' WHERE t.is_active = 1';
  const params: string[] = [...eventParams];

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
  const perPage = Math.min(100, Math.max(10, parseInt(per_page)));
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

  return c.json({
    success: true,
    data: result.results,
    pagination: { page: pageNum, perPage, total, totalPages: Math.ceil(total / perPage) },
    stats,
  });
});

// ==================
// ADMIN: Data export for cleanup matching
// ==================
teamRoutes.get('/admin/export-for-cleanup', async (c) => {
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
teamRoutes.post('/admin/bulk-update', async (c) => {
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
teamRoutes.get('/admin/team-roster/:teamId', async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param('teamId');

  // Get players on this team
  const players = await db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.usa_hockey_number,
           p.jersey_number, p.position, p.shoots,
           tp.status as roster_status, tp.added_at
    FROM players p
    JOIN team_players tp ON tp.player_id = p.id
    WHERE tp.team_id = ? AND tp.status IN ('active', 'rostered')
    ORDER BY CAST(p.jersey_number AS INTEGER), p.last_name ASC
  `).bind(teamId).all();

  // Get guardian/parent contacts for each player
  const guardians = await db.prepare(`
    SELECT pg.player_id, pg.relationship, u.id as user_id,
           u.first_name, u.last_name, u.email, u.phone
    FROM player_guardians pg
    JOIN users u ON u.id = pg.user_id
    JOIN team_players tp ON tp.player_id = pg.player_id
    WHERE tp.team_id = ? AND tp.status IN ('active', 'rostered')
    ORDER BY pg.player_id, u.last_name
  `).bind(teamId).all();

  // Merge guardians into players
  const guardianMap: Record<string, any[]> = {};
  for (const g of (guardians.results || [])) {
    const pid = g.player_id as string;
    if (!guardianMap[pid]) guardianMap[pid] = [];
    guardianMap[pid].push(g);
  }

  const roster = (players.results || []).map((p: any) => ({
    ...p,
    guardians: guardianMap[p.id] || [],
  }));

  return c.json({ success: true, data: roster, count: roster.length });
});

// ==================
// ADMIN: Bulk import teams
// ==================
teamRoutes.post('/admin/bulk-import', async (c) => {
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
teamRoutes.patch('/admin/:id', async (c) => {
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
// ADMIN: Delete team (soft)
// ==================
teamRoutes.delete('/admin/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare(`UPDATE teams SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).bind(id).run();
  return c.json({ success: true });
});

// ==================
// ADMIN: Deduplicate teams (single SQL)
// ==================
teamRoutes.post('/admin/dedup', async (c) => {
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
teamRoutes.post('/admin/purge-no-contact', async (c) => {
  const db = c.env.DB;

  const result = await db.prepare(`
    UPDATE teams SET is_active = 0, updated_at = datetime('now')
    WHERE is_active = 1 AND (head_coach_email IS NULL OR head_coach_email = '')
  `).run();

  const remaining = await db.prepare(`SELECT COUNT(*) as cnt FROM teams WHERE is_active = 1`).first();

  return c.json({ success: true, deactivated: result.meta.changes, remaining_active: (remaining as any)?.cnt });
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
// Get teams for current user (coach/manager/org)
// ==================
teamRoutes.get('/my-teams', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  // Get teams where user is coach, manager, or org owner
  const result = await db.prepare(`
    SELECT DISTINCT t.*, o.name as organization_name,
      (SELECT COUNT(*) FROM team_players tp WHERE tp.team_id = t.id AND tp.status = 'active') as player_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.team_id = t.id AND r.status IN ('pending', 'approved')) as active_registrations
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    LEFT JOIN team_coaches tc ON tc.team_id = t.id
    LEFT JOIN team_managers tm ON tm.team_id = t.id
    LEFT JOIN organizations org ON org.id = t.organization_id AND org.owner_id = ?
    WHERE tc.user_id = ? OR tm.user_id = ? OR org.owner_id = ?
    ORDER BY t.age_group ASC, t.name ASC
  `).bind(user.id, user.id, user.id, user.id).all();

  return c.json({ success: true, data: result.results });
});

// ==================
// Get single team with roster
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
// Create team (full — with coach/manager/league info)
// ==================
const createTeamSchema = z.object({
  name: z.string().min(1),
  ageGroup: z.string(),
  divisionLevel: z.string().optional(),
  organizationId: z.string().optional(),
  usaHockeyTeamId: z.string().optional(),
  usaHockeyRosterUrl: z.string().optional(),
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
});

teamRoutes.post('/', zValidator('json', createTeamSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  const teamId = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO teams (id, organization_id, name, age_group, division_level,
      usa_hockey_team_id, usa_hockey_roster_url, city, state,
      website, hometown_league, team_type, season_record,
      head_coach_name, head_coach_email, head_coach_phone,
      manager_name, manager_email, manager_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    teamId, data.organizationId || null, data.name, data.ageGroup,
    data.divisionLevel || null, data.usaHockeyTeamId || null,
    data.usaHockeyRosterUrl || null, data.city || null, data.state || null,
    data.website || null, data.hometownLeague || null,
    data.teamType || null, data.seasonRecord || null,
    data.headCoachName || null, data.headCoachEmail || null, data.headCoachPhone || null,
    data.managerName || null, data.managerEmail || null, data.managerPhone || null
  ).run();

  return c.json({ success: true, data: { id: teamId } }, 201);
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
  position: z.enum(['forward', 'defense', 'goalie']).optional(),
  shoots: z.enum(['left', 'right']).optional(),
});

teamRoutes.post('/:id/players', authMiddleware, requireRole('admin', 'organization', 'coach', 'manager'), zValidator('json', addPlayerSchema), async (c) => {
  const teamId = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const playerId = crypto.randomUUID().replace(/-/g, '');

  // Create player
  await db.prepare(`
    INSERT INTO players (id, first_name, last_name, date_of_birth, usa_hockey_number, jersey_number, position, shoots)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    playerId, data.firstName, data.lastName, data.dateOfBirth || null,
    data.usaHockeyNumber || null, data.jerseyNumber || null,
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
teamRoutes.post('/admin/consolidate-orgs', async (c) => {
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
