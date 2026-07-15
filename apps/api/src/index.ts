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
import { faqRoutes } from './routes/faqs';
import { shopRoutes } from './routes/shop';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = [
      'https://ultimatetournaments.com',
      'https://www.ultimatetournaments.com',
      'https://uht-web.pages.dev',
    ];
    // Allow localhost only in non-production environments
    if (c.env.ENVIRONMENT !== 'production' && origin?.startsWith('http://localhost')) return origin;
    // Allow all Cloudflare Pages preview deploys
    if (origin?.endsWith('.pages.dev')) return origin;
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
app.route('/api/faqs', faqRoutes);
app.route('/api/shop', shopRoutes);

// RSVP endpoint for coaches meeting
app.post('/api/rsvps', async (c) => {
  const body = await c.req.json();
  const { name, email, teamOrg, attending } = body;
  if (!name || !email) return c.json({ error: 'Name and email required' }, 400);
  await c.env.DB.prepare(
    'INSERT INTO rsvps (name, email, team_org, attending) VALUES (?, ?, ?, ?)'
  ).bind(name, email, teamOrg || null, attending || 'yes').run();

  // Send confirmation email with Zoom link
  const firstName = (name || '').split(' ')[0] || 'Coach';
  const confirmHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:32px 0;">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    // Header
    + '<tr><td style="background:linear-gradient(135deg,#001d3d 0%,#003566 100%);padding:32px 40px;text-align:center;">'
    + '<img src="https://ultimatetournaments.com/uht-logo.png" alt="UHT" width="80" style="display:inline-block;margin-bottom:12px;">'
    + '<h1 style="color:#ffffff;font-size:24px;margin:0;">You&#39;re In!</h1>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:32px 40px;">'
    + '<p style="font-size:16px;color:#1a1a1a;margin:0 0 16px;">Hey ' + firstName + ',</p>'
    + '<p style="font-size:16px;color:#1a1a1a;margin:0 0 24px;">Thanks for RSVPing for the <strong>UHT Coach/Manager Meeting</strong>. Here are your Zoom details:</p>'
    // Meeting details card
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;border-radius:10px;margin-bottom:24px;">'
    + '<tr><td style="padding:24px;">'
    + '<p style="font-size:14px;font-weight:700;color:#003e79;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Meeting Details</p>'
    + '<p style="font-size:15px;color:#333;margin:0 0 6px;">Tuesday, July 14, 2026 at 7:30 PM CT</p>'
    + '<p style="font-size:15px;color:#333;margin:0 0 6px;">Meeting ID: 837 0800 5862</p>'
    + '<p style="font-size:13px;color:#666;margin:0;">Duration: ~15 minutes</p>'
    + '</td></tr></table>'
    // Join button
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
    + '<a href="https://us02web.zoom.us/j/83708005862?pwd=VDFhs7aLiyR0hcnSIWDWDtJuTVNljB.1" style="display:inline-block;padding:14px 40px;background-color:#2D8CFF;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">Join Zoom Meeting</a>'
    + '</td></tr></table>'
    + '<p style="font-size:14px;color:#666;margin:24px 0 0;text-align:center;">See you tomorrow night!</p>'
    + '</td></tr>'
    // Footer
    + '<tr><td style="background-color:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">'
    + '<p style="font-size:12px;color:#999;margin:0;">Ultimate Hockey Tournaments | ultimatetournaments.com</p>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + c.env.RESEND_API, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'UHT <info@ultimatetournaments.com>',
        to: [email],
        subject: 'Your Zoom Link — UHT Coach/Manager Meeting Tomorrow 7:30 PM CT',
        html: confirmHtml
      })
    });
  } catch (e) {
    // Don't fail the RSVP if email fails
    console.error('RSVP confirmation email failed:', e);
  }

  return c.json({ success: true });
});

app.get('/api/rsvps', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM rsvps ORDER BY created_at DESC').all();
  return c.json({ success: true, data: rows.results });
});

// Meeting reward — generate unique codes for RSVP'd coaches and send push notifications
app.post('/api/meeting-reward/send', async (c) => {
  const body = await c.req.json() as { sendKey?: string; testEmails?: string[] };
  if (body.sendKey !== 'uht-coaches-2026') return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;

  // Get RSVP'd emails — optionally filtered to specific test emails
  const rsvps = await db.prepare('SELECT id, name, email FROM rsvps').all();
  let rsvpList = (rsvps.results || []) as any[];
  if (body.testEmails && body.testEmails.length > 0) {
    const testSet = new Set(body.testEmails.map((e: string) => e.toLowerCase()));
    rsvpList = rsvpList.filter((r: any) => testSet.has(r.email.toLowerCase()));
  }
  if (rsvpList.length === 0) return c.json({ success: true, data: { codes_created: 0, pushes_sent: 0 } });

  let codesCreated = 0;
  const rewardEmails: string[] = [];

  for (const rsvp of rsvpList) {
    // Check if code already exists for this email
    const existing = await db.prepare('SELECT id FROM meeting_rewards WHERE email = ?').bind(rsvp.email).first();
    if (existing) continue;

    // Generate unique code: UHT- + 6 random alphanumeric chars
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'UHT-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await db.prepare(
      'INSERT INTO meeting_rewards (email, name, code, amount) VALUES (?, ?, ?, 50)'
    ).bind(rsvp.email, rsvp.name || null, code).run();
    codesCreated++;
    rewardEmails.push(rsvp.email.toLowerCase());
  }

  // Find users with push tokens whose email matches an RSVP
  let pushesSent = 0;
  if (rewardEmails.length > 0 || rsvpList.length > 0) {
    // Get ALL RSVP emails (including ones that already had codes — they still need the push)
    const allRsvpEmails = rsvpList.map((r: any) => r.email.toLowerCase());

    // Find matching users with push tokens
    const placeholders = allRsvpEmails.map(() => '?').join(',');
    const tokenResult = await db.prepare(
      'SELECT DISTINCT pt.token, pt.user_id, u.email FROM push_tokens pt JOIN users u ON u.id = pt.user_id WHERE LOWER(u.email) IN (' + placeholders + ')'
    ).bind(...allRsvpEmails).all();

    const tokens = (tokenResult.results || []).map((r: any) => r.token as string);
    const userIds = [...new Set((tokenResult.results || []).map((r: any) => r.user_id as string))];

    if (tokens.length > 0) {
      // Send push notifications
      const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
      const messages = tokens.map((token: string) => ({
        to: token,
        sound: 'default',
        title: 'You Got a Gift!',
        body: 'Thanks for joining the Coach/Manager Meeting! Tap to unwrap your reward.',
        data: { type: 'meeting_reward' },
      }));

      const BATCH_SIZE = 100;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
          if (res.ok) pushesSent += batch.length;
        } catch (e) { console.error('Push send failed:', e); }
      }

      // Create user notifications for inbox
      for (const userId of userIds) {
        const nId = crypto.randomUUID().replace(/-/g, '');
        try {
          await db.prepare(
            "INSERT INTO user_notifications (id, user_id, title, body, type, data) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(nId, userId, 'You Got a Gift!', 'Thanks for joining the Coach/Manager Meeting! Tap to unwrap your reward.', 'meeting_reward', JSON.stringify({ type: 'meeting_reward' })).run();
        } catch (e) { /* ignore */ }
      }

      // Mark rewards as push_sent
      await db.prepare("UPDATE meeting_rewards SET push_sent = 1, push_sent_at = datetime('now') WHERE push_sent = 0").run();
    }
  }

  return c.json({ success: true, data: { codes_created: codesCreated, pushes_sent: pushesSent, total_rsvps: rsvpList.length } });
});

// Send gifts to any audience with custom amounts
app.post('/api/gift/send', async (c) => {
  const body = await c.req.json() as {
    sendKey?: string;
    audience?: 'all_users' | 'coaches' | 'parents' | 'custom';
    customEmails?: string[];
    amount?: number;
    title?: string;
    message?: string;
  };
  if (body.sendKey !== 'uht-coaches-2026') return c.json({ error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const amount = body.amount || 50;
  const giftTitle = body.title || 'You Got a Gift!';
  const giftMessage = body.message || `You just received a $${amount} discount for your next UHT tournament! Tap to unwrap your reward.`;

  // Build target email list based on audience
  let targetEmails: { email: string; name: string | null }[] = [];

  if (body.audience === 'custom' && body.customEmails?.length) {
    // Custom email list
    for (const email of body.customEmails) {
      const user = await db.prepare('SELECT first_name, last_name FROM users WHERE LOWER(email) = LOWER(?)').bind(email.trim()).first() as any;
      targetEmails.push({ email: email.trim().toLowerCase(), name: user ? `${user.first_name} ${user.last_name}`.trim() : null });
    }
  } else if (body.audience === 'coaches') {
    const rows = await db.prepare("SELECT DISTINCT u.email, u.first_name, u.last_name FROM users u JOIN user_roles ur ON u.id = ur.user_id WHERE ur.role IN ('coach', 'manager')").all();
    targetEmails = (rows.results || []).map((r: any) => ({ email: r.email.toLowerCase(), name: `${r.first_name} ${r.last_name}`.trim() }));
  } else if (body.audience === 'parents') {
    const rows = await db.prepare("SELECT DISTINCT u.email, u.first_name, u.last_name FROM users u JOIN user_roles ur ON u.id = ur.user_id WHERE ur.role = 'parent'").all();
    targetEmails = (rows.results || []).map((r: any) => ({ email: r.email.toLowerCase(), name: `${r.first_name} ${r.last_name}`.trim() }));
  } else {
    // all_users — everyone with an account
    const rows = await db.prepare('SELECT email, first_name, last_name FROM users').all();
    targetEmails = (rows.results || []).map((r: any) => ({ email: r.email.toLowerCase(), name: `${r.first_name} ${r.last_name}`.trim() }));
  }

  if (targetEmails.length === 0) return c.json({ success: true, data: { codes_created: 0, pushes_sent: 0 } });

  let codesCreated = 0;
  const processedEmails: string[] = [];

  for (const target of targetEmails) {
    // Check if code already exists for this email (skip duplicates)
    const existing = await db.prepare('SELECT id FROM meeting_rewards WHERE email = ? AND amount = ? AND redeemed = 0').bind(target.email, amount).first();
    if (existing) { processedEmails.push(target.email); continue; }

    // Generate unique code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'UHT-';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

    await db.prepare(
      'INSERT INTO meeting_rewards (email, name, code, amount) VALUES (?, ?, ?, ?)'
    ).bind(target.email, target.name, code, amount).run();
    codesCreated++;
    processedEmails.push(target.email);
  }

  // Send push notifications to all targeted users
  let pushesSent = 0;
  if (processedEmails.length > 0) {
    const placeholders = processedEmails.map(() => '?').join(',');
    const tokenResult = await db.prepare(
      'SELECT DISTINCT pt.token, pt.user_id FROM push_tokens pt JOIN users u ON u.id = pt.user_id WHERE LOWER(u.email) IN (' + placeholders + ')'
    ).bind(...processedEmails).all();

    const tokens = (tokenResult.results || []).map((r: any) => r.token as string);
    const userIds = [...new Set((tokenResult.results || []).map((r: any) => r.user_id as string))];

    if (tokens.length > 0) {
      const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
      const messages = tokens.map((token: string) => ({
        to: token,
        sound: 'default',
        title: giftTitle,
        body: giftMessage,
        data: { type: 'meeting_reward' },
      }));

      const BATCH_SIZE = 100;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
          if (res.ok) pushesSent += batch.length;
        } catch (e) { console.error('Push send failed:', e); }
      }

      // Create user notifications
      for (const userId of userIds) {
        const nId = crypto.randomUUID().replace(/-/g, '');
        try {
          await db.prepare(
            "INSERT INTO user_notifications (id, user_id, title, body, type, data) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(nId, userId, giftTitle, giftMessage, 'meeting_reward', JSON.stringify({ type: 'meeting_reward' })).run();
        } catch (e) { /* ignore */ }
      }
    }
  }

  return c.json({ success: true, data: { codes_created: codesCreated, pushes_sent: pushesSent, total_targeted: targetEmails.length, amount } });
});

// Get reward code for current user's email
app.get('/api/meeting-reward/my-code', async (c) => {
  const emailParam = c.req.query('email');
  if (!emailParam) return c.json({ error: 'Email required' }, 400);

  const db = c.env.DB;
  const reward = await db.prepare(
    'SELECT code, amount, redeemed FROM meeting_rewards WHERE LOWER(email) = LOWER(?)'
  ).bind(emailParam).first() as any;

  if (!reward) return c.json({ success: true, data: null });
  return c.json({ success: true, data: { code: reward.code, amount: reward.amount, redeemed: reward.redeemed === 1 } });
});

// Get all rewards (admin)
app.get('/api/meeting-rewards', async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare('SELECT * FROM meeting_rewards ORDER BY created_at DESC').all();
  return c.json({ success: true, data: rows.results });
});

// Validate a reward code (check if valid + not yet redeemed)
app.post('/api/meeting-reward/validate', async (c) => {
  const { code } = await c.req.json() as { code?: string };
  if (!code) return c.json({ success: false, error: 'Code required' }, 400);

  const db = c.env.DB;
  const reward = await db.prepare(
    'SELECT code, amount, redeemed, email FROM meeting_rewards WHERE UPPER(code) = UPPER(?)'
  ).bind(code.trim()).first() as any;

  if (!reward) return c.json({ success: false, error: 'Invalid code' }, 404);
  if (reward.redeemed === 1) return c.json({ success: false, error: 'This code has already been used' }, 409);

  return c.json({ success: true, data: { code: reward.code, amount: reward.amount, valid: true } });
});

// Redeem a reward code (mark as used — single use only)
app.post('/api/meeting-reward/redeem', async (c) => {
  const { code, registrationId, email } = await c.req.json() as { code?: string; registrationId?: string; email?: string };
  if (!code) return c.json({ success: false, error: 'Code required' }, 400);

  const db = c.env.DB;
  const reward = await db.prepare(
    'SELECT id, code, amount, redeemed, email FROM meeting_rewards WHERE UPPER(code) = UPPER(?)'
  ).bind(code.trim()).first() as any;

  if (!reward) return c.json({ success: false, error: 'Invalid code' }, 404);
  if (reward.redeemed === 1) return c.json({ success: false, error: 'This code has already been used' }, 409);

  // Mark as redeemed
  await db.prepare(
    "UPDATE meeting_rewards SET redeemed = 1, redeemed_at = datetime('now'), redeemed_event_id = ? WHERE id = ?"
  ).bind(registrationId || email || 'manual', reward.id).run();

  return c.json({ success: true, data: { code: reward.code, amount: reward.amount, redeemed: true } });
});

// Coaches meeting email blast
app.post('/api/coaches-meeting/send', async (c) => {
  const body = await c.req.json() as { test?: boolean; testEmail?: string; sendKey?: string };

  // Simple auth check
  if (body.sendKey !== 'uht-coaches-2026') {
    return c.json({ error: 'Invalid send key' }, 403);
  }

  const db = c.env.DB;
  const env = c.env;

  // Build the email HTML
  const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;"><tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

<!-- Header with logo -->
<tr><td style="background-color:#003e79;padding:28px 24px;text-align:center;">
  <img src="https://ultimatetournaments.com/uht-logo.png" alt="UHT" width="80" style="display:inline-block;margin-bottom:12px;" />
  <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:800;">Coach/Manager Meeting</h1>
  <p style="color:#8bb8e8;font-size:14px;margin:6px 0 0;">2026-27 Season Kickoff</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 28px;">
  <p style="color:#1d1d1f;font-size:16px;line-height:1.6;margin:0 0 20px;">
    You're invited to a <strong>15-minute Zoom call</strong> tomorrow evening to kick off the 2026-27 season with Ultimate Hockey Tournaments!
  </p>

  <!-- Date/Time Box -->
  <div style="background-color:#f0f7ff;border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid #003e79;">
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="padding:4px 0;color:#6e6e73;font-size:13px;width:80px;">When</td>
        <td style="padding:4px 0;color:#1d1d1f;font-size:15px;font-weight:600;">Tuesday, July 14 at 7:30 PM CT</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6e6e73;font-size:13px;">Where</td>
        <td style="padding:4px 0;color:#1d1d1f;font-size:15px;font-weight:600;">Zoom (link provided after RSVP)</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6e6e73;font-size:13px;">Duration</td>
        <td style="padding:4px 0;color:#1d1d1f;font-size:15px;font-weight:600;">15 minutes</td>
      </tr>
    </table>
  </div>

  <!-- What We'll Cover -->
  <h3 style="color:#1d1d1f;font-size:16px;margin:0 0 12px;font-weight:700;">What We'll Cover:</h3>
  <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:24px;"><span style="color:#003e79;font-size:16px;">&#x2713;</span></td>
      <td style="padding:8px 0;color:#3d3d3d;font-size:14px;line-height:1.5;">2026-27 season schedule release</td>
    </tr>
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:24px;"><span style="color:#003e79;font-size:16px;">&#x2713;</span></td>
      <td style="padding:8px 0;color:#3d3d3d;font-size:14px;line-height:1.5;">New UHT mobile app &mdash; live scores, schedules, and team management</td>
    </tr>
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:24px;"><span style="color:#003e79;font-size:16px;">&#x2713;</span></td>
      <td style="padding:8px 0;color:#3d3d3d;font-size:14px;line-height:1.5;">Registration &amp; team setup walkthrough</td>
    </tr>
  </table>

  <!-- CTA Button -->
  <div style="text-align:center;margin:28px 0;">
    <a href="https://ultimatetournaments.com/coaches-meeting" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:16px 48px;border-radius:28px;text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:0.3px;">RSVP Now</a>
  </div>

  <p style="color:#6e6e73;font-size:13px;line-height:1.6;margin:0;text-align:center;">
    This is one you won't want to miss &mdash; big things are coming for 2026-27!
  </p>
</td></tr>

<!-- Footer -->
<tr><td style="background-color:#f5f5f7;padding:20px 24px;text-align:center;">
  <p style="color:#86868b;font-size:12px;margin:0 0 6px;">
    Ultimate Hockey Tournaments<br/>
    <a href="https://ultimatetournaments.com" style="color:#003e79;text-decoration:none;">ultimatetournaments.com</a>
  </p>
  <p style="color:#aeaeb2;font-size:11px;margin:0;">
    You received this email because you are part of our tournament community.
  </p>
</td></tr>

</table></td></tr></table></body></html>`;

  const subject = "You're Invited: UHT Coach/Manager Meeting — Tomorrow 7:30 PM CT";

  // Test mode: send only to test email
  if (body.test && body.testEmail) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
          to: [body.testEmail],
          subject: '[TEST] ' + subject,
          html: emailHtml,
        }),
      });
      const resendData = response.ok ? await response.json() as any : await response.text();
      return c.json({ success: response.ok, data: response.ok ? { messageId: resendData?.id } : { error: resendData } });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  }

  // Full send: get all unique emails from coaches + contacts + icontacts
  const allEmails = await db.prepare(
    "SELECT LOWER(TRIM(email)) as email FROM (" +
    "SELECT head_coach_email as email FROM teams WHERE is_active = 1 AND head_coach_email IS NOT NULL AND head_coach_email != '' " +
    "UNION " +
    "SELECT email FROM contacts WHERE source = 'legacy_team' AND email IS NOT NULL AND email != '' " +
    "UNION " +
    "SELECT email FROM email_list_contacts WHERE is_active = 1 AND email IS NOT NULL AND email != '' " +
    ") ORDER BY email"
  ).all<any>();

  const emails = (allEmails.results || []).map((r: any) => r.email).filter(Boolean);

  if (emails.length === 0) {
    return c.json({ success: false, error: 'No recipients found' }, 400);
  }

  let sent = 0;
  let failed = 0;
  const batchSize = 50; // Send in batches of 50

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);

    // Use Resend batch API - send individual emails
    const batchPayload = batch.map((email: string) => ({
      from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
      to: [email],
      subject: subject,
      html: emailHtml,
    }));

    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchPayload),
      });

      if (response.ok) {
        sent += batch.length;
      } else {
        // If batch fails, try individual sends
        for (const email of batch) {
          try {
            const singleRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + env.RESEND_API,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
                to: [email],
                subject: subject,
                html: emailHtml,
              }),
            });
            if (singleRes.ok) sent++;
            else failed++;
          } catch {
            failed++;
          }
        }
      }
    } catch {
      failed += batch.length;
    }
  }

  return c.json({ success: true, data: { sent, failed, total: emails.length } });
});

// Coaches meeting REMINDER email (20-min warning with Zoom link)
app.post('/api/coaches-meeting/send-reminder', async (c) => {
  const body = await c.req.json() as { sendKey?: string; subject?: string; message?: string };

  if (body.sendKey !== 'uht-coaches-2026') {
    return c.json({ error: 'Invalid send key' }, 403);
  }

  const db = c.env.DB;
  const env = c.env;

  // Get all RSVP emails with attending = 'yes'
  const rsvps = await db.prepare(
    "SELECT DISTINCT LOWER(TRIM(email)) as email, name FROM rsvps WHERE attending = 'yes' AND email IS NOT NULL AND email != ''"
  ).all<any>();

  const recipients = (rsvps.results || []).filter((r: any) => r.email);

  if (recipients.length === 0) {
    return c.json({ success: false, error: 'No RSVP recipients found' }, 400);
  }

  const subject = body.subject || "Reminder: UHT Coaches Meeting Starts Soon!";
  const customMessage = body.message || "The meeting starts in 20 minutes!";

  const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;"><tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

<tr><td style="background-color:#003e79;padding:28px 24px;text-align:center;">
  <img src="https://ultimatetournaments.com/uht-logo.png" alt="UHT" width="80" style="display:inline-block;margin-bottom:12px;" />
  <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:800;">Meeting Reminder</h1>
  <p style="color:#8bb8e8;font-size:14px;margin:6px 0 0;">Coach/Manager Meeting &mdash; Tonight!</p>
</td></tr>

<tr><td style="padding:32px 28px;">
  <p style="color:#1d1d1f;font-size:18px;line-height:1.6;margin:0 0 20px;font-weight:600;">
    ${customMessage}
  </p>

  <div style="background-color:#f0f7ff;border-radius:12px;padding:20px;margin-bottom:24px;border-left:4px solid #003e79;">
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="padding:4px 0;color:#6e6e73;font-size:13px;width:80px;">When</td>
        <td style="padding:4px 0;color:#1d1d1f;font-size:15px;font-weight:600;">Tonight at 7:30 PM CT</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6e6e73;font-size:13px;">Duration</td>
        <td style="padding:4px 0;color:#1d1d1f;font-size:15px;font-weight:600;">15 minutes</td>
      </tr>
    </table>
  </div>

  <div style="text-align:center;margin:28px 0;">
    <a href="https://us02web.zoom.us/j/83708005862?pwd=VDFhs7aLiyR0hcnSIWDWDtJuTVNljB.1" style="display:inline-block;background-color:#2D8CFF;color:#ffffff;padding:18px 48px;border-radius:28px;text-decoration:none;font-size:18px;font-weight:bold;letter-spacing:0.3px;">Join Zoom Meeting</a>
  </div>

  <p style="color:#6e6e73;font-size:13px;line-height:1.6;margin:16px 0 0;text-align:center;">
    Or copy this link: <a href="https://us02web.zoom.us/j/83708005862?pwd=VDFhs7aLiyR0hcnSIWDWDtJuTVNljB.1" style="color:#003e79;">https://us02web.zoom.us/j/83708005862</a>
  </p>
</td></tr>

<tr><td style="background-color:#f5f5f7;padding:20px 24px;text-align:center;">
  <p style="color:#86868b;font-size:12px;margin:0 0 6px;">
    Ultimate Hockey Tournaments<br/>
    <a href="https://ultimatetournaments.com" style="color:#003e79;text-decoration:none;">ultimatetournaments.com</a>
  </p>
</td></tr>

</table></td></tr></table></body></html>`;

  let sent = 0;
  let failed = 0;
  const emails = recipients.map((r: any) => r.email);
  const batchSize = 50;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchPayload = batch.map((email: string) => ({
      from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
      to: [email],
      subject: subject,
      html: emailHtml,
    }));

    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchPayload),
      });

      if (response.ok) {
        sent += batch.length;
      } else {
        for (const email of batch) {
          try {
            const singleRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + env.RESEND_API,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
                to: [email],
                subject: subject,
                html: emailHtml,
              }),
            });
            if (singleRes.ok) sent++;
            else failed++;
          } catch {
            failed++;
          }
        }
      }
    } catch {
      failed += batch.length;
    }
  }

  return c.json({ success: true, data: { sent, failed, total: emails.length } });
});

// Send $50 reward code emails to RSVP'd coaches
app.post('/api/coaches-meeting/send-rewards', async (c) => {
  const body = await c.req.json() as { sendKey?: string };

  if (body.sendKey !== 'uht-coaches-2026') {
    return c.json({ error: 'Invalid send key' }, 403);
  }

  const db = c.env.DB;
  const env = c.env;

  // Get all rewards that haven't been emailed yet (push_sent = 0)
  const rewards = await db.prepare(
    "SELECT id, email, name, code, amount FROM meeting_rewards WHERE push_sent = 0"
  ).all<any>();

  const recipients = (rewards.results || []).filter((r: any) => r.email && r.code);

  if (recipients.length === 0) {
    return c.json({ success: false, error: 'No unsent rewards found' }, 400);
  }

  function buildRewardEmail(name: string, code: string, amount: number): string {
    const firstName = (name || '').split(' ')[0] || 'Coach';
    // Title-case the first name
    const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;"><tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

<tr><td style="background:linear-gradient(135deg,#003e79 0%,#005599 50%,#0077cc 100%);padding:32px 24px;text-align:center;">
  <img src="https://ultimatetournaments.com/uht-logo.png" alt="UHT" width="80" style="display:inline-block;margin-bottom:12px;" />
  <h1 style="color:#ffffff;font-size:26px;margin:0;font-weight:800;letter-spacing:-0.5px;">Thank You for Attending!</h1>
  <p style="color:#8bb8e8;font-size:15px;margin:8px 0 0;">Coaches Meeting &mdash; July 2026</p>
</td></tr>

<tr><td style="padding:32px 28px;">
  <p style="color:#1d1d1f;font-size:17px;line-height:1.6;margin:0 0 20px;">
    Hey ${displayName},
  </p>
  <p style="color:#1d1d1f;font-size:16px;line-height:1.7;margin:0 0 24px;">
    Thanks for joining our coaches meeting! As a thank you, here's your exclusive <strong>$${amount} off</strong> discount code for any upcoming Ultimate Hockey Tournament registration.
  </p>

  <div style="background:linear-gradient(135deg,#f0f7ff,#e8f4fd);border-radius:16px;padding:28px;margin-bottom:28px;text-align:center;border:2px solid #003e79;">
    <p style="color:#6e6e73;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your Discount Code</p>
    <p style="color:#003e79;font-size:36px;font-weight:900;margin:0 0 8px;letter-spacing:3px;font-family:'Courier New',monospace;">${code}</p>
    <p style="color:#003e79;font-size:20px;font-weight:700;margin:0;">$${amount} OFF</p>
  </div>

  <p style="color:#1d1d1f;font-size:16px;line-height:1.7;margin:0 0 24px;">
    Apply this code during registration on our website to save $${amount} on your next tournament entry.
  </p>

  <div style="text-align:center;margin:28px 0;">
    <a href="https://ultimatetournaments.com/events" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:16px 40px;border-radius:28px;text-decoration:none;font-size:16px;font-weight:bold;">Browse Upcoming Events</a>
  </div>

  <div style="background-color:#f5f5f7;border-radius:12px;padding:16px 20px;margin-top:20px;">
    <p style="color:#6e6e73;font-size:13px;line-height:1.6;margin:0;">
      <strong>How to use:</strong> Enter your code at checkout when registering your team on
      <a href="https://ultimatetournaments.com" style="color:#003e79;text-decoration:none;font-weight:600;">ultimatetournaments.com</a>.
      One code per registration. Code does not expire.
    </p>
  </div>
</td></tr>

<tr><td style="background-color:#f5f5f7;padding:20px 24px;text-align:center;">
  <p style="color:#86868b;font-size:12px;margin:0 0 6px;">
    Ultimate Hockey Tournaments<br/>
    <a href="https://ultimatetournaments.com" style="color:#003e79;text-decoration:none;">ultimatetournaments.com</a>
  </p>
</td></tr>

</table></td></tr></table></body></html>`;
  }

  let sent = 0;
  let failed = 0;
  const batchSize = 10; // Smaller batches since each email is personalized

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const batchPayload = batch.map((r: any) => ({
      from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
      to: [r.email],
      subject: `Your $${r.amount} Reward Code from UHT`,
      html: buildRewardEmail(r.name, r.code, r.amount),
    }));

    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchPayload),
      });

      if (response.ok) {
        sent += batch.length;
        // Mark these as sent
        for (const r of batch) {
          await db.prepare(
            "UPDATE meeting_rewards SET push_sent = 1, push_sent_at = datetime('now') WHERE id = ?"
          ).bind(r.id).run().catch(() => {});
        }
      } else {
        const errText = await response.text().catch(() => '');
        console.error('Resend batch error:', errText);
        // Try individual sends
        for (const r of batch) {
          try {
            const singleRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + env.RESEND_API,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
                to: [r.email],
                subject: `Your $${r.amount} Reward Code from UHT`,
                html: buildRewardEmail(r.name, r.code, r.amount),
              }),
            });
            if (singleRes.ok) {
              sent++;
              await db.prepare(
                "UPDATE meeting_rewards SET push_sent = 1, push_sent_at = datetime('now') WHERE id = ?"
              ).bind(r.id).run().catch(() => {});
            } else failed++;
          } catch {
            failed++;
          }
        }
      }
    } catch {
      failed += batch.length;
    }
  }

  return c.json({ success: true, data: { sent, failed, total: recipients.length } });
});

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
  const apiUrl = c.env.API_URL || 'https://uht.chad-157.workers.dev';
  const url = `${apiUrl}/api/upload/${key}`;
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

// Serve team logos from R2
app.get('/api/assets/team-logos/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.STORAGE.get(`team-logos/${filename}`);
  if (!object) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(object.body, { headers });
});

// Serve org logos from R2
app.get('/api/assets/org-logos/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.STORAGE.get(`org-logos/${filename}`);
  if (!object) return c.json({ error: 'Not found' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
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
