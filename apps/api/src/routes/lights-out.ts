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
    <p style="text-align:center;color:#55637a;font-size:11px;margin-top:22px;">Ultimate Hockey Tournaments · Lights Out Invitational · St. Louis, MO<br>
      <a href="https://ultimatetournaments.com/unsubscribe" style="color:#55637a;text-decoration:underline;">Unsubscribe</a></p>
  </div></body></html>`;
}

// Emails that unsubscribed from UHT mail (contacts.is_subscribed_email = 0
// or any email_list_contacts row inactive - both are set by the public
// /unsubscribe flow). Blast-style sends skip them; transactional emails
// (payment confirmations, codes a family asked for) do not check this.
async function unsubscribedSet(db: any, emails: any[]): Promise<Set<string>> {
  const out = new Set<string>();
  const uniq = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    try {
      const r1 = await db.prepare(`SELECT LOWER(email) as em FROM contacts WHERE is_subscribed_email = 0 AND LOWER(email) IN (${ph})`).bind(...chunk).all();
      for (const row of (r1.results || [])) out.add(String(row.em));
      const r2 = await db.prepare(`SELECT DISTINCT LOWER(email) as em FROM email_list_contacts WHERE is_active = 0 AND LOWER(email) IN (${ph})`).bind(...chunk).all();
      for (const row of (r2.results || [])) out.add(String(row.em));
    } catch {}
  }
  return out;
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

// Goalie caps per division (Chad, Nov 2026): Mite 6, Squirt 8 (full at
// launch), Pee Wee 8, Bantam 6, Midget uncapped. When a division's PAID
// goalie count reaches its cap, new goalie registrations for those birth
// years go to a free waitlist instead of checkout. The gate is live-count
// based, so sending a waitlisted family an invite code - or a refund -
// reopens checkout automatically. Staff invite codes always pass.
// SOLD OUT (Chad, Nov 23 2026): every spot claimed in 7 days. New
// registrations are closed at the API so no stale page or old email link can
// start a checkout. Balance payments for existing deposits still work
// (GET /balance/:id is untouched). Flip to false to reopen checkout - e.g.
// when the second location is announced.
const SOLD_OUT = true;

const GOALIE_CAPS: { div: string; min: number; max: number; cap: number }[] = [
  { div: 'Mite', min: 2018, max: 2023, cap: 6 },
  { div: 'Squirt', min: 2016, max: 2017, cap: 8 },
  { div: 'Pee Wee', min: 2014, max: 2015, cap: 8 },
  { div: 'Bantam', min: 2012, max: 2013, cap: 6 },
];
const goalieCapFor = (birthYear?: string | null, position?: string | null) => {
  if (String(position || '').trim().toLowerCase() !== 'goalie') return null;
  const y = parseInt(String(birthYear || '').trim(), 10);
  if (!y || isNaN(y)) return null;
  return GOALIE_CAPS.find(g => y >= g.min && y <= g.max) || null;
};

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

// Goalie waitlist - a division's goalie spots are at cap, so the family
// joins this free list instead of paying. When a spot opens, staff sends an
// invite code from the admin panel (goalie_waitlist -> invite_approved) and
// the code unlocks the normal register form.
lightsOutRoutes.post('/goalie-waitlist', zValidator('json', inviteRequestSchema), async (c) => {
  const b = c.req.valid('json');
  const db = c.env.DB;
  // One waitlist entry per player + email, quietly idempotent
  const dup = await db.prepare(
    `SELECT id FROM lights_out_registrations WHERE status = 'goalie_waitlist' AND LOWER(player_name) = LOWER(?) AND LOWER(email) = LOWER(?)`
  ).bind(b.playerName.trim(), b.email.trim()).first<any>();
  if (dup) return c.json({ success: true, data: { id: dup.id, already: true } });

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO lights_out_registrations (id, player_name, team_name, star_event_id, birth_year, position, parent_name, email, phone, status, star_verified, notes)
    VALUES (?, ?, ?, 'goalie-waitlist', ?, 'Goalie', ?, ?, ?, 'goalie_waitlist', 0, 'Goalie waitlist - division goalie spots at cap')
  `).bind(id, b.playerName.trim(), b.teamName.trim(), b.birthYear || null,
    b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null).run();

  const first = b.playerName.trim().split(' ')[0];
  await sendEmail(c.env, b.email.trim(), `${b.playerName.trim()} is on the Lights Out goalie waitlist`,
    emailShell(`
      <h2 style="margin:0 0 14px;color:#39ff14;font-size:19px;">You are on the goalie waitlist</h2>
      <p style="margin:0 0 14px;">Hi ${b.parentName.trim()},</p>
      <p style="margin:0 0 14px;">Goalie spots for ${first}'s age group are completely full - that is how fast this event is moving. <b style="color:#7fd8ff;">${b.playerName.trim()}</b> is officially on the goalie waitlist for the Lights Out Invitational, June 11-13, 2027 in St. Louis.</p>
      <p style="margin:0 0 14px;">No payment was taken and there is nothing else you need to do. The moment a goalie spot opens, we email you a single-use invite code - codes go out in waitlist order, and the spot is claimed when payment is made.</p>
      <p style="margin:0;">Keep ${first} in the crease. We hope to see those pads under the glow.</p>
    `));
  await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out GOALIE WAITLIST: ${b.playerName.trim()} (${b.teamName.trim()})`,
    emailShell(`
      <p style="margin:0 0 6px;">Player: <b>${b.playerName.trim()}</b> (${b.birthYear || 'birth year n/a'}, Goalie)</p>
      <p style="margin:0 0 6px;">Team: ${b.teamName.trim()}</p>
      <p style="margin:0 0 6px;">Parent: ${b.parentName.trim()} - ${b.email.trim()} ${b.phone ? '- ' + b.phone : ''}</p>
      <p style="margin:10px 0 0;color:#7fd8ff;">Division goalie spots are at cap. When one opens, use Spot Opened + Send Code on the admin Lights Out page (Goalie Waitlist filter).</p>
    `));
  return c.json({ success: true, data: { id } });
});

// Sold-out waitlist - the event filled in 7 days, so families pick their
// age level and get in line. If a spot opens, or when the second location
// is announced (targeting the next 2 weeks), the waitlist hears first and
// registers first. No payment, idempotent per player + email.
const AGE_LEVELS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', 'Midget'] as const;
const waitlistSchema = z.object({
  playerName: z.string().min(2).max(80),
  ageLevel: z.enum(AGE_LEVELS),
  teamName: z.string().max(120).optional(),
  position: z.string().max(20).optional(),
  parentName: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
});

lightsOutRoutes.post('/waitlist', zValidator('json', waitlistSchema), async (c) => {
  const b = c.req.valid('json');
  const db = c.env.DB;
  const dup = await db.prepare(
    `SELECT id FROM lights_out_registrations WHERE status = 'waitlist' AND LOWER(player_name) = LOWER(?) AND LOWER(email) = LOWER(?)`
  ).bind(b.playerName.trim(), b.email.trim()).first<any>();
  if (dup) return c.json({ success: true, data: { id: dup.id, already: true } });

  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO lights_out_registrations (id, player_name, team_name, star_event_id, age_level, position, parent_name, email, phone, status, star_verified, notes)
    VALUES (?, ?, ?, 'waitlist', ?, ?, ?, ?, ?, 'waitlist', 0, 'Sold-out waitlist - event filled in 7 days')
  `).bind(id, b.playerName.trim(), b.teamName?.trim() || '', b.ageLevel, b.position || null,
    b.parentName.trim(), b.email.trim().toLowerCase(), b.phone || null).run();

  const first = b.playerName.trim().split(' ')[0];
  await sendEmail(c.env, b.email.trim(), `${b.playerName.trim()} is on the Lights Out waitlist`,
    emailShell(`
      <h2 style="margin:0 0 14px;color:#39ff14;font-size:19px;">You are on the waitlist</h2>
      <p style="margin:0 0 14px;">Hi ${b.parentName.trim()},</p>
      <p style="margin:0 0 14px;">The Lights Out Invitational <b style="color:#ffb84d;">sold out in 7 days</b> - every single spot claimed. <b style="color:#7fd8ff;">${b.playerName.trim()}</b> is now officially on the waitlist for the ${b.ageLevel} age level.</p>
      <p style="margin:0 0 14px;">Here is the exciting part: we are working on securing a <b style="color:#7fd8ff;">second location</b> right now, and it could be announced in the next 2 weeks. Our waitlist gets the <b>first opportunity to register</b> - before anyone else even hears about it.</p>
      <p style="margin:0 0 14px;">No payment was taken and there is nothing else you need to do. If a spot opens in ${first}'s age level, or the moment the second location goes live, you will hear from us first.</p>
      <p style="margin:0;">Keep ${first} skating. We hope to see them under the glow in June.</p>
    `));
  await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out WAITLIST: ${b.playerName.trim()} (${b.ageLevel})`,
    emailShell(`
      <p style="margin:0 0 6px;">Player: <b>${b.playerName.trim()}</b> (${b.ageLevel}${b.position ? ', ' + b.position : ''})</p>
      ${b.teamName?.trim() ? `<p style="margin:0 0 6px;">Team: ${b.teamName.trim()}</p>` : ''}
      <p style="margin:0 0 6px;">Parent: ${b.parentName.trim()} - ${b.email.trim()} ${b.phone ? '- ' + b.phone : ''}</p>
      <p style="margin:10px 0 0;color:#7fd8ff;">Sold-out waitlist entry - see the Waitlist filter on the admin Lights Out page.</p>
    `));
  return c.json({ success: true, data: { id } });
});

lightsOutRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  if (SOLD_OUT) {
    return c.json({
      success: false, soldOut: true,
      error: 'The Lights Out Invitational is completely SOLD OUT - every spot was claimed in 7 days. Join the waitlist: if a spot opens or our second location is announced, the waitlist gets the first opportunity to register.',
    }, 409);
  }
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
    // Goalie cap: paid goalies hold the spots. A full division never
    // reaches Stripe - the frontend flips into waitlist mode instead.
    const gcap = goalieCapFor(b.birthYear, b.position);
    if (gcap) {
      const held = await db.prepare(`
        SELECT COUNT(*) as n FROM lights_out_registrations
        WHERE position = 'Goalie' AND status IN ('pending', 'approved')
          AND CAST(birth_year AS INTEGER) BETWEEN ? AND ?
      `).bind(gcap.min, gcap.max).first<any>();
      if ((held?.n || 0) >= gcap.cap) {
        return c.json({
          success: false,
          goalieWaitlist: true,
          error: `${gcap.div} goalie spots are sold out. Join the free goalie waitlist and we will email you an invite code the moment a spot opens.`,
        }, 409);
      }
    }
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
      'payment_intent_data[metadata][player_name]': b.playerName.trim(),
      // Shows as the payment description in the Stripe dashboard list, so
      // staff can match a charge to a player at a glance
      'payment_intent_data[description]': `Lights Out - ${b.playerName.trim()} (${isDeposit ? 'deposit' : 'full'})`,
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
  if (!sessionId) return c.json({ success: false, error: 'Session mismatch' }, 400);

  const sres = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` },
  });
  const session = await sres.json() as any;
  // A double-submit can leave a newer unpaid session id on the row while
  // the family pays the first one. The paid session's metadata names the
  // registration it was created for, so trust that over the stored id.
  if (sessionId !== row.stripe_session_id && session?.metadata?.lights_out_reg_id !== id) {
    return c.json({ success: false, error: 'Session mismatch' }, 400);
  }
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

// Swag item tracker: every giveaway item with its order status and
// tracking. Total-to-order is computed live from paid registrations
// (qty_per_player x paid count), so it tracks sellout/refunds on its own.
// Seeded once from the invoice's item list; items can be added later.
const SWAG_SEED: [string, number][] = [
  ['Custom Glow Jerseys (home + away)', 2],
  ['Glow T-Shirt', 1],
  ['UHT Duffle Bag', 1],
  ['Custom Glow UHT Puck', 1],
  ['Collector Stick', 1],
  ['Custom Trading Cards', 1],
  ['Trading Card Binder', 1],
  ['Custom Lights Out Ring', 1],
  ['Lights Out Blanket', 1],
  ['Bag Tag', 1],
];

// Missing-size nudge: every paid player with no jersey size on the new
// chart gets a reminder with their personal size link. Covers both the
// re-pick group (old size snapshotted) and never-picked. Transactional.
// Same-day dedupe via missing_size_email_sent_at so a double click never
// double-sends, but the button works again on a later day.
lightsOutRoutes.post('/admin/missing-size-emails', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const db = c.env.DB;
  try { await db.prepare('ALTER TABLE lights_out_registrations ADD COLUMN missing_size_email_sent_at TEXT').run(); } catch {}

  const pending = () => db.prepare(`
    SELECT id, player_name, parent_name, email, jersey_size_old FROM lights_out_registrations
    WHERE status NOT LIKE 'invite_%' AND status NOT IN ('refunded', 'waitlist', 'goalie_waitlist')
      AND COALESCE(amount_paid_cents, 0) > 0 AND (jersey_size IS NULL OR jersey_size = '')
      AND email IS NOT NULL AND email != ''
      AND (missing_size_email_sent_at IS NULL OR date(missing_size_email_sent_at) < date('now'))
    ORDER BY created_at, id
  `).all<any>();

  if (c.req.query('dry')) {
    const rows = (await pending()).results || [];
    return c.json({ success: true, data: { remaining: rows.length } });
  }

  const nudgeEmail = (row: any) => {
    const first = String(row.player_name || '').trim().split(/\s+/)[0] || 'your player';
    return {
      subject: `Action needed - ${row.player_name} still needs a jersey size for Lights Out`,
      html: emailShell(`
        <h2 style="margin:0 0 14px;color:#39ff14;font-size:19px;">One quick thing for ${first}'s jerseys</h2>
        <p style="margin:0 0 14px;">Hi ${row.parent_name},</p>
        <p style="margin:0 0 14px;"><b style="color:#7fd8ff;">${row.player_name}</b> is locked in for the Lights Out Invitational - but we still do not have a <b style="color:#ffb84d;">jersey size</b> on file, and the custom glow jerseys are ordered per player.</p>
        ${row.jersey_size_old ? `<p style="margin:0 0 14px;">We switched to the manufacturer's real size chart (with exact measurements in inches), so your earlier pick of <b>${row.jersey_size_old}</b> needs a quick re-pick on the new chart - it takes about 30 seconds.</p>` : `<p style="margin:0 0 14px;">Picking takes about 30 seconds - the chart shows exact measurements in inches, so you can match a jersey that fits well today.</p>`}
        <p style="margin:0 0 16px;text-align:center;">
          <a href="https://ultimatetournaments.com/lights-out/size?id=${row.id}" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">PICK ${first.toUpperCase()}'S SIZES NOW</a>
        </p>
        <p style="margin:0;">The jersey order goes to the manufacturer soon - without a size on file we would have to guess, and nobody wants a guessed jersey. Thank you!</p>
      `),
    };
  };

  const batch = Math.min(parseInt(c.req.query('batch') || '30', 10) || 30, 40);
  const rows = ((await pending()).results || []).slice(0, batch);
  let sent = 0;
  for (const row of rows) {
    const m = nudgeEmail(row);
    await sendEmail(c.env, row.email, m.subject, m.html);
    await db.prepare(`UPDATE lights_out_registrations SET missing_size_email_sent_at = datetime('now') WHERE id = ?`).bind(row.id).run();
    sent++;
    await new Promise(res => setTimeout(res, 650));
  }
  const left = ((await pending()).results || []).length;
  if (sent > 0 && left === 0) {
    await sendEmail(c.env, 'johnny@ultimatetournaments.com', 'Lights Out: missing-size nudge sent to every family without a jersey size',
      emailShell(`<p style="margin:0;">Every paid family still missing a jersey size got the reminder with their personal size link. The Jerseys tab counter on the admin page counts down as they pick.</p>`));
  }
  return c.json({ success: true, data: { sent, remaining: left } });
});

lightsOutRoutes.get('/admin/swag-items', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  let items = (await db.prepare('SELECT * FROM lights_out_swag_items ORDER BY sort_order, name').all<any>()).results || [];
  if (items.length === 0) {
    let i = 0;
    for (const [name, qty] of SWAG_SEED) {
      await db.prepare(`INSERT INTO lights_out_swag_items (id, name, qty_per_player, sort_order, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`)
        .bind(crypto.randomUUID().replace(/-/g, ''), name, qty, i++).run();
    }
    items = (await db.prepare('SELECT * FROM lights_out_swag_items ORDER BY sort_order, name').all<any>()).results || [];
  }
  return c.json({ success: true, data: items });
});

lightsOutRoutes.post('/admin/swag-items', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({ name: z.string().min(2).max(120), qtyPerPlayer: z.number().int().min(1).max(10).default(1) })), async (c) => {
    const { name, qtyPerPlayer } = c.req.valid('json');
    const db = c.env.DB;
    const max = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM lights_out_swag_items').first<any>();
    const id = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`INSERT INTO lights_out_swag_items (id, name, qty_per_player, sort_order, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`)
      .bind(id, name.trim(), qtyPerPlayer, (max?.m ?? -1) + 1).run();
    return c.json({ success: true, data: { id } });
  });

lightsOutRoutes.patch('/admin/swag-items/:id', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({
    status: z.enum(['not_ordered', 'ordered', 'sample', 'shipped']).optional(),
    tracking: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    name: z.string().min(2).max(120).optional(),
    qtyPerPlayer: z.number().int().min(1).max(10).optional(),
    orderQty: z.number().int().min(0).max(100000).optional(),
    unitCostCents: z.number().int().min(0).max(100000000).nullable().optional(),
  })), async (c) => {
    const b = c.req.valid('json');
    const db = c.env.DB;
    const sets: string[] = []; const vals: any[] = [];
    if (b.status !== undefined) { sets.push('status = ?'); vals.push(b.status); }
    if (b.tracking !== undefined) { sets.push('tracking = ?'); vals.push(b.tracking.trim() || null); }
    if (b.notes !== undefined) { sets.push('notes = ?'); vals.push(b.notes.trim() || null); }
    if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name.trim()); }
    if (b.qtyPerPlayer !== undefined) { sets.push('qty_per_player = ?'); vals.push(b.qtyPerPlayer); }
    if (b.orderQty !== undefined) { sets.push('order_qty = ?'); vals.push(b.orderQty); }
    if (b.unitCostCents !== undefined) { sets.push('unit_cost_cents = ?'); vals.push(b.unitCostCents); }
    if (sets.length === 0) return c.json({ success: false, error: 'Nothing to update' }, 400);
    sets.push(`updated_at = datetime('now')`);
    vals.push(c.req.param('id'));
    await db.prepare(`UPDATE lights_out_swag_items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return c.json({ success: true });
  });

lightsOutRoutes.get('/admin/requests', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT lr.*, e.name as star_event_name
    FROM lights_out_registrations lr
    LEFT JOIN events e ON e.id = lr.star_event_id
    ORDER BY CASE lr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, lr.created_at DESC
  `).all<any>();
  return c.json({ success: true, data: rows.results || [] });
});

// Admin: fix a registration's details (misspelled names, wrong birth year,
// bad email, jersey fixes). Updates only the fields sent; empty string
// clears a field. Never touches status, payment, or codes, and sends no
// emails.
const detailsSchema = z.object({
  player_name: z.string().trim().min(1).optional(),
  team_name: z.string().trim().optional(),
  birth_year: z.string().trim().optional(),
  position: z.string().trim().optional(),
  parent_name: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  jersey_name: z.string().trim().optional(),
  jersey_number_request: z.string().trim().optional(),
  jersey_size: z.string().trim().optional(),
  tee_size: z.string().trim().optional(),
  assigned_team: z.string().trim().optional(),
  notes: z.string().optional(),
});
lightsOutRoutes.patch('/admin/requests/:id/details', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', detailsSchema), async (c) => {
    const id = c.req.param('id');
    const b = c.req.valid('json') as Record<string, string | undefined>;
    const db = c.env.DB;
    const row = await db.prepare('SELECT id FROM lights_out_registrations WHERE id = ?').bind(id).first<any>();
    if (!row) return c.json({ success: false, error: 'Not found' }, 404);
    const fields = Object.entries(b).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return c.json({ success: false, error: 'Nothing to update' }, 400);
    const sets = fields.map(([k]) => `${k} = ?`).join(', ');
    const vals = fields.map(([k, v]) => {
      if (k === 'email') return String(v).toLowerCase();
      return v === '' ? null : v;
    });
    await db.prepare(`UPDATE lights_out_registrations SET ${sets} WHERE id = ?`).bind(...vals, id).run();
    return c.json({ success: true });
  });

lightsOutRoutes.patch('/admin/requests/:id', authMiddleware, requireRole('admin', 'director'),
  zValidator('json', z.object({ status: z.enum(['approved', 'denied', 'pending', 'invite_approved', 'invite_denied', 'goalie_waitlist']) })), async (c) => {
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
      const offWaitlist = row.status === 'goalie_waitlist';
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
      await sendEmail(c.env, row.email, offWaitlist ? `A goalie spot opened - ${row.player_name} is invited` : `${row.player_name} is invited - Lights Out Invitational`,
        emailShell(`
          <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#39ff14;">${offWaitlist ? 'A GOALIE SPOT OPENED.' : 'CONGRATULATIONS.'} ${String(row.player_name).toUpperCase()} IS INVITED.</p>
          <p style="margin:0 0 14px;">${offWaitlist ? `A goalie spot just opened up, and it goes straight to the waitlist - that means ${row.player_name}.` : 'Your invite request made the cut.'} ${row.player_name} is officially invited to the <b style="color:#7fd8ff;">Lights Out Invitational</b> - June 11-13, 2027 in St. Louis. Dark arena, glowing ice, and every player keeps the custom glow jerseys, collector stick, and glow puck.</p>
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
// Real manufacturer jersey sizes (supplier chart, Nov 2026). The number is
// the actual garment size in inches. Player cut and goalie cut are
// different garments with their own size runs; goalie cut stores as GC-*.
const PLAYER_JERSEY_SIZES = ['CHILD-36', 'YXS-38', 'YS-40', 'YM-42', 'YL-44', 'YXL-46', 'AS-48', 'AM-50', 'AL-52', 'AXL-54', 'A2XL-56', 'A3XL-58', 'A4XL-60'];
const GOALIE_JERSEY_SIZES = ['GC-44', 'GC-46', 'GC-48', 'GC-50', 'GC-52', 'GC-54', 'GC-56', 'GC-58', 'GC-60', 'GC-62', 'GC-64'];
const isJerseySize = (v: string) => PLAYER_JERSEY_SIZES.includes(v) || GOALIE_JERSEY_SIZES.includes(v);
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
    jersey_sizes: PLAYER_JERSEY_SIZES,
    goalie_jersey_sizes: GOALIE_JERSEY_SIZES,
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
      'payment_intent_data[description]': `Lights Out BALANCE - ${row.player_name}`,
      'payment_intent_data[metadata][player_name]': String(row.player_name || ''),
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
      WHERE status NOT LIKE 'invite_%' AND status != 'refunded' AND COALESCE(amount_paid_cents, 0) > 0
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
    WHERE status NOT LIKE 'invite_%' AND status != 'refunded' AND COALESCE(amount_paid_cents, 0) > 0
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
    WHERE status NOT LIKE 'invite_%' AND status != 'refunded' AND COALESCE(amount_paid_cents, 0) > 0 AND sizes_email_sent_at IS NOT NULL
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

// Old generic size -> closest real manufacturer size, suggested in the
// re-pick email so families have a starting point
const RESIZE_MAP: Record<string, string> = {
  'Youth S': 'YS-40', 'Youth M': 'YM-42', 'Youth L': 'YL-44', 'Youth XL': 'YXL-46',
  'Adult S': 'AS-48', 'Adult M': 'AM-50', 'Adult L': 'AL-52', 'Adult XL': 'AXL-54', 'Adult XXL': 'A2XL-56',
  'Goalie Cut Youth S': 'GC-44', 'Goalie Cut Youth M': 'GC-46', 'Goalie Cut Youth L': 'GC-48', 'Goalie Cut Youth XL': 'GC-50',
  'Goalie Cut Adult S': 'GC-52', 'Goalie Cut Adult M': 'GC-54', 'Goalie Cut Adult L': 'GC-56', 'Goalie Cut Adult XL': 'GC-58', 'Goalie Cut Adult XXL': 'GC-60',
};

// Admin: jersey re-pick blast after the switch to real manufacturer sizes
// (Nov 2026). Targets paid rows whose old pick was snapshotted into
// jersey_size_old and whose jersey_size is now empty. ?dry=1 counts,
// ?test=you@x sends a sample, otherwise sends a batch and stamps
// resize_email_sent_at. Call until remaining is 0.
lightsOutRoutes.post('/admin/resize-emails', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const db = c.env.DB;

  const resizeEmail = (row: any) => {
    const first = String(row.player_name || '').trim().split(/\s+/)[0] || 'your player';
    const oldPick = String(row.jersey_size_old || '');
    const suggested = RESIZE_MAP[oldPick] || '';
    const wasGoalie = oldPick.startsWith('Goalie Cut ');
    return {
      subject: `Quick re-pick needed - ${row.player_name}'s Lights Out jersey size`,
      html: emailShell(`
        <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#7fd8ff;">ONE QUICK FIX ON ${String(first).toUpperCase()}'S JERSEY</p>
        <p style="margin:0 0 14px;">Hi ${row.parent_name},</p>
        <p style="margin:0 0 14px;">We heard you - the jersey sizing was confusing, and we want ${first}'s glow jersey to fit perfectly. We have switched the size form to the manufacturer's REAL jersey sizes, with actual chest, sleeve, and body measurements for every size${wasGoalie ? ', including the goalie cut sizes' : ''}.</p>
        <p style="margin:0 0 14px;">You picked <b style="color:#dbe8f5;">${oldPick}</b> before.${suggested ? ` The closest real size is <b style="color:#39ff14;">${suggested}</b> - but please check the measurements on the form before you confirm, that is the whole point.` : ''} Your tee size and jersey name/number are saved and unchanged - this is only the jersey size.</p>
        <p style="margin:0 0 16px;text-align:center;">
          <a href="https://ultimatetournaments.com/lights-out/size?id=${encodeURIComponent(row.id)}" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">RE-PICK ${String(first).toUpperCase()}'S JERSEY SIZE</a>
        </p>
        <p style="margin:0 0 14px;">Takes about 30 seconds - the size chart with measurements is right on the page. When in doubt, size up.</p>
        <p style="margin:0;color:#ffb84d;font-size:13px;font-weight:bold;">Sorry for the double ask. We would rather bug you once more than hand ${first} a jersey that does not fit in June.</p>
      `),
    };
  };

  const pending = () => db.prepare(`
    SELECT id, player_name, parent_name, email, jersey_size_old FROM lights_out_registrations
    WHERE COALESCE(amount_paid_cents, 0) > 0 AND status NOT LIKE 'invite_%' AND status != 'refunded'
      AND jersey_size_old IS NOT NULL AND jersey_size_old != ''
      AND (jersey_size IS NULL OR jersey_size = '')
      AND email IS NOT NULL AND email != ''
      AND resize_email_sent_at IS NULL
    ORDER BY created_at, id
  `).all<any>();

  const test = String(c.req.query('test') || '').trim();
  if (test) {
    const rows = (await pending()).results || [];
    if (!rows.length) return c.json({ success: false, error: 'No unsent rows to sample' }, 404);
    const m = resizeEmail(rows[0]);
    await sendEmail(c.env, test, `[TEST] ${m.subject}`, m.html);
    return c.json({ success: true, data: { test, sampled: rows[0].player_name, remaining: rows.length } });
  }
  if (c.req.query('dry')) {
    const rows = (await pending()).results || [];
    return c.json({ success: true, data: { remaining: rows.length } });
  }

  const batch = Math.min(parseInt(c.req.query('batch') || '20', 10) || 20, 40);
  const rows = ((await pending()).results || []).slice(0, batch);
  const sent: string[] = [];
  for (const row of rows) {
    const m = resizeEmail(row);
    await sendEmail(c.env, row.email, m.subject, m.html);
    await db.prepare(`UPDATE lights_out_registrations SET resize_email_sent_at = datetime('now') WHERE id = ?`).bind(row.id).run();
    sent.push(row.player_name);
    await new Promise(res => setTimeout(res, 650));
  }
  const left = ((await pending()).results || []).length;
  if (sent.length > 0 && left === 0) {
    await sendEmail(c.env, 'johnny@ultimatetournaments.com', 'Lights Out: jersey re-pick email sent to every affected family',
      emailShell(`<p style="margin:0;">Every family that picked a jersey size under the old generic sizing was asked to re-pick on the new manufacturer chart. The admin swag table counts them as missing a size until they do.</p>`));
  }
  return c.json({ success: true, data: { sent: sent.length, remaining: left } });
});

// Admin: refund a registration. Refunds EVERYTHING the family paid on
// this row through Stripe (the registration payment, plus the balance
// payment when one exists) and moves the row to 'refunded'. That status
// frees the goalie-cap spot, drops the row from money totals, swag
// counts, team building, and the sizes blast - all of which only count
// non-refunded paid rows. Stripe emails the family its own refund
// receipt; we send nothing to them.
lightsOutRoutes.post('/admin/requests/:id/refund', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  try { await db.prepare('ALTER TABLE lights_out_registrations ADD COLUMN refunded_at TEXT').run(); } catch {}
  const row = await db.prepare('SELECT * FROM lights_out_registrations WHERE id = ?').bind(id).first<any>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (row.status === 'refunded') return c.json({ success: false, error: 'Already refunded' }, 400);
  if ((row.amount_paid_cents || 0) <= 0) return c.json({ success: false, error: 'Nothing has been paid on this registration' }, 400);

  const sk = { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` };
  const piFor = async (sessId: string | null): Promise<string | null> => {
    if (!sessId) return null;
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessId}`, { headers: sk });
    const j = await r.json() as any;
    return r.ok && j.payment_status === 'paid' ? (j.payment_intent || null) : null;
  };

  const refunds: string[] = [];
  let refundedCents = 0;
  for (const sess of [row.stripe_session_id, row.balance_session_id]) {
    const pi = await piFor(sess);
    if (!pi) continue;
    const rr = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { ...sk, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ payment_intent: pi, 'metadata[lights_out_reg_id]': id }).toString(),
    });
    const rj = await rr.json() as any;
    if (rr.ok) {
      refunds.push(rj.id);
      refundedCents += rj.amount || 0;
    } else if (rj?.error?.code === 'charge_already_refunded') {
      refunds.push(`${pi} already refunded in Stripe`);
    } else {
      return c.json({ success: false, error: `Stripe refund failed: ${rj?.error?.message || `HTTP ${rr.status}`}` }, 502);
    }
  }
  if (refunds.length === 0) return c.json({ success: false, error: 'No paid Stripe payment found behind this registration' }, 400);

  const user = (c as any).get('user');
  await db.prepare(`
    UPDATE lights_out_registrations
    SET status = 'refunded', refunded_at = datetime('now'), reviewed_at = datetime('now'), reviewed_by = ?,
        notes = COALESCE(notes, '') || ' | Refunded $' || printf('%.2f', ? / 100.0) || ' on ' || date('now') || ' (' || ? || ')'
    WHERE id = ?
  `).bind(user?.email || user?.id || 'admin', refundedCents, refunds.join(', '), id).run();

  await sendEmail(c.env, 'johnny@ultimatetournaments.com', `Lights Out REFUND: ${row.player_name} ($${(refundedCents / 100).toFixed(2)})`,
    emailShell(`<p style="margin:0;">Refunded $${(refundedCents / 100).toFixed(2)} to ${row.parent_name} (${row.email}) for ${row.player_name} - ${row.team_name}. Stripe: ${refunds.join(', ')}. The family gets Stripe's own refund receipt; nothing else was emailed to them.</p>`));

  return c.json({ success: true, data: { refunded_cents: refundedCents, refunds } });
});

// Admin: Stripe lookup for "I paid but you show incomplete" disputes.
// /admin/stripe-lookup?key=uht-coaches-2026&email=x@y.com - every charge
// under that billing email; or &pi=pi_... for one payment intent. Each hit
// includes its Checkout session id, so staff can re-point a registration
// row at the real paid session and run /register/:id/verify on it.
lightsOutRoutes.get('/admin/stripe-lookup', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const sk = { headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` } };
  const sessionFor = async (pi: string) => {
    if (!pi) return null;
    const sres = await fetch(`https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(pi)}&limit=1`, sk);
    const sj = await sres.json() as any;
    const sess = sj?.data?.[0];
    return sess ? { id: sess.id, payment_status: sess.payment_status, metadata: sess.metadata || {} } : null;
  };
  const shape = async (ch: any) => ({
    amount: `$${(ch.amount / 100).toFixed(2)}`,
    status: ch.status,
    refunded: ch.refunded,
    paid: ch.paid,
    when: new Date(ch.created * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    description: ch.description || ch.calculated_statement_descriptor || '',
    metadata: ch.metadata || {},
    billing_email: ch.billing_details?.email || '',
    last4: ch.payment_method_details?.card?.last4 || '',
    payment_intent: ch.payment_intent || '',
    checkout_session: await sessionFor(ch.payment_intent),
  });

  // ?refund=re_... fetches one refund and its charge, to verify a refund
  // actually went through and where Stripe sent the receipt
  const refundId = String(c.req.query('refund') || '').trim();
  if (refundId) {
    const r = await fetch(`https://api.stripe.com/v1/refunds/${encodeURIComponent(refundId)}`, sk);
    const j = await r.json() as any;
    if (!r.ok) return c.json({ success: false, error: j?.error?.message || `Stripe ${r.status}` }, 502);
    let charge: any = null;
    if (j.charge) {
      const cr = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(j.charge)}`, sk);
      const cj = await cr.json() as any;
      if (cr.ok) charge = { amount: `$${(cj.amount / 100).toFixed(2)}`, refunded: cj.refunded, amount_refunded: `$${(cj.amount_refunded / 100).toFixed(2)}`, receipt_email: cj.receipt_email || cj.billing_details?.email || '', last4: cj.payment_method_details?.card?.last4 || '', description: cj.description || '' };
    }
    return c.json({ success: true, data: {
      refund: refundId, status: j.status, amount: `$${(j.amount / 100).toFixed(2)}`,
      created: new Date(j.created * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      destination: j.destination_details?.type || '', charge,
    } });
  }

  const pi = String(c.req.query('pi') || '').trim();
  if (pi) {
    const r = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}`, sk);
    const j = await r.json() as any;
    if (!r.ok) return c.json({ success: false, error: j?.error?.message || `Stripe ${r.status}` }, 502);
    const cres = await fetch(`https://api.stripe.com/v1/charges?payment_intent=${encodeURIComponent(pi)}&limit=1`, sk);
    const cj = await cres.json() as any;
    const ch = cj?.data?.[0];
    return c.json({ success: true, data: {
      pi, pi_status: j.status, amount: `$${(j.amount / 100).toFixed(2)}`, pi_metadata: j.metadata || {},
      charge: ch ? await shape(ch) : null,
    } });
  }

  const email = String(c.req.query('email') || '').trim().toLowerCase();
  if (!email.includes('@')) return c.json({ success: false, error: 'Pass ?email= or ?pi=' }, 400);
  const q = encodeURIComponent(`billing_details.email:'${email}'`);
  const r = await fetch(`https://api.stripe.com/v1/charges/search?query=${q}&limit=20`, sk);
  const j = await r.json() as any;
  if (!r.ok) return c.json({ success: false, error: j?.error?.message || `Stripe ${r.status}` }, 502);
  const charges = [] as any[];
  for (const ch of (j.data || [])) charges.push(await shape(ch));
  return c.json({ success: true, data: { email, found: charges.length, charges } });
});

// Admin: one-time urgency reminder to every Code Sent family (Chad, Nov
// 2026): ~100 codes are out and only 35 spots remain, first come first
// serve. Key-authed. ?test=you@x.com sends one sample (first unsent row's
// data) without marking anything; ?dry=1 counts; otherwise sends a batch
// (default 20, 650ms apart for Resend's 2/sec limit) and stamps
// code_reminder_sent_at so re-calls never double-send. Call until
// remaining is 0.
lightsOutRoutes.post('/admin/code-reminder', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const db = c.env.DB;
  try { await db.prepare('ALTER TABLE lights_out_registrations ADD COLUMN code_reminder_sent_at TEXT').run(); } catch {}

  const reminderEmail = (row: any) => {
    const first = String(row.player_name || '').trim().split(/\s+/)[0] || 'your player';
    return {
      subject: `Only 35 spots left - ${row.player_name}'s Lights Out code is still unused`,
      html: emailShell(`
        <p style="margin:0 0 14px;font-size:19px;font-weight:bold;color:#ffb84d;">ONLY 35 SPOTS LEFT. ALMOST 100 CODES ARE OUT.</p>
        <p style="margin:0 0 14px;">Hi ${row.parent_name},</p>
        <p style="margin:0 0 14px;"><b style="color:#7fd8ff;">${row.player_name}</b> is holding an invite code to the <b style="color:#7fd8ff;">Lights Out Invitational</b> - June 11-13, 2027 in St. Louis - but the code has not been used yet. A code does not hold a spot. Payment does.</p>
        <p style="margin:0 0 14px;">Here is exactly where things stand: almost 100 families are holding invite codes right now, and only <b style="color:#ffb84d;">35 spots remain</b> before the event is completely sold out. Spots are filled first come, first serve. Once the last 35 are claimed, registration closes and unused codes will not work.</p>
        <p style="margin:0 0 10px;">${first}'s single-use invite code:</p>
        <p style="margin:0 0 14px;text-align:center;"><span style="display:inline-block;background:#04091a;border:1px solid rgba(57,255,20,.5);border-radius:10px;padding:12px 26px;font-size:22px;font-weight:bold;letter-spacing:4px;color:#39ff14;">${row.invite_code}</span></p>
        <p style="margin:0 0 16px;text-align:center;">
          <a href="https://ultimatetournaments.com/lights-out?invite=${encodeURIComponent(row.invite_code)}" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">CLAIM ${first.toUpperCase()}'S SPOT NOW</a>
        </p>
        <p style="margin:0 0 14px;">$550 per player, or a $200 non-refundable deposit locks the spot today. The button opens the registration form with the code already entered.</p>
        <p style="margin:0;color:#ffb84d;font-size:13px;font-weight:bold;">If you want ${first} under the glow in June, now is the time - we would hate for you to miss it by a day.</p>
      `),
    };
  };

  const pending = () => db.prepare(`
    SELECT id, player_name, parent_name, email, invite_code FROM lights_out_registrations
    WHERE status = 'invite_approved' AND invite_code IS NOT NULL AND invite_code != ''
      AND email IS NOT NULL AND email != '' AND code_reminder_sent_at IS NULL
    ORDER BY reviewed_at, id
  `).all<any>();

  const test = String(c.req.query('test') || '').trim();
  if (test) {
    const rows = (await pending()).results || [];
    if (!rows.length) return c.json({ success: false, error: 'No unsent rows to sample' }, 404);
    const m = reminderEmail(rows[0]);
    await sendEmail(c.env, test, `[TEST] ${m.subject}`, m.html);
    return c.json({ success: true, data: { test, sampled: rows[0].player_name, remaining: rows.length } });
  }

  if (c.req.query('dry')) {
    const rows = (await pending()).results || [];
    return c.json({ success: true, data: { remaining: rows.length } });
  }

  const batch = Math.min(parseInt(c.req.query('batch') || '20', 10) || 20, 40);
  const rows = ((await pending()).results || []).slice(0, batch);
  const supp = await unsubscribedSet(db, rows.map((r: any) => r.email));
  const sent: string[] = [];
  let unsubscribed = 0;
  for (const row of rows) {
    if (supp.has(String(row.email || '').toLowerCase())) {
      // Marked so the pending query stops offering them - never emailed
      await db.prepare(`UPDATE lights_out_registrations SET code_reminder_sent_at = 'skipped-unsubscribed' WHERE id = ?`).bind(row.id).run();
      unsubscribed++;
      continue;
    }
    const m = reminderEmail(row);
    await sendEmail(c.env, row.email, m.subject, m.html);
    await db.prepare(`UPDATE lights_out_registrations SET code_reminder_sent_at = datetime('now') WHERE id = ?`).bind(row.id).run();
    sent.push(row.player_name);
    await new Promise(res => setTimeout(res, 650));
  }
  const left = ((await pending()).results || []).length;
  if (sent.length > 0 && left === 0) {
    await sendEmail(c.env, 'johnny@ultimatetournaments.com', 'Lights Out: code reminder sent to every Code Sent family',
      emailShell(`<p style="margin:0;">The 35-spots-left reminder went out to every family still holding an unused invite code. Each email carried that family's own code and register button.</p>`));
  }
  return c.json({ success: true, data: { sent: sent.length, remaining: left, unsubscribed } });
});

// Congratulations blast to every REGISTERED (paid) player: selected to the
// first-ever Lights Out Invitational, which sold out in 7 days. Deposit
// families get a PAY THE BALANCE button; paid-in-full families get a
// nothing-left-to-do line. Transactional (they are participants), so no
// unsubscribe check. Idempotent via congrats_email_sent_at.
lightsOutRoutes.post('/admin/congrats-emails', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const db = c.env.DB;
  try { await db.prepare('ALTER TABLE lights_out_registrations ADD COLUMN congrats_email_sent_at TEXT').run(); } catch {}

  const congratsEmail = (row: any) => {
    const first = String(row.player_name || '').trim().split(/\s+/)[0] || 'your player';
    const paid = row.amount_paid_cents || 0;
    const balance = Math.max(0, 55000 - paid);
    return {
      subject: `${row.player_name} is IN - Lights Out SOLD OUT in 7 days`,
      html: emailShell(`
        <p style="margin:0 0 6px;font-size:13px;font-weight:bold;letter-spacing:3px;color:#39ff14;">CONGRATULATIONS</p>
        <h2 style="margin:0 0 14px;color:#7fd8ff;font-size:21px;">${first} is officially IN.</h2>
        <p style="margin:0 0 14px;">Hi ${row.parent_name},</p>
        <p style="margin:0 0 14px;">Congratulations - <b style="color:#7fd8ff;">${row.player_name}</b> has been selected to the <b style="color:#7fd8ff;">first-ever Lights Out Invitational</b>, June 11-13, 2027 in St. Louis. The arena goes dark, the ice glows, and ${first} will be on it.</p>
        <p style="margin:0 0 14px;text-align:center;"><span style="display:inline-block;background:#04091a;border:1px solid rgba(255,184,77,.6);border-radius:10px;padding:12px 26px;font-size:17px;font-weight:bold;letter-spacing:2px;color:#ffb84d;">SOLD OUT IN 7 DAYS</span></p>
        <p style="margin:0 0 14px;">That is not a typo. Every single spot in this event was claimed in <b style="color:#ffb84d;">one week</b> - and ${first} got one of them. You are part of something hockey has never seen before, and the demand proved it.</p>
        ${balance > 0 ? `
        <p style="margin:0 0 10px;color:#ffb84d;"><b>One thing left: your $${(balance / 100).toFixed(0)} balance.</b> Your deposit locked the spot - pay the remaining balance below and ${first} is fully locked in for June, nothing else owed.</p>
        <p style="margin:0 0 16px;text-align:center;">
          <a href="https://uht.chad-157.workers.dev/api/lights-out/balance/${row.id}" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">PAY THE $${(balance / 100).toFixed(0)} BALANCE</a>
        </p>` : `
        <p style="margin:0 0 14px;color:#39ff14;"><b>You are paid in full - there is nothing left to do.</b> The spot, the jerseys, the stick, the puck, the whole haul: locked in.</p>`}
        <p style="margin:0 0 14px;">What happens next: we build balanced teams by age and position, and everything - teams, schedules, jersey details and event info - comes to you by email and in the UHT app as June gets closer.</p>
        <p style="margin:0;">Welcome to the glow. This is going to be one for the scrapbook.</p>
      `),
    };
  };

  const pending = () => db.prepare(`
    SELECT id, player_name, parent_name, email, amount_paid_cents FROM lights_out_registrations
    WHERE status NOT LIKE 'invite_%' AND status NOT IN ('refunded', 'waitlist', 'goalie_waitlist')
      AND COALESCE(amount_paid_cents, 0) > 0
      AND email IS NOT NULL AND email != '' AND congrats_email_sent_at IS NULL
    ORDER BY created_at, id
  `).all<any>();

  // Test address comes from ?test= or the JSON body (body keeps personal
  // addresses out of URLs and logs)
  const body = await c.req.json().catch(() => ({} as any));
  const test = String(c.req.query('test') || body?.test || '').trim();
  if (test) {
    let rows = (await pending()).results || [];
    if (!rows.length) {
      // Blast already finished - sample a sent row so tests still work
      rows = ((await db.prepare(`
        SELECT id, player_name, parent_name, email, amount_paid_cents FROM lights_out_registrations
        WHERE status NOT LIKE 'invite_%' AND status NOT IN ('refunded', 'waitlist', 'goalie_waitlist')
          AND COALESCE(amount_paid_cents, 0) > 0 ORDER BY created_at, id
      `).all<any>()).results || []) as any[];
    }
    if (!rows.length) return c.json({ success: false, error: 'No rows to sample' }, 404);
    // Sample one deposit row if present so the balance button is visible
    const sample = rows.find((r: any) => (r.amount_paid_cents || 0) < 55000) || rows[0];
    const m = congratsEmail(sample);
    await sendEmail(c.env, test, `[TEST] ${m.subject}`, m.html);
    return c.json({ success: true, data: { test, sampled: sample.player_name, paid_cents: sample.amount_paid_cents } });
  }

  if (c.req.query('dry')) {
    const rows = (await pending()).results || [];
    const deposits = rows.filter((r: any) => (r.amount_paid_cents || 0) < 55000).length;
    return c.json({ success: true, data: { remaining: rows.length, deposits, paid_full: rows.length - deposits } });
  }

  const batch = Math.min(parseInt(c.req.query('batch') || '20', 10) || 20, 40);
  const rows = ((await pending()).results || []).slice(0, batch);
  const sent: string[] = [];
  for (const row of rows) {
    const m = congratsEmail(row);
    await sendEmail(c.env, row.email, m.subject, m.html);
    await db.prepare(`UPDATE lights_out_registrations SET congrats_email_sent_at = datetime('now') WHERE id = ?`).bind(row.id).run();
    sent.push(row.player_name);
    await new Promise(res => setTimeout(res, 650));
  }
  const left = ((await pending()).results || []).length;
  if (sent.length > 0 && left === 0) {
    await sendEmail(c.env, 'johnny@ultimatetournaments.com', 'Lights Out: congratulations email sent to every registered family',
      emailShell(`<p style="margin:0;">The sold-out-in-7-days congratulations email went to every paid registration. Deposit families got their own PAY THE BALANCE button; paid-in-full families got the nothing-left-to-do version.</p>`));
  }
  return c.json({ success: true, data: { sent: sent.length, remaining: left } });
});

// Sold-out notice to families who received an invite code but never
// registered: the event filled in 7 days, codes can no longer claim a spot,
// and the waitlist (plus the second location in the works) is the next move.
// Skips anyone whose email already has a paid registration, and skips
// unsubscribed addresses. Idempotent via soldout_email_sent_at.
lightsOutRoutes.post('/admin/soldout-emails', async (c) => {
  if (c.req.query('key') !== 'uht-coaches-2026') return c.json({ success: false, error: 'Nope' }, 403);
  const db = c.env.DB;
  try { await db.prepare('ALTER TABLE lights_out_registrations ADD COLUMN soldout_email_sent_at TEXT').run(); } catch {}

  const soldoutEmail = (row: any) => {
    const first = String(row.player_name || '').trim().split(/\s+/)[0] || 'your player';
    return {
      subject: `Lights Out officially SOLD OUT in 7 days - ${first}'s next move`,
      html: emailShell(`
        <p style="margin:0 0 14px;text-align:center;"><span style="display:inline-block;background:#04091a;border:1px solid rgba(255,184,77,.6);border-radius:10px;padding:12px 26px;font-size:17px;font-weight:bold;letter-spacing:2px;color:#ffb84d;">OFFICIALLY SOLD OUT IN 7 DAYS</span></p>
        <p style="margin:0 0 14px;">Hi ${row.parent_name},</p>
        <p style="margin:0 0 14px;">The <b style="color:#7fd8ff;">Lights Out Invitational</b> is officially <b style="color:#ffb84d;">sold out</b> - every single spot claimed in 7 days. ${first}'s invite code was one of the limited few we sent, but with the event full, codes can no longer claim a spot.</p>
        <p style="margin:0 0 14px;"><b style="color:#7fd8ff;">Here is why this is not the end:</b> we are working on securing a <b style="color:#7fd8ff;">second location</b> for a second Lights Out event right now, and it could be announced in the next 2 weeks.</p>
        <p style="margin:0 0 14px;">Because ${first} received an invite, we wanted you to hear it from us first: join the waitlist and you get the <b style="color:#39ff14;">first opportunity to register</b> - before we announce anything to the Three Stars winners from our future events, and before the public hears a word. It is free, takes 30 seconds, and puts ${first} at the front of the line.</p>
        <p style="margin:0 0 16px;text-align:center;">
          <a href="https://ultimatetournaments.com/lights-out/?register=1" style="display:inline-block;background:#39ff14;color:#04091a;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:10px;font-size:15px;">JOIN THE WAITLIST - FREE</a>
        </p>
        <p style="margin:0;">We would love to get ${first} under the glow. Keep an eye on your inbox - the next announcement could come fast.</p>
      `),
    };
  };

  const pending = () => db.prepare(`
    SELECT id, player_name, parent_name, email FROM lights_out_registrations r
    WHERE status = 'invite_approved'
      AND email IS NOT NULL AND email != '' AND soldout_email_sent_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM lights_out_registrations p
        WHERE LOWER(p.email) = LOWER(r.email) AND COALESCE(p.amount_paid_cents, 0) > 0 AND p.status != 'refunded'
      )
    ORDER BY reviewed_at, id
  `).all<any>();

  const body = await c.req.json().catch(() => ({} as any));
  const test = String(c.req.query('test') || body?.test || '').trim();
  if (test) {
    let rows = (await pending()).results || [];
    if (!rows.length) {
      rows = ((await db.prepare(`
        SELECT id, player_name, parent_name, email FROM lights_out_registrations
        WHERE status = 'invite_approved' AND email IS NOT NULL AND email != ''
        ORDER BY reviewed_at, id
      `).all<any>()).results || []) as any[];
    }
    if (!rows.length) return c.json({ success: false, error: 'No rows to sample' }, 404);
    const m = soldoutEmail(rows[0]);
    await sendEmail(c.env, test, `[TEST] ${m.subject}`, m.html);
    return c.json({ success: true, data: { test, sampled: rows[0].player_name } });
  }

  if (c.req.query('dry')) {
    const rows = (await pending()).results || [];
    return c.json({ success: true, data: { remaining: rows.length } });
  }

  const batch = Math.min(parseInt(c.req.query('batch') || '20', 10) || 20, 40);
  const rows = ((await pending()).results || []).slice(0, batch);
  const supp = await unsubscribedSet(db, rows.map((r: any) => r.email));
  const sent: string[] = [];
  let unsubscribed = 0;
  for (const row of rows) {
    if (supp.has(String(row.email || '').toLowerCase())) {
      await db.prepare(`UPDATE lights_out_registrations SET soldout_email_sent_at = 'skipped-unsubscribed' WHERE id = ?`).bind(row.id).run();
      unsubscribed++;
      continue;
    }
    const m = soldoutEmail(row);
    await sendEmail(c.env, row.email, m.subject, m.html);
    await db.prepare(`UPDATE lights_out_registrations SET soldout_email_sent_at = datetime('now') WHERE id = ?`).bind(row.id).run();
    sent.push(row.player_name);
    await new Promise(res => setTimeout(res, 650));
  }
  const left = ((await pending()).results || []).length;
  if (sent.length > 0 && left === 0) {
    await sendEmail(c.env, 'johnny@ultimatetournaments.com', 'Lights Out: sold-out notice sent to every unused-code family',
      emailShell(`<p style="margin:0;">The sold-out-in-7-days notice went to every family holding an unused invite code (families who registered were excluded). Each email pointed them at the waitlist and the second location in the works.</p>`));
  }
  return c.json({ success: true, data: { sent: sent.length, remaining: left, unsubscribed } });
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
  const supp = await unsubscribedSet(db, (rows as any[]).map((r: any) => r.email));
  for (const r of rows as any[]) {
    if (supp.has(String(r.email || '').toLowerCase())) {
      await db.prepare(`UPDATE lights_out_registrations SET payment_reminder_at = datetime('now') WHERE id = ?`).bind(r.id).run();
      skipped++;
      continue;
    }
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
