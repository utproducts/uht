import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env, UserRole } from '../types';
import { hashPassword, verifyPassword, generateToken } from '../middleware/auth';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getResolvedFields } from '../lib/template-overrides';
import { rateLimit } from '../middleware/rate-limit';

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
  role: z.enum(['organization', 'coach', 'manager', 'parent', 'referee', 'scorekeeper']).default('parent'),
});

authRoutes.post('/register', rateLimit(5, 60_000), zValidator('json', registerSchema), async (c) => {
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
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_app_user)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(userId, data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null).run();

    // Assign role
    await db.prepare(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), userId, data.role).run();

    // Auto-link any pending team invites for this email
    const allRoles: string[] = [data.role];
    try {
      const pendingInvites = await db.prepare(`
        SELECT ti.id, ti.team_id, ti.invited_role
        FROM team_invites ti
        JOIN teams t ON t.id = ti.team_id AND t.is_active = 1
        WHERE ti.email = ? AND ti.status = 'pending'
      `).bind(data.email.toLowerCase()).all<{ id: string; team_id: string; invited_role: string }>();

      for (const inv of pendingInvites.results || []) {
        const memberId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`
          INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via)
          VALUES (?, ?, ?, ?, 'active', 'invite_auto')
        `).bind(memberId, inv.team_id, userId, inv.invited_role).run();
        const jId = crypto.randomUUID().replace(/-/g, '');
        if (inv.invited_role === 'manager') {
          await db.prepare(`INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, inv.team_id, userId).run();
        } else {
          await db.prepare(`INSERT OR IGNORE INTO team_coaches (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, inv.team_id, userId).run();
        }
        await db.prepare(`UPDATE team_invites SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now') WHERE id = ?`).bind(userId, inv.id).run();
        if (inv.invited_role !== data.role && !allRoles.includes(inv.invited_role)) {
          const roleId = crypto.randomUUID().replace(/-/g, '');
          await db.prepare(`INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)`).bind(roleId, userId, inv.invited_role).run();
          allRoles.push(inv.invited_role);
        }
      }
    } catch (err: any) {
      console.error('Auto-link invites on register error:', err?.message || String(err));
    }

    // Auto-link any pending org owner invites for this email
    try {
      const orgInvites = await db.prepare(`
        SELECT oi.id, oi.organization_id
        FROM organization_invites oi
        JOIN organizations o ON o.id = oi.organization_id AND o.is_active = 1
        WHERE oi.email = ? AND oi.status = 'pending'
      `).bind(data.email.toLowerCase()).all<{ id: string; organization_id: string }>();

      for (const inv of orgInvites.results || []) {
        await db.prepare(`
          INSERT OR IGNORE INTO organization_admins (id, organization_id, user_id, role)
          VALUES (?, ?, ?, 'owner')
        `).bind(crypto.randomUUID().replace(/-/g, ''), inv.organization_id, userId).run();
        await db.prepare(`
          UPDATE organization_invites SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now') WHERE id = ?
        `).bind(userId, inv.id).run();
        if (!allRoles.includes('organization')) {
          await db.prepare('INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)')
            .bind(crypto.randomUUID().replace(/-/g, ''), userId, 'organization').run();
          allRoles.push('organization');
        }
      }
    } catch (err: any) {
      console.error('Auto-link org invites on register error:', err?.message || String(err));
    }

    // Generate token
    const token = await generateToken(
      { id: userId, email: data.email.toLowerCase(), roles: allRoles as UserRole[] },
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
          roles: allRoles,
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

authRoutes.post('/signup', rateLimit(5, 60_000), zValidator('json', signupSchema), async (c) => {
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
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_app_user)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(userId, data.email.toLowerCase(), 'magic_link', data.firstName, data.lastName, data.phone || null).run();

    // Assign role
    await db.prepare(`
      INSERT INTO user_roles (id, user_id, role)
      VALUES (?, ?, ?)
    `).bind(crypto.randomUUID().replace(/-/g, ''), userId, data.role).run();

    // Auto-link any pending team invites for this email
    let teamsLinked = 0;
    try {
      const pendingInvites = await db.prepare(`
        SELECT ti.id, ti.team_id, ti.invited_role
        FROM team_invites ti
        JOIN teams t ON t.id = ti.team_id AND t.is_active = 1
        WHERE ti.email = ? AND ti.status = 'pending'
      `).bind(data.email.toLowerCase()).all<{ id: string; team_id: string; invited_role: string }>();

      for (const inv of pendingInvites.results || []) {
        const memberId = crypto.randomUUID().replace(/-/g, '');
        await db.prepare(`
          INSERT OR IGNORE INTO team_members (id, team_id, user_id, role, status, joined_via)
          VALUES (?, ?, ?, ?, 'active', 'invite_auto')
        `).bind(memberId, inv.team_id, userId, inv.invited_role).run();

        // Legacy junction
        const jId = crypto.randomUUID().replace(/-/g, '');
        if (inv.invited_role === 'manager') {
          await db.prepare(`INSERT OR IGNORE INTO team_managers (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, inv.team_id, userId).run();
        } else {
          await db.prepare(`INSERT OR IGNORE INTO team_coaches (id, team_id, user_id) VALUES (?, ?, ?)`).bind(jId, inv.team_id, userId).run();
        }

        // Mark invite accepted
        await db.prepare(`
          UPDATE team_invites SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now') WHERE id = ?
        `).bind(userId, inv.id).run();

        // Add the invited role if different from signup role
        if (inv.invited_role !== data.role) {
          const roleId = crypto.randomUUID().replace(/-/g, '');
          await db.prepare(`INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)`).bind(roleId, userId, inv.invited_role).run();
        }

        teamsLinked++;
      }
    } catch (err: any) {
      console.error('Auto-link invites on signup error:', err?.message || String(err));
    }

    // Auto-link any pending org owner invites for this email
    let orgsLinked = 0;
    try {
      const orgInvites = await db.prepare(`
        SELECT oi.id, oi.organization_id
        FROM organization_invites oi
        JOIN organizations o ON o.id = oi.organization_id AND o.is_active = 1
        WHERE oi.email = ? AND oi.status = 'pending'
      `).bind(data.email.toLowerCase()).all<{ id: string; organization_id: string }>();

      for (const inv of orgInvites.results || []) {
        await db.prepare(`
          INSERT OR IGNORE INTO organization_admins (id, organization_id, user_id, role)
          VALUES (?, ?, ?, 'owner')
        `).bind(crypto.randomUUID().replace(/-/g, ''), inv.organization_id, userId).run();

        await db.prepare(`
          UPDATE organization_invites SET status = 'accepted', accepted_by = ?, accepted_at = datetime('now') WHERE id = ?
        `).bind(userId, inv.id).run();

        if (data.role !== 'organization') {
          await db.prepare('INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, ?)')
            .bind(crypto.randomUUID().replace(/-/g, ''), userId, 'organization').run();
        }
        orgsLinked++;
      }
    } catch (err: any) {
      console.error('Auto-link org invites on signup error:', err?.message || String(err));
    }

    // Generate magic link token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const linkId = crypto.randomUUID().replace(/-/g, '');

    await db.prepare(`
      INSERT INTO magic_links (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(linkId, userId, token, expiresAt).run();

    // Send welcome + magic link email via Resend
    const baseUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
    const loginUrl = `${baseUrl}/login/verify?token=${token}`;

    if (c.env.RESEND_API) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.RESEND_API}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Ultimate Tournaments <registration@ultimatetournaments.com>',
            to: [data.email.toLowerCase()],
            subject: 'Welcome to Ultimate Tournaments!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                  <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="UHT" width="140" style="width: 140px; height: auto; margin-bottom: 24px;" />
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
                  <div style="margin-top: 32px; padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
                    <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
                    <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
                  </div>
                </div>
              `,
          }),
        });
      } catch (err: any) {
        console.error('Resend signup email error:', err?.message || String(err));
        // Account is created, just email failed — don't block signup
      }
    }

    return c.json({
      success: true,
      data: {
        userId,
        email: data.email.toLowerCase(),
        role: data.role,
        teamsLinked,
        orgsLinked,
      },
      message: orgsLinked > 0
        ? `Account created and linked as owner of ${orgsLinked} organization(s)! Check your email for a sign-in link.`
        : teamsLinked > 0
        ? `Account created and linked to ${teamsLinked} team(s)! Check your email for a sign-in link.`
        : 'Account created! Check your email for a sign-in link.',
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

authRoutes.post('/login', rateLimit(10, 60_000), zValidator('json', loginSchema), async (c) => {
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

  // Accounts created via email-link signup have no password yet
  if (user.password_hash === 'magic_link' || user.password_hash === 'LOCKED-no-login-system-placeholder-account') {
    return c.json({
      success: false,
      error: 'no_password',
      message: 'Your account was created with email sign-in and has no password yet. Use "Email me a sign-in link" below, then set a password in your account.',
    }, 403);
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
  redirect: z.string().optional(),
});

authRoutes.post('/magic-link', rateLimit(5, 60_000), zValidator('json', magicLinkSchema), async (c) => {
  const { email, redirect } = c.req.valid('json');
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
  const baseUrl = c.env.SITE_URL || 'https://ultimatetournaments.com';
  const redirectParam = redirect ? `&redirect=${encodeURIComponent(redirect)}` : '';
  const loginUrl = `${baseUrl}/login/verify?token=${token}${redirectParam}`;

  // Send email via Resend (with admin-customizable template)
  if (c.env.RESEND_API) {
    try {
      const mlFields = await getResolvedFields(db, 'magic_link');
      const mlSubject = mlFields.subject || 'Your Login Link - Ultimate Tournaments';
      const mlBody = mlFields.body_text || 'Click the button below to sign in to your Ultimate Tournaments account. This link expires in 15 minutes.';
      const mlCta = mlFields.cta_text || 'Sign In';
      const mlFooter = mlFields.footer_text || "If you didn't request this link, you can safely ignore this email.";

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.RESEND_API}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Ultimate Tournaments <registration@ultimatetournaments.com>',
          to: [user.email],
          subject: mlSubject,
          html: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                <img src="https://uht.chad-157.workers.dev/api/assets/brand/uht-logo.png" alt="UHT" width="140" style="width: 140px; height: auto; margin-bottom: 24px;" />
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
                <div style="margin-top: 32px; padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
                  <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
                  <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
                  <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
                </div>
              </div>
            `,
        }),
      });
    } catch (err: any) {
      console.error('Resend error:', err?.message || String(err));
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

authRoutes.post('/scorekeeper-pin', rateLimit(10, 60_000), zValidator('json', pinLoginSchema), async (c) => {
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

// ==================
// ADMIN PIN LOGIN
// ==================
const adminPinSchema = z.object({
  email: z.string().email(),
  pin: z.string().length(4),
});

authRoutes.post('/admin-pin', rateLimit(10, 60_000), zValidator('json', adminPinSchema), async (c) => {
  const { email, pin } = c.req.valid('json');
  const db = c.env.DB;

  // Find admin/director user by email
  const user = await db.prepare(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.pin_code
    FROM users u
    WHERE LOWER(u.email) = LOWER(?)
  `).bind(email.trim()).first<{
    id: string; email: string; first_name: string; last_name: string;
    is_active: number; pin_code: string | null;
  }>();

  if (!user) {
    return c.json({ success: false, error: 'Invalid email or PIN' }, 401);
  }

  if (!user.is_active) {
    return c.json({ success: false, error: 'Account is disabled' }, 401);
  }

  if (!user.pin_code) {
    return c.json({ success: false, error: 'PIN not set. Please use the magic link to sign in, then set your PIN in Settings.' }, 401);
  }

  if (user.pin_code !== pin) {
    return c.json({ success: false, error: 'Invalid email or PIN' }, 401);
  }

  // Check user has admin or director role
  const rolesResult = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .bind(user.id).all<{ role: UserRole }>();
  const roles = rolesResult.results?.map(r => r.role) || [];

  if (!roles.includes('admin') && !roles.includes('director')) {
    return c.json({ success: false, error: 'PIN login is only available for admin and director accounts' }, 403);
  }

  // Generate JWT
  const jwtToken = await generateToken(
    { id: user.id, email: user.email, roles },
    c.env.JWT_SECRET
  );

  return c.json({
    success: true,
    data: {
      token: jwtToken,
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
// SELF-ADD ROLE
// ==================
const addRoleSchema = z.object({
  role: z.enum(['coach', 'parent', 'referee', 'scorekeeper']),
});

authRoutes.post('/add-role', authMiddleware, zValidator('json', addRoleSchema), async (c) => {
  const user = (c as any).get('user');
  const { role } = c.req.valid('json');
  const db = c.env.DB;

  try {
    // Check if user already has this role
    const existing = await db.prepare('SELECT id FROM user_roles WHERE user_id = ? AND role = ?')
      .bind(user.id, role).first();

    if (existing) {
      // Already has role — just return current roles
      const allRoles = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
        .bind(user.id).all();
      const roles = allRoles.results.map((r: any) => r.role);
      return c.json({ success: true, roles });
    }

    // Insert new role
    const newId = crypto.randomUUID();
    await db.prepare('INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, datetime("now"))')
      .bind(newId, user.id, role).run();

    // Return all current roles
    const allRoles = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?')
      .bind(user.id).all();
    const roles = allRoles.results.map((r: any) => r.role);

    return c.json({ success: true, roles });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Failed to add role' }, 500);
  }
});

// ==================
// SET ADMIN PIN
// ==================
const setPinSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/, 'PIN must be 4 digits'),
});

// ==================
// SET / CHANGE PASSWORD
// Email-link accounts (password_hash = 'magic_link') can set one without a
// current password; accounts that already have one must provide it.
// ==================
const setPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  currentPassword: z.string().optional(),
});

authRoutes.post('/set-password', authMiddleware, zValidator('json', setPasswordSchema), async (c) => {
  const authUser = c.get('user');
  const { newPassword, currentPassword } = c.req.valid('json');
  const db = c.env.DB;

  const user = await db.prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .bind(authUser.id).first<{ id: string; password_hash: string }>();
  if (!user) return c.json({ success: false, error: 'User not found' }, 404);

  const hasPassword = user.password_hash !== 'magic_link';
  if (hasPassword) {
    if (!currentPassword) {
      return c.json({ success: false, error: 'current_password_required', message: 'Enter your current password to change it.' }, 400);
    }
    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) return c.json({ success: false, error: 'Current password is incorrect' }, 401);
  }

  const newHash = await hashPassword(newPassword);
  await db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(newHash, user.id).run();

  return c.json({ success: true, message: 'Password saved. You can now sign in with your email and password.' });
});

authRoutes.put('/set-pin',
  authMiddleware,
  zValidator('json', setPinSchema),
  async (c) => {
    const user = (c as any).get('user');
    const { pin } = c.req.valid('json');
    const db = c.env.DB;

    // Only admin/director can set PIN
    const roles: string[] = user.roles || [];
    if (!roles.includes('admin') && !roles.includes('director')) {
      return c.json({ success: false, error: 'Only admin and director users can set a PIN' }, 403);
    }

    await db.prepare('UPDATE users SET pin_code = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(pin, user.id).run();

    return c.json({ success: true, message: 'PIN set successfully' });
  }
);

// ==================
// UPDATE PROFILE
// ==================
authRoutes.put('/update-profile', authMiddleware, async (c) => {
  const authUser = (c as any).get('user');
  const db = c.env.DB;
  const body = await c.req.json();
  const { firstName, lastName, email, phone } = body;

  try {
    await db.prepare(
      'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(
      firstName || '',
      lastName || '',
      email || authUser.email,
      phone || null,
      authUser.id
    ).run();

    return c.json({ success: true, data: { message: 'Profile updated' } });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Update failed' }, 500);
  }
});

// ==================
// MIGRATION HELPER (run once to add pin_code column)
// ==================
authRoutes.post('/migrate-pin', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN pin_code TEXT DEFAULT NULL').run();
    return c.json({ success: true, message: 'pin_code column added' });
  } catch (err: any) {
    if (err?.message?.includes('duplicate column')) {
      return c.json({ success: true, message: 'pin_code column already exists' });
    }
    return c.json({ success: false, error: err?.message || 'Migration failed' }, 500);
  }
});
