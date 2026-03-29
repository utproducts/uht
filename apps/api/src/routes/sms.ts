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
  const { unread_only } = c.req.query();

  let query = `
    SELECT sc.*,
      c.first_name as contact_first, c.last_name as contact_last, c.email as contact_email,
      (SELECT body FROM sms_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM sms_messages sm2 WHERE sm2.conversation_id = sc.id AND sm2.direction = 'inbound'
        AND sm2.created_at > COALESCE(sc.updated_at, sc.created_at)) as unread_count
    FROM sms_conversations sc
    LEFT JOIN contacts c ON c.id = sc.contact_id
  `;

  if (unread_only === 'true') {
    query += ' WHERE sc.is_read = 0';
  }
  query += ' ORDER BY sc.last_message_at DESC';

  const result = await db.prepare(query).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// Get messages in a conversation
// ==================
smsRoutes.get('/conversations/:id/messages', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const convoId = c.req.param('id');
  const db = c.env.DB;

  // Mark as read
  await db.prepare('UPDATE sms_conversations SET is_read = 1, updated_at = datetime(\'now\') WHERE id = ?').bind(convoId).run();

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
// Send SMS (outbound)
// ==================
const sendSmsSchema = z.object({
  conversationId: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().min(1),
});

smsRoutes.post('/send', authMiddleware, requireRole('admin', 'director'), zValidator('json', sendSmsSchema), async (c) => {
  const data = c.req.valid('json');
  const user = c.get('user');
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

  // Create conversation if needed
  if (!convoId) {
    // Look up contact by phone
    const contact = await db.prepare('SELECT id, first_name, last_name FROM contacts WHERE phone = ?').bind(phone).first<any>();
    const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : null;

    convoId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO sms_conversations (id, contact_id, phone_number, contact_name, last_message_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(convoId, contact?.id || null, phone, contactName).run();
  }

  // Send via TextMagic
  try {
    const response = await fetch('https://rest.textmagic.com/api/v2/messages', {
      method: 'POST',
      headers: {
        'X-TM-Username': env.TEXTMAGIC_USERNAME,
        'X-TM-Key': env.TEXTMAGIC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: data.message,
        phones: phone.replace(/\D/g, ''),
      }),
    });

    const result = await response.json() as any;

    // Save message
    const msgId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO sms_messages (id, conversation_id, direction, body, textmagic_message_id, status, sent_by)
      VALUES (?, ?, 'outbound', ?, ?, 'sent', ?)
    `).bind(msgId, convoId, data.message, result.id?.toString() || null, user.id).run();

    // Update conversation
    await db.prepare(`
      UPDATE sms_conversations SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).bind(convoId).run();

    return c.json({ success: true, data: { messageId: msgId, conversationId: convoId } });
  } catch (err) {
    console.error('TextMagic error:', err);
    return c.json({ success: false, error: 'Failed to send SMS' }, 500);
  }
});

// ==================
// TextMagic inbound webhook (receives replies)
// ==================
smsRoutes.post('/webhooks/textmagic', async (c) => {
  const body = await c.req.json();
  const db = c.env.DB;

  const phone = body.sender || body.phone;
  const message = body.text || body.messageBody;

  if (!phone || !message) {
    return c.json({ success: true }); // Acknowledge but ignore
  }

  // Find or create conversation
  let convo = await db.prepare('SELECT id FROM sms_conversations WHERE phone_number = ?').bind(phone).first<{ id: string }>();

  if (!convo) {
    // Auto-resolve contact name from DB
    const contact = await db.prepare('SELECT id, first_name, last_name FROM contacts WHERE phone = ?').bind(phone).first<any>();
    const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : null;

    const convoId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO sms_conversations (id, contact_id, phone_number, contact_name, is_read, last_message_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).bind(convoId, contact?.id || null, phone, contactName).run();
    convo = { id: convoId };
  }

  // Save inbound message
  await db.prepare(`
    INSERT INTO sms_messages (id, conversation_id, direction, body, textmagic_message_id, status)
    VALUES (?, ?, 'inbound', ?, ?, 'received')
  `).bind(crypto.randomUUID().replace(/-/g, ''), convo.id, message, body.id?.toString() || null).run();

  // Mark conversation unread
  await db.prepare(`
    UPDATE sms_conversations SET is_read = 0, last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).bind(convo.id).run();

  return c.json({ success: true });
});
