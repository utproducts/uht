import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, UserRole } from '../types';
import { hashPassword, verifyPassword, generateToken } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { getResolvedFields } from '../lib/template-overrides';

export const authRoutes = new Hono<{ Bindings: Env }>();

// ==================
// REGISTER
// ==================
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['organization', 'coach', 'manager', 'parent']).default('parent'),
});

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check if email already exists
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(data.email.toLowerCase()).first();
  if (existing) {
    return c.json({ success: false, error: 'An account with this email already exists' }, 409);
  }

  const passwordHash = await hashPassword(data.password);
  const userId = crypto.randomUUID().replace(/-/g, '');

  try {
    // Create user
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null).run();

    // Assign role
    await db.prepare(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), userId, data.role).run();

    // Generate token
    const token = await generateToken(
      { id: userId, email: data.email.toLowerCase(), roles: [data.role as UserRole] },
      c.env.JWT_SECRET
    );

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: userId,
          email: data.email.toLowerCase(),
          firstName: data.firstName,
          lastName: data.lastName,
          roles: [data.role],
        },
      },
    }, 201);
  } catch (err) {
    console.error('Registration error:', err);
    return c.json({ success: false, error: 'Failed to create account' }, 500);
  }
});

// ==================
// SIGNUP (magic link — no password)
// ==================
const signupSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['organization', 'coach', 'manager', 'parent', 'referee']),
});

authRoutes.post('/signup', zValidator('json', signupSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check if email already exists
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(data.email.toLowerCase()).first();
  if (existing) {
    return c.json({ success: false, error: 'email_exists', message: 'An account with this email already exists. Try signing in instead.' }, 409);
  }

  const userId = crypto.randomUUID().replace(/-/g, '');

  try {
    // Create user (no password — magic link only)
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, data.email.toLowerCase(), 'magic_link', data.firstName, data.lastName, data.phone || null).run();

    // Assign role
    await db.prepare(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), userId, data.role).run();

    // Generate magic link token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const linkId = crypto.randomUUID().replace(/-/g, '');

    await db.prepare(`
      INSERT INTO magic_links (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(linkId, userId, token, expiresAt).run();

    // Send welcome + magic link email via SendGrid
    const baseUrl = 'https://uht-web.pages.dev';
    const loginUrl = `${baseUrl}/login/verify?token=${token}`;

    if (c.env.SENDGRID_API_KEY) {
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: data.email.toLowerCase(), name: `${data.firstName} ${data.lastName}` }] }],
            from: { email: 'registration@ultimatetournaments.com', name: 'Ultimate Tournaments' },
            subject: 'Welcome to Ultimate Tournaments!',
            content: [{
              type: 'text/html',
              value: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                  <img src="https://uht-web.pages.dev/uht-logo.png" alt="UHT" style="height: 48px; margin-bottom: 24px;" />
                  <h2 style="color: #1d1d1f; margin-bottom: 8px;">Welcome, ${data.firstName}!</h2>
                  <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
                    Your account has been created. Click the button below to sign in for the first time.
                  </p>
                  <a href="${loginUrl}" style="display: inline-block; background: #003e79; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 24px 0;">
                    Sign In to Your Account
                  </a>
                  <p style="color: #aeaeb2; font-size: 13px; margin-top: 32px;">
                    This link expires in 15 minutes. You can always request a new one from the login page.
                  </p>
                </div>
              `,
            }],
          }),
        });
      } catch (err: any) {
        console.error('SendGrid signup email error:', err?.message || String(err));
        // Account is created, just email failed — don't block signup
      }
    }

    return c.json({
      success: true,
      data: {
        userId,
        email: data.email.toLowerCase(),
        role: data.role,
      },
      message: 'Account created! Check your email for a sign-in link.',
    }, 201);
  } catch (err) {
    console.error('Signup error:', err);
    return c.json({ success: false, error: 'Failed to create account' }, 500);
  }
});

// ==================
// LOGIN
// ==================
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const db = c.env.DB;

  // Find user
  const user = await db.prepare(`
    SELECT id, email, password_hash, first_name, last_name, is_active
    FROM users WHERE email = ?
  `).bind(email.toLowerCase()).first<{
    id: string; email: string; password_hash: string;
    first_name: string; last_name: string; is_active: number;
  }>();

  if (!user || !user.is_active) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  // Get roles
  const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .bind(user.id).all<{ role: UserRole }>();
  const roles = rolesResult.results?.map(r => r.role) || [];

  // Generate token
  const token = await generateToken({ id: user.id, email: user.email, roles }, c.env.JWT_SECRET);

  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        roles,
      },
    },
  });
});

// ==================
// GET CURRENT USER
// ==================
authRoutes.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const db = c.env.DB;

  const user = await db.prepare(`
    SELECT id, email, first_name, last_name, phone, avatar_url, created_at
    FROM users WHERE id = ?
  `).bind(authUser.id).first();

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .bind(authUser.id).all<{ role: UserRole }>();

  return c.json({
    success: true,
    data: {
      ...user,
      roles: rolesResult.results?.map(r => r.role) || [],
    },
  });
});

// ==================
// MAGIC LINK - REQUEST
// ==================
const magicLinkSchema = z.object({
  email: z.string().email(),
});

authRoutes.post('/magic-link', zValidator('json', magicLinkSchema), async (c) => {
  const { email } = c.req.valid('json');
  const db = c.env.DB;

  // Find user by email
  const user = await db.prepare(`
    SELECT id, email, first_name, last_name, is_active
    FROM users WHERE email = ?
  `).bind(email.toLowerCase()).first<{
    id: string; email: string; first_name: string; last_name: string; is_active: number;
  }>();

  // Tell the user if their email isn't found so they can try the right one
  if (!user) {
    return c.json({ success: false, error: 'no_account', message: "We don't have an account with that email. Make sure you're using the same email you registered with." }, 404);
  }
  if (!user.is_active) {
    return c.json({ success: false, error: 'inactive', message: 'This account has been deactivated. Please contact us for help.' }, 403);
  }

  // Generate a secure random token
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Token expires in 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const linkId = crypto.randomUUID().replace(/-/g, '');

  // Store magic link
  await db.prepare(`
    INSERT INTO magic_links (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(linkId, user.id, token, expiresAt).run();

  // Build login URL
  const baseUrl = 'https://uht-web.pages.dev';
  const loginUrl = `${baseUrl}/login/verify?token=${token}`;

  // Send email via SendGrid (with admin-customizable template)
  if (c.env.SENDGRID_API_KEY) {
    try {
      const mlFields = await getResolvedFields(db, 'magic_link');
      const mlSubject = mlFields.subject || 'Your Login Link - Ultimate Tournaments';
      const mlBody = mlFields.body_text || 'Click the button below to sign in to your Ultimate Tournaments account. This link expires in 15 minutes.';
      const mlCta = mlFields.cta_text || 'Sign In';
      const mlFooter = mlFields.footer_text || "If you didn't request this link, you can safely ignore this email.";

      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: user.email, name: `${user.first_name} ${user.last_name}` }] }],
          from: { email: 'registration@ultimatetournaments.com', name: 'Ultimate Tournaments' },
          subject: mlSubject,
          content: [{
            type: 'text/html',
            value: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                <img src="https://uht-web.pages.dev/uht-logo.png" alt="UHT" style="height: 48px; margin-bottom: 24px;" />
                <h2 style="color: #1d1d1f; margin-bottom: 8px;">Hi ${user.first_name},</h2>
                <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
                  ${mlBody}
                </p>
                <a href="${loginUrl}" style="display: inline-block; background: #003e79; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 24px 0;">
                  ${mlCta}
                </a>
                <p style="color: #aeaeb2; font-size: 13px; margin-top: 32px;">
                  ${mlFooter}
                </p>
              </div>
            `,
          }],
        }),
      });
    } catch (err: any) {
      console.error('SendGrid error:', err?.message || String(err));
      return c.json({ success: false, error: 'Failed to send login email. Please try again.' }, 500);
    }
  }

  return c.json({ success: true, message: 'Login link sent! Check your email.' });
});

// ==================
// MAGIC LINK - VERIFY
// ==================
const verifyMagicLinkSchema = z.object({
  token: z.string().min(1),
});

authRoutes.post('/magic-link/verify', zValidator('json', verifyMagicLinkSchema), async (c) => {
  const { token } = c.req.valid('json');
  const db = c.env.DB;

  // Find the magic link
  const link = await db.prepare(`
    SELECT ml.id, ml.user_id, ml.expires_at, ml.used_at,
           u.email, u.first_name, u.last_name, u.is_active
    FROM magic_links ml
    JOIN users u ON u.id = ml.user_id
    WHERE ml.token = ?
  `).bind(token).first<{
    id: string; user_id: string; expires_at: string; used_at: string | null;
    email: string; first_name: string; last_name: string; is_active: number;
  }>();

  if (!link) {
    return c.json({ success: false, error: 'Invalid or expired login link' }, 401);
  }

  // Check if already used
  if (link.used_at) {
    return c.json({ success: false, error: 'This login link has already been used' }, 401);
  }

  // Check if expired
  if (new Date(link.expires_at) < new Date()) {
    return c.json({ success: false, error: 'This login link has expired. Please request a new one.' }, 401);
  }

  // Check if user is active
  if (!link.is_active) {
    return c.json({ success: false, error: 'Account is disabled' }, 401);
  }

  // Mark magic link as used
  await db.prepare(`
    UPDATE magic_links SET used_at = datetime('now') WHERE id = ?
  `).bind(link.id).run();

  // Mark email as verified
  await db.prepare(`
    UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?
  `).bind(link.user_id).run();

  // Get roles
  const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .bind(link.user_id).all<{ role: UserRole }>();
  const roles = rolesResult.results?.map(r => r.role) || [];

  // Generate JWT
  const jwtToken = await generateToken(
    { id: link.user_id, email: link.email, roles },
    c.env.JWT_SECRET
  );

  return c.json({
    success: true,
    data: {
      token: jwtToken,
      user: {
        id: link.user_id,
        email: link.email,
        firstName: link.first_name,
        lastName: link.last_name,
        roles,
      },
    },
  });
});

// ==================
// SCOREKEEPER PIN LOGIN
// ==================
const pinLoginSchema = z.object({
  pin: z.string().length(4),
});

authRoutes.post('/scorekeeper-pin', zValidator('json', pinLoginSchema), async (c) => {
  const { pin } = c.req.valid('json');
  const db = c.env.DB;

  const pinRecord = await db.prepare(`
    SELECT sp.event_id, e.name as event_name, e.slug as event_slug
    FROM scorekeeper_pins sp
    JOIN events e ON e.id = sp.event_id
    WHERE sp.pin_code = ? AND sp.is_active = 1
  `).bind(pin).first<{ event_id: string; event_name: string; event_slug: string }>();

  if (!pinRecord) {
    return c.json({ success: false, error: 'Invalid PIN code' }, 401);
  }

  // Generate a limited-scope token for scorekeeper
  const token = await generateToken(
    { id: `scorekeeper-${pin}`, email: `scorekeeper@${pinRecord.event_slug}`, roles: ['scorekeeper'] },
    c.env.JWT_SECRET
  );

  return c.json({
    success: true,
    data: {
      token,
      eventId: pinRecord.event_id,
      eventName: pinRecord.event_name,
    },
  });
});
