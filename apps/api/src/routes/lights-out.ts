import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { ImageResponse } from 'workers-og';

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
  // One door or the other: the event where the star was earned, or an
  // approved invite code from a reviewed request
  starEventId: z.string().min(8).optional(),
  inviteCode: z.string().min(4).max(20).optional(),
  birthYear: z.string().max(8).optional(),
  position: z.string().max(20).optional(),
  jerseySize: z.string().max(20).optional(),
  teeSize: z.string().max(20).optional(),
  parentName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  payType: z.enum(['full', 'deposit']).default('full'),
}).refine(b => b.starEventId || b.inviteCode, { message: 'Pick the event where the star was earned, or enter your invite code.' });

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
  reason: z.string().max(2500).optional(),
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
      <p style="margin:0 0 14px;">We have your invite request for <b style="color:#7fd8ff;">${b.playerName.trim()}</b> for the Lights Out Invitational, June 11-13, 2027 in St. Louis - thank you for putting their name in.</p>
      <p style="margin:0 0 14px;">We read every single request. Some of the best players on the ice never show up on a scoresheet - shutdown defensemen, grinders, goalies who steal games - and that is exactly why the request list exists.</p>
      <p style="margin:0 0 14px;">Here is how it works: Three Stars winners get the first spots, and as the roster comes together we go straight to the request list to fill it out. We will email you either way, so you will never be left guessing.</p>
      <p style="margin:0 0 0;">And of course, a Three Stars selection at any UHT event this season is an automatic invite - so keep ${b.playerName.trim().split(' ')[0]} skating.</p>
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

  let id: string;
  let starHit: any = null;
  const isDeposit = b.payType === 'deposit';
  const chargeCents = isDeposit ? LIGHTS_OUT_DEPOSIT_CENTS : LIGHTS_OUT_PRICE_CENTS;

  if (b.inviteCode && !b.starEventId) {
    // Approved-invite path: the code was issued by staff on a reviewed
    // request. Reuse that row so the approval trail stays intact.
    const inv = await db.prepare(
      `SELECT id, status, paid_at FROM lights_out_registrations WHERE UPPER(invite_code) = UPPER(?)`
    ).bind(b.inviteCode.trim()).first<any>();
    if (!inv) return c.json({ success: false, error: 'That invite code is not valid. Check the code in your approval email, or reply to it and we will help.' }, 400);
    if (inv.paid_at) return c.json({ success: false, error: 'This invite code has already been used. Reach out if that does not sound right.' }, 409);
    id = inv.id;
    await db.prepare(`
      UPDATE lights_out_registrations
      SET player_name = ?, jersey_number = ?, team_name = ?, birth_year = ?, position = ?,
          parent_name = ?, email = ?, phone = ?, status = 'pending_payment', payment_plan = ?
      WHERE id = ?
    `).bind(b.playerName.trim(), b.jerseyNumber || null, b.teamName.trim(), b.birthYear || null,
      b.position || null, b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null, b.payType, id).run();
  } else {
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
    starHit = await db.prepare(`
      SELECT 1 as x FROM game_three_stars ts JOIN games g ON g.id = ts.game_id
      WHERE g.event_id = ? AND (LOWER(ts.player_name) = LOWER(?) OR LOWER(ts.player_name) LIKE LOWER(?))
      LIMIT 1
    `).bind(b.starEventId, b.playerName.trim(), `% ${lastName}`).first<any>();

    id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO lights_out_registrations (id, player_name, jersey_number, team_name, star_event_id, birth_year, position, jersey_size, tee_size, parent_name, email, phone, status, star_verified, payment_plan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)
    `).bind(id, b.playerName.trim(), (b.jerseyNumber || '').replace(/[^0-9]/g, '').slice(0, 2) || null, b.teamName.trim(), b.starEventId, b.birthYear || null,
      b.position || null, b.jerseySize || null, b.teeSize || null, b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null, starHit ? 1 : 0, b.payType).run();
  }

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
  zValidator('json', z.object({ status: z.enum(['approved', 'denied', 'pending', 'invite_approved', 'invite_denied']) })), async (c) => {
    const id = c.req.param('id');
    const { status } = c.req.valid('json');
    const db = c.env.DB;
    try { await db.prepare('ALTER TABLE lights_out_registrations ADD COLUMN invite_code TEXT').run(); } catch {}
    const row = await db.prepare(`
      SELECT lr.*, e.name as star_event_name FROM lights_out_registrations lr
      LEFT JOIN events e ON e.id = lr.star_event_id WHERE lr.id = ?
    `).bind(id).first<any>();
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);

    const user = (c as any).get('user');
    await db.prepare(`UPDATE lights_out_registrations SET status = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`)
      .bind(status, user?.email || user?.id || 'admin', id).run();

    // Approving a no-star INVITE REQUEST issues a single-use code and sends
    // the congratulations email with it; the code unlocks the register form
    if (status === 'invite_approved' && row.status !== 'invite_approved') {
      let code = row.invite_code;
      if (!code) {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        for (let tries = 0; tries < 10 && !row.invite_code; tries++) {
          code = 'GLOW-' + Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
          const clash = await db.prepare('SELECT 1 as x FROM lights_out_registrations WHERE invite_code = ?').bind(code).first<any>();
          if (!clash) break;
        }
        await db.prepare('UPDATE lights_out_registrations SET invite_code = ? WHERE id = ?').bind(code, id).run();
      }
      await sendEmail(c.env, row.email, `${row.player_name} is invited - Lights Out Invitational`,
        emailShell(`
          <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#39ff14;">CONGRATULATIONS. ${String(row.player_name).toUpperCase()} IS INVITED.</p>
          <p style="margin:0 0 14px;">Your invite request made the cut. ${row.player_name} is officially invited to the <b style="color:#7fd8ff;">Lights Out Invitational</b> - June 11-13, 2027 in St. Louis. Dark arena, glowing ice, and every player keeps the custom glow jerseys, collector stick, and glow puck.</p>
          <p style="margin:0 0 10px;">Your single-use invite code:</p>
          <p style="margin:0 0 14px;text-align:center;"><span style="display:inline-block;background:#04091a;border:1px solid rgba(57,255,20,.5);border-radius:10px;padding:12px 26px;font-size:22px;font-weight:bold;letter-spacing:4px;color:#39ff14;">${code}</span></p>
          <p style="margin:0 0 16px;text-align:center;">
            <a href="https://ultimatetournaments.com/lights-out?invite=${encodeURIComponent(code)}" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">REGISTER WITH THIS CODE</a>
          </p>
          <p style="margin:0 0 14px;">That button opens the registration form with your code already entered - just add ${row.player_name}'s details and pay. $550 per player, or a $200 non-refundable deposit holds the spot. (Entering it by hand? Tap Register Now on the Lights Out page and choose "I have an invite code.")</p>
          <p style="margin:0;color:#ffb84d;font-size:13px;font-weight:bold;">This is an extremely limited event - the code does not hold a spot until payment is made.</p>
        `));
      await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out invite code issued: ${row.player_name} (${code})`,
        emailShell(`<p style="margin:0;">Code <b style="color:#39ff14;">${code}</b> sent to ${row.parent_name} (${row.email}) for ${row.player_name} - ${row.team_name}.</p>`));
    }

    if (status === 'approved' && row.status !== 'approved') {
      const m = approvedEmail(row, id);
      await sendEmail(c.env, row.email, m.subject, m.html);
    }
    return c.json({ success: true });
  });

// The acceptance email a family gets when staff clicks Approve - shared by
// the real approval and the admin test-send below.
function approvedEmail(row: any, id: string): { subject: string; html: string } {
  return {
    subject: `${row.player_name} is IN - Lights Out Invitational`,
    html: emailShell(`
      <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#39ff14;">CONFIRMED. ${String(row.player_name).toUpperCase()} IS IN.</p>
      <p style="margin:0 0 14px;">The star checks out. ${row.player_name} earned a Three Stars selection at ${row.star_event_name || 'a UHT event'}, and that means one thing: an official invite to the first-ever <b style="color:#7fd8ff;">glow-in-the-dark hockey tournament</b> in St. Louis.</p>
      <p style="margin:0 0 14px;">Mark the calendar: <b style="color:#39ff14;">June 11-13, 2027</b> in St. Louis. We will send rink details and ${row.player_name}'s team placement (built by age and position) as the event gets closer. The custom glow jerseys, glow puck, glow tape, glow tee, and UHT hockey bag are all included - ${row.player_name} will pick it all up at check-in, right before our opening ceremonies on June 11th.</p>
      <div style="text-align:center;margin:0 0 16px;">
        <a href="https://ultimatetournaments.com/lights-out/size?id=${id}" style="display:inline-block;background:linear-gradient(90deg,#39ff14,#00ccff);color:#04091a;text-decoration:none;font-weight:bold;padding:12px 30px;border-radius:999px;font-size:14px;">PICK ${String(row.player_name).split(' ')[0].toUpperCase()}'S JERSEY + TEE SIZES</a>
      </div>
      ${(row.amount_paid_cents || 0) < 55000 ? `
      <p style="margin:0 0 10px;color:#ffb84d;"><b>Balance due: $${((55000 - (row.amount_paid_cents || 0)) / 100).toFixed(0)}.</b> Your $200 deposit got the spot - pay the balance as soon as possible to be fully locked in for June.</p>
      <div style="text-align:center;margin:0 0 16px;">
        <a href="https://uht.chad-157.workers.dev/api/lights-out/balance/${id}" style="display:inline-block;background:transparent;border:2px solid #ffb84d;color:#ffb84d;text-decoration:none;font-weight:bold;padding:10px 28px;border-radius:999px;font-size:14px;">PAY THE BALANCE</a>
      </div>` : ''}
      <p style="margin:0 0 10px;">We made this for ${row.player_name} - press and hold (or right click) to save it, then post it anywhere. Tag <b style="color:#39ff14;">@ultimatetournaments</b> when you do - we share our favorites.</p>
      <a href="https://uht.chad-157.workers.dev/api/lights-out/share/${id}.png" style="display:block;margin:0 0 14px;">
        <img src="https://uht.chad-157.workers.dev/api/lights-out/share/${id}.png" width="100%" style="max-width:512px;border-radius:14px;display:block;margin:0 auto;" alt="${row.player_name} is officially invited to the Lights Out Invitational" />
      </a>
      <p style="margin:0;color:#7fd8ff;">Tell no one. Or tell everyone. Either way - the lights go out soon.</p>
    `),
  };
}

// ==========================================
// Jersey size: parents pick the size for their player's glow jerseys via
// the link in the acceptance email. Stored on the registration row so the
// admin panel can total sizes for the swag order.
// ==========================================
const JERSEY_SIZES = ['Youth S', 'Youth M', 'Youth L', 'Youth XL', 'Adult S', 'Adult M', 'Adult L', 'Adult XL', 'Adult XXL'];
// Goalie jerseys are a different cut - parents pick 'Goalie Cut <size>'
const isJerseySize = (v: string) => JERSEY_SIZES.includes(v) || (v.startsWith('Goalie Cut ') && JERSEY_SIZES.includes(v.slice(11)));
const TEE_SIZES = ['Youth S', 'Youth M', 'Youth L', 'Youth XL', 'Adult S', 'Adult M', 'Adult L', 'Adult XL', 'Adult XXL'];
const FULL_PRICE_CENTS = 55000;

lightsOutRoutes.get('/size/:id', async (c) => {
  const id = String(c.req.param('id') || '');
  const row = await c.env.DB.prepare(
    `SELECT player_name, jersey_size, tee_size, jersey_number, jersey_number_request, jersey_name, status, paid_at, amount_paid_cents FROM lights_out_registrations WHERE id = ?`
  ).bind(id).first<any>();
  if (!row || ['invite_requested', 'invite_denied', 'denied'].includes(String(row.status))) {
    return c.json({ success: false, error: 'Registration not found' }, 404);
  }
  const balanceCents = row.paid_at ? Math.max(0, FULL_PRICE_CENTS - (row.amount_paid_cents || 0)) : 0;
  // Sensible defaults: the number they wore when they earned the star, and
  // the player's last name - parents can change both before saving
  const nameParts = String(row.player_name || '').trim().split(/\s+/);
  return c.json({ success: true, data: {
    player_name: row.player_name,
    jersey_size: row.jersey_size || null,
    tee_size: row.tee_size || null,
    jersey_number: (() => { const n = String(row.jersey_number_request || row.jersey_number || '').trim(); return /^\d{1,2}$/.test(n) ? n : ''; })(),
    jersey_name: row.jersey_name || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '') ,
    jersey_sizes: JERSEY_SIZES,
    tee_sizes: TEE_SIZES,
    balance_cents: balanceCents,
  } });
});

lightsOutRoutes.post('/size/:id', zValidator('json', z.object({
  jerseySize: z.string().optional(),
  teeSize: z.string().optional(),
  jerseyNumber: z.string().max(3).optional(),
  jerseyName: z.string().max(20).optional(),
})), async (c) => {
  const id = String(c.req.param('id') || '');
  const { jerseySize, teeSize, jerseyNumber, jerseyName } = c.req.valid('json');
  if (!jerseySize && !teeSize && jerseyNumber === undefined && jerseyName === undefined) {
    return c.json({ success: false, error: 'Nothing to save.' }, 400);
  }
  if (jerseySize && !isJerseySize(jerseySize)) return c.json({ success: false, error: 'Pick a jersey size from the list.' }, 400);
  if (teeSize && !TEE_SIZES.includes(teeSize)) return c.json({ success: false, error: 'Pick a tee size from the list.' }, 400);
  const num = (jerseyNumber || '').trim();
  if (num && !/^\d{1,2}$/.test(num)) return c.json({ success: false, error: 'Jersey number should be 1 or 2 digits.' }, 400);
  const jname = (jerseyName || '').trim().toUpperCase();
  if (jname && !/^[A-Z][A-Z .'-]{0,19}$/.test(jname)) return c.json({ success: false, error: 'Jersey name can only use letters.' }, 400);
  const r = await c.env.DB.prepare(
    `UPDATE lights_out_registrations SET
       jersey_size = COALESCE(?, jersey_size),
       tee_size = COALESCE(?, tee_size),
       jersey_number_request = COALESCE(?, jersey_number_request),
       jersey_name = COALESCE(?, jersey_name)
     WHERE id = ? AND status NOT IN ('invite_requested', 'invite_denied', 'denied')`
  ).bind(jerseySize || null, teeSize || null, num || null, jname || null, id).run();
  if (!r.meta?.changes) return c.json({ success: false, error: 'Registration not found' }, 404);
  return c.json({ success: true });
});

// ==========================================
// Balance payment: deposit families pay the remaining $350 through a fresh
// Stripe checkout. GET creates the session and redirects straight to Stripe
// so the acceptance email can link it directly.
// ==========================================
lightsOutRoutes.get('/balance/:id', async (c) => {
  const id = String(c.req.param('id') || '');
  const row = await c.env.DB.prepare(
    `SELECT id, player_name, email, status, paid_at, amount_paid_cents FROM lights_out_registrations WHERE id = ?`
  ).bind(id).first<any>();
  if (!row || !row.paid_at || ['invite_requested', 'invite_denied', 'denied'].includes(String(row.status))) {
    return c.text('Registration not found', 404);
  }
  const balance = Math.max(0, FULL_PRICE_CENTS - (row.amount_paid_cents || 0));
  if (balance <= 0) {
    return c.redirect(`https://ultimatetournaments.com/lights-out/size?id=${id}&balance=none`, 302);
  }
  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'payment',
      'success_url': `https://uht.chad-157.workers.dev/api/lights-out/balance-confirm?reg=${id}&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `https://ultimatetournaments.com/lights-out/size?id=${id}`,
      'customer_email': String(row.email || '').toLowerCase(),
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(balance),
      'line_items[0][price_data][product_data][name]': 'Lights Out Invitational - Remaining Balance',
      'line_items[0][price_data][product_data][description]': `${row.player_name} - pays the registration in full`,
      'line_items[0][quantity]': '1',
      'metadata[lights_out_reg_id]': id,
      'metadata[lights_out_balance]': '1',
      'payment_intent_data[metadata][lights_out_reg_id]': id,
    }).toString(),
  });
  const session = await stripeResponse.json() as any;
  if (!stripeResponse.ok || !session?.url) return c.text('Could not start checkout - please try again.', 500);
  await c.env.DB.prepare('UPDATE lights_out_registrations SET balance_session_id = ? WHERE id = ?').bind(session.id, id).run();
  return c.redirect(session.url, 302);
});

lightsOutRoutes.get('/balance-confirm', async (c) => {
  const id = String(c.req.query('reg') || '');
  const sessionId = String(c.req.query('session_id') || '');
  const row = await c.env.DB.prepare(
    `SELECT id, balance_session_id FROM lights_out_registrations WHERE id = ?`
  ).bind(id).first<any>();
  const sizeUrl = `https://ultimatetournaments.com/lights-out/size?id=${id}`;
  if (!row || !sessionId || sessionId !== row.balance_session_id) return c.redirect(sizeUrl, 302);
  const sres = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}` },
  });
  const session = await sres.json() as any;
  if (sres.ok && session?.payment_status === 'paid') {
    // Guard against double-credit on refresh: clear the session id in the same statement
    await c.env.DB.prepare(`
      UPDATE lights_out_registrations
      SET amount_paid_cents = COALESCE(amount_paid_cents, 0) + ?, payment_plan = 'full', balance_session_id = NULL
      WHERE id = ? AND balance_session_id = ?
    `).bind(session.amount_total || 0, id, sessionId).run();
    return c.redirect(sizeUrl + '&balance=paid', 302);
  }
  return c.redirect(sizeUrl, 302);
});

// ==========================================
// Swag sizes email: asks the family for jersey/tee sizes + number and name
// for the back, with their personal size link, the player's social graphic,
// and the balance button for deposit payers. Sent from the admin panel -
// test to yourself first, then one click for every paid family.
// ==========================================
function sizesEmail(row: any, id: string): { subject: string; html: string } {
  const first = String(row.player_name || '').trim().split(/\s+/)[0] || 'your player';
  const paidCents = row.amount_paid_cents || 0;
  const balance = Math.max(0, FULL_PRICE_CENTS - paidCents);
  return {
    subject: `${first}'s glow gear needs a size - Lights Out Invitational`,
    html: emailShell(`
      <p style="margin:0 0 6px;font-size:19px;font-weight:bold;color:#39ff14;">CONFIRMED. ${String(row.player_name).toUpperCase()} IS OFFICIALLY IN.</p>
      <p style="margin:0 0 14px;">${first} is locked in for the <b style="color:#7fd8ff;">Lights Out Invitational</b> - June 11-13, 2027 in St. Louis. The first glow-in-the-dark hockey tournament in UHT history, and ${first} is part of it.</p>
      <p style="margin:0 0 14px;">Now that ${first} is in, we need sizes so we can start working on ${first}'s <b style="color:#7fd8ff;">custom glow jersey</b>. It takes about 30 seconds.</p>
      <p style="margin:0 0 16px;">While you are there, tell us the <b style="color:#7fd8ff;">number and last name</b> you want on the back of ${first}'s jerseys. Number requests are first come, first served within each team, so the sooner the better.</p>
      <div style="text-align:center;margin:0 0 18px;">
        <a href="https://ultimatetournaments.com/lights-out/size?id=${id}" style="display:inline-block;background:linear-gradient(90deg,#39ff14,#00ccff);color:#04091a;text-decoration:none;font-weight:bold;padding:13px 34px;border-radius:999px;font-size:15px;">PICK ${first.toUpperCase()}'S SIZES</a>
      </div>
      <p style="margin:0 0 18px;color:#7fd8ff;font-size:13px;text-align:center;">Everything will be waiting at check-in, right before our opening ceremonies on June 11th.</p>
      ${balance > 0 ? `
      <div style="border-top:1px solid rgba(0,204,255,.25);padding-top:16px;margin:0 0 18px;">
        <p style="margin:0 0 10px;color:#ffb84d;"><b>Balance due: $${(balance / 100).toFixed(0)}.</b> Your deposit got ${first}'s spot - pay the balance as soon as possible to be fully locked in for June.</p>
        <div style="text-align:center;">
          <a href="https://uht.chad-157.workers.dev/api/lights-out/balance/${id}" style="display:inline-block;background:transparent;border:2px solid #ffb84d;color:#ffb84d;text-decoration:none;font-weight:bold;padding:10px 28px;border-radius:999px;font-size:14px;">PAY THE BALANCE</a>
        </div>
      </div>` : ''}
      <p style="margin:0 0 10px;">And in case you missed it - this is ${first}'s official graphic. Press and hold (or right click) to save it, then post it anywhere and tag <b style="color:#39ff14;">@ultimatetournaments</b>. We share our favorites.</p>
      <a href="https://uht.chad-157.workers.dev/api/lights-out/share/${id}.png" style="display:block;margin:0 0 4px;">
        <img src="https://uht.chad-157.workers.dev/api/lights-out/share/${id}.png" width="100%" style="max-width:512px;border-radius:14px;display:block;margin:0 auto;" alt="${row.player_name} is officially registered for the Lights Out Invitational" />
      </a>
    `),
  };
}

// Admin: test copy of the sizes email to any address, using the most recent
// paid registration so every link (size page, graphic, balance) is real
lightsOutRoutes.post('/admin/test-sizes-email', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({ to: z.string().email() })), async (c) => {
    const { to } = c.req.valid('json');
    const row = await c.env.DB.prepare(`
      SELECT * FROM lights_out_registrations
      WHERE status NOT LIKE 'invite_%' AND COALESCE(amount_paid_cents, 0) > 0
      ORDER BY CASE WHEN COALESCE(amount_paid_cents, 0) < 55000 THEN 0 ELSE 1 END, created_at DESC LIMIT 1
    `).first<any>();
    if (!row) return c.json({ success: false, error: 'No paid registrations yet' }, 404);
    const m = sizesEmail(row, row.id);
    await sendEmail(c.env, to, `[TEST] ${m.subject}`, m.html);
    return c.json({ success: true, data: { sample_player: row.player_name } });
  });

// Admin: the real blast - every paid family that has not had one yet.
// sizes_email_sent_at makes the button safe to click twice.
lightsOutRoutes.post('/admin/send-sizes-emails', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM lights_out_registrations
    WHERE status NOT LIKE 'invite_%' AND COALESCE(amount_paid_cents, 0) > 0
      AND sizes_email_sent_at IS NULL AND email LIKE '%_@_%'
    ORDER BY created_at LIMIT 200
  `).all<any>();
  let sent = 0;
  const failed: string[] = [];
  for (const row of (rows.results || []) as any[]) {
    try {
      const m = sizesEmail(row, row.id);
      // Direct send so a Resend rejection (rate limit etc.) is NOT marked
      // sent - the swallow-errors wrapper is for fire-and-forget emails only
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${(c.env as any).RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [row.email], subject: m.subject, html: m.html }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
      await c.env.DB.prepare("UPDATE lights_out_registrations SET sizes_email_sent_at = datetime('now') WHERE id = ?")
        .bind(row.id).run();
      sent++;
    } catch (e) {
      failed.push(String(row.player_name || row.id));
      console.error('sizes email failed for', row.id, e);
    }
    // Stay under Resend's rate limit (2/sec)
    await new Promise(r => setTimeout(r, 600));
  }
  return c.json({ success: true, data: { sent, failed } });
});

// Admin: did Resend actually get the sizes blast? Compares the provider's
// recent-send log against our sent flags. ?fix=1 re-arms anyone missing.
lightsOutRoutes.get('/admin/sizes-email-audit', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const marked = await c.env.DB.prepare(`
    SELECT id, player_name, email, sizes_email_sent_at FROM lights_out_registrations
    WHERE status NOT LIKE 'invite_%' AND COALESCE(amount_paid_cents, 0) > 0 AND sizes_email_sent_at IS NOT NULL
  `).all<any>();
  // Resend list API: newest first, page through until we are past the blast window
  const got = new Set<string>();
  let cursor = '';
  for (let page = 0; page < 8; page++) {
    const r = await fetch(`https://api.resend.com/emails?limit=100${cursor ? `&after=${cursor}` : ''}`, {
      headers: { Authorization: `Bearer ${(c.env as any).RESEND_API}` },
    });
    if (!r.ok) return c.json({ success: false, error: `Resend list failed (${r.status})` }, 502);
    const j = await r.json() as any;
    const list = j?.data || [];
    for (const e of list) {
      if (String(e.subject || '').includes('glow gear needs a size')) {
        for (const t of (Array.isArray(e.to) ? e.to : [e.to])) got.add(String(t).toLowerCase());
      }
    }
    if (!list.length || !j?.has_more) break;
    cursor = list[list.length - 1]?.id || '';
    if (!cursor) break;
  }
  const missing = (marked.results || []).filter((m: any) => !got.has(String(m.email).toLowerCase()));
  if (c.req.query('fix') === '1' && missing.length) {
    for (const m of missing as any[]) {
      await c.env.DB.prepare('UPDATE lights_out_registrations SET sizes_email_sent_at = NULL WHERE id = ?').bind(m.id).run();
    }
  }
  return c.json({ success: true, data: {
    marked_sent: (marked.results || []).length,
    confirmed_at_resend: got.size,
    missing: missing.map((m: any) => ({ player: m.player_name, email: m.email })),
    fixed: c.req.query('fix') === '1' ? missing.length : 0,
  } });
});

// Admin: send yourself a copy of the acceptance email for any eligible row
lightsOutRoutes.post('/admin/test-approved-email', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({ registrationId: z.string().min(1), to: z.string().email() })), async (c) => {
    const { registrationId, to } = c.req.valid('json');
    const row = await c.env.DB.prepare(
      `SELECT r.*, e.name as star_event_name FROM lights_out_registrations r
       LEFT JOIN events e ON e.id = r.star_event_id WHERE r.id = ?`
    ).bind(registrationId).first<any>();
    if (!row) return c.json({ success: false, error: 'Registration not found' }, 404);
    const m = approvedEmail(row, registrationId);
    await sendEmail(c.env, to, `[TEST] ${m.subject}`, m.html);
    return c.json({ success: true });
  });

// ==========================================
// Abandoned checkout nudge: families who started registration but never
// paid get ONE reminder with a fresh Stripe link straight to checkout.
// Runs daily from the Lights Out sweep and on demand from the admin panel.
// ==========================================
export async function remindIncompleteCheckouts(env: Env): Promise<{ sent: number; skipped: number }> {
  const db = env.DB;
  const rows = (await db.prepare(`
    SELECT * FROM lights_out_registrations
    WHERE status = 'pending_payment' AND paid_at IS NULL
      AND payment_reminder_at IS NULL
      AND created_at <= datetime('now', '-45 minutes')
      AND created_at >= '2026-11-13'
  `).all()).results || [];

  let sent = 0, skipped = 0;
  for (const r of rows as any[]) {
    // Same family already completed a registration - no nudge needed
    const alreadyPaid = await db.prepare(
      `SELECT 1 as x FROM lights_out_registrations WHERE email = ? AND paid_at IS NOT NULL LIMIT 1`
    ).bind(r.email).first<any>();
    if (alreadyPaid) {
      await db.prepare(`UPDATE lights_out_registrations SET payment_reminder_at = datetime('now') WHERE id = ?`).bind(r.id).run();
      skipped++;
      continue;
    }

    const isDeposit = r.payment_plan === 'deposit';
    const chargeCents = isDeposit ? LIGHTS_OUT_DEPOSIT_CENTS : LIGHTS_OUT_PRICE_CENTS;
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(env as any).STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': `https://ultimatetournaments.com/lights-out/?reg=${r.id}&session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': 'https://ultimatetournaments.com/lights-out/?cancelled=1',
        'customer_email': String(r.email),
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(chargeCents),
        'line_items[0][price_data][product_data][name]': isDeposit ? 'Lights Out Invitational - $200 Non-Refundable Deposit' : 'Lights Out Invitational - Player Registration (Paid in Full)',
        'line_items[0][price_data][product_data][description]': `${r.player_name} · St. Louis, MO · jerseys, stick, puck, tee and duffle included${isDeposit ? ' · $350 balance due before the event' : ''}`,
        'line_items[0][quantity]': '1',
        'metadata[lights_out_reg_id]': String(r.id),
        'metadata[player_name]': String(r.player_name),
        'payment_intent_data[metadata][lights_out_reg_id]': String(r.id),
      }).toString(),
    });
    const session = await stripeResponse.json() as any;
    if (!stripeResponse.ok || !session?.url) continue;

    const first = String(r.player_name).trim().split(/\s+/)[0] || 'your player';
    await sendEmail(env, String(r.email), `${first}'s Lights Out spot is not locked in yet`,
      emailShell(`
        <h2 style="margin:0 0 14px;color:#39ff14;font-size:19px;">One step left</h2>
        <p style="margin:0 0 14px;">Hi ${r.parent_name},</p>
        <p style="margin:0 0 14px;">You started <b style="color:#7fd8ff;">${r.player_name}</b>'s registration for the Lights Out Invitational - June 11-13, 2027 in St. Louis - but the payment never went through, so the spot is not locked in yet.</p>
        <p style="margin:0 0 14px;">A heads up on timing: registrations are moving fast, and at this pace the event will be sold out this week. ${isDeposit ? 'The $200 non-refundable deposit is all it takes to hold the spot.' : ''}</p>
        <p style="margin:0 0 16px;text-align:center;">
          <a href="${session.url}" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">${isDeposit ? 'FINISH PAYMENT - $200 DEPOSIT' : 'FINISH PAYMENT - $550'}</a>
        </p>
        <p style="margin:0 0 14px;color:#9fb3cc;font-size:13px;">That button goes straight to secure Stripe checkout for ${first} - nothing to fill out again. Want to switch between deposit and paying in full? Just register again at <a href="https://ultimatetournaments.com/lights-out?register=1" style="color:#00ccff;">ultimatetournaments.com/lights-out</a>.</p>
        <p style="margin:0;">See you in the dark.<br/><br/>Johnny<br/>Ultimate Hockey Tournaments</p>
      `));
    await db.prepare(`UPDATE lights_out_registrations SET payment_reminder_at = datetime('now'), stripe_session_id = ? WHERE id = ?`)
      .bind(session.id, r.id).run();
    sent++;
  }
  return { sent, skipped };
}

lightsOutRoutes.post('/admin/remind-incomplete', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const result = await remindIncompleteCheckouts(c.env);
  return c.json({ success: true, data: result });
});

// ==========================================
// Shareable "I'M IN" social graphic (1080x1080 PNG), personalized per
// player. Linked from the acceptance email so families can post it, and
// from the admin list so staff can see each one.
// ==========================================
lightsOutRoutes.get('/share/:id', async (c) => {
  const id = String(c.req.param('id') || '').replace(/\.png$/i, '');
  const row = await c.env.DB.prepare(
    `SELECT player_name, team_name, status, paid_at FROM lights_out_registrations WHERE id = ?`
  ).bind(id).first<any>();
  // Only players who are actually in (paid or approved) get a graphic
  if (!row || !(row.paid_at || ['approved', 'pending'].includes(String(row.status)))) {
    return c.text('Not found', 404);
  }

  const cache = (caches as any).default;
  // v3: bump to invalidate cached renders after design changes
  const keyUrl = new URL(c.req.url);
  keyUrl.searchParams.set('design', 'v3');
  const cacheKey = new Request(keyUrl.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const [bold, semi, logoBuf, arenaBuf] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/rajdhani/v17/LDI2apCSOBg7S-QT7pa8FsOs.ttf').then(r => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/rajdhani/v17/LDI2apCSOBg7S-QT7pbYF8Os.ttf').then(r => r.arrayBuffer()),
    fetch('https://ultimatetournaments.com/lights-out-logo.png').then(r => r.arrayBuffer()).catch(() => null),
    fetch('https://ultimatetournaments.com/lights-out-arena.jpg').then(r => r.arrayBuffer()).catch(() => null),
  ]);
  const toB64 = (buf: ArrayBuffer | null, mime: string): string => {
    if (!buf) return '';
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${mime};base64,${btoa(bin)}`;
  };
  const logoB64 = toB64(logoBuf, 'image/png');
  const arenaB64 = toB64(arenaBuf, 'image/jpeg');

  const name = String(row.player_name || '').toUpperCase();
  const team = String(row.team_name || '').toUpperCase();
  const nameSize = name.length > 18 ? 72 : name.length > 12 ? 92 : 108;

  const html = `
  <div style="position:relative;display:flex;flex-direction:column;width:1080px;height:1080px;background:#04091a;align-items:center;justify-content:center;font-family:Rajdhani;">
    ${arenaB64 ? `<img src="${arenaB64}" width="1080" height="1080" style="position:absolute;top:0;left:0;width:1080px;height:1080px;object-fit:cover;" />` : ''}
    <div style="position:absolute;top:0;left:0;display:flex;width:1080px;height:1080px;background:rgba(4,9,26,.62);background-image:radial-gradient(circle at 20% 15%, rgba(0,204,255,.18), transparent 45%),radial-gradient(circle at 80% 85%, rgba(57,255,20,.16), transparent 45%);"></div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:980px;height:980px;border:3px solid rgba(57,255,20,.55);border-radius:36px;background:rgba(4,9,26,.72);">
      ${logoB64 ? `<img src="${logoB64}" style="width:300px;height:300px;object-fit:contain;margin-bottom:6px;" />` : ''}
      <div style="display:flex;font-size:34px;font-weight:600;letter-spacing:14px;color:#7fd8ff;margin-bottom:26px;">OFFICIALLY REGISTERED</div>
      <div style="display:flex;font-size:${nameSize}px;font-weight:700;letter-spacing:6px;color:#ffffff;text-shadow:0 0 28px rgba(0,204,255,.9);text-align:center;max-width:900px;">${name}</div>
      <div style="display:flex;font-size:36px;font-weight:600;letter-spacing:4px;color:rgba(255,255,255,.75);margin-top:14px;text-align:center;max-width:880px;">${team}</div>
      <div style="display:flex;width:520px;height:3px;background:linear-gradient(90deg, transparent, rgba(57,255,20,.8), transparent);margin:38px 0;"></div>
      <div style="display:flex;font-size:58px;font-weight:700;letter-spacing:10px;color:#39ff14;text-shadow:0 0 34px rgba(57,255,20,.95);">I AM IN</div>
      <div style="display:flex;font-size:35px;font-weight:600;letter-spacing:6px;color:#ffffff;margin-top:22px;">JUNE 11-13, 2027 · ST. LOUIS</div>
      <div style="display:flex;font-size:26px;font-weight:600;letter-spacing:4px;color:rgba(127,216,255,.85);margin-top:16px;">UHT'S FIRST GLOW-IN-THE-DARK HOCKEY TOURNAMENT</div>
      <div style="display:flex;font-size:24px;font-weight:600;letter-spacing:3px;color:rgba(255,255,255,.45);margin-top:30px;">ULTIMATETOURNAMENTS.COM/LIGHTS-OUT</div>
    </div>
  </div>`;

  const img = new ImageResponse(html, {
    width: 1080,
    height: 1080,
    fonts: [
      { name: 'Rajdhani', data: bold, weight: 700 },
      { name: 'Rajdhani', data: semi, weight: 600 },
    ],
  });
  const body = await img.arrayBuffer();
  const resp = new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
});
