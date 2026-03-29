import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const emailRoutes = new Hono<{ Bindings: Env }>();

// ==================
// List campaigns
// ==================
emailRoutes.get('/campaigns', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const { event_id, status } = c.req.query();

  let query = `SELECT ec.*, e.name as event_name FROM email_campaigns ec LEFT JOIN events e ON e.id = ec.event_id WHERE 1=1`;
  const params: string[] = [];

  if (event_id) { query += ' AND ec.event_id = ?'; params.push(event_id); }
  if (status) { query += ' AND ec.status = ?'; params.push(status); }
  query += ' ORDER BY ec.created_at DESC';

  const result = await db.prepare(query).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// ==================
// Create campaign
// ==================
const createCampaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  eventId: z.string().optional(),
  templateType: z.enum(['looking_for_teams', 'event_announcement', 'results', 'registration_confirmation', 'custom']).optional(),
});

emailRoutes.post('/campaigns', authMiddleware, requireRole('admin', 'director'), zValidator('json', createCampaignSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO email_campaigns (id, name, subject, body_html, body_text, event_id, template_type, sent_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.name, data.subject, data.bodyHtml, data.bodyText || null,
    data.eventId || null, data.templateType || 'custom', c.get('user').id
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ==================
// Send campaign to contact list/filter
// ==================
const sendCampaignSchema = z.object({
  campaignId: z.string(),
  filter: z.object({
    ageGroups: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    states: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    listId: z.string().optional(),
  }),
});

emailRoutes.post('/send', authMiddleware, requireRole('admin'), zValidator('json', sendCampaignSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const env = c.env;

  // Get campaign
  const campaign = await db.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(data.campaignId).first<any>();
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);

  // Build contact query from filter
  let contactQuery = 'SELECT * FROM contacts WHERE is_subscribed_email = 1';
  const params: string[] = [];

  if (data.filter.cities?.length) {
    contactQuery += ` AND city IN (${data.filter.cities.map(() => '?').join(',')})`;
    params.push(...data.filter.cities);
  }
  if (data.filter.states?.length) {
    contactQuery += ` AND state IN (${data.filter.states.map(() => '?').join(',')})`;
    params.push(...data.filter.states);
  }
  if (data.filter.tags?.length) {
    for (const tag of data.filter.tags) {
      contactQuery += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }
  }

  const contacts = await db.prepare(contactQuery).bind(...params).all<any>();
  const contactList = contacts.results || [];

  // Send via SendGrid
  let sent = 0;
  for (const contact of contactList) {
    if (!contact.email) continue;

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: contact.email, name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() }],
          }],
          from: { email: campaign.from_email, name: campaign.from_name },
          subject: campaign.subject,
          content: [
            { type: 'text/html', value: campaign.body_html },
            ...(campaign.body_text ? [{ type: 'text/plain', value: campaign.body_text }] : []),
          ],
        }),
      });

      if (response.ok) {
        const sgMessageId = response.headers.get('X-Message-Id');
        await db.prepare(`
          INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status)
          VALUES (?, ?, ?, ?, 'sent')
        `).bind(crypto.randomUUID().replace(/-/g, ''), data.campaignId, contact.id, sgMessageId).run();
        sent++;
      }
    } catch (err) {
      console.error('SendGrid error for contact:', contact.id, err);
    }
  }

  // Update campaign stats
  await db.prepare(`
    UPDATE email_campaigns SET status = 'sent', sent_at = datetime('now'), total_sent = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(sent, data.campaignId).run();

  return c.json({ success: true, data: { sent, total: contactList.length } });
});

// ==================
// SendGrid webhook for tracking (opens, clicks, bounces)
// ==================
emailRoutes.post('/webhooks/sendgrid', async (c) => {
  const events = await c.req.json();
  const db = c.env.DB;

  for (const event of events) {
    const sgId = event.sg_message_id?.split('.')[0];
    if (!sgId) continue;

    let status = '';
    let field = '';
    switch (event.event) {
      case 'delivered': status = 'delivered'; field = 'total_delivered'; break;
      case 'open': status = 'opened'; field = 'total_opened'; break;
      case 'click': status = 'clicked'; field = 'total_clicked'; break;
      case 'bounce': status = 'bounced'; field = 'total_bounced'; break;
      case 'unsubscribe': status = 'unsubscribed'; field = 'total_unsubscribed'; break;
      default: continue;
    }

    // Update individual send
    const send = await db.prepare(`
      UPDATE email_sends SET status = ? WHERE sendgrid_message_id = ? RETURNING campaign_id
    `).bind(status, sgId).first<{ campaign_id: string }>();

    // Update campaign aggregate stats
    if (send && field) {
      await db.prepare(`UPDATE email_campaigns SET ${field} = ${field} + 1 WHERE id = ?`).bind(send.campaign_id).run();
    }
  }

  return c.json({ success: true });
});
