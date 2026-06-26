import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth';
import { eventRoutes } from './routes/events';
import { teamRoutes } from './routes/teams';
import { registrationRoutes } from './routes/registrations';
import { scoringRoutes } from './routes/scoring';
import { contactRoutes } from './routes/contacts';
import { emailRoutes } from './routes/email';
import { smsRoutes } from './routes/sms';
import { venueRoutes } from './routes/venues';
import { cityRoutes } from './routes/cities';
import { sponsorRoutes } from './routes/sponsors';
import { iceBookingRoutes } from './routes/ice-booking';
import { merchRoutes } from './routes/merch';
import { chatbotRoutes } from './routes/chatbot';
import { schedulingRoutes } from './routes/scheduling';
import { organizationRoutes } from './routes/organizations';
import { playerRoutes } from './routes/players';
import { cityInviteRoutes } from './routes/city-invites';
import { hotelRoutes } from './routes/hotels';
import { lookupRoutes } from './routes/lookups';
import { userRoutes } from './routes/users';
import { directorRoutes } from './routes/director';
import { analyticsRoutes } from './routes/analytics';
import { financialRoutes } from './routes/financials';
import { refereeRoutes } from './routes/referees';
import { stripeRoutes } from './routes/stripe';
import { followRoutes } from './routes/follows';
import { pushRoutes } from './routes/push';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://ultimatetournaments.com',
      'https://www.ultimatetournaments.com',
      'https://uht-web.pages.dev',
    ];
    // Allow localhost in development
    if (origin?.startsWith('http://localhost')) return origin;
    // Allow all Cloudflare Pages preview deploys (*.uht-web.pages.dev)
    if (origin?.endsWith('.uht-web.pages.dev')) return origin;
    return allowed.includes(origin ?? '') ? origin! : '';
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-Bypass', 'X-Scorekeeper-Pin'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Health check
app.get('/', (c) => c.json({
  name: 'UHT Platform API',
  version: '1.0.0',
  status: 'healthy',
  timestamp: new Date().toISOString(),
}));

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/teams', teamRoutes);
app.route('/api/organizations', organizationRoutes);
app.route('/api/players', playerRoutes);
app.route('/api/registrations', registrationRoutes);
app.route('/api/scheduling', schedulingRoutes);
app.route('/api/scoring', scoringRoutes);
app.route('/api/contacts', contactRoutes);
app.route('/api/email', emailRoutes);
app.route('/api/sms', smsRoutes);
app.route('/api/venues', venueRoutes);
app.route('/api/cities', cityRoutes);
app.route('/api/sponsors', sponsorRoutes);
app.route('/api/ice-booking', iceBookingRoutes);
app.route('/api/merch', merchRoutes);
app.route('/api/chatbot', chatbotRoutes);
app.route('/api/city-invites', cityInviteRoutes);
app.route('/api/hotels', hotelRoutes);
app.route('/api/lookups', lookupRoutes);
app.route('/api/users', userRoutes);
app.route('/api/director', directorRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/financials', financialRoutes);
app.route('/api/referees', refereeRoutes);
app.route('/api/stripe', stripeRoutes);
app.route('/api/follows', followRoutes);
app.route('/api/push', pushRoutes);

// Image upload to R2
app.post('/api/upload/image', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No file provided' }, 400);

  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
  if (!allowed.includes(file.type)) return c.json({ error: 'Invalid file type' }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ error: 'File too large (max 5MB)' }, 400);

  const ext = file.name.split('.').pop() || 'png';
  const key = `images/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await c.env.STORAGE.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  // Return the public URL via R2 custom domain or worker proxy
  const url = `https://uht.chad-157.workers.dev/api/upload/${key}`;
  return c.json({ success: true, url, key });
});

// Serve uploaded images from R2
app.get('/api/upload/images/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.STORAGE.get(`images/${filename}`);
  if (!object) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(object.body, { headers });
});

// Serve static brand assets from R2
app.get('/api/assets/brand/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.STORAGE.get(filename);
  if (!object) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(object.body, { headers });
});

// Serve hotel images from R2
app.get('/api/assets/hotels/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.STORAGE.get(`hotels/${filename}`);
  if (!object) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(object.body, { headers });
});

// Bulk import endpoint (admin only, for data migration)
app.post('/api/import/bulk', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json() as { statements: string[]; disableFk?: boolean };

  if (!body.statements || !Array.isArray(body.statements)) {
    return c.json({ error: 'Missing statements array' }, 400);
  }

  // Optionally disable FK checks for migration
  if (body.disableFk) {
    await db.prepare('PRAGMA foreign_keys = OFF').run();
  }

  let success = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const stmt of body.statements) {
    try {
      await db.prepare(stmt).run();
      success++;
    } catch (e: any) {
      errors++;
      if (errorDetails.length < 5) {
        errorDetails.push(`${e.message}: ${stmt.substring(0, 100)}`);
      }
    }
  }

  // Re-enable FK checks
  if (body.disableFk) {
    await db.prepare('PRAGMA foreign_keys = ON').run();
  }

  return c.json({ success: true, data: { success, errors, errorDetails } });
});

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
  }, 500);
});

export default app;
