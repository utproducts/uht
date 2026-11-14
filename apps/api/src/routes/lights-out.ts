import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

/*
  LIGHTS OUT INVITATIONAL - invite-request registration.
  Public: list past events + submit a request (always lands as 'pending';
  every star claim is checked against game_three_stars for the admin).
  Admin: list requests, approve/deny - approval sends the "you're in" email.
*/

export const lightsOutRoutes = new Hono<{ Bindings: Env }>();

const FROM = 'Ultimate Hockey Tournaments <johnny@ultimatetournaments.com>';
const LIGHTS_OUT_PRICE_CENTS = 55000; // $550 per player, paid in full
const LIGHTS_OUT_DEPOSIT_CENTS = 20000; // $200 non-refundable deposit option

async function sendEmail(env: Env, to: string, subject: string, html: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${(env as any).RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
  } catch {}
}

function emailShell(inner: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#04091a;">
  <div style="max-width:560px;margin:0 auto;padding:36px 22px;font-family:Arial,Helvetica,sans-serif;">
    <div style="text-align:center;margin-bottom:26px;">
      <img src="https://ultimatetournaments.com/lights-out-logo.png" alt="Lights Out Invitational" width="230" style="max-width:70%;" />
    </div>
    <div style="background:#0a1228;border:1px solid rgba(0,204,255,.35);border-radius:16px;padding:28px 24px;color:#dbe8f5;font-size:14px;line-height:1.65;">
      ${inner}
    </div>
    <p style="text-align:center;color:#55637a;font-size:11px;margin-top:22px;">Ultimate Hockey Tournaments · Lights Out Invitational · St. Louis, MO</p>
  </div></body></html>`;
}

// Past events a star could have been earned at (for the claim dropdown)
lightsOutRoutes.get('/events', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, start_date FROM events
    WHERE status NOT IN ('draft', 'cancelled')
      AND date(COALESCE(end_date, start_date)) <= date('now')
      AND EXISTS (SELECT 1 FROM games g JOIN game_three_stars ts ON ts.game_id = g.id WHERE g.event_id = events.id)
    ORDER BY start_date DESC
  `).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

const registerSchema = z.object({
  playerName: z.string().min(2).max(80),
  jerseyNumber: z.string().max(10).optional(),
  teamName: z.string().min(2).max(120),
  starEventId: z.string().min(8),
  birthYear: z.string().max(8).optional(),
  position: z.string().max(20).optional(),
  parentName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  payType: z.enum(['full', 'deposit']).default('full'),
});

// Invite requests from players WITHOUT a Three Stars selection — stored for
// staff review, no payment. First spots always go to star earners.
const inviteRequestSchema = z.object({
  playerName: z.string().min(2).max(80),
  teamName: z.string().min(2).max(120),
  birthYear: z.string().max(8).optional(),
  position: z.string().max(20).optional(),
  parentName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  reason: z.string().max(600).optional(),
});

lightsOutRoutes.post('/request-invite', zValidator('json', inviteRequestSchema), async (c) => {
  const b = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO lights_out_registrations (id, player_name, team_name, star_event_id, birth_year, position, parent_name, email, phone, status, star_verified, notes)
    VALUES (?, ?, ?, 'invite-request', ?, ?, ?, ?, ?, 'invite_requested', 0, ?)
  `).bind(id, b.playerName.trim(), b.teamName.trim(), b.birthYear || null, b.position || null,
    b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null,
    b.reason ? `Invite request: ${b.reason.trim()}` : 'Invite request (no star)').run();

  await sendEmail(c.env, b.email.trim(), 'We got your Lights Out invite request',
    emailShell(`
      <h2 style="margin:0 0 14px;color:#39ff14;font-size:19px;">Request received</h2>
      <p style="margin:0 0 14px;">Hi ${b.parentName.trim()},</p>
      <p style="margin:0 0 14px;">We have your invite request for <b style="color:#7fd8ff;">${b.playerName.trim()}</b> for the Lights Out Invitational, June 11-13, 2027 in St. Louis.</p>
      <p style="margin:0 0 14px;">To be straight with you: this is a very limited event and first spots go to our Three Stars winners. Requesting an invite does not guarantee approval - but if spots open beyond the stars, requests are the first place we look. We will email you either way.</p>
      <p style="margin:0 0 0;">Best thing your player can do in the meantime: earn a star at any UHT event this season - that is an automatic invite.</p>
    `));
  await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out INVITE REQUEST: ${b.playerName.trim()} (${b.teamName.trim()})`,
    emailShell(`
      <p style="margin:0 0 6px;">Player: <b>${b.playerName.trim()}</b> (${b.birthYear || 'birth year n/a'}, ${b.position || 'position n/a'})</p>
      <p style="margin:0 0 6px;">Team: ${b.teamName.trim()}</p>
      <p style="margin:0 0 6px;">Parent: ${b.parentName.trim()} - ${b.email.trim()} ${b.phone ? '- ' + b.phone : ''}</p>
      ${b.reason ? `<p style="margin:0 0 6px;">Why: ${b.reason.trim()}</p>` : ''}
      <p style="margin:10px 0 0;color:#7fd8ff;">No star on record - review in the admin Lights Out requests list.</p>
    `));
  return c.json({ success: true, data: { id } });
});

lightsOutRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const b = c.req.valid('json');
  const db = c.env.DB;

  const ev = await db.prepare('SELECT id, name FROM events WHERE id = ?').bind(b.starEventId).first<any>();
  if (!ev) return c.json({ success: false, error: 'Unknown event' }, 400);

  const dup = await db.prepare(
    `SELECT id, status FROM lights_out_registrations WHERE LOWER(player_name) = LOWER(?) AND star_event_id = ? AND status != 'denied'`
  ).bind(b.playerName.trim(), b.starEventId).first<any>();
  if (dup && dup.status !== 'pending_payment') {
    return c.json({ success: false, error: 'This player is already registered. Check your email, or reach out and we will help.' }, 409);
  }
  // An abandoned checkout should never block the family from trying again
  if (dup) await db.prepare('DELETE FROM lights_out_registrations WHERE id = ?').bind(dup.id).run();

  // Check the star claim against the scoresheets (last-name match is enough
  // for the admin signal; parents sometimes enter a nickname first name)
  const parts = b.playerName.trim().split(/\s+/);
  const lastName = parts[parts.length - 1];
  const starHit = await db.prepare(`
    SELECT 1 as x FROM game_three_stars ts JOIN games g ON g.id = ts.game_id
    WHERE g.event_id = ? AND (LOWER(ts.player_name) = LOWER(?) OR LOWER(ts.player_name) LIKE LOWER(?))
    LIMIT 1
  `).bind(b.starEventId, b.playerName.trim(), `% ${lastName}`).first<any>();

  const id = crypto.randomUUID().replace(/-/g, '');
  const isDeposit = b.payType === 'deposit';
  const chargeCents = isDeposit ? LIGHTS_OUT_DEPOSIT_CENTS : LIGHTS_OUT_PRICE_CENTS;
  await db.prepare(`
    INSERT INTO lights_out_registrations (id, player_name, jersey_number, team_name, star_event_id, birth_year, position, parent_name, email, phone, status, star_verified, payment_plan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)
  `).bind(id, b.playerName.trim(), b.jerseyNumber || null, b.teamName.trim(), b.starEventId, b.birthYear || null,
    b.position || null, b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null, starHit ? 1 : 0, b.payType).run();

  // $550 in full or a $200 non-refundable deposit, through Stripe Checkout
  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'payment',
      'success_url': `https://ultimatetournaments.com/lights-out/?reg=${id}&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': 'https://ultimatetournaments.com/lights-out/?cancelled=1',
      'customer_email': b.email.trim().toLowerCase(),
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(chargeCents),
      'line_items[0][price_data][product_data][name]': isDeposit ? 'Lights Out Invitational - $200 Non-Refundable Deposit' : 'Lights Out Invitational - Player Registration (Paid in Full)',
      'line_items[0][price_data][product_data][description]': `${b.playerName.trim()} · St. Louis, MO · jerseys, stick, puck, tee and duffle included${isDeposit ? ' · $350 balance due before the event' : ''}`,
      'line_items[0][quantity]': '1',
      'metadata[lights_out_reg_id]': id,
      'metadata[player_name]': b.playerName.trim(),
      'payment_intent_data[metadata][lights_out_reg_id]': id,
    }).toString(),
  });
  const session = await stripeResponse.json() as any;
  if (!stripeResponse.ok || !session?.url) {
    await db.prepare('DELETE FROM lights_out_registrations WHERE id = ?').bind(id).run();
    return c.json({ success: false, error: 'Could not start checkout - please try again.' }, 500);
  }
  await db.prepare('UPDATE lights_out_registrations SET stripe_session_id = ? WHERE id = ?').bind(session.id, id).run();

  return c.json({ success: true, data: { id, checkoutUrl: session.url, starVerified: !!starHit } });
});

// Success-URL verification: confirm the Stripe session really paid, then
// mark the registration paid (idempotent) and send the emails.
lightsOutRoutes.get('/register/:id/verify', async (c) => {
  const id = c.req.param('id');
  const sessionId = c.req.query('session_id') || '';
  const db = c.env.DB;

  const row = await db.prepare(`
    SELECT lr.*, e.name as star_event_name FROM lights_out_registrations lr
    LEFT JOIN events e ON e.id = lr.star_event_id WHERE lr.id = ?
  `).bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (row.paid_at) return c.json({ success: true, data: { alreadyPaid: true } });
  if (!sessionId || sessionId !== row.stripe_session_id) return c.json({ success: false, error: 'Session mismatch' }, 400);

  const sres = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` },
  });
  const session = await sres.json() as any;
  if (!sres.ok || session.payment_status !== 'paid') {
    return c.json({ success: false, error: 'Payment not completed' }, 402);
  }

  const paidCents = session.amount_total || (row.payment_plan === 'deposit' ? LIGHTS_OUT_DEPOSIT_CENTS : LIGHTS_OUT_PRICE_CENTS);
  const isDeposit = row.payment_plan === 'deposit';
  const balanceCents = Math.max(0, LIGHTS_OUT_PRICE_CENTS - paidCents);
  await db.prepare(`
    UPDATE lights_out_registrations
    SET status = 'pending', amount_paid_cents = ?, paid_at = datetime('now')
    WHERE id = ? AND paid_at IS NULL
  `).bind(paidCents, id).run();

  await sendEmail(c.env, row.email, 'Payment received - Lights Out Invitational',
    emailShell(`
      <p style="margin:0 0 14px;font-size:17px;font-weight:bold;color:#ffffff;">Payment received. ${row.player_name} is almost in.</p>
      <p style="margin:0 0 14px;">We have your <b style="color:#39ff14;">$${(paidCents / 100).toFixed(0)} ${isDeposit ? 'non-refundable deposit' : 'paid-in-full registration'}</b> for the <b style="color:#39ff14;">Lights Out Invitational</b>, claimed on a Three Stars selection at ${row.star_event_name || 'a UHT event'}.</p>
      ${isDeposit ? `<p style="margin:0 0 14px;">The remaining <b style="color:#7fd8ff;">$${(balanceCents / 100).toFixed(0)} balance</b> is due before the event - we will send a payment link with the event details.</p>` : ''}
      <p style="margin:0 0 14px;">Our team is confirming the star against the official scoresheets now - the final invite confirmation lands in this inbox shortly, followed by dates, rink details, and team placement.</p>
      <p style="margin:0;color:#7fd8ff;">The lights go out soon.</p>
    `));

  await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out PAID registration: ${row.player_name} ($${(paidCents / 100).toFixed(0)}${isDeposit ? ' deposit' : ' full'})`,
    emailShell(`
      <p style="margin:0 0 12px;font-weight:bold;color:#fff;">New PAID Lights Out registration</p>
      <p style="margin:0 0 4px;">Player: <b>${row.player_name}</b> ${row.jersey_number ? `#${row.jersey_number}` : ''}</p>
      <p style="margin:0 0 4px;">Team: ${row.team_name}</p>
      <p style="margin:0 0 4px;">Star event: ${row.star_event_name || row.star_event_id}</p>
      <p style="margin:0 0 4px;">Star found on scoresheets: <b style="color:${row.star_verified ? '#39ff14' : '#ff6b6b'}">${row.star_verified ? 'YES' : 'NOT FOUND'}</b></p>
      <p style="margin:0 0 4px;">Paid: <b style="color:#39ff14;">$${(paidCents / 100).toFixed(2)}</b> (${isDeposit ? 'DEPOSIT - $' + (balanceCents / 100).toFixed(0) + ' balance due' : 'PAID IN FULL'})</p>
      <p style="margin:0 0 4px;">Parent: ${row.parent_name} · ${row.email}${row.phone ? ` · ${row.phone}` : ''}</p>
      <p style="margin:12px 0 0;">Confirm the invite at ultimatetournaments.com/admin/lights-out</p>
    `));

  return c.json({ success: true, data: { paid: true } });
});

// --- Admin ---

lightsOutRoutes.get('/admin/requests', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT lr.*, e.name as star_event_name
    FROM lights_out_registrations lr
    LEFT JOIN events e ON e.id = lr.star_event_id
    ORDER BY CASE lr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, lr.created_at DESC
  `).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

lightsOutRoutes.patch('/admin/requests/:id', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({ status: z.enum(['approved', 'denied', 'pending']) })), async (c) => {
    const id = c.req.param('id');
    const { status } = c.req.valid('json');
    const db = c.env.DB;
    const row = await db.prepare(`
      SELECT lr.*, e.name as star_event_name FROM lights_out_registrations lr
      LEFT JOIN events e ON e.id = lr.star_event_id WHERE lr.id = ?
    `).bind(id).first<any>();
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);

    const user = (c as any).get('user');
    await db.prepare(`UPDATE lights_out_registrations SET status = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
      .bind(status, user?.email || user?.id || 'admin', id).run();

    if (status === 'approved' && row.status !== 'approved') {
      await sendEmail(c.env, row.email, `${row.player_name} is IN - Lights Out Invitational`,
        emailShell(`
          <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#39ff14;">CONFIRMED. ${row.player_name.toUpperCase()} IS IN.</p>
          <p style="margin:0 0 14px;">The star checks out. ${row.player_name} earned a Three Stars selection at ${row.star_event_name || 'a UHT event'}, and that means one thing: an official invite to the first-ever <b style="color:#7fd8ff;">glow-in-the-dark hockey tournament</b> in St. Louis.</p>
          <p style="margin:0 0 14px;">What happens next: we will send dates, rink details, and ${row.player_name}'s team placement (built by age and position) as soon as they are locked. The custom glow jerseys, glow puck, glow tape, glow tee, and UHT hockey bag are all included.</p>
          <p style="margin:0;color:#7fd8ff;">Tell no one. Or tell everyone. Either way - the lights go out soon.</p>
        `));
    }
    return c.json({ success: true });
  });
