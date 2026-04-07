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
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-Bypass'],
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
app.route('/api/sponsors', sponsorRoutes);
app.route('/api/ice-booking', iceBookingRoutes);
app.route('/api/merch', merchRoutes);
app.route('/api/chatbot', chatbotRoutes);
app.route('/api/city-invites', cityInviteRoutes);
app.route('/api/hotels', hotelRoutes);
app.route('/api/lookups', lookupRoutes);
app.route('/api/users', userRoutes);

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
