import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const smsRoutes = new Hono<{ Bindings: Env }>();

// ==================
// Get all conversations (WhatsApp-style inbox)
// ==================
smsRoutes.get('/conversations', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { unread_only, search } = c.req.query();

  let query = `
    SELECT sc.*,
      (SELECT body FROM sms_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM sms_messages sm3 WHERE sm3.conversation_id = sc.id ORDER BY sm3.created_at DESC LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM sms_messages sm2 WHERE sm2.conversation_id = sc.id AND sm2.direction = 'inbound'
        AND sm2.created_at > COALESCE(sc.updated_at, sc.created_at)) as unread_count
    FROM sms_conversations sc
    WHERE 1=1
  `;
  const params: string[] = [];

  if (unread_only === 'true') {
    query += ' AND sc.is_read = 0';
  }
  if (search) {
    query += ' AND (sc.contact_name LIKE ? OR sc.phone_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY sc.last_message_at DESC';

  const stmt = params.length > 0 ? db.prepare(query).bind(...params) : db.prepare(query);
  const result = await stmt.all();
  return c.json({ success: true, data: result.results });
});

// ==================
// Get messages in a conversation
// ==================
smsRoutes.get('/conversations/:id/messages', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const convoId = c.req.param('id');
  const db = c.env.DB;

  // Mark as read
  await db.prepare("UPDATE sms_conversations SET is_read = 1, updated_at = datetime('now') WHERE id = ?").bind(convoId).run();

  const messages = await db.prepare(`
    SELECT sm.*, u.first_name as sent_by_name
    FROM sms_messages sm
    LEFT JOIN users u ON u.id = sm.sent_by
    WHERE sm.conversation_id = ?
    ORDER BY sm.created_at ASC
  `).bind(convoId).all();

  return c.json({ success: true, data: messages.results });
});

// ==================
// Send SMS (single message to a conversation)
// ==================
const sendSmsSchema = z.object({
  conversationId: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().min(1),
});

smsRoutes.post('/send', authMiddleware, requireRole('admin', 'director'), zValidator('json', sendSmsSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const user = c.get('user') as any;
    const db = c.env.DB;
    const env = c.env;

    let convoId = data.conversationId;
    let phone = data.phone;

    // If conversation exists, get the phone number
    if (convoId) {
      const convo = await db.prepare('SELECT phone_number FROM sms_conversations WHERE id = ?').bind(convoId).first<{ phone_number: string }>();
      if (convo) phone = convo.phone_number;
    }

    if (!phone) {
      return c.json({ success: false, error: 'Phone number required' }, 400);
    }

    // Normalize phone
    const cleanPhone = normalizePhone(phone);

    // Create conversation if needed
    if (!convoId) {
      const resolved = await resolveContact(db, cleanPhone);
      convoId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO sms_conversations (id, contact_id, phone_number, contact_name, last_message_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(convoId, resolved.contactId, cleanPhone, resolved.displayName).run();
    }

    // Send via Twilio
    let twilioMessageId: string | null = null;
    try {
      twilioMessageId = await sendTwilioSms(env, cleanPhone, data.message);
    } catch (err: any) {
      console.error('Twilio error:', err?.message || err);
      // Still save the message locally even if Twilio fails (for dev/testing)
    }

    // Save message
    const msgId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO sms_messages (id, conversation_id, direction, body, textmagic_message_id, status, sent_by)
      VALUES (?, ?, 'outbound', ?, ?, ?, ?)
    `).bind(msgId, convoId, data.message, twilioMessageId, twilioMessageId ? 'sent' : 'queued', user.id).run();

    await db.prepare("UPDATE sms_conversations SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(convoId).run();

    return c.json({ success: true, data: { messageId: msgId, conversationId: convoId } });
  } catch (err: any) {
    console.error('SMS send error:', err);
    return c.json({ success: false, error: err?.message || 'Failed to send message' }, 500);
  }
});

// ==================
// Broadcast SMS (send to filtered recipient list)
// ==================
const broadcastSchema = z.object({
  message: z.string().min(1),
  filter: z.object({
    type: z.enum(['event', 'event_coaches', 'event_age_group', 'event_age_group_coaches', 'all_contacts', 'custom']),
    eventId: z.string().optional(),
    ageGroup: z.string().optional(),
    phoneNumbers: z.array(z.string()).optional(), // for custom
  }),
});

smsRoutes.post('/broadcast', authMiddleware, requireRole('admin', 'director'), zValidator('json', broadcastSchema), async (c) => {
  const { message, filter } = c.req.valid('json');
  const user = c.get('user') as any;
  const db = c.env.DB;
  const env = c.env;

  // Resolve recipients based on filter
  const recipients = await resolveRecipients(db, filter);

  if (recipients.length === 0) {
    return c.json({ success: false, error: 'No recipients match the selected filter' }, 400);
  }

  // Send to each recipient
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const cleanPhone = normalizePhone(recipient.phone);
    if (!cleanPhone) { failedCount++; continue; }

    // Find or create conversation
    let convo = await db.prepare('SELECT id FROM sms_conversations WHERE phone_number = ?').bind(cleanPhone).first<{ id: string }>();
    if (!convo) {
      const convoId = crypto.randomUUID().replace(/-/g, '');
      await db.prepare(`
        INSERT INTO sms_conversations (id, contact_id, phone_number, contact_name, last_message_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(convoId, recipient.contactId || null, cleanPhone, recipient.displayName).run();
      convo = { id: convoId };
    }

    // Send via Twilio
    let twilioId: string | null = null;
    try {
      twilioId = await sendTwilioSms(env, cleanPhone, message);
      sentCount++;
    } catch {
      failedCount++;
    }

    // Save message
    await db.prepare(`
      INSERT INTO sms_messages (id, conversation_id, direction, body, textmagic_message_id, status, sent_by)
      VALUES (?, ?, 'outbound', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().replace(/-/g, ''), convo.id, message,
      twilioId, twilioId ? 'sent' : 'failed', user.id
    ).run();

    await db.prepare("UPDATE sms_conversations SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(convo.id).run();
  }

  return c.json({
    success: true,
    data: { totalRecipients: recipients.length, sent: sentCount, failed: failedCount },
  });
});

// ==================
// Get recipient count for a filter (preview before sending)
// ==================
smsRoutes.post('/recipients/preview', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;
  const recipients = await resolveRecipients(db, body.filter);
  return c.json({
    success: true,
    data: {
      count: recipients.length,
      recipients: recipients.slice(0, 20).map(r => ({
        name: r.displayName,
        phone: r.phone ? r.phone.slice(0, -4) + '****' : null,
        team: r.teamName,
        ageGroup: r.ageGroup,
      })),
    },
  });
});

// ==================
// Get available filters (events, age groups, etc.)
// ==================
smsRoutes.get('/filters', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  const events = await db.prepare("SELECT id, name, city, state FROM events WHERE status NOT IN ('cancelled') ORDER BY start_date DESC").all();

  // Get unique age groups from event_divisions
  const ageGroups = await db.prepare('SELECT DISTINCT age_group FROM event_divisions ORDER BY age_group').all();

  return c.json({
    success: true,
    data: {
      events: events.results,
      ageGroups: (ageGroups.results || []).map((r: any) => r.age_group),
    },
  });
});

// ==================
// Twilio inbound webhook (receives replies)
// ==================
smsRoutes.post('/webhooks/twilio', async (c) => {
  const db = c.env.DB;

  // Twilio sends form-encoded data
  const formData = await c.req.parseBody();
  const phone = normalizePhone(String(formData['From'] || ''));
  const message = String(formData['Body'] || '');

  if (!phone || !message) {
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }

  // Find or create conversation
  let convo = await db.prepare('SELECT id FROM sms_conversations WHERE phone_number = ?').bind(phone).first<{ id: string }>();

  if (!convo) {
    const resolved = await resolveContact(db, phone);
    const convoId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO sms_conversations (id, contact_id, phone_number, contact_name, is_read, last_message_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).bind(convoId, resolved.contactId, phone, resolved.displayName).run();
    convo = { id: convoId };
  } else {
    // Re-resolve contact name in case they've since registered
    const resolved = await resolveContact(db, phone);
    if (resolved.displayName) {
      await db.prepare('UPDATE sms_conversations SET contact_name = ? WHERE id = ?').bind(resolved.displayName, convo.id).run();
    }
  }

  // Save inbound message
  await db.prepare(`
    INSERT INTO sms_messages (id, conversation_id, direction, body, textmagic_message_id, status)
    VALUES (?, ?, 'inbound', ?, ?, 'received')
  `).bind(crypto.randomUUID().replace(/-/g, ''), convo.id, message, String(formData['MessageSid'] || '')).run();

  await db.prepare("UPDATE sms_conversations SET is_read = 0, last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(convo.id).run();

  // TwiML empty response (no auto-reply)
  return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
});

// ==================
// HELPER: Send via Twilio
// ==================
async function sendTwilioSms(env: Env, to: string, body: string): Promise<string | null> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('Twilio not configured — skipping SMS send');
    return null;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const params = new URLSearchParams();
  params.append('To', to.startsWith('+') ? to : `+1${to}`);
  params.append('From', fromNumber);
  params.append('Body', body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const result = await response.json() as any;
  if (!response.ok) {
    throw new Error(result.message || 'Twilio send failed');
  }
  return result.sid || null;
}

// ==================
// HELPER: Normalize phone number
// ==================
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('+')) return phone;
  return digits ? `+${digits}` : '';
}

// ==================
// HELPER: Resolve contact from phone number
// Searches users, contacts, and registrations to find name + team + age group
// ==================
async function resolveContact(db: D1Database, phone: string): Promise<{
  contactId: string | null;
  displayName: string;
  teamName: string | null;
  ageGroup: string | null;
}> {
  const cleanDigits = phone.replace(/\D/g, '');
  const phoneVariants = [phone, `+1${cleanDigits.slice(-10)}`, cleanDigits, cleanDigits.slice(-10)];

  // Try users table first (has roles, most authoritative)
  for (const p of phoneVariants) {
    const user = await db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.phone,
        (SELECT t.name FROM teams t JOIN registrations r ON r.team_id = t.id WHERE r.registered_by = u.id ORDER BY r.created_at DESC LIMIT 1) as team_name,
        (SELECT ed.age_group FROM event_divisions ed JOIN registrations r2 ON r2.event_division_id = ed.id WHERE r2.registered_by = u.id ORDER BY r2.created_at DESC LIMIT 1) as age_group
      FROM users u WHERE u.phone LIKE ?
    `).bind(`%${p.slice(-10)}`).first<any>();

    if (user) {
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const display = user.team_name
        ? `${name} · ${user.team_name}${user.age_group ? ` (${user.age_group})` : ''}`
        : name;
      return { contactId: null, displayName: display || phone, teamName: user.team_name, ageGroup: user.age_group };
    }
  }

  // Try contacts table
  for (const p of phoneVariants) {
    const contact = await db.prepare('SELECT id, first_name, last_name, organization_name FROM contacts WHERE phone LIKE ?')
      .bind(`%${p.slice(-10)}`).first<any>();
    if (contact) {
      const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      return { contactId: contact.id, displayName: name || contact.organization_name || phone, teamName: null, ageGroup: null };
    }
  }

  return { contactId: null, displayName: phone, teamName: null, ageGroup: null };
}

// ==================
// HELPER: Resolve recipients based on filter
// ==================
interface Recipient {
  phone: string;
  displayName: string;
  contactId: string | null;
  teamName: string | null;
  ageGroup: string | null;
  role: string | null;
}

async function resolveRecipients(db: D1Database, filter: any): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  const seen = new Set<string>();

  const addRecipient = (r: Recipient) => {
    const key = normalizePhone(r.phone);
    if (key && !seen.has(key)) {
      seen.add(key);
      recipients.push({ ...r, phone: key });
    }
  };

  if (filter.type === 'event' || filter.type === 'event_coaches') {
    // All participants or coaches in an event
    const isCoachOnly = filter.type === 'event_coaches';
    const query = `
      SELECT u.id, u.phone, u.first_name, u.last_name,
        t.name as team_name, ed.age_group,
        GROUP_CONCAT(DISTINCT ur.role) as roles
      FROM registrations r
      JOIN users u ON u.id = r.registered_by
      JOIN teams t ON t.id = r.team_id
      JOIN event_divisions ed ON ed.id = r.event_division_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE r.event_id = ? AND r.status = 'approved' AND u.phone IS NOT NULL AND u.phone != ''
      GROUP BY u.id
    `;
    const results = await db.prepare(query).bind(filter.eventId).all<any>();
    for (const row of results.results || []) {
      if (isCoachOnly && row.roles && !row.roles.includes('coach') && !row.roles.includes('manager')) continue;
      addRecipient({
        phone: row.phone,
        displayName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        contactId: null,
        teamName: row.team_name,
        ageGroup: row.age_group,
        role: row.roles,
      });
    }
  }

  if (filter.type === 'event_age_group' || filter.type === 'event_age_group_coaches') {
    const isCoachOnly = filter.type === 'event_age_group_coaches';
    const query = `
      SELECT u.id, u.phone, u.first_name, u.last_name,
        t.name as team_name, ed.age_group,
        GROUP_CONCAT(DISTINCT ur.role) as roles
      FROM registrations r
      JOIN users u ON u.id = r.registered_by
      JOIN teams t ON t.id = r.team_id
      JOIN event_divisions ed ON ed.id = r.event_division_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE r.event_id = ? AND ed.age_group = ? AND r.status = 'approved' AND u.phone IS NOT NULL AND u.phone != ''
      GROUP BY u.id
    `;
    const results = await db.prepare(query).bind(filter.eventId, filter.ageGroup).all<any>();
    for (const row of results.results || []) {
      if (isCoachOnly && row.roles && !row.roles.includes('coach') && !row.roles.includes('manager')) continue;
      addRecipient({
        phone: row.phone,
        displayName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        contactId: null,
        teamName: row.team_name,
        ageGroup: row.age_group,
        role: row.roles,
      });
    }
  }

  if (filter.type === 'all_contacts') {
    const results = await db.prepare("SELECT id, phone, first_name, last_name, organization_name FROM contacts WHERE phone IS NOT NULL AND phone != '' AND is_subscribed_sms = 1").all<any>();
    for (const row of results.results || []) {
      addRecipient({
        phone: row.phone,
        displayName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.organization_name || row.phone,
        contactId: row.id,
        teamName: null,
        ageGroup: null,
        role: null,
      });
    }
  }

  if (filter.type === 'custom' && filter.phoneNumbers) {
    for (const p of filter.phoneNumbers) {
      addRecipient({ phone: p, displayName: p, contactId: null, teamName: null, ageGroup: null, role: null });
    }
  }

  return recipients;
}
