import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, AuthUser } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const directorRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// HELPER: Validate director access to event
// ==========================================
async function validateDirectorAccess(
  db: D1Database,
  userId: string,
  eventId: string
): Promise<boolean> {
  const result = await db
    .prepare('SELECT id FROM event_directors WHERE event_id = ? AND user_id = ? LIMIT 1')
    .bind(eventId, userId)
    .first();
  return !!result;
}

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

/**
 * POST /events/:eventId/directors
 * Assign a director to an event
 */
directorRoutes.post(
  '/events/:eventId/directors',
  authMiddleware,
  requireRole('admin'),
  zValidator('json', z.object({
    userId: z.string().min(1),
    rinkIds: z.array(z.string()).optional(), // If empty/omitted, director covers all rinks
  })),
  async (c) => {
    const eventId = c.req.param('eventId');
    const { userId, rinkIds } = c.req.valid('json');
    const db = c.env.DB;

    try {
      // Verify event exists
      const event = await db.prepare('SELECT id FROM events WHERE id = ? LIMIT 1').bind(eventId).first();
      if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

      // Verify user exists
      const user = await db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').bind(userId).first();
      if (!user) return c.json({ success: false, error: 'User not found' }, 404);

      // Auto-migrate: add rink_id if missing
      try { await db.prepare("ALTER TABLE event_directors ADD COLUMN rink_id TEXT REFERENCES venue_rinks(id)").run(); } catch (_) {}

      // Remove any existing assignments for this director+event (then re-insert)
      await db.prepare('DELETE FROM event_directors WHERE event_id = ? AND user_id = ?').bind(eventId, userId).run();

      if (rinkIds && rinkIds.length > 0) {
        // Insert one row per rink
        for (const rinkId of rinkIds) {
          const id = crypto.randomUUID().replace(/-/g, '');
          await db.prepare('INSERT INTO event_directors (id, event_id, user_id, rink_id) VALUES (?, ?, ?, ?)').bind(id, eventId, userId, rinkId).run();
        }
      } else {
        // Insert one row with rink_id = NULL (covers all rinks)
        const id = crypto.randomUUID().replace(/-/g, '');
        await db.prepare('INSERT INTO event_directors (id, event_id, user_id, rink_id) VALUES (?, ?, ?, ?)').bind(id, eventId, userId, null).run();
      }

      return c.json({ success: true, data: { userId, rinkIds: rinkIds || [] } }, 201);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || 'Failed to assign director' }, 500);
    }
  }
);

/**
 * DELETE /events/:eventId/directors/:userId
 * Remove a director from an event
 */
directorRoutes.delete(
  '/events/:eventId/directors/:userId',
  authMiddleware,
  requireRole('admin'),
  async (c) => {
    const { eventId, userId } = c.req.param();
    const db = c.env.DB;

    try {
      const result = await db
        .prepare('DELETE FROM event_directors WHERE event_id = ? AND user_id = ?')
        .bind(eventId, userId)
        .run();

      if (result.meta.changes === 0) {
        return c.json({ success: false, error: 'Director assignment not found' }, 404);
      }

      return c.json({ success: true });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to remove director' },
        500
      );
    }
  }
);

/**
 * GET /events/:eventId/directors
 * List directors for an event
 */
directorRoutes.get(
  '/events/:eventId/directors',
  authMiddleware,
  requireRole('admin'),
  async (c) => {
    const eventId = c.req.param('eventId');
    const db = c.env.DB;

    try {
      // Auto-migrate: add rink_id if missing
      try { await db.prepare("ALTER TABLE event_directors ADD COLUMN rink_id TEXT REFERENCES venue_rinks(id)").run(); } catch (_) {}

      const rows = await db
        .prepare(
          `SELECT ed.id, ed.event_id, ed.user_id, ed.rink_id, ed.created_at,
                  u.first_name, u.last_name, u.email, u.phone,
                  vr.name as rink_name
           FROM event_directors ed
           JOIN users u ON u.id = ed.user_id
           LEFT JOIN venue_rinks vr ON vr.id = ed.rink_id
           WHERE ed.event_id = ?
           ORDER BY u.first_name ASC, u.last_name ASC`
        )
        .bind(eventId)
        .all();

      // Group by director: merge rink assignments into one object per director
      const dirMap = new Map<string, any>();
      for (const row of (rows.results || []) as any[]) {
        const key = row.user_id;
        if (!dirMap.has(key)) {
          dirMap.set(key, {
            user_id: row.user_id,
            event_id: row.event_id,
            name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
            email: row.email,
            phone: row.phone,
            rinks: [],
            created_at: row.created_at,
          });
        }
        if (row.rink_id) {
          dirMap.get(key).rinks.push({ id: row.rink_id, name: row.rink_name });
        }
      }

      return c.json({ success: true, data: Array.from(dirMap.values()) });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to fetch directors' },
        500
      );
    }
  }
);

// ==========================================
// DIRECTOR ENDPOINTS
// ==========================================

/**
 * GET /my-events
 * List events assigned to this director
 */
directorRoutes.get('/my-events', authMiddleware, requireRole('director'), async (c) => {
  const user = c.get('user') as AuthUser;
  const db = c.env.DB;

  try {
    const events = await db
      .prepare(
        `SELECT e.id, e.name, e.city, e.state, e.start_date, e.end_date, e.status,
                v.name as venue_name,
                (SELECT COUNT(DISTINCT ed2.id) FROM event_divisions ed2 WHERE ed2.event_id = e.id) as division_count,
                edr.created_at as assigned_at
         FROM event_directors edr
         JOIN events e ON e.id = edr.event_id
         LEFT JOIN venues v ON v.id = e.venue_id
         WHERE edr.user_id = ?
         ORDER BY e.start_date DESC`
      )
      .bind(user.id)
      .all();

    return c.json({ success: true, data: events.results || [] });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || 'Failed to fetch events' },
      500
    );
  }
});

/**
 * GET /events/:eventId/games
 * Get all games for an event the director is assigned to
 */
directorRoutes.get('/events/:eventId/games', authMiddleware, requireRole('director'), async (c) => {
  const user = c.get('user') as AuthUser;
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  try {
    // Verify director access
    const hasAccess = await validateDirectorAccess(db, user.id, eventId);
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403);
    }

    // Get all games for the event with related data
    const games = await db
      .prepare(
        `SELECT g.id, g.event_id, g.game_number, g.game_type, g.pool_name,
                g.home_team_id, g.away_team_id, g.rink_id, g.venue_id,
                g.start_time, g.status, g.period, g.home_score, g.away_score,
                g.delay_minutes, g.delay_note, g.checked_in_at, g.checked_in_by,
                g.event_division_id, g.created_at, g.updated_at,
                ht.name as home_team_name, ht.logo_url as home_team_logo,
                at2.name as away_team_name, at2.logo_url as away_team_logo,
                vr.name as rink_name, v.name as venue_name,
                ed.age_group, ed.division_level
         FROM games g
         LEFT JOIN teams ht ON ht.id = g.home_team_id
         LEFT JOIN teams at2 ON at2.id = g.away_team_id
         LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
         LEFT JOIN venues v ON v.id = g.venue_id
         LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
         WHERE g.event_id = ?
         ORDER BY g.start_time ASC, g.game_number ASC`
      )
      .bind(eventId)
      .all();

    // For each game, fetch locker room assignments
    const gameList = games.results || [];
    const enrichedGames = await Promise.all(
      gameList.map(async (game: any) => {
        const lockerRooms = await db
          .prepare(
            `SELECT glr.id, glr.game_id, glr.team_id, glr.locker_room_id,
                    lr.name as locker_room_name
             FROM game_locker_rooms glr
             LEFT JOIN locker_rooms lr ON lr.id = glr.locker_room_id
             WHERE glr.game_id = ?`
          )
          .bind(game.id)
          .all();

        return {
          ...game,
          locker_rooms: lockerRooms.results || [],
        };
      })
    );

    return c.json({ success: true, data: enrichedGames });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || 'Failed to fetch games' },
      500
    );
  }
});

/**
 * PUT /games/:gameId/status
 * Update game status (with delay support and logging)
 */
directorRoutes.put(
  '/games/:gameId/status',
  authMiddleware,
  requireRole('director'),
  zValidator(
    'json',
    z.object({
      status: z.enum([
        'scheduled',
        'delayed',
        'warmup',
        'in_progress',
        'intermission',
        'final',
        'cancelled',
        'forfeit',
      ]),
      delayMinutes: z.number().min(0).optional(),
      delayNote: z.string().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user') as AuthUser;
    const gameId = c.req.param('gameId');
    const { status, delayMinutes, delayNote } = c.req.valid('json');
    const db = c.env.DB;

    try {
      // Get the game and verify director access
      const game = await db
        .prepare('SELECT id, event_id, status as old_status FROM games WHERE id = ? LIMIT 1')
        .bind(gameId)
        .first<any>();

      if (!game) {
        return c.json({ success: false, error: 'Game not found' }, 404);
      }

      const hasAccess = await validateDirectorAccess(db, user.id, game.event_id);
      if (!hasAccess) {
        return c.json({ success: false, error: 'Access denied' }, 403);
      }

      // Validate delayed status has delayMinutes
      if (status === 'delayed' && delayMinutes === undefined) {
        return c.json(
          { success: false, error: 'delayMinutes required when setting status to delayed' },
          400
        );
      }

      // Update game
      await db
        .prepare(
          `UPDATE games
           SET status = ?, delay_minutes = ?, delay_note = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(status, delayMinutes || null, delayNote || null, gameId)
        .run();

      // Log the status change
      const logId = crypto.randomUUID().replace(/-/g, '');
      await db
        .prepare(
          `INSERT INTO game_status_log (id, game_id, old_status, new_status, delay_minutes, note, changed_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .bind(logId, gameId, game.old_status, status, delayMinutes || null, delayNote || null, user.id)
        .run();

      return c.json({ success: true, data: { gameId, status } });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to update game status' },
        500
      );
    }
  }
);

/**
 * PUT /games/:gameId/check-in
 * Director checks in for a game
 */
directorRoutes.put(
  '/games/:gameId/check-in',
  authMiddleware,
  requireRole('director'),
  async (c) => {
    const user = c.get('user') as AuthUser;
    const gameId = c.req.param('gameId');
    const db = c.env.DB;

    try {
      // Get the game and verify director access
      const game = await db
        .prepare('SELECT id, event_id FROM games WHERE id = ? LIMIT 1')
        .bind(gameId)
        .first<any>();

      if (!game) {
        return c.json({ success: false, error: 'Game not found' }, 404);
      }

      const hasAccess = await validateDirectorAccess(db, user.id, game.event_id);
      if (!hasAccess) {
        return c.json({ success: false, error: 'Access denied' }, 403);
      }

      // Update check-in
      await db
        .prepare(
          `UPDATE games
           SET checked_in_at = datetime('now'), checked_in_by = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(user.id, gameId)
        .run();

      return c.json({ success: true, data: { gameId } });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to check in' },
        500
      );
    }
  }
);

/**
 * PUT /games/:gameId/score
 * Update game score
 */
directorRoutes.put(
  '/games/:gameId/score',
  authMiddleware,
  requireRole('director'),
  zValidator(
    'json',
    z.object({
      homeScore: z.number().min(0),
      awayScore: z.number().min(0),
    })
  ),
  async (c) => {
    const user = c.get('user') as AuthUser;
    const gameId = c.req.param('gameId');
    const { homeScore, awayScore } = c.req.valid('json');
    const db = c.env.DB;

    try {
      // Get the game and verify director access
      const game = await db
        .prepare(
          'SELECT id, event_id, home_score as old_home_score, away_score as old_away_score FROM games WHERE id = ? LIMIT 1'
        )
        .bind(gameId)
        .first<any>();

      if (!game) {
        return c.json({ success: false, error: 'Game not found' }, 404);
      }

      const hasAccess = await validateDirectorAccess(db, user.id, game.event_id);
      if (!hasAccess) {
        return c.json({ success: false, error: 'Access denied' }, 403);
      }

      // Update score
      await db
        .prepare(
          `UPDATE games
           SET home_score = ?, away_score = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(homeScore, awayScore, gameId)
        .run();

      // Log the change (optional: add a game_events entry if you want granular tracking)
      const logId = crypto.randomUUID().replace(/-/g, '');
      await db
        .prepare(
          `INSERT INTO game_status_log (id, game_id, old_status, new_status, note, changed_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .bind(
          logId,
          gameId,
          'score_update',
          'score_update',
          `Score changed from ${game.old_home_score}-${game.old_away_score} to ${homeScore}-${awayScore}`,
          user.id
        )
        .run();

      return c.json({ success: true, data: { gameId, homeScore, awayScore } });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to update score' },
        500
      );
    }
  }
);

/**
 * PUT /games/:gameId/locker-rooms
 * Assign locker rooms to teams in a game
 */
directorRoutes.put(
  '/games/:gameId/locker-rooms',
  authMiddleware,
  requireRole('director'),
  zValidator(
    'json',
    z.object({
      homeLockerRoomId: z.string().optional(),
      awayLockerRoomId: z.string().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user') as AuthUser;
    const gameId = c.req.param('gameId');
    const { homeLockerRoomId, awayLockerRoomId } = c.req.valid('json');
    const db = c.env.DB;

    try {
      // Get the game and verify director access
      const game = await db
        .prepare('SELECT id, event_id, home_team_id, away_team_id FROM games WHERE id = ? LIMIT 1')
        .bind(gameId)
        .first<any>();

      if (!game) {
        return c.json({ success: false, error: 'Game not found' }, 404);
      }

      const hasAccess = await validateDirectorAccess(db, user.id, game.event_id);
      if (!hasAccess) {
        return c.json({ success: false, error: 'Access denied' }, 403);
      }

      // Upsert locker room for home team
      if (homeLockerRoomId && game.home_team_id) {
        const existing = await db
          .prepare(
            'SELECT id FROM game_locker_rooms WHERE game_id = ? AND team_id = ? LIMIT 1'
          )
          .bind(gameId, game.home_team_id)
          .first();

        if (existing) {
          await db
            .prepare('UPDATE game_locker_rooms SET locker_room_id = ? WHERE game_id = ? AND team_id = ?')
            .bind(homeLockerRoomId, gameId, game.home_team_id)
            .run();
        } else {
          const id = crypto.randomUUID().replace(/-/g, '');
          await db
            .prepare(
              'INSERT INTO game_locker_rooms (id, game_id, team_id, locker_room_id) VALUES (?, ?, ?, ?)'
            )
            .bind(id, gameId, game.home_team_id, homeLockerRoomId)
            .run();
        }
      }

      // Upsert locker room for away team
      if (awayLockerRoomId && game.away_team_id) {
        const existing = await db
          .prepare(
            'SELECT id FROM game_locker_rooms WHERE game_id = ? AND team_id = ? LIMIT 1'
          )
          .bind(gameId, game.away_team_id)
          .first();

        if (existing) {
          await db
            .prepare('UPDATE game_locker_rooms SET locker_room_id = ? WHERE game_id = ? AND team_id = ?')
            .bind(awayLockerRoomId, gameId, game.away_team_id)
            .run();
        } else {
          const id = crypto.randomUUID().replace(/-/g, '');
          await db
            .prepare(
              'INSERT INTO game_locker_rooms (id, game_id, team_id, locker_room_id) VALUES (?, ?, ?, ?)'
            )
            .bind(id, gameId, game.away_team_id, awayLockerRoomId)
            .run();
        }
      }

      return c.json({ success: true, data: { gameId } });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to assign locker rooms' },
        500
      );
    }
  }
);

/**
 * GET /games/:gameId/status-log
 * Get status change history for a game
 */
directorRoutes.get(
  '/games/:gameId/status-log',
  authMiddleware,
  requireRole('director'),
  async (c) => {
    const user = c.get('user') as AuthUser;
    const gameId = c.req.param('gameId');
    const db = c.env.DB;

    try {
      // Get the game and verify director access
      const game = await db
        .prepare('SELECT id, event_id FROM games WHERE id = ? LIMIT 1')
        .bind(gameId)
        .first<any>();

      if (!game) {
        return c.json({ success: false, error: 'Game not found' }, 404);
      }

      const hasAccess = await validateDirectorAccess(db, user.id, game.event_id);
      if (!hasAccess) {
        return c.json({ success: false, error: 'Access denied' }, 403);
      }

      // Get status log
      const logs = await db
        .prepare(
          `SELECT gsl.id, gsl.game_id, gsl.old_status, gsl.new_status, gsl.delay_minutes, gsl.note,
                  gsl.changed_by, gsl.created_at,
                  u.first_name, u.last_name, u.email
           FROM game_status_log gsl
           LEFT JOIN users u ON u.id = gsl.changed_by
           WHERE gsl.game_id = ?
           ORDER BY gsl.created_at DESC`
        )
        .bind(gameId)
        .all();

      return c.json({ success: true, data: logs.results || [] });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to fetch status log' },
        500
      );
    }
  }
);

// ==========================================
// LOCKER ROOM MANAGEMENT (Admin or Director)
// ==========================================

/**
 * GET /rinks/:rinkId/locker-rooms
 * List locker rooms for a rink
 */
directorRoutes.get('/rinks/:rinkId/locker-rooms', async (c) => {
  const rinkId = c.req.param('rinkId');
  const db = c.env.DB;

  try {
    const lockerRooms = await db
      .prepare(
        'SELECT id, rink_id, name, sort_order FROM locker_rooms WHERE rink_id = ? ORDER BY sort_order ASC'
      )
      .bind(rinkId)
      .all();

    return c.json({ success: true, data: lockerRooms.results || [] });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || 'Failed to fetch locker rooms' },
      500
    );
  }
});

/**
 * POST /rinks/:rinkId/locker-rooms
 * Create a locker room
 */
directorRoutes.post(
  '/rinks/:rinkId/locker-rooms',
  authMiddleware,
  requireRole('admin', 'director'),
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      sortOrder: z.number().optional(),
    })
  ),
  async (c) => {
    const rinkId = c.req.param('rinkId');
    const { name, sortOrder } = c.req.valid('json');
    const db = c.env.DB;

    try {
      // Verify rink exists
      const rink = await db
        .prepare('SELECT id FROM venue_rinks WHERE id = ? LIMIT 1')
        .bind(rinkId)
        .first();
      if (!rink) {
        return c.json({ success: false, error: 'Rink not found' }, 404);
      }

      // Check for duplicate name at this rink
      const existing = await db
        .prepare('SELECT id FROM locker_rooms WHERE rink_id = ? AND name = ? LIMIT 1')
        .bind(rinkId, name)
        .first();
      if (existing) {
        return c.json(
          { success: false, error: 'Locker room with this name already exists for this rink' },
          409
        );
      }

      const id = crypto.randomUUID().replace(/-/g, '');
      await db
        .prepare(
          'INSERT INTO locker_rooms (id, rink_id, name, sort_order) VALUES (?, ?, ?, ?)'
        )
        .bind(id, rinkId, name, sortOrder || 0)
        .run();

      return c.json({ success: true, data: { id } }, 201);
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to create locker room' },
        500
      );
    }
  }
);

/**
 * PUT /locker-rooms/:id
 * Update a locker room
 */
directorRoutes.put(
  '/locker-rooms/:id',
  authMiddleware,
  requireRole('admin', 'director'),
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).optional(),
      sortOrder: z.number().optional(),
    })
  ),
  async (c) => {
    const id = c.req.param('id');
    const { name, sortOrder } = c.req.valid('json');
    const db = c.env.DB;

    try {
      // Get the locker room to verify it exists
      const lockerRoom = await db
        .prepare('SELECT id, rink_id FROM locker_rooms WHERE id = ? LIMIT 1')
        .bind(id)
        .first<any>();
      if (!lockerRoom) {
        return c.json({ success: false, error: 'Locker room not found' }, 404);
      }

      // If name is being changed, check for duplicates
      if (name) {
        const duplicate = await db
          .prepare(
            'SELECT id FROM locker_rooms WHERE rink_id = ? AND name = ? AND id != ? LIMIT 1'
          )
          .bind(lockerRoom.rink_id, name, id)
          .first();
        if (duplicate) {
          return c.json(
            { success: false, error: 'Another locker room with this name already exists' },
            409
          );
        }
      }

      // Update
      let query = 'UPDATE locker_rooms SET ';
      const updates: any[] = [];
      const params: any[] = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (sortOrder !== undefined) {
        updates.push('sort_order = ?');
        params.push(sortOrder);
      }

      if (updates.length === 0) {
        return c.json({ success: false, error: 'No fields to update' }, 400);
      }

      query += updates.join(', ') + ' WHERE id = ?';
      params.push(id);

      await db.prepare(query).bind(...params).run();

      return c.json({ success: true });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to update locker room' },
        500
      );
    }
  }
);

/**
 * DELETE /locker-rooms/:id
 * Delete a locker room
 */
directorRoutes.delete(
  '/locker-rooms/:id',
  authMiddleware,
  requireRole('admin', 'director'),
  async (c) => {
    const id = c.req.param('id');
    const db = c.env.DB;

    try {
      // Check if locker room is in use
      const inUse = await db
        .prepare('SELECT id FROM game_locker_rooms WHERE locker_room_id = ? LIMIT 1')
        .bind(id)
        .first();
      if (inUse) {
        return c.json(
          { success: false, error: 'Cannot delete locker room that is assigned to games' },
          409
        );
      }

      const result = await db
        .prepare('DELETE FROM locker_rooms WHERE id = ?')
        .bind(id)
        .run();

      if (result.meta.changes === 0) {
        return c.json({ success: false, error: 'Locker room not found' }, 404);
      }

      return c.json({ success: true });
    } catch (err: any) {
      return c.json(
        { success: false, error: err?.message || 'Failed to delete locker room' },
        500
      );
    }
  }
);

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

/**
 * GET /events/:eventId/games/live
 * Public endpoint for live scores with cascading delay info
 */
directorRoutes.get('/events/:eventId/games/live', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  try {
    // Get all games for the event
    const games = await db
      .prepare(
        `SELECT g.id, g.event_id, g.game_number, g.game_type, g.pool_name,
                g.home_team_id, g.away_team_id, g.rink_id, g.venue_id,
                g.start_time, g.status, g.period, g.home_score, g.away_score,
                g.delay_minutes, g.delay_note, g.checked_in_at, g.checked_in_by,
                g.event_division_id, g.created_at, g.updated_at,
                ht.name as home_team_name, ht.logo_url as home_team_logo,
                at2.name as away_team_name, at2.logo_url as away_team_logo,
                vr.name as rink_name, v.name as venue_name,
                ed.age_group, ed.division_level
         FROM games g
         LEFT JOIN teams ht ON ht.id = g.home_team_id
         LEFT JOIN teams at2 ON at2.id = g.away_team_id
         LEFT JOIN venue_rinks vr ON vr.id = g.rink_id
         LEFT JOIN venues v ON v.id = g.venue_id
         LEFT JOIN event_divisions ed ON ed.id = g.event_division_id
         WHERE g.event_id = ?
         ORDER BY g.rink_id ASC, g.start_time ASC, g.game_number ASC`
      )
      .bind(eventId)
      .all();

    const gameList = games.results || [];

    // For each game, fetch locker room assignments
    const enrichedGames = await Promise.all(
      gameList.map(async (game: any) => {
        const lockerRooms = await db
          .prepare(
            `SELECT glr.id, glr.game_id, glr.team_id, glr.locker_room_id,
                    lr.name as locker_room_name
             FROM game_locker_rooms glr
             LEFT JOIN locker_rooms lr ON lr.id = glr.locker_room_id
             WHERE glr.game_id = ?`
          )
          .bind(game.id)
          .all();

        return {
          ...game,
          locker_rooms: lockerRooms.results || [],
        };
      })
    );

    // Calculate cascading delays per rink
    // Group games by rink
    const gamesByRink: Record<string, any[]> = {};
    for (const game of enrichedGames) {
      const rinkId = game.rink_id || 'unknown';
      if (!gamesByRink[rinkId]) gamesByRink[rinkId] = [];
      gamesByRink[rinkId].push(game);
    }

    // Apply cascading delay logic
    const result = [];
    for (const rinkId in gamesByRink) {
      const rinkGames = gamesByRink[rinkId].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      let cumulativeDelay = 0;
      for (const game of rinkGames) {
        const adjustedStartTime = new Date(
          new Date(game.start_time).getTime() + cumulativeDelay * 60000
        );

        const enrichedGame = {
          ...game,
          adjusted_start_time: adjustedStartTime.toISOString(),
          cumulative_delay_minutes: cumulativeDelay,
        };

        result.push(enrichedGame);

        // If this game is delayed, add to cumulative
        if (game.status === 'delayed' && game.delay_minutes) {
          cumulativeDelay += game.delay_minutes;
        }
      }
    }

    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || 'Failed to fetch live games' },
      500
    );
  }
});
