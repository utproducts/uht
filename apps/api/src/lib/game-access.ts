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
