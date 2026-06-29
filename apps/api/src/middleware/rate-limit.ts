import type { Context } from 'hono';

// Simple in-memory rate limiter for Cloudflare Workers.
// Resets on cold start, but catches hot abuse within a single isolate.
// For stronger guarantees, upgrade to Durable Objects or Cloudflare Rate Limiting.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup to prevent unbounded Map growth (runs at most once per minute)
let lastCleanup = 0;
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Rate limit middleware. Limits requests per IP + path within a sliding window.
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Function) => {
    cleanupStaleEntries();

    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      entry.count++;
      if (entry.count > maxRequests) {
        c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
        return c.json({ error: 'Too many requests' }, 429);
      }
    }

    await next();
  };
}
