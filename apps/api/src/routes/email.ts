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
  scope: z.enum(['everyone', 'event', 'division', 'age_group', 'manual_emails']),
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
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: recipient.email, name: recipient.name || '' }],
          }],
          from: { email: campaign.from_email || 'info@ultimatetournaments.com', name: campaign.from_name || 'Ultimate Hockey Tournaments' },
          subject: campaign.subject,
          content: [
            { type: 'text/html', value: campaign.body_html },
            ...(campaign.body_text ? [{ type: 'text/plain', value: campaign.body_text }] : []),
          ],
          tracking_settings: {
            open_tracking: { enable: true },
            click_tracking: { enable: true },
          },
        }),
      });

      const sgMessageId = response.headers.get('X-Message-Id') || null;

      await db.prepare(`
        INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().replace(/-/g, ''), data.campaignId, contactId,
        sgMessageId, response.ok ? 'sent' : 'dropped'
      ).run();

      if (response.ok) sent++;
      else failed++;
    } catch (err) {
      console.error('SendGrid error:', err);
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
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: recipient.email, name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() }],
          }],
          from: { email: campaign.from_email || 'info@ultimatetournaments.com', name: campaign.from_name || 'Ultimate Hockey Tournaments' },
          subject: resendSubject,
          content: [
            { type: 'text/html', value: campaign.body_html },
            ...(campaign.body_text ? [{ type: 'text/plain', value: campaign.body_text }] : []),
          ],
          tracking_settings: {
            open_tracking: { enable: true },
            click_tracking: { enable: true },
          },
        }),
      });

      if (response.ok) {
        // Update the send record with new message id
        const sgMessageId = response.headers.get('X-Message-Id') || null;
        await db.prepare(`
          UPDATE email_sends SET sendgrid_message_id = ?, status = 'sent', opened_at = NULL, clicked_at = NULL
          WHERE campaign_id = ? AND contact_id = ?
        `).bind(sgMessageId, campaignId, recipient.contact_id).run();
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
        SELECT e.*, (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'approved') as team_count
        FROM events e WHERE e.status IN ('registration_open', 'active') ORDER BY e.start_date ASC
      `).all<any>();
      subject = 'Upcoming Tournaments — Ultimate Hockey Tournaments';
      html = generateAllEventsEmail(events.results || []);
      break;
    }
    case 'market_specific_event': {
      if (!data.eventId) return c.json({ success: false, error: 'eventId required for this template' }, 400);
      const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(data.eventId).first<any>();
      if (!event) return c.json({ success: false, error: 'Event not found' }, 404);
      subject = `Register Now: ${event.name}`;
      html = generateEventEmail(event);
      break;
    }
    case 'find_team': {
      if (!data.eventId) return c.json({ success: false, error: 'eventId required for this template' }, 400);
      const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(data.eventId).first<any>();
      if (!event) return c.json({ success: false, error: 'Event not found' }, 404);
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
      html = generateFindTeamEmail(event, divisions.results || []);
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
      const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email, name: 'Test User' }] }],
          from: { email: 'registration@ultimatetournaments.com', name: 'Ultimate Tournaments' },
          subject: `[TEST] ${fields.subject}`,
          content: [{ type: 'text/html', value: html }],
        }),
      });
      result = { success: sgResp.ok, error: sgResp.ok ? undefined : `SendGrid ${sgResp.status}` };
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

  // Base: get all team contacts from registrations (coach emails from teams table)
  let query = `
    SELECT DISTINCT
      t.head_coach_email as email,
      COALESCE(t.head_coach_name, t.name) as name,
      t.name as team_name,
      ed.age_group,
      e.name as event_name,
      e.id as event_id,
      t.id as team_id
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
    case 'everyone':
    default:
      break;
  }

  // Exclude teams already registered for a specific event
  // This prevents marketing emails from going to teams already signed up
  if (filter.excludeRegisteredForEvent) {
    query += ` AND t.head_coach_email NOT IN (
      SELECT t2.head_coach_email FROM registrations r2
      JOIN teams t2 ON t2.id = r2.team_id
      WHERE r2.event_id = ? AND r2.status IN ('approved', 'pending')
      AND t2.head_coach_email IS NOT NULL AND t2.head_coach_email != ''
    )`;
    params.push(filter.excludeRegisteredForEvent);
  }

  query += ' ORDER BY t.name';
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
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function generateAllEventsEmail(events: any[]): string {
  const eventCards = events.map(ev => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #e8e8ed;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <h3 style="margin:0 0 4px 0;color:#1d1d1f;font-size:16px;">${ev.name}</h3>
          <p style="margin:0;color:#6e6e73;font-size:13px;">${ev.city}, ${ev.state} · ${formatDate(ev.start_date)}</p>
          ${ev.price_cents ? `<p style="margin:4px 0 0;color:#003e79;font-size:14px;font-weight:bold;">Starting at ${formatPrice(ev.price_cents)}</p>` : ''}
        </td>
        <td style="vertical-align:middle;text-align:right;width:120px;">
          <a href="https://ultimatetournaments.com/events/${ev.slug}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:8px 16px;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;">Details</a>
        </td>
      </tr></table>
    </td></tr>
  `).join('');

  return wrapEmail(`
    <h2 style="margin:0 0 8px;color:#1d1d1f;font-size:20px;">Upcoming Tournaments</h2>
    <p style="margin:0 0 20px;color:#6e6e73;font-size:14px;">Check out our upcoming events and register your team today!</p>
    <table width="100%" cellpadding="0" cellspacing="0">${eventCards}</table>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://ultimatetournaments.com/events" style="display:inline-block;background-color:#00ccff;color:#003e79;padding:12px 32px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:bold;">View All Events</a>
    </div>
  `);
}

function generateEventEmail(event: any): string {
  return wrapEmail(`
    <h2 style="margin:0 0 8px;color:#1d1d1f;font-size:22px;">${event.name}</h2>
    <p style="margin:0 0 4px;color:#6e6e73;font-size:14px;">${event.city}, ${event.state}</p>
    <p style="margin:0 0 20px;color:#6e6e73;font-size:14px;">${formatDate(event.start_date)} – ${formatDate(event.end_date)}</p>
    ${event.information ? `<p style="margin:0 0 20px;color:#3d3d3d;font-size:14px;line-height:1.6;">${event.information}</p>` : ''}
    <div style="background-color:#f0f7ff;border-radius:12px;padding:16px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${event.price_cents ? `<tr><td style="color:#86868b;font-size:12px;padding:4px 0;">Starting at</td><td style="text-align:right;color:#003e79;font-weight:bold;font-size:18px;">${formatPrice(event.price_cents)}</td></tr>` : ''}
        <tr><td style="color:#86868b;font-size:12px;padding:4px 0;">Format</td><td style="text-align:right;color:#1d1d1f;font-size:13px;font-weight:600;">4 Game Guarantee</td></tr>
      </table>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://ultimatetournaments.com/events/${event.slug}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:14px 36px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:bold;">Register Now</a>
    </div>
  `);
}

function generateFindTeamEmail(event: any, divisions: any[]): string {
  // Build division rows from data, or leave marker for frontend builder
  const divRows = divisions.length > 0
    ? divisions.map(d => `
      <tr>
        <td style="padding:8px 12px;color:#1d1d1f;font-size:14px;font-weight:600;border-bottom:1px solid #e8e8ed;">${d.age_group} ${d.division_level || ''}</td>
        <td style="padding:8px 12px;text-align:center;color:#003e79;font-weight:bold;font-size:14px;border-bottom:1px solid #e8e8ed;">${d.spots_left != null ? `${d.spots_left} spot${d.spots_left !== 1 ? 's' : ''}` : 'Open'}</td>
      </tr>
    `).join('')
    : '';

  return wrapEmail(`
    <div style="background-color:#f0f7ff;border-left:4px solid #003e79;padding:12px 16px;margin-bottom:20px;border-radius:0 8px 8px 0;">
      <p style="margin:0;color:#003e79;font-size:14px;font-weight:bold;">Spots are filling up fast!</p>
    </div>
    <h2 style="margin:0 0 8px;color:#1d1d1f;font-size:22px;">${event.name}</h2>
    <p style="margin:0 0 4px;color:#6e6e73;font-size:14px;">${event.city}, ${event.state} · ${formatDate(event.start_date)}</p>
    <p style="margin:0 0 20px;color:#3d3d3d;font-size:14px;line-height:1.6;">We still have openings in the following divisions. Secure your spot before it's too late!</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8ed;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <tr style="background-color:#003e79;">
        <th style="padding:8px 12px;text-align:left;color:#ffffff;font-size:12px;text-transform:uppercase;">Division</th>
        <th style="padding:8px 12px;text-align:center;color:#ffffff;font-size:12px;text-transform:uppercase;">Available</th>
      </tr>
      <!-- DIVISION_ROWS -->${divRows}<!-- /DIVISION_ROWS -->
    </table>
    <div style="text-align:center;">
      <a href="https://ultimatetournaments.com/events/${event.slug}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:14px 36px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:bold;">Register Now</a>
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
