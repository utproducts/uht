import * as jose from 'jose';

/*
  Shared write-access check for scorekeeper game endpoints.

  Before 9/14 the score-entry endpoints accepted ANY non-empty
  X-Scorekeeper-Pin header — the PIN was never checked against the database,
  so anyone who guessed a game id could post goals, end games (which texts
  coaches), or wipe events. This helper is the single gate for every
  score-writing endpoint:

  - PIN path: the header value must match a scorekeeper_pins row for the
    game's event (or the event's own scorekeeper_pin column, which admins see
    on the event record).
  - JWT path: a valid token whose user currently holds admin, director, or
    scorekeeper role (roles read fresh from D1, same as authMiddleware).
  - Dev bypass: X-Dev-Bypass works only outside production, mirroring
    authMiddleware.
*/

export interface GameAccess {
  ok: boolean;
  status?: 401 | 403 | 404;
  error?: string;
  via?: 'pin' | 'jwt' | 'dev';
  eventId?: string;
}

export async function verifyGameWriteAccess(c: any, gameId: string): Promise<GameAccess> {
  const db = c.env.DB as D1Database;

  if (c.req.header('X-Dev-Bypass') === 'true' && c.env.ENVIRONMENT !== 'production') {
    return { ok: true, via: 'dev' };
  }

  const game = await db.prepare('SELECT id, event_id FROM games WHERE id = ?').bind(gameId).first<{ id: string; event_id: string }>();
  if (!game) return { ok: false, status: 404, error: 'Game not found' };

  const pin = (c.req.header('X-Scorekeeper-Pin') || '').trim();
  if (pin) {
    const row = await db.prepare(
      'SELECT id FROM scorekeeper_pins WHERE pin_code = ? AND event_id = ?'
    ).bind(pin, game.event_id).first();
    if (row) return { ok: true, via: 'pin', eventId: game.event_id };
    const ev = await db.prepare(
      'SELECT id FROM events WHERE id = ? AND scorekeeper_pin = ?'
    ).bind(game.event_id, pin).first();
    if (ev) return { ok: true, via: 'pin', eventId: game.event_id };
    return { ok: false, status: 403, error: 'Invalid scorekeeper PIN for this event' };
  }

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ') && c.env.JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(c.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(authHeader.slice(7), secret);
      const rr = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
        .bind(payload.sub as string).all<{ role: string }>();
      const roles = (rr.results || []).map(r => r.role);
      if (roles.includes('admin') || roles.includes('director') || roles.includes('scorekeeper')) {
        return { ok: true, via: 'jwt', eventId: game.event_id };
      }
      return { ok: false, status: 403, error: 'Your account does not have scorekeeper access' };
    } catch {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }
  }

  return { ok: false, status: 401, error: 'Scorekeeper PIN required' };
}

/*
  Read access for the OFFICIAL SCORESHEET. Stricter than public scores:
  only tournament staff (admin/director/scorekeeper roles or a valid event
  PIN) and the two teams' coaches/managers may view it. Everyone else needs
  a share link (games.share_token) sent to them by someone with access.
  Followers do NOT qualify - following a team is not scoresheet access.
*/
export async function verifySheetReadAccess(
  c: any,
  game: { id: string; event_id: string; home_team_id?: string | null; away_team_id?: string | null; share_token?: string | null }
): Promise<{ ok: boolean; canShare: boolean; status?: number; error?: string }> {
  const db = c.env.DB as D1Database;

  if (c.req.header('X-Dev-Bypass') === 'true' && c.env.ENVIRONMENT !== 'production') {
    return { ok: true, canShare: true };
  }

  // Share-link viewers: read only, no re-share URL
  const share = (c.req.query('share') || '').trim();
  if (share && game.share_token && share === game.share_token) {
    return { ok: true, canShare: false };
  }

  const pin = (c.req.header('X-Scorekeeper-Pin') || '').trim();
  if (pin) {
    const row = await db.prepare('SELECT id FROM scorekeeper_pins WHERE pin_code = ? AND event_id = ?')
      .bind(pin, game.event_id).first();
    if (row) return { ok: true, canShare: true };
  }

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ') && c.env.JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(c.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(authHeader.slice(7), secret);
      const userId = payload.sub as string;
      const rr = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?').bind(userId).all<{ role: string }>();
      const roles = (rr.results || []).map(r => r.role);
      if (roles.includes('admin') || roles.includes('director') || roles.includes('scorekeeper')) {
        return { ok: true, canShare: true };
      }
      const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[];
      if (teamIds.length > 0) {
        const ph = teamIds.map(() => '?').join(',');
        const staff = await db.prepare(`
          SELECT 1 FROM team_coaches WHERE user_id = ? AND team_id IN (${ph})
          UNION SELECT 1 FROM team_managers WHERE user_id = ? AND team_id IN (${ph})
          LIMIT 1
        `).bind(userId, ...teamIds, userId, ...teamIds).first();
        if (staff) return { ok: true, canShare: true };
      }
    } catch { /* fall through to denial */ }
  }

  return { ok: false, canShare: false, status: 403, error: 'The official scoresheet is available to team coaches and managers. Ask your coach for a share link.' };
}
