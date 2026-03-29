import { Context, Next } from 'hono';
import * as jose from 'jose';
import type { Env, AuthUser, UserRole, JWTPayload } from '../types';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header or session cookie
 * Attaches user info to context
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret) as { payload: JWTPayload };

    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
      firstName: '',
      lastName: '',
    };

    c.set('user', user);
    await next();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
}

/**
 * Role-based access control middleware factory
 * Usage: requireRole('admin', 'director')
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user') as AuthUser | undefined;

    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const hasRole = user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return c.json({ success: false, error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
}

/**
 * Optional auth — doesn't fail if no token, just doesn't set user
 */
export async function optionalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const secret = new TextEncoder().encode(c.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret) as { payload: JWTPayload };
      c.set('user', {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
        firstName: '',
        lastName: '',
      } as AuthUser);
    } catch {
      // Token invalid — continue without user context
    }
  }

  await next();
}

/**
 * Generate JWT token for a user
 */
export async function generateToken(user: { id: string; email: string; roles: UserRole[] }, jwtSecret: string): Promise<string> {
  const secret = new TextEncoder().encode(jwtSecret);
  const token = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  return token;
}

/**
 * Hash password using Web Crypto API (available in Workers)
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  // Derive key using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify password against stored hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, expectedHash] = storedHash.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex === expectedHash;
}
