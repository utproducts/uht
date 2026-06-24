import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sendRegistrationConfirmationEmail } from '../lib/registration-email';
import { sendApprovalEmail } from '../lib/approval-email';
import { TEMPLATE_DEFINITIONS, getDefaults, getOverridesFromDB, getResolvedFields, replaceVars } from '../lib/template-overrides';

export const emailRoutes = new Hono<{ Bindings: Env }>();

// ==================
// Bulk import contacts into an email list
// ==================
emailRoutes.post('/lists/bulk-import', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const { listId, contacts } = await c.req.json<{ listId: string; contacts: { email: string; first_name?: string; last_name?: string; subscribed_date?: string; last_open_date?: string; last_click_date?: string }[] }>();

  if (!listId || !contacts || !Array.isArray(contacts)) {
    return c.json({ success: false, error: 'listId and contacts array required' }, 400);
  }

  let inserted = 0;
  let errors = 0;

  // Process in batches of 50
  for (let i = 0; i < contacts.length; i += 50) {
    const chunk = contacts.slice(i, i + 50);
    const stmts = chunk.map(ct => {
      const id = crypto.randomUUID().replace(/-/g, '');
      return db.prepare(
        `INSERT OR IGNORE INTO email_list_contacts (id, list_id, email, first_name, last_name, subscribed_date, last_open_date, last_click_date, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      ).bind(id, listId, ct.email.toLowerCase().trim(), ct.first_name || null, ct.last_name || null, ct.subscribed_date || null, ct.last_open_date || null, ct.last_click_date || null);
    });

    try {
      const results = await db.batch(stmts);
      for (const r of results) {
        inserted += (r.meta?.changes || 0);
      }
    } catch (err: any) {
      errors++;
      console.error('Bulk import batch error:', err.message);
    }
  }

  // Update list contact count
  const countResult = await db.prepare('SELECT COUNT(*) as total FROM email_list_contacts WHERE list_id = ? AND is_active = 1').bind(listId).first<any>();
  await db.prepare('UPDATE email_lists SET contact_count = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(countResult?.total || 0, listId).run();

  return c.json({ success: true, inserted, errors, total: countResult?.total || 0 });
});

// ==================
// Get email lists
// ==================
emailRoutes.get('/lists', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM email_lists WHERE is_active = 1 ORDER BY created_at DESC').all();
  return c.json({ success: true, data: result.results });
});

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
// Get single campaign with per-recipient detail
// ==================
emailRoutes.get('/campaigns/:id', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const campaign = await db.prepare(`
    SELECT ec.*, e.name as event_name
    FROM email_campaigns ec
    LEFT JOIN events e ON e.id = ec.event_id
    WHERE ec.id = ?
  `).bind(id).first<any>();
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);

  // Get per-recipient send data
  const sends = await db.prepare(`
    SELECT es.*, c.email, c.first_name, c.last_name
    FROM email_sends es
    LEFT JOIN contacts c ON c.id = es.contact_id
    WHERE es.campaign_id = ?
    ORDER BY es.created_at DESC
  `).bind(id).all();

  return c.json({
    success: true,
    data: {
      ...campaign,
      recipients: sends.results || [],
    },
  });
});

// ==================
// Preview audience — returns count and sample for a given filter
// ==================
const audienceFilterSchema = z.object({
  scope: z.enum(['everyone', 'all_coaches', 'event', 'division', 'age_group', 'manual_emails']),
  eventId: z.string().optional(),
  divisionId: z.string().optional(),
  ageGroup: z.string().optional(),
  manualEmails: z.array(z.string().email()).optional(),
  excludeRegisteredForEvent: z.string().optional(), // Exclude teams already registered for this event
});

emailRoutes.post('/audience/preview', authMiddleware, requireRole('admin', 'director'), zValidator('json', audienceFilterSchema), async (c) => {
  const filter = c.req.valid('json');
  const db = c.env.DB;

  // Handle manual email list preview
  if (filter.scope === 'manual_emails' && filter.manualEmails?.length) {
    const seen = new Set<string>();
    const unique = filter.manualEmails.filter(e => {
      const lower = e.toLowerCase().trim();
      if (!lower || seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    return c.json({
      success: true,
      data: {
        count: unique.length,
        sample: unique.slice(0, 10).map(email => ({
          email, name: '', team: '—', age_group: '—', event: '—',
        })),
      },
    });
  }

  const { query, params } = buildAudienceQuery(filter);
  const result = await db.prepare(query).bind(...params).all<any>();
  const recipients = result.results || [];

  return c.json({
    success: true,
    data: {
      count: recipients.length,
      sample: recipients.slice(0, 10).map((r: any) => ({
        email: r.email,
        name: r.name,
        team: r.team_name,
        age_group: r.age_group,
        event: r.event_name,
      })),
    },
  });
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
  templateType: z.enum(['market_all_events', 'market_specific_event', 'find_team', 'custom']).optional(),
  audience: audienceFilterSchema.optional(),
});

emailRoutes.post('/campaigns', authMiddleware, requireRole('admin', 'director'), zValidator('json', createCampaignSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO email_campaigns (id, name, subject, body_html, body_text, event_id, template_type, sent_by, audience_filter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.name, data.subject, data.bodyHtml, data.bodyText || null,
    data.eventId || null, data.templateType || 'custom', c.get('user').id,
    data.audience ? JSON.stringify(data.audience) : null
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ==================
// Send test email (preview before sending campaign)
// ==================
const testSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
});

emailRoutes.post('/test-send', authMiddleware, requireRole('admin', 'director'), zValidator('json', testSendSchema), async (c) => {
  const data = c.req.valid('json');
  const env = c.env;

  const fromEmail = data.fromEmail || 'info@ultimatetournaments.com';
  const fromName = data.fromName || 'Ultimate Hockey Tournaments';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [data.to],
        subject: `[TEST] ${data.subject}`,
        html: data.html,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return c.json({ success: false, error: `Resend ${response.status}: ${errBody}` }, 500);
    }

    const resendData = await response.json() as any;
    return c.json({ success: true, data: { messageId: resendData?.id, sentTo: data.to } });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Failed to send test email' }, 500);
  }
});

// ==================
// Send campaign
// ==================
const sendCampaignSchema = z.object({
  campaignId: z.string(),
  audience: audienceFilterSchema,
});

emailRoutes.post('/send', authMiddleware, requireRole('admin'), zValidator('json', sendCampaignSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const env = c.env;

  const campaign = await db.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(data.campaignId).first<any>();
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);

  // Build audience — either from registrations query or manual email list
  let uniqueRecipients: { email: string; name: string }[] = [];

  if (data.audience.scope === 'manual_emails' && data.audience.manualEmails?.length) {
    // Manual email list — deduplicate and use as-is
    const seen = new Set<string>();
    uniqueRecipients = data.audience.manualEmails
      .filter(email => {
        const lower = email.toLowerCase().trim();
        if (!lower || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .map(email => ({ email: email.trim(), name: '' }));
  } else {
    const { query, params } = buildAudienceQuery(data.audience);
    const result = await db.prepare(query).bind(...params).all<any>();
    const recipients = result.results || [];

    // Deduplicate by email
    const seen = new Set<string>();
    uniqueRecipients = recipients.filter((r: any) => {
      if (!r.email || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase());
      return true;
    });
  }

  if (uniqueRecipients.length === 0) {
    return c.json({ success: false, error: 'No recipients found for this audience filter' }, 400);
  }

  // Update campaign status to sending
  await db.prepare(`UPDATE email_campaigns SET status = 'sending', audience_filter = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(data.audience), data.campaignId).run();

  let sent = 0;
  let failed = 0;

  for (const recipient of uniqueRecipients) {
    // Ensure contact exists in contacts table for tracking
    let contactId = await ensureContact(db, recipient);

    // Check if already sent to this contact for this campaign
    const existing = await db.prepare(
      'SELECT id FROM email_sends WHERE campaign_id = ? AND contact_id = ?'
    ).bind(data.campaignId, contactId).first();
    if (existing) continue;

    try {
      const fromEmail = campaign.from_email || 'info@ultimatetournaments.com';
      const fromName = campaign.from_name || 'Ultimate Hockey Tournaments';

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [recipient.email],
          subject: campaign.subject,
          html: campaign.body_html,
          ...(campaign.body_text ? { text: campaign.body_text } : {}),
        }),
      });

      const resendData = response.ok ? await response.json() as any : null;
      const messageId = resendData?.id || null;

      await db.prepare(`
        INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().replace(/-/g, ''), data.campaignId, contactId,
        messageId, response.ok ? 'sent' : 'dropped'
      ).run();

      if (response.ok) sent++;
      else failed++;
    } catch (err) {
      console.error('Resend error:', err);
      failed++;
    }
  }

  // Update campaign stats
  await db.prepare(`
    UPDATE email_campaigns SET status = 'sent', sent_at = datetime('now'), total_sent = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(sent, data.campaignId).run();

  return c.json({ success: true, data: { sent, failed, total: uniqueRecipients.length } });
});

// ==================
// Resend to non-openers
// ==================
emailRoutes.post('/campaigns/:id/resend-non-openers', authMiddleware, requireRole('admin'), async (c) => {
  const campaignId = c.req.param('id');
  const db = c.env.DB;
  const env = c.env;

  const campaign = await db.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(campaignId).first<any>();
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);
  if (campaign.status !== 'sent') return c.json({ success: false, error: 'Campaign has not been sent yet' }, 400);

  // Find sends that were NOT opened (sent or delivered but not opened/clicked)
  const nonOpeners = await db.prepare(`
    SELECT es.contact_id, c.email, c.first_name, c.last_name
    FROM email_sends es
    JOIN contacts c ON c.id = es.contact_id
    WHERE es.campaign_id = ? AND es.status IN ('sent', 'delivered') AND c.email IS NOT NULL
  `).bind(campaignId).all<any>();

  const recipients = nonOpeners.results || [];
  if (recipients.length === 0) {
    return c.json({ success: false, error: 'Everyone has opened the email — nice work!' }, 400);
  }

  // Optionally modify subject for resend
  const resendSubject = campaign.subject.startsWith('Re: ') ? campaign.subject : campaign.subject;

  let sent = 0;
  for (const recipient of recipients) {
    try {
      const fromEmail = campaign.from_email || 'info@ultimatetournaments.com';
      const fromName = campaign.from_name || 'Ultimate Hockey Tournaments';

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [recipient.email],
          subject: resendSubject,
          html: campaign.body_html,
          ...(campaign.body_text ? { text: campaign.body_text } : {}),
        }),
      });

      if (response.ok) {
        const resendData = await response.json() as any;
        const messageId = resendData?.id || null;
        await db.prepare(`
          UPDATE email_sends SET sendgrid_message_id = ?, status = 'sent', opened_at = NULL, clicked_at = NULL
          WHERE campaign_id = ? AND contact_id = ?
        `).bind(messageId, campaignId, recipient.contact_id).run();
        sent++;
      }
    } catch (err) {
      console.error('Resend error:', err);
    }
  }

  // Update sent count
  await db.prepare(`
    UPDATE email_campaigns SET total_sent = total_sent + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(sent, campaignId).run();

  return c.json({ success: true, data: { resent: sent, total_non_openers: recipients.length } });
});

// ==================
// Get available events for email targeting
// ==================
emailRoutes.get('/audience/events', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const events = await db.prepare(`
    SELECT e.id, e.name, e.city, e.state, e.start_date, e.status,
      (SELECT COUNT(DISTINCT r.team_id) FROM registrations r WHERE r.event_id = e.id AND r.status = 'approved') as team_count
    FROM events e
    WHERE e.status NOT IN ('draft', 'cancelled')
    ORDER BY e.start_date DESC
  `).all();
  return c.json({ success: true, data: events.results });
});

// ==================
// Get divisions for an event (for audience targeting)
// ==================
emailRoutes.get('/audience/events/:eventId/divisions', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;
  const divisions = await db.prepare(`
    SELECT ed.id, ed.age_group, ed.division_level, ed.current_team_count, ed.max_teams
    FROM event_divisions ed
    WHERE ed.event_id = ?
    ORDER BY ed.age_group
  `).bind(eventId).all();
  return c.json({ success: true, data: divisions.results });
});

// ==================
// Generate email template HTML
// ==================
const templateSchema = z.object({
  templateType: z.enum(['market_all_events', 'market_specific_event', 'find_team', 'custom']),
  eventId: z.string().optional(),
  customMessage: z.string().optional(),
});

emailRoutes.post('/templates/generate', authMiddleware, requireRole('admin', 'director'), zValidator('json', templateSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  let subject = '';
  let html = '';

  switch (data.templateType) {
    case 'market_all_events': {
      const events = await db.prepare(`
        SELECT e.*, (SELECT COUNT(*) FROM event_registrations er WHERE er.event_id = e.id AND er.status IN ('approved', 'pending')) as team_count
        FROM events e WHERE e.status IN ('registration_open', 'active', 'published') AND e.start_date >= date('now')
        ORDER BY e.start_date ASC
      `).all<any>();
      subject = 'Upcoming Tournaments — Ultimate Hockey Tournaments';
      html = generateAllEventsEmail(events.results || []);
      break;
    }
    case 'market_specific_event': {
      if (!data.eventId) return c.json({ success: false, error: 'eventId required for this template' }, 400);
      const event = await db.prepare(`
        SELECT e.*, v.name as venue_name, v.address as venue_address
        FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = ?
      `).bind(data.eventId).first<any>();
      if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

      // Fetch divisions for this event
      const eventDivisions = await db.prepare(`
        SELECT age_group, division_level, price_cents, current_team_count, max_teams
        FROM event_divisions WHERE event_id = ? ORDER BY age_group
      `).bind(data.eventId).all<any>();

      // Fetch hotels for this event
      const eventHotels = await db.prepare(`
        SELECT hotel_name, city, state, price_per_night, rate_description, booking_url
        FROM event_hotels WHERE event_id = ? AND is_active = 1 ORDER BY hotel_name
      `).bind(data.eventId).all<any>();

      // Fetch event venues (multi-venue)
      const eventVenues = await db.prepare(`
        SELECT v.name, v.address, v.city, v.state
        FROM event_venues ev JOIN venues v ON v.id = ev.venue_id WHERE ev.event_id = ?
      `).bind(data.eventId).all<any>();

      subject = `Register Now: ${event.name}`;
      html = generateEventEmail(event, eventDivisions.results || [], eventHotels.results || [], eventVenues.results || [], data.customMessage);
      break;
    }
    case 'find_team': {
      if (!data.eventId) return c.json({ success: false, error: 'eventId required for this template' }, 400);
      const event = await db.prepare(`
        SELECT e.*, v.name as venue_name, v.address as venue_address
        FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = ?
      `).bind(data.eventId).first<any>();
      if (!event) return c.json({ success: false, error: 'Event not found' }, 404);

      // Fetch hotels for this event
      const ftHotels = await db.prepare(`
        SELECT hotel_name, city, state, price_per_night, rate_description, booking_url
        FROM event_hotels WHERE event_id = ? AND is_active = 1 ORDER BY hotel_name
      `).bind(data.eventId).all<any>();

      // Fetch event venues (multi-venue)
      const ftVenues = await db.prepare(`
        SELECT v.name, v.address, v.city, v.state
        FROM event_venues ev JOIN venues v ON v.id = ev.venue_id WHERE ev.event_id = ?
      `).bind(data.eventId).all<any>();

      // First try divisions with open spots
      let divisions = await db.prepare(`
        SELECT ed.*, ed.max_teams - ed.current_team_count as spots_left
        FROM event_divisions ed WHERE ed.event_id = ? AND ed.max_teams > ed.current_team_count ORDER BY ed.age_group
      `).bind(data.eventId).all<any>();
      // If none found, pull ALL divisions for the event so the template isn't empty
      if (!divisions.results || divisions.results.length === 0) {
        divisions = await db.prepare(`
          SELECT ed.*, ed.max_teams - ed.current_team_count as spots_left
          FROM event_divisions ed WHERE ed.event_id = ? ORDER BY ed.age_group
        `).bind(data.eventId).all<any>();
      }
      subject = `Spots Available: ${event.name}`;
      html = generateFindTeamEmail(event, divisions.results || [], ftHotels.results || [], ftVenues.results || []);
      break;
    }
    case 'custom':
    default:
      subject = '';
      html = generateCustomEmail(data.customMessage || '');
      break;
  }

  return c.json({ success: true, data: { subject, html } });
});

// ==================
// Automated email templates — list, preview HTML, send test, edit overrides
// ==================

// List all automated email templates (with editable field definitions)
emailRoutes.get('/automated', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;

  // For each template, check if there are DB overrides
  const templatesWithStatus = await Promise.all(
    TEMPLATE_DEFINITIONS.map(async (t) => {
      const overrides = await getOverridesFromDB(db, t.id);
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        trigger: t.trigger,
        from: t.from,
        hasCustomizations: overrides !== null,
        editableFields: t.editableFields,
      };
    })
  );

  return c.json({ success: true, data: templatesWithStatus });
});

// Get current overrides for a template (returns defaults merged with any DB overrides)
emailRoutes.get('/automated/:templateId/overrides', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const templateId = c.req.param('templateId');
  const def = TEMPLATE_DEFINITIONS.find(t => t.id === templateId);
  if (!def) return c.json({ success: false, error: 'Template not found' }, 404);

  const db = c.env.DB;
  const overrides = await getOverridesFromDB(db, templateId);
  const resolved = await getResolvedFields(db, templateId);

  return c.json({
    success: true,
    data: {
      templateId,
      fields: def.editableFields,
      defaults: getDefaults(templateId),
      overrides: overrides || {},
      resolved,
      hasCustomizations: overrides !== null,
    },
  });
});

// Save overrides for a template
const saveOverridesSchema = z.object({
  fields: z.record(z.string()),
});

emailRoutes.put('/automated/:templateId/overrides', authMiddleware, requireRole('admin'), zValidator('json', saveOverridesSchema), async (c) => {
  const templateId = c.req.param('templateId');
  const def = TEMPLATE_DEFINITIONS.find(t => t.id === templateId);
  if (!def) return c.json({ success: false, error: 'Template not found' }, 404);

  const { fields } = c.req.valid('json');
  const db = c.env.DB;
  const userId = c.get('user')?.id || 'admin';

  // Only store fields that differ from defaults
  const defaults = getDefaults(templateId);
  const changedFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (defaults[key] !== undefined && value !== defaults[key]) {
      changedFields[key] = value;
    }
  }

  // If nothing changed from defaults, delete the override row
  if (Object.keys(changedFields).length === 0) {
    await db.prepare('DELETE FROM email_template_overrides WHERE template_id = ?').bind(templateId).run();
    return c.json({ success: true, message: 'Reset to defaults (no changes from default)' });
  }

  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO email_template_overrides (id, template_id, fields, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (template_id) DO UPDATE SET
      fields = excluded.fields,
      updated_at = datetime('now'),
      updated_by = excluded.updated_by
  `).bind(id, templateId, JSON.stringify(changedFields), userId).run();

  return c.json({ success: true, message: 'Template overrides saved', data: { changedFields } });
});

// Reset a template back to defaults
emailRoutes.delete('/automated/:templateId/overrides', authMiddleware, requireRole('admin'), async (c) => {
  const templateId = c.req.param('templateId');
  const def = TEMPLATE_DEFINITIONS.find(t => t.id === templateId);
  if (!def) return c.json({ success: false, error: 'Template not found' }, 404);

  const db = c.env.DB;
  await db.prepare('DELETE FROM email_template_overrides WHERE template_id = ?').bind(templateId).run();

  return c.json({ success: true, message: 'Template reset to defaults' });
});

// Preview a specific automated email template (returns HTML with overrides applied)
emailRoutes.get('/automated/:templateId/preview', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const templateId = c.req.param('templateId');
  const template = TEMPLATE_DEFINITIONS.find(t => t.id === templateId);
  if (!template) return c.json({ success: false, error: 'Template not found' }, 404);

  const db = c.env.DB;
  const fields = await getResolvedFields(db, templateId);

  const sampleData = {
    teamName: 'Chicago Wolves Elite',
    ageGroup: 'Bantam',
    division: 'AA',
    eventName: 'Chicago Dog Classic 2026',
    eventDate: 'May 29 - Jun 1, 2026',
    eventDateShort: '05/29/2026',
    eventCity: 'Chicago, Illinois',
    headCoachName: 'Mike Johnson',
    recipientName: 'Coach Johnson',
    priceCents: 89500,
    depositCents: 35000,
  };

  const vars = {
    eventName: sampleData.eventName,
    teamName: sampleData.teamName,
    ageGroup: sampleData.ageGroup,
    division: sampleData.division,
    eventDate: sampleData.eventDateShort,
    eventCity: sampleData.eventCity,
    divisionText: sampleData.division ? ` - ${sampleData.division}` : '',
    firstName: 'Coach Johnson',
  };

  let subject = '';
  let html = '';

  switch (templateId) {
    case 'registration_confirmation': {
      const { buildConfirmationHtml } = await import('../lib/registration-email');
      subject = replaceVars(fields.subject, vars);
      html = buildConfirmationHtml({ ...sampleData, _overrides: fields } as any);
      break;
    }
    case 'approval_unpaid': {
      const { buildAcceptanceHtml } = await import('../lib/approval-email');
      subject = replaceVars(fields.subject, vars);
      html = buildAcceptanceHtml({ ...sampleData, paymentStatus: 'unpaid', _overrides: fields } as any);
      break;
    }
    case 'approval_deposit': {
      const { buildAcceptanceHtml } = await import('../lib/approval-email');
      subject = replaceVars(fields.subject, vars);
      html = buildAcceptanceHtml({ ...sampleData, paymentStatus: 'partial', _overrides: fields } as any);
      break;
    }
    case 'approval_paid': {
      const { buildAcceptanceHtml } = await import('../lib/approval-email');
      subject = replaceVars(fields.subject, vars);
      html = buildAcceptanceHtml({ ...sampleData, paymentStatus: 'paid', _overrides: fields } as any);
      break;
    }
    case 'magic_link': {
      subject = replaceVars(fields.subject, vars);
      html = buildMagicLinkHtml('Coach Johnson', '#', fields);
      break;
    }
  }

  return c.json({ success: true, data: { subject, html, template: { id: template.id, name: template.name, description: template.description, trigger: template.trigger, from: template.from } } });
});

// Send a test of an automated email template (uses DB overrides)
const sendTestSchema = z.object({
  templateId: z.string(),
  email: z.string().email(),
});

emailRoutes.post('/automated/send-test', authMiddleware, requireRole('admin'), zValidator('json', sendTestSchema), async (c) => {
  const { templateId, email } = c.req.valid('json');
  const template = TEMPLATE_DEFINITIONS.find(t => t.id === templateId);
  if (!template) return c.json({ success: false, error: 'Template not found' }, 404);

  const db = c.env.DB;
  const fields = await getResolvedFields(db, templateId);

  const sampleData = {
    recipientEmail: email,
    recipientName: 'Test User',
    teamName: 'Chicago Wolves Elite',
    ageGroup: 'Bantam',
    division: 'AA',
    eventName: 'Chicago Dog Classic 2026',
    eventDate: 'May 29 - Jun 1, 2026',
    eventDateShort: '05/29/2026',
    eventCity: 'Chicago, Illinois',
    headCoachName: 'Mike Johnson',
    priceCents: 89500,
    depositCents: 35000,
  };

  let result: { success: boolean; error?: string } = { success: false, error: 'Unknown template' };

  switch (templateId) {
    case 'registration_confirmation':
      result = await sendRegistrationConfirmationEmail(c.env, { ...sampleData, _overrides: fields } as any);
      break;
    case 'approval_unpaid':
      result = await sendApprovalEmail(c.env, { ...sampleData, paymentStatus: 'unpaid', _overrides: fields } as any);
      break;
    case 'approval_deposit':
      result = await sendApprovalEmail(c.env, { ...sampleData, paymentStatus: 'partial', _overrides: fields } as any);
      break;
    case 'approval_paid':
      result = await sendApprovalEmail(c.env, { ...sampleData, paymentStatus: 'paid', _overrides: fields } as any);
      break;
    case 'magic_link': {
      const html = buildMagicLinkHtml('Test User', '#', fields);
      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Ultimate Tournaments <registration@ultimatetournaments.com>',
          to: [email],
          subject: `[TEST] ${fields.subject}`,
          html: html,
        }),
      });
      result = { success: resendResp.ok, error: resendResp.ok ? undefined : `Resend ${resendResp.status}` };
      break;
    }
  }

  return c.json({ success: result.success, error: result.error, sent_to: email, template: templateId });
});

/** Build magic link HTML using override fields */
function buildMagicLinkHtml(recipientName: string, loginUrl: string, fields: Record<string, string>): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <img src="https://uht-web.pages.dev/uht-logo.png" alt="UHT" style="height: 48px; margin-bottom: 24px;" />
      <h2 style="color: #1d1d1f; margin-bottom: 8px;">Hi ${recipientName},</h2>
      <p style="color: #6e6e73; font-size: 16px; line-height: 1.5;">
        ${fields.body_text || 'Click the button below to sign in to your Ultimate Tournaments account. This link expires in 15 minutes.'}
      </p>
      <a href="${loginUrl}" style="display: inline-block; background: #003e79; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 24px 0;">
        ${fields.cta_text || 'Sign In'}
      </a>
      <p style="color: #aeaeb2; font-size: 13px; margin-top: 32px;">
        ${fields.footer_text || "If you didn't request this link, you can safely ignore this email."}
      </p>
    </div>`;
}

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
    let timeField = '';
    switch (event.event) {
      case 'delivered': status = 'delivered'; field = 'total_delivered'; break;
      case 'open': status = 'opened'; field = 'total_opened'; timeField = 'opened_at'; break;
      case 'click': status = 'clicked'; field = 'total_clicked'; timeField = 'clicked_at'; break;
      case 'bounce': status = 'bounced'; field = 'total_bounced'; break;
      case 'unsubscribe': status = 'unsubscribed'; field = 'total_unsubscribed'; break;
      default: continue;
    }

    // Update individual send — only escalate status (don't downgrade opened→delivered)
    const statusOrder = ['queued', 'sent', 'delivered', 'opened', 'clicked'];
    const send = await db.prepare(
      'SELECT id, campaign_id, status FROM email_sends WHERE sendgrid_message_id = ?'
    ).bind(sgId).first<any>();

    if (send) {
      const currentIdx = statusOrder.indexOf(send.status);
      const newIdx = statusOrder.indexOf(status);
      // Only update if it's a bounce/unsub (always update) or a higher status
      if (status === 'bounced' || status === 'unsubscribed' || newIdx > currentIdx) {
        const timeUpdate = timeField ? `, ${timeField} = datetime('now')` : '';
        await db.prepare(
          `UPDATE email_sends SET status = ?${timeUpdate} WHERE id = ?`
        ).bind(status, send.id).run();
      }

      // Update campaign aggregate stats
      if (field) {
        await db.prepare(`UPDATE email_campaigns SET ${field} = ${field} + 1 WHERE id = ?`).bind(send.campaign_id).run();
      }
    }
  }

  return c.json({ success: true });
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function buildAudienceQuery(filter: { scope: string; eventId?: string; divisionId?: string; ageGroup?: string; excludeRegisteredForEvent?: string }) {
  const params: string[] = [];

  // "everyone" → all users in the system with valid emails
  if (filter.scope === 'everyone') {
    let query = `
      SELECT DISTINCT u.email,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as name,
        '' as team_name, '' as age_group, '' as event_name
      FROM users u
      WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''
        AND u.email NOT LIKE '%@system.internal'
    `;
    if (filter.excludeRegisteredForEvent) {
      query += ` AND u.email NOT IN (
        SELECT t2.head_coach_email FROM event_registrations er2
        JOIN teams t2 ON t2.id = er2.team_id
        WHERE er2.event_id = ? AND er2.status IN ('approved', 'pending')
        AND t2.head_coach_email IS NOT NULL AND t2.head_coach_email != ''
      )`;
      params.push(filter.excludeRegisteredForEvent);
    }
    query += ' ORDER BY u.first_name, u.last_name';
    return { query, params };
  }

  // "all_coaches" → all team coach emails from teams table
  if (filter.scope === 'all_coaches') {
    let query = `
      SELECT DISTINCT t.head_coach_email as email,
        COALESCE(t.head_coach_name, t.name) as name,
        t.name as team_name, t.age_group, '' as event_name
      FROM teams t
      WHERE t.is_active = 1 AND t.head_coach_email IS NOT NULL AND t.head_coach_email != ''
    `;
    if (filter.excludeRegisteredForEvent) {
      query += ` AND t.head_coach_email NOT IN (
        SELECT t2.head_coach_email FROM event_registrations er2
        JOIN teams t2 ON t2.id = er2.team_id
        WHERE er2.event_id = ? AND er2.status IN ('approved', 'pending')
        AND t2.head_coach_email IS NOT NULL AND t2.head_coach_email != ''
      )`;
      params.push(filter.excludeRegisteredForEvent);
    }
    query += ' ORDER BY t.name';
    return { query, params };
  }

  // Event/division/age_group scopes → pull from event_registrations + registrations (both tables)
  let query = `
    SELECT DISTINCT
      COALESCE(t.head_coach_email, u.email) as email,
      COALESCE(t.head_coach_name, u.first_name || ' ' || u.last_name, t.name) as name,
      t.name as team_name,
      COALESCE(ed.age_group, t.age_group) as age_group,
      e.name as event_name
    FROM event_registrations er
    JOIN teams t ON t.id = er.team_id
    JOIN events e ON e.id = er.event_id
    LEFT JOIN event_divisions ed ON ed.id = er.division_id
    LEFT JOIN users u ON u.id = er.user_id
    WHERE er.status IN ('approved', 'pending', 'awaiting_payment')
      AND (t.head_coach_email IS NOT NULL AND t.head_coach_email != ''
           OR u.email IS NOT NULL AND u.email != '')
  `;

  switch (filter.scope) {
    case 'event':
      if (filter.eventId) {
        query += ' AND er.event_id = ?';
        params.push(filter.eventId);
      }
      break;
    case 'division':
      if (filter.divisionId) {
        query += ' AND er.division_id = ?';
        params.push(filter.divisionId);
      }
      break;
    case 'age_group':
      if (filter.ageGroup) {
        query += ' AND ed.age_group = ?';
        params.push(filter.ageGroup);
      }
      break;
  }

  if (filter.excludeRegisteredForEvent) {
    query += ` AND COALESCE(t.head_coach_email, u.email) NOT IN (
      SELECT COALESCE(t2.head_coach_email, u2.email)
      FROM event_registrations er2
      JOIN teams t2 ON t2.id = er2.team_id
      LEFT JOIN users u2 ON u2.id = er2.user_id
      WHERE er2.event_id = ? AND er2.status IN ('approved', 'pending')
    )`;
    params.push(filter.excludeRegisteredForEvent);
  }

  // Also union with legacy registrations table if it has data
  query += `
    UNION
    SELECT DISTINCT
      t.head_coach_email as email,
      COALESCE(t.head_coach_name, t.name) as name,
      t.name as team_name,
      ed.age_group,
      e.name as event_name
    FROM registrations r
    JOIN teams t ON t.id = r.team_id
    JOIN event_divisions ed ON ed.id = r.event_division_id
    JOIN events e ON e.id = r.event_id
    WHERE r.status = 'approved' AND t.head_coach_email IS NOT NULL AND t.head_coach_email != ''
  `;

  switch (filter.scope) {
    case 'event':
      if (filter.eventId) {
        query += ' AND r.event_id = ?';
        params.push(filter.eventId);
      }
      break;
    case 'division':
      if (filter.divisionId) {
        query += ' AND r.event_division_id = ?';
        params.push(filter.divisionId);
      }
      break;
    case 'age_group':
      if (filter.ageGroup) {
        query += ' AND ed.age_group = ?';
        params.push(filter.ageGroup);
      }
      break;
  }

  query += ' ORDER BY name';
  return { query, params };
}

async function ensureContact(db: any, recipient: any): Promise<string> {
  // Check if contact exists by email
  const existing = await db.prepare('SELECT id FROM contacts WHERE email = ?')
    .bind(recipient.email.toLowerCase()).first<any>();
  if (existing) return existing.id;

  // Create contact
  const id = crypto.randomUUID().replace(/-/g, '');
  const nameParts = (recipient.name || '').split(' ');
  await db.prepare(`
    INSERT INTO contacts (id, email, first_name, last_name, source)
    VALUES (?, ?, ?, ?, 'registration')
  `).bind(id, recipient.email.toLowerCase(), nameParts[0] || null, nameParts.slice(1).join(' ') || null).run();
  return id;
}

// ==========================================
// EMAIL TEMPLATES
// ==========================================

const EMAIL_HEADER = `
<div style="background-color:#003e79;padding:32px 24px;text-align:center;">
  <h1 style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;margin:0;">
    Ultimate Hockey Tournaments
  </h1>
</div>`;

const EMAIL_FOOTER = `
<div style="background-color:#f5f5f7;padding:24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <p style="color:#86868b;font-size:12px;margin:0 0 8px 0;">
    Ultimate Hockey Tournaments<br/>
    <a href="https://ultimatetournaments.com" style="color:#003e79;">ultimatetournaments.com</a>
  </p>
  <p style="color:#aeaeb2;font-size:11px;margin:0;">
    You received this email because you are part of our tournament community.
  </p>
</div>`;

function wrapEmail(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;"><tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
<tr><td>${EMAIL_HEADER}</td></tr>
<tr><td style="padding:32px 24px;">${content}</td></tr>
<tr><td>${EMAIL_FOOTER}</td></tr>
</table></td></tr></table></body></html>`;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

const AGE_GROUP_ORDER = ['mite', 'squirt', 'peewee', 'pee wee', 'bantam', 'midget'];
function sortByAgeGroup(items: any[], field = 'age_group'): any[] {
  return [...items].sort((a, b) => {
    const aIdx = AGE_GROUP_ORDER.findIndex(ag => (a[field] || '').toLowerCase().includes(ag));
    const bIdx = AGE_GROUP_ORDER.findIndex(ag => (b[field] || '').toLowerCase().includes(ag));
    const aOrder = aIdx >= 0 ? aIdx : 99;
    const bOrder = bIdx >= 0 ? bIdx : 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a[field] || '').localeCompare(b[field] || '');
  });
}

function sortAgeGroupString(ageGroups: string): string {
  if (!ageGroups) return '';
  const groups = parseAgeGroupsArray(ageGroups);
  groups.sort((a, b) => {
    const aIdx = AGE_GROUP_ORDER.findIndex(ag => a.toLowerCase().includes(ag));
    const bIdx = AGE_GROUP_ORDER.findIndex(ag => b.toLowerCase().includes(ag));
    return (aIdx >= 0 ? aIdx : 99) - (bIdx >= 0 ? bIdx : 99);
  });
  return groups.join(', ');
}

/** Parse age groups from either JSON array string or comma-separated string */
function parseAgeGroupsArray(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  // Handle JSON array format: ["Mite", "Squirt", "Pee Wee"]
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((s: string) => String(s).trim()).filter(Boolean);
    } catch {}
  }
  // Fallback: comma-separated
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

/** Render age groups as styled pill badges for emails */
function renderAgeGroupPills(raw: string): string {
  if (!raw) return '';
  const groups = parseAgeGroupsArray(raw);
  // Sort by age group order
  groups.sort((a, b) => {
    const aIdx = AGE_GROUP_ORDER.findIndex(ag => a.toLowerCase().includes(ag));
    const bIdx = AGE_GROUP_ORDER.findIndex(ag => b.toLowerCase().includes(ag));
    return (aIdx >= 0 ? aIdx : 99) - (bIdx >= 0 ? bIdx : 99);
  });
  return groups.map(g =>
    `<span style="display:inline-block;background-color:#003e79;color:#ffffff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;margin:2px 4px 2px 0;">${g}</span>`
  ).join(' ');
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function generateAllEventsEmail(events: any[]): string {
  // Group events by city, showing first 3 per city with logos
  const cityMap = new Map<string, any[]>();
  for (const ev of events) {
    // Normalize state abbreviation
    const stateNorm = (ev.state || '').replace('Illinois', 'IL').replace('Wisconsin', 'WI').replace('Indiana', 'IN').replace('Missouri', 'MO');
    const cityKey = `${ev.city}, ${stateNorm}`;
    if (!cityMap.has(cityKey)) cityMap.set(cityKey, []);
    cityMap.get(cityKey)!.push({ ...ev, stateNorm });
  }

  const citySections = Array.from(cityMap.entries()).map(([cityLabel, cityEvents]) => {
    const shown = cityEvents.slice(0, 3);
    const remaining = cityEvents.length - shown.length;

    const eventRows = shown.map(ev => {
      const logoHtml = ev.logo_url
        ? `<td style="vertical-align:top;width:60px;padding-right:12px;">
            <img src="${ev.logo_url}" alt="" width="56" height="56" style="border-radius:10px;object-fit:cover;display:block;" />
          </td>`
        : '';
      return `
        <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f3;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${logoHtml}
            <td style="vertical-align:top;">
              <a href="https://ultimatetournaments.com/events/${ev.slug}" style="margin:0 0 2px 0;color:#003e79;font-size:15px;font-weight:600;text-decoration:none;">${ev.name}</a>
              <p style="margin:0;color:#6e6e73;font-size:12px;">${formatDate(ev.start_date)}</p>
              ${ev.price_cents ? `<p style="margin:2px 0 0;color:#1d1d1f;font-size:13px;font-weight:600;">Starting at ${formatPrice(ev.price_cents)}</p>` : ''}
            </td>
            <td style="vertical-align:middle;text-align:right;width:90px;">
              <a href="https://ultimatetournaments.com/events/${ev.slug}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:7px 14px;border-radius:18px;text-decoration:none;font-size:12px;font-weight:600;">Details</a>
            </td>
          </tr></table>
        </td></tr>`;
    }).join('');

    const moreLink = remaining > 0
      ? `<tr><td style="padding:8px 0;text-align:center;"><a href="https://ultimatetournaments.com/events" style="color:#003e79;font-size:13px;font-weight:600;text-decoration:none;">+ ${remaining} more event${remaining !== 1 ? 's' : ''} in ${cityLabel}</a></td></tr>`
      : '';

    return `
      <div style="margin-bottom:24px;">
        <div style="background-color:#003e79;color:#ffffff;padding:10px 16px;border-radius:10px 10px 0 0;">
          <h3 style="margin:0;font-size:16px;font-weight:700;">${cityLabel}</h3>
        </div>
        <div style="border:1px solid #e8e8ed;border-top:none;border-radius:0 0 10px 10px;padding:4px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${eventRows}
            ${moreLink}
          </table>
        </div>
      </div>`;
  }).join('');

  return wrapEmail(`
    <h2 style="margin:0 0 8px;color:#1d1d1f;font-size:22px;">Upcoming Tournaments</h2>
    <p style="margin:0 0 24px;color:#6e6e73;font-size:14px;line-height:1.5;">Check out our upcoming events across the Midwest and register your team today!</p>
    ${citySections}
    <div style="text-align:center;margin-top:28px;">
      <a href="https://ultimatetournaments.com/events" style="display:inline-block;background-color:#00ccff;color:#003e79;padding:14px 36px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:bold;">View All Events</a>
    </div>
  `);
}

function generateEventEmail(event: any, divisions: any[] = [], hotels: any[] = [], venues: any[] = [], customMessage?: string): string {
  // Sort divisions by age group order
  divisions = sortByAgeGroup(divisions);
  const registerUrl = `https://ultimatetournaments.com/register?event=${event.slug}`;
  const eventUrl = `https://ultimatetournaments.com/events/${event.slug}`;

  // Logo section
  const logoHtml = event.logo_url
    ? `<div style="text-align:center;margin-bottom:20px;">
        <img src="${event.logo_url}" alt="${event.name}" width="120" height="120" style="border-radius:16px;object-fit:cover;display:inline-block;" />
      </div>`
    : '';

  // Description / information
  const infoText = event.information || event.description || '';
  const infoHtml = infoText
    ? `<p style="margin:0 0 24px;color:#3d3d3d;font-size:14px;line-height:1.7;">${infoText}</p>`
    : '';

  // Pricing — show lowest division price or event-level price
  let lowestPrice = event.price_cents;
  if (divisions.length > 0) {
    const prices = divisions.filter((d: any) => d.price_cents).map((d: any) => d.price_cents);
    if (prices.length > 0) lowestPrice = Math.min(...prices);
  }

  // Age groups — sorted in correct order
  const rawAgeGroups = event.age_groups
    || (divisions.length > 0 ? [...new Set(divisions.map((d: any) => d.age_group))].join(', ') : '');
  const ageGroups = rawAgeGroups ? sortAgeGroupString(rawAgeGroups) : '';

  // Custom message from admin
  const customMessageHtml = customMessage
    ? `<div style="background-color:#f0f7ff;border-left:4px solid #003e79;padding:14px 18px;margin-bottom:24px;border-radius:0 10px 10px 0;">
        <p style="margin:0;color:#1d1d1f;font-size:14px;line-height:1.7;">${customMessage}</p>
      </div>`
    : '';

  // Venue info
  const venueList = venues.length > 0 ? venues : (event.venue_name ? [{ name: event.venue_name, address: event.venue_address, city: event.city, state: event.state }] : []);

  const venueHtml = venueList.length > 0
    ? `<div style="margin-bottom:24px;">
        <h3 style="margin:0 0 10px;color:#1d1d1f;font-size:16px;font-weight:700;">Venue${venueList.length > 1 ? 's' : ''}</h3>
        ${venueList.map((v: any) => `
          <div style="background-color:#f5f5f7;border-radius:10px;padding:12px 16px;margin-bottom:8px;">
            <p style="margin:0;color:#1d1d1f;font-size:14px;font-weight:600;">${v.name}</p>
            ${v.address ? `<p style="margin:2px 0 0;color:#6e6e73;font-size:13px;">${v.address}${v.city ? `, ${v.city}` : ''}${v.state ? `, ${v.state}` : ''}</p>` : ''}
          </div>
        `).join('')}
      </div>`
    : '';

  // Hotels section
  const hotelHtml = hotels.length > 0
    ? `<div style="margin-bottom:24px;">
        <h3 style="margin:0 0 10px;color:#1d1d1f;font-size:16px;font-weight:700;">Partner Hotels</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8ed;border-radius:10px;overflow:hidden;">
          <tr style="background-color:#003e79;">
            <th style="padding:8px 12px;text-align:left;color:#ffffff;font-size:12px;text-transform:uppercase;">Hotel</th>
            <th style="padding:8px 12px;text-align:right;color:#ffffff;font-size:12px;text-transform:uppercase;">Rate</th>
          </tr>
          ${hotels.map((h: any) => `
            <tr>
              <td style="padding:10px 12px;color:#1d1d1f;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f3;">
                ${h.booking_url ? `<a href="${h.booking_url}" style="color:#003e79;text-decoration:none;">${h.hotel_name}</a>` : h.hotel_name}
                ${h.rate_description ? `<br/><span style="color:#86868b;font-size:11px;font-weight:400;">${h.rate_description}</span>` : ''}
              </td>
              <td style="padding:10px 12px;text-align:right;color:#003e79;font-weight:bold;font-size:14px;border-bottom:1px solid #f0f0f3;white-space:nowrap;">
                ${h.price_per_night ? formatPrice(h.price_per_night) + '/night' : '—'}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>`
    : '';

  // Divisions / age groups section
  const divisionHtml = divisions.length > 0
    ? `<div style="margin-bottom:24px;">
        <h3 style="margin:0 0 10px;color:#1d1d1f;font-size:16px;font-weight:700;">Divisions</h3>
        <div style="display:flex;flex-wrap:wrap;">
          ${divisions.map((d: any) => {
            const spotsLeft = d.max_teams ? d.max_teams - (d.current_team_count || 0) : null;
            return `<div style="display:inline-block;background-color:#f0f7ff;border:1px solid #003e79;border-radius:20px;padding:6px 14px;margin:0 6px 6px 0;">
              <span style="color:#003e79;font-size:13px;font-weight:600;">${d.age_group}${d.division_level ? ' ' + d.division_level : ''}</span>
              ${d.price_cents ? `<span style="color:#6e6e73;font-size:11px;"> · ${formatPrice(d.price_cents)}</span>` : ''}
              ${spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 ? `<span style="color:#e53e3e;font-size:11px;font-weight:600;"> · ${spotsLeft} left!</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  return wrapEmail(`
    ${logoHtml}
    <h2 style="margin:0 0 4px;color:#1d1d1f;font-size:24px;font-weight:800;text-align:center;">${event.name}</h2>
    <p style="margin:0 0 4px;color:#003e79;font-size:15px;font-weight:600;text-align:center;">${event.city}, ${event.state}</p>
    <p style="margin:0 0 20px;color:#6e6e73;font-size:14px;text-align:center;">${formatDate(event.start_date)} – ${formatDate(event.end_date)}</p>

    ${infoHtml}

    <!-- CUSTOM_MESSAGE -->${customMessageHtml}<!-- /CUSTOM_MESSAGE -->

    <!-- Quick facts -->
    <div style="background-color:#f0f7ff;border-radius:12px;padding:16px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${lowestPrice ? `<tr><td style="color:#86868b;font-size:13px;padding:5px 0;">Starting at</td><td style="text-align:right;color:#003e79;font-weight:bold;font-size:18px;">${formatPrice(lowestPrice)}</td></tr>` : ''}
        <tr><td style="color:#86868b;font-size:13px;padding:5px 0;">Format</td><td style="text-align:right;color:#1d1d1f;font-size:13px;font-weight:600;">4 Game Guarantee</td></tr>
        ${ageGroups ? `<tr><td style="color:#86868b;font-size:13px;padding:5px 0;vertical-align:top;">Age Groups</td><td style="text-align:right;padding:3px 0;">${renderAgeGroupPills(rawAgeGroups)}</td></tr>` : ''}
      </table>
    </div>

    <!-- Register CTA -->
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${registerUrl}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:16px 48px;border-radius:28px;text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:0.3px;">Register Now</a>
    </div>

    ${divisionHtml}
    ${venueHtml}
    ${hotelHtml}

    <!-- Secondary CTA -->
    <div style="text-align:center;margin-top:8px;">
      <a href="${eventUrl}" style="color:#003e79;font-size:14px;font-weight:600;text-decoration:none;">View Full Event Details →</a>
    </div>
  `);
}

function generateFindTeamEmail(event: any, divisions: any[] = [], hotels: any[] = [], venues: any[] = []): string {
  // Sort divisions by age group order
  divisions = sortByAgeGroup(divisions);
  const registerUrl = `https://ultimatetournaments.com/register?event=${event.slug}&eventId=${event.id}`;
  const eventUrl = `https://ultimatetournaments.com/events/${event.slug}`;

  // Logo section
  const logoHtml = event.logo_url
    ? `<div style="text-align:center;margin-bottom:16px;">
        <img src="${event.logo_url}" alt="${event.name}" width="100" height="100" style="border-radius:14px;object-fit:cover;display:inline-block;" />
      </div>`
    : '';

  // Build division rows from data, or leave marker for frontend builder
  const divRows = divisions.length > 0
    ? divisions.map(d => `
      <tr>
        <td style="padding:8px 12px;color:#1d1d1f;font-size:14px;font-weight:600;border-bottom:1px solid #e8e8ed;">${d.age_group} ${d.division_level || ''}</td>
        <td style="padding:8px 12px;text-align:center;color:#003e79;font-weight:bold;font-size:14px;border-bottom:1px solid #e8e8ed;">${d.spots_left != null ? `${d.spots_left} spot${d.spots_left !== 1 ? 's' : ''}` : 'Open'}</td>
      </tr>
    `).join('')
    : '';

  // Description / information
  const infoText = event.information || event.description || '';

  // Venue info
  const venueList = venues.length > 0 ? venues : (event.venue_name ? [{ name: event.venue_name, address: event.venue_address, city: event.city, state: event.state }] : []);
  const venueHtml = venueList.length > 0
    ? `<div style="margin-bottom:24px;">
        <h3 style="margin:0 0 10px;color:#1d1d1f;font-size:15px;font-weight:700;">Where You'll Play</h3>
        ${venueList.map((v: any) => `
          <div style="background-color:#f5f5f7;border-radius:10px;padding:12px 16px;margin-bottom:8px;">
            <p style="margin:0;color:#1d1d1f;font-size:14px;font-weight:600;">${v.name}</p>
            ${v.address ? `<p style="margin:2px 0 0;color:#6e6e73;font-size:13px;">${v.address}${v.city ? `, ${v.city}` : ''}${v.state ? `, ${v.state}` : ''}</p>` : ''}
          </div>
        `).join('')}
      </div>`
    : '';

  // Hotels section
  const hotelHtml = hotels.length > 0
    ? `<div style="margin-bottom:24px;">
        <h3 style="margin:0 0 10px;color:#1d1d1f;font-size:15px;font-weight:700;">Partner Hotels</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8ed;border-radius:10px;overflow:hidden;">
          <tr style="background-color:#003e79;">
            <th style="padding:8px 12px;text-align:left;color:#ffffff;font-size:12px;text-transform:uppercase;">Hotel</th>
            <th style="padding:8px 12px;text-align:right;color:#ffffff;font-size:12px;text-transform:uppercase;">Rate</th>
          </tr>
          ${hotels.map((h: any) => `
            <tr>
              <td style="padding:10px 12px;color:#1d1d1f;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f3;">
                ${h.booking_url ? `<a href="${h.booking_url}" style="color:#003e79;text-decoration:none;">${h.hotel_name}</a>` : h.hotel_name}
                ${h.rate_description ? `<br/><span style="color:#86868b;font-size:11px;font-weight:400;">${h.rate_description}</span>` : ''}
              </td>
              <td style="padding:10px 12px;text-align:right;color:#003e79;font-weight:bold;font-size:14px;border-bottom:1px solid #f0f0f3;white-space:nowrap;">
                ${h.price_per_night ? formatPrice(h.price_per_night) + '/night' : '—'}
              </td>
            </tr>
          `).join('')}
        </table>
      </div>`
    : '';

  return wrapEmail(`
    ${logoHtml}
    <h2 style="margin:0 0 4px;color:#1d1d1f;font-size:24px;font-weight:800;text-align:center;">${event.name}</h2>
    <p style="margin:0 0 4px;color:#003e79;font-size:15px;font-weight:600;text-align:center;">${event.city}, ${event.state}</p>
    <p style="margin:0 0 20px;color:#6e6e73;font-size:14px;text-align:center;">${formatDate(event.start_date)} – ${formatDate(event.end_date)}</p>

    <div style="background-color:#fff3cd;border-left:4px solid #f59e0b;padding:14px 18px;margin-bottom:24px;border-radius:0 10px 10px 0;">
      <p style="margin:0;color:#92400e;font-size:15px;font-weight:700;">Spots Are Filling Up Fast!</p>
      <p style="margin:4px 0 0;color:#92400e;font-size:13px;line-height:1.5;">Don't miss your chance to compete in one of the Midwest's premier youth hockey tournaments. Limited roster spots remain — register today before divisions fill up.</p>
    </div>

    ${infoText ? `<p style="margin:0 0 24px;color:#3d3d3d;font-size:14px;line-height:1.7;">${infoText}</p>` : ''}

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8ed;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <tr style="background-color:#003e79;">
        <th style="padding:10px 14px;text-align:left;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Division</th>
        <th style="padding:10px 14px;text-align:center;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Available</th>
      </tr>
      <!-- DIVISION_ROWS -->${divRows}<!-- /DIVISION_ROWS -->
    </table>

    <!-- Register CTA -->
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${registerUrl}" style="display:inline-block;background-color:#dc2626;color:#ffffff;padding:16px 48px;border-radius:28px;text-decoration:none;font-size:16px;font-weight:bold;letter-spacing:0.3px;">Register Now — Secure Your Spot</a>
    </div>

    ${venueHtml}
    ${hotelHtml}

    <!-- Secondary CTA -->
    <div style="text-align:center;margin-top:8px;">
      <a href="${eventUrl}" style="color:#003e79;font-size:14px;font-weight:600;text-decoration:none;">View Full Event Details →</a>
    </div>
  `);
}

function generateCustomEmail(message: string): string {
  return wrapEmail(`
    <div style="color:#1d1d1f;font-size:14px;line-height:1.7;">
      ${message || '<p>Type your message here...</p>'}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://ultimatetournaments.com" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:12px 32px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:bold;">Visit Our Website</a>
    </div>
  `);
}
