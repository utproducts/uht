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

  // ?light=1 → stats only (used by the live-refresh poll; skips the heavy
  // recipient list so big campaigns can refresh every few seconds)
  if (c.req.query('light') === '1') {
    const counts = await db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status != 'dropped' THEN 1 ELSE 0 END) as sent_ok FROM email_sends WHERE campaign_id = ?"
    ).bind(id).first<any>();
    return c.json({ success: true, data: { ...campaign, send_rows: counts?.total || 0, send_rows_ok: counts?.sent_ok || 0 } });
  }

  // Per-recipient send data — capped so huge campaigns stay loadable
  const sends = await db.prepare(`
    SELECT es.*, c.email, c.first_name, c.last_name
    FROM email_sends es
    LEFT JOIN contacts c ON c.id = es.contact_id
    WHERE es.campaign_id = ?
    ORDER BY es.created_at DESC
    LIMIT 1000
  `).bind(id).all();
  const countRow = await db.prepare('SELECT COUNT(*) as n FROM email_sends WHERE campaign_id = ?').bind(id).first<any>();

  return c.json({
    success: true,
    data: {
      ...campaign,
      recipients: sends.results || [],
      recipients_total: countRow?.n || 0,
      recipients_truncated: (countRow?.n || 0) > 1000,
    },
  });
});

// ==================
// Preview audience — returns count and sample for a given filter
// ==================
const audienceFilterSchema = z.object({
  scope: z.enum(['everyone', 'all_coaches', 'event', 'division', 'age_group', 'manual_emails', 'past_contacts', 'icontacts', 'registered_users', 'purchased']),
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
  templateType: z.enum(['market_all_events', 'market_specific_event', 'find_team', 'super_saver', 'custom']).optional(),
  audience: audienceFilterSchema.optional(),
  // Super Saver: featured events + promo window (activates the auto-credit)
  eventIds: z.array(z.string()).optional(),
  promoDays: z.number().min(1).max(60).optional(),
  // Registration deadline (YYYY-MM-DD, end of day) — overrides promoDays
  promoEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // The credit only applies to events STARTING on/after this date (YYYY-MM-DD)
  minEventStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

  // Sending a Super Saver campaign activates the auto-credit promo window.
  // Only one promo is active at a time — a new send supersedes the previous one.
  if (data.templateType === 'super_saver') {
    try {
      const promoDays = data.promoDays || 7;
      // Explicit deadline date wins over the day count; window closes end of that day
      const endsAt = data.promoEndDate ? `${data.promoEndDate} 23:59:59` : null;
      try { await db.prepare('ALTER TABLE super_saver_promos ADD COLUMN min_event_start TEXT').run(); } catch { /* exists */ }
      await db.prepare('UPDATE super_saver_promos SET is_active = 0 WHERE is_active = 1').run();
      await db.prepare(`
        INSERT INTO super_saver_promos (name, discount_cents, starts_at, ends_at, event_ids, is_active, min_event_start)
        VALUES (?, 40000, datetime('now'), COALESCE(?, datetime('now', '+' || ? || ' days')), ?, 1, ?)
      `).bind(data.name, endsAt, promoDays, JSON.stringify(data.eventIds || []), data.minEventStart || null).run();
    } catch (err: any) {
      console.error('Super Saver promo activation failed:', err?.message || String(err));
    }
  }

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
  // Recipients processed per call — the admin UI keeps calling until done
  // (keeps each Worker request well under subrequest limits)
  batchLimit: z.number().min(1).max(500).optional(),
});

// Shared wave processor — used by the /send route (UI-driven fast path) AND
// the scheduled cron (background pickup when the sending screen is closed).
// Resume-safe: recorded sends are never re-emailed.
export async function processSendWave(env: any, campaign: any, audience: any, batchLimit: number): Promise<{ sent: number; failed: number; remaining: number; done: boolean; total: number; totalSent: number; invalidSkipped: number } | { error: string }> {
  const db: D1Database = env.DB;

  // Build audience — either from registrations query or manual email list
  let uniqueRecipients: { email: string; name: string }[] = [];

  if (audience.scope === 'manual_emails' && audience.manualEmails?.length) {
    const seen = new Set<string>();
    uniqueRecipients = audience.manualEmails
      .filter((email: string) => {
        const lower = email.toLowerCase().trim();
        if (!lower || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .map((email: string) => ({ email: email.trim(), name: '' }));
  } else {
    const { query, params } = buildAudienceQuery(audience);
    const result = await db.prepare(query).bind(...params).all<any>();
    const recipients = result.results || [];
    const seen = new Set<string>();
    uniqueRecipients = recipients.filter((r: any) => {
      if (!r.email || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase());
      return true;
    });
  }

  // Drop malformed addresses — ONE bad address 422s its entire Resend batch
  const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const validEmail = (e: string) => emailRe.test(e) && !e.includes('..');
  const beforeFilter = uniqueRecipients.length;
  uniqueRecipients = uniqueRecipients
    .map(r => ({ ...r, email: (r.email || '').trim() }))
    .filter(r => validEmail(r.email));
  const invalidSkipped = beforeFilter - uniqueRecipients.length;

  if (uniqueRecipients.length === 0) return { error: 'No recipients found for this audience filter' };

  await db.prepare(`UPDATE email_campaigns SET status = 'sending', audience_filter = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(audience), campaign.id).run();

  // Resolve recipients to contact ids in bulk
  const emailToContact = new Map<string, string>();
  const emails = uniqueRecipients.map(r => r.email.toLowerCase());
  for (let i = 0; i < emails.length; i += 90) {
    const chunk = emails.slice(i, i + 90);
    const ph = chunk.map(() => '?').join(',');
    const rows = await db.prepare(`SELECT id, LOWER(email) as em FROM contacts WHERE LOWER(email) IN (${ph})`).bind(...chunk).all<any>();
    for (const row of (rows.results || [])) emailToContact.set(row.em, row.id);
  }
  const missing = uniqueRecipients.filter(r => !emailToContact.has(r.email.toLowerCase()));
  for (let i = 0; i < missing.length; i += 40) {
    const chunk = missing.slice(i, i + 40);
    const stmts = chunk.map(r => {
      const id = crypto.randomUUID().replace(/-/g, '');
      emailToContact.set(r.email.toLowerCase(), id);
      const nameParts = (r.name || '').split(' ');
      return db.prepare(`INSERT INTO contacts (id, email, first_name, last_name, source) VALUES (?, ?, ?, ?, 'registration')`)
        .bind(id, r.email.toLowerCase(), nameParts[0] || null, nameParts.slice(1).join(' ') || null);
    });
    await db.batch(stmts);
  }

  // Resume-safe skip of already-recorded sends
  const sentAlready = new Set<string>();
  const sentRows = await db.prepare('SELECT contact_id FROM email_sends WHERE campaign_id = ?').bind(campaign.id).all<any>();
  for (const r of (sentRows.results || [])) sentAlready.add(r.contact_id);

  const pending = uniqueRecipients.filter(r => !sentAlready.has(emailToContact.get(r.email.toLowerCase()) as string));
  const slice = pending.slice(0, batchLimit);

  const fromEmail = campaign.from_email || 'info@ultimatetournaments.com';
  const fromName = campaign.from_name || 'Ultimate Hockey Tournaments';

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < slice.length; i += 100) {
    const chunk = slice.slice(i, i + 100);
    let ok = false;
    let ids: any[] = [];
    try {
      const resp = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map(r => ({
          from: `${fromName} <${fromEmail}>`,
          to: [r.email],
          subject: campaign.subject,
          html: campaign.body_html,
          ...(campaign.body_text ? { text: campaign.body_text } : {}),
        }))),
      });
      if (resp.ok) {
        const j = await resp.json() as any;
        ids = j?.data || [];
        ok = true;
      } else if (resp.status === 422) {
        // A bad address poisoned the batch — isolate it with individual sends
        console.error('Resend batch 422 — falling back to individual sends for this chunk');
        for (const r of chunk) {
          try {
            const single = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `${fromName} <${fromEmail}>`,
                to: [r.email],
                subject: campaign.subject,
                html: campaign.body_html,
                ...(campaign.body_text ? { text: campaign.body_text } : {}),
              }),
            });
            if (single.ok) {
              const sj = await single.json() as any;
              await db.prepare(`INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, ?, 'sent')`)
                .bind(crypto.randomUUID().replace(/-/g, ''), campaign.id, emailToContact.get(r.email.toLowerCase()), sj?.id || null).run();
              sent++;
            } else if (single.status === 422) {
              await db.prepare(`INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, NULL, 'dropped')`)
                .bind(crypto.randomUUID().replace(/-/g, ''), campaign.id, emailToContact.get(r.email.toLowerCase())).run();
              console.error('Dropped invalid address:', r.email);
            } else {
              failed++;
            }
          } catch { failed++; }
          await new Promise(res => setTimeout(res, 550));
        }
        continue;
      } else {
        console.error('Resend batch error:', resp.status, await resp.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Resend batch error:', err);
    }

    if (ok) {
      const stmts = chunk.map((r, idx) => db.prepare(
        `INSERT INTO email_sends (id, campaign_id, contact_id, sendgrid_message_id, status) VALUES (?, ?, ?, ?, 'sent')`
      ).bind(
        crypto.randomUUID().replace(/-/g, ''), campaign.id,
        emailToContact.get(r.email.toLowerCase()), ids[idx]?.id || null
      ));
      await db.batch(stmts);
      sent += chunk.length;
    } else {
      failed += chunk.length;
    }

    if (i + 100 < slice.length) await new Promise(res => setTimeout(res, 650));
  }

  const remaining = pending.length - slice.length + (failed > 0 ? failed : 0);
  const totalSentRow = await db.prepare(
    "SELECT COUNT(*) as n FROM email_sends WHERE campaign_id = ? AND status != 'dropped'"
  ).bind(campaign.id).first<any>();
  const totalSent = totalSentRow?.n || 0;
  const done = remaining <= 0;

  await db.prepare(`
    UPDATE email_campaigns SET status = ?, ${done ? "sent_at = datetime('now')," : ''} total_sent = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(done ? 'sent' : 'sending', totalSent, campaign.id).run();

  return { sent, failed, remaining, done, total: uniqueRecipients.length, totalSent, invalidSkipped };
}

// Enable open + click tracking on all Resend domains via their API (the
// dashboard toggle sometimes fails to persist)
emailRoutes.post('/admin/enable-tracking', authMiddleware, requireRole('admin'), async (c) => {
  const env = c.env;
  const list = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${env.RESEND_API}` },
  });
  const lj = await list.json().catch(() => null) as any;
  const domains = lj?.data || [];
  if (!domains.length) return c.json({ success: false, error: 'No domains found on the Resend account' }, 404);

  // Tracking only applies once a tracking_subdomain is configured AND verified
  // — set one, then enable, then return each domain's DNS records so the
  // required CNAME can be added.
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const subdomain = (body?.subdomain || 'track').replace(/[^a-z0-9-]/gi, '');
  const only = (body?.domain || '').toLowerCase();

  const results: any[] = [];
  for (const d of domains) {
    if (only && d.name.toLowerCase() !== only) continue;
    const patch = await fetch(`https://api.resend.com/domains/${d.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${env.RESEND_API}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_subdomain: subdomain, open_tracking: true, click_tracking: true }),
    });
    const pj = await patch.json().catch(() => null) as any;
    const detail = await fetch(`https://api.resend.com/domains/${d.id}`, {
      headers: { 'Authorization': `Bearer ${env.RESEND_API}` },
    });
    const dj = await detail.json().catch(() => null) as any;
    results.push({
      domain: d.name,
      patch_status: patch.status,
      patch_error: patch.ok ? undefined : pj,
      open_tracking: dj?.open_tracking ?? null,
      click_tracking: dj?.click_tracking ?? null,
      tracking_subdomain: dj?.tracking_subdomain ?? null,
      records: (dj?.records || []).filter((r: any) => /track/i.test(r.record || '') || /track/i.test(r.name || '')),
    });
  }
  return c.json({ success: true, data: results });
});

emailRoutes.post('/send', authMiddleware, requireRole('admin'), zValidator('json', sendCampaignSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;

  const campaign = await db.prepare('SELECT * FROM email_campaigns WHERE id = ?').bind(data.campaignId).first<any>();
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);

  const result = await processSendWave(c.env, campaign, data.audience, data.batchLimit || 400);
  if ('error' in result) return c.json({ success: false, error: result.error }, 400);
  return c.json({ success: true, data: result });
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
  templateType: z.enum(['market_all_events', 'market_specific_event', 'find_team', 'super_saver', 'custom']),
  eventId: z.string().optional(),
  eventIds: z.array(z.string()).optional(),
  promoDays: z.number().min(1).max(60).optional(),
  promoEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minEventStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  discountAmount: z.number().min(1).optional(),
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
    case 'super_saver': {
      // No picked events = feature the rest of THIS YEAR's public events only
      // (the qualifying first registration must be for a this-year event; the
      // credited 2nd event can be any event, this year or next)
      let ssEvents;
      if (data.eventIds && data.eventIds.length > 0) {
        const placeholders = data.eventIds.map(() => '?').join(',');
        ssEvents = await db.prepare(`
          SELECT id, name, slug, city, state, start_date, end_date, logo_url
          FROM events WHERE id IN (${placeholders})
          ORDER BY start_date ASC
        `).bind(...data.eventIds).all<any>();
      } else {
        ssEvents = await db.prepare(`
          SELECT id, name, slug, city, state, start_date, end_date, logo_url
          FROM events
          WHERE status IN ('published', 'registration_open', 'active')
            AND start_date >= date('now')
            AND start_date <= strftime('%Y', 'now') || '-12-31'
          ORDER BY start_date ASC
        `).all<any>();
      }

      const promoDays = data.promoDays || 7;
      const discount = data.discountAmount || 400;
      const deadline = data.promoEndDate
        ? new Date(`${data.promoEndDate}T23:59:59`)
        : new Date(Date.now() + promoDays * 24 * 60 * 60 * 1000);
      // Manual date strings — Workers' toLocaleDateString is unreliable
      const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const deadlineStr = `${DAY_NAMES[deadline.getDay()]}, ${MONTH_NAMES[deadline.getMonth()]} ${deadline.getDate()}, ${deadline.getFullYear()}`;
      const mes = data.minEventStart ? new Date(`${data.minEventStart}T12:00:00`) : null;
      const minEventStartStr = mes ? `${MONTH_NAMES[mes.getMonth()]} ${mes.getDate()}, ${mes.getFullYear()}` : null;

      subject = `\u{1F6A8} Super Saver: $${discount} Off Your 2nd Tournament — Register by ${MONTH_NAMES[deadline.getMonth()].slice(0, 3)} ${deadline.getDate()}`;
      html = generateSuperSaverEmail(ssEvents.results || [], deadlineStr, discount, promoDays, minEventStartStr);
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
    // Sample hotel block so the preview/test shows the hotel + hotel contact section
    hotelInfo: {
      name: 'Sample Tournament Hotel',
      address: '123 Main Street',
      city: 'Chicago',
      state: 'IL',
      phone: '3125551200',
      rateDescription: '$129/night (team rate)',
      bookingUrl: 'https://ultimatetournaments.com',
      bookingCode: 'UHT2026',
      bookingCutoffDate: '2026-05-01',
      contactName: 'Jamie Rivera',
      contactTitle: 'Sales Manager',
      contactPhone: '3125551234',
      contactEmail: 'jamie.rivera@samplehotel.com',
    },
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
    // Sample hotel block so the preview/test shows the hotel + hotel contact section
    hotelInfo: {
      name: 'Sample Tournament Hotel',
      address: '123 Main Street',
      city: 'Chicago',
      state: 'IL',
      phone: '3125551200',
      rateDescription: '$129/night (team rate)',
      bookingUrl: 'https://ultimatetournaments.com',
      bookingCode: 'UHT2026',
      bookingCutoffDate: '2026-05-01',
      contactName: 'Jamie Rivera',
      contactTitle: 'Sales Manager',
      contactPhone: '3125551234',
      contactEmail: 'jamie.rivera@samplehotel.com',
    },
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
      <img src="https://ultimatetournaments.com/uht-logo.png" alt="UHT" style="height: 48px; margin-bottom: 24px;" />
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
      <div style="margin-top: 32px; padding: 24px 30px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
        <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #003e79;">Download the UHT App</p>
        <p style="margin: 0 0 16px; font-size: 14px; color: #666;">Track schedules, scores, and standings in real-time</p>
        <a href="https://apps.apple.com/app/id6786085393" style="display: inline-block; padding: 12px 24px; background-color: #003e79; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Download on the App Store</a>
      </div>
    </div>`;
}

// ==================
// Resend webhook for tracking (opens, clicks, bounces)
// Also handles legacy SendGrid webhook format for backwards compatibility
// ==================
emailRoutes.post('/webhooks/resend', async (c) => {
  const payload = await c.req.json();
  const db = c.env.DB;

  // Resend sends a single event object with { type, data }
  const eventType = payload.type;
  const emailId = payload.data?.email_id;
  if (!emailId) return c.json({ success: true });

  let status = '';
  let field = '';
  let timeField = '';
  switch (eventType) {
    case 'email.delivered': status = 'delivered'; field = 'total_delivered'; break;
    case 'email.opened': status = 'opened'; field = 'total_opened'; timeField = 'opened_at'; break;
    case 'email.clicked': status = 'clicked'; field = 'total_clicked'; timeField = 'clicked_at'; break;
    case 'email.bounced': status = 'bounced'; field = 'total_bounced'; break;
    case 'email.complained': status = 'unsubscribed'; field = 'total_unsubscribed'; break;
    default: return c.json({ success: true });
  }

  // sendgrid_message_id column now stores Resend email IDs
  const statusOrder = ['queued', 'sent', 'delivered', 'opened', 'clicked'];
  const send = await db.prepare(
    'SELECT id, campaign_id, status FROM email_sends WHERE sendgrid_message_id = ?'
  ).bind(emailId).first<any>();

  if (send) {
    const currentIdx = statusOrder.indexOf(send.status);
    const newIdx = statusOrder.indexOf(status);
    if (status === 'bounced' || status === 'unsubscribed' || newIdx > currentIdx) {
      const timeUpdate = timeField ? `, ${timeField} = datetime('now')` : '';
      await db.prepare(
        `UPDATE email_sends SET status = ?${timeUpdate} WHERE id = ?`
      ).bind(status, send.id).run();
    }

    if (field) {
      await db.prepare(`UPDATE email_campaigns SET ${field} = ${field} + 1 WHERE id = ?`).bind(send.campaign_id).run();
    }
  }

  return c.json({ success: true });
});

// Legacy SendGrid webhook route (kept for any in-flight webhooks)
emailRoutes.post('/webhooks/sendgrid', async (c) => {
  return c.json({ success: true });
});

// ==================
// Unsubscribe — no auth required (clicked from email links)
// ==================
emailRoutes.get('/unsubscribe', async (c) => {
  const email = c.req.query('email');
  if (!email) return c.json({ success: false, error: 'Email required' }, 400);

  const db = c.env.DB;
  const normalized = email.toLowerCase().trim();

  // Check current subscription status
  const contact = await db.prepare('SELECT id, is_subscribed_email FROM contacts WHERE LOWER(email) = ?').bind(normalized).first<any>();
  const elc = await db.prepare('SELECT id, is_active FROM email_list_contacts WHERE LOWER(email) = ?').bind(normalized).first<any>();

  return c.json({
    success: true,
    data: {
      email: normalized,
      found: !!(contact || elc),
      already_unsubscribed: (contact && contact.is_subscribed_email === 0) || (elc && elc.is_active === 0),
    },
  });
});

emailRoutes.post('/unsubscribe', async (c) => {
  const body = await c.req.json<{ email: string }>();
  if (!body.email) return c.json({ success: false, error: 'Email required' }, 400);

  const db = c.env.DB;
  const normalized = body.email.toLowerCase().trim();

  // Unsubscribe from contacts table
  await db.prepare(
    "UPDATE contacts SET is_subscribed_email = 0, updated_at = datetime('now') WHERE LOWER(email) = ?"
  ).bind(normalized).run();

  // Unsubscribe from email_list_contacts table
  await db.prepare(
    'UPDATE email_list_contacts SET is_active = 0 WHERE LOWER(email) = ?'
  ).bind(normalized).run();

  return c.json({ success: true, message: 'Successfully unsubscribed' });
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function buildAudienceQuery(filter: { scope: string; eventId?: string; divisionId?: string; ageGroup?: string; excludeRegisteredForEvent?: string }) {
  const params: string[] = [];

  // "everyone" → every contact source combined (users + contacts + iContact
  // list), deduplicated by email. Unsubscribed contacts are excluded.
  if (filter.scope === 'everyone') {
    let query = `
      SELECT email, name, team_name, age_group, event_name, MIN(pri) as best FROM (
        SELECT LOWER(u.email) as email,
          COALESCE(u.first_name || ' ' || u.last_name, u.email) as name,
          '' as team_name, '' as age_group, '' as event_name, 1 as pri
        FROM users u
        WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''
          AND u.email NOT LIKE '%@system.internal'

        UNION ALL

        SELECT LOWER(c.email) as email,
          COALESCE(c.first_name || ' ' || c.last_name, c.email) as name,
          COALESCE(c.organization_name, '') as team_name, '' as age_group, '' as event_name, 2 as pri
        FROM contacts c
        WHERE c.email IS NOT NULL AND c.email != '' AND c.is_subscribed_email = 1

        UNION ALL

        SELECT LOWER(el.email) as email,
          COALESCE(el.first_name || ' ' || el.last_name, el.email) as name,
          '' as team_name, '' as age_group, '' as event_name, 3 as pri
        FROM email_list_contacts el
        WHERE el.is_active = 1 AND el.email IS NOT NULL AND el.email != ''
      ) combined
      GROUP BY email
    `;
    if (filter.excludeRegisteredForEvent) {
      query += ` HAVING email NOT IN (
        SELECT LOWER(t2.head_coach_email) FROM event_registrations er2
        JOIN teams t2 ON t2.id = er2.team_id
        WHERE er2.event_id = ? AND er2.status IN ('approved', 'pending')
        AND t2.head_coach_email IS NOT NULL AND t2.head_coach_email != ''
      )`;
      params.push(filter.excludeRegisteredForEvent);
    }
    query += ' ORDER BY name';
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

  // "purchased" → purchased coach/manager lists from contacts table
  if (filter.scope === 'purchased') {
    const query = `
      SELECT DISTINCT c.email,
        COALESCE(c.first_name || ' ' || c.last_name, c.email) as name,
        COALESCE(c.organization_name, '') as team_name,
        COALESCE(c.tags, '') as age_group,
        '' as event_name
      FROM contacts c
      WHERE c.source LIKE 'purchased%' AND c.email IS NOT NULL AND c.email != ''
        AND c.is_subscribed_email = 1
      ORDER BY c.last_name, c.first_name
    `;
    return { query, params };
  }

  // "past_contacts" → legacy team contacts from contacts table
  if (filter.scope === 'past_contacts') {
    const query = `
      SELECT DISTINCT c.email,
        COALESCE(c.first_name || ' ' || c.last_name, c.email) as name,
        COALESCE(c.organization_name, '') as team_name,
        '' as age_group,
        '' as event_name
      FROM contacts c
      WHERE c.source = 'legacy_team' AND c.email IS NOT NULL AND c.email != ''
        AND c.is_subscribed_email = 1
      ORDER BY c.last_name, c.first_name
    `;
    return { query, params: [] };
  }

  // "icontacts" → iContact imports from email_list_contacts table
  if (filter.scope === 'icontacts') {
    const query = `
      SELECT DISTINCT elc.email,
        COALESCE(elc.first_name || ' ' || elc.last_name, elc.email) as name,
        '' as team_name, '' as age_group, '' as event_name
      FROM email_list_contacts elc
      WHERE elc.is_active = 1 AND elc.email IS NOT NULL AND elc.email != ''
      ORDER BY elc.last_name, elc.first_name
    `;
    return { query, params: [] };
  }

  // "registered_users" → users table (site registrants)
  if (filter.scope === 'registered_users') {
    const query = `
      SELECT DISTINCT u.email,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as name,
        '' as team_name, '' as age_group, '' as event_name
      FROM users u
      WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''
        AND u.email NOT LIKE '%@system.internal'
      ORDER BY u.last_name, u.first_name
    `;
    return { query, params: [] };
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
    You received this email because you are part of our tournament community.<br/>
    <a href="https://ultimatetournaments.com/unsubscribe" style="color:#aeaeb2;text-decoration:underline;">Unsubscribe</a>
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

function generateSuperSaverEmail(events: any[], deadlineStr: string, discount: number, promoDays: number, minEventStartStr?: string | null): string {
  // Manual formatting — the Workers runtime mangles partial toLocaleDateString
  // option sets (day+year came out as "2026 (day: 18)")
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtRange = (start: string, end: string) => {
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  };

  // Event cards: two per row (stack naturally on mobile-width clients)
  const cells = events.map(ev => {
    const registerUrl = `https://ultimatetournaments.com/events/${ev.slug}`;
    const logo = ev.logo_url
      ? `<img src="${ev.logo_url}" alt="" width="64" height="64" style="border-radius:12px;object-fit:cover;display:block;margin:0 auto 10px;" />`
      : `<div style="width:64px;height:64px;border-radius:12px;background-color:#003e79;margin:0 auto 10px;line-height:64px;text-align:center;color:#ffffff;font-size:24px;font-weight:800;">\u{1F3D2}</div>`;
    return `
      <td width="50%" style="padding:6px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8ed;border-radius:14px;background-color:#ffffff;">
          <tr><td style="padding:18px 14px;text-align:center;">
            ${logo}
            <p style="margin:0 0 2px;color:#1d1d1f;font-size:15px;font-weight:700;">${ev.name}</p>
            <p style="margin:0 0 2px;color:#6e6e73;font-size:12px;">${ev.city}, ${ev.state}</p>
            <p style="margin:0 0 12px;color:#003e79;font-size:12px;font-weight:600;">${fmtRange(ev.start_date, ev.end_date)}</p>
            <a href="${registerUrl}" style="display:inline-block;background-color:#003e79;color:#ffffff;padding:9px 22px;border-radius:20px;text-decoration:none;font-size:13px;font-weight:700;">Register Now</a>
          </td></tr>
        </table>
      </td>`;
  });
  const eventRows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    eventRows.push(`<tr>${cells[i]}${cells[i + 1] || '<td width="50%" style="padding:6px;"></td>'}</tr>`);
  }

  return wrapEmail(`
    <!-- Promo hero -->
    <div style="background:linear-gradient(135deg,#003e79 0%,#005599 100%);background-color:#003e79;border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:24px;">
      <span style="display:inline-block;background-color:#00ccff;color:#003e79;font-size:12px;font-weight:800;letter-spacing:1.5px;padding:5px 14px;border-radius:14px;text-transform:uppercase;">\u{1F4E3} Limited-Time Super Saver</span>
      <p style="margin:16px 0 4px;color:#ffffff;font-size:44px;font-weight:800;line-height:1;">$${discount} OFF</p>
      <p style="margin:0 0 14px;color:#9fd8ff;font-size:17px;font-weight:600;">your 2nd tournament registration</p>
      <span style="display:inline-block;background-color:rgba(255,255,255,0.14);color:#ffffff;font-size:13px;font-weight:600;padding:7px 16px;border-radius:18px;">⏰ Offer ends ${deadlineStr}</span>
    </div>

    <!-- How it works -->
    <h2 style="margin:0 0 14px;color:#1d1d1f;font-size:19px;">How it works</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td style="width:34px;vertical-align:top;padding:6px 0;"><div style="width:26px;height:26px;border-radius:13px;background-color:#003e79;color:#ffffff;font-size:14px;font-weight:800;text-align:center;line-height:26px;">1</div></td>
        <td style="vertical-align:middle;padding:6px 0;color:#1d1d1f;font-size:14px;">Register for any <b>${new Date().getFullYear()} UHT event</b> below by <b>${deadlineStr}</b></td>
      </tr>
      <tr>
        <td style="width:34px;vertical-align:top;padding:6px 0;"><div style="width:26px;height:26px;border-radius:13px;background-color:#003e79;color:#ffffff;font-size:14px;font-weight:800;text-align:center;line-height:26px;">2</div></td>
        <td style="vertical-align:middle;padding:6px 0;color:#1d1d1f;font-size:14px;">Register for a <b>2nd UHT tournament</b>${minEventStartStr ? ` starting <b>${minEventStartStr} or later</b> — any city` : ' — any event this year or next, any city'}</td>
      </tr>
      <tr>
        <td style="width:34px;vertical-align:top;padding:6px 0;"><div style="width:26px;height:26px;border-radius:13px;background-color:#00a86b;color:#ffffff;font-size:14px;font-weight:800;text-align:center;line-height:26px;">3</div></td>
        <td style="vertical-align:middle;padding:6px 0;color:#1d1d1f;font-size:14px;">A <b style="color:#00a86b;">$${discount} credit</b> is applied to that 2nd registration${minEventStartStr ? ' automatically' : ''}</td>
      </tr>
    </table>

    <!-- Hotel requirement -->
    <div style="background-color:#fff8e6;border:1px solid #f5d88f;border-radius:12px;padding:12px 16px;margin:14px 0 26px;">
      <p style="margin:0;color:#8a6100;font-size:13px;font-weight:600;">\u{1F3E8} Hotel booking at the time of registration is required to qualify for the Super Saver credit.</p>
    </div>

    <!-- Events -->
    <h2 style="margin:0 0 14px;color:#1d1d1f;font-size:19px;">Super Saver Events</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;">
      ${eventRows.join('')}
    </table>

    <!-- Why act now -->
    <div style="background-color:#f5f9ff;border-radius:14px;padding:20px 22px;margin-bottom:26px;">
      <h3 style="margin:0 0 10px;color:#003e79;font-size:16px;">Why act now?</h3>
      <p style="margin:0 0 6px;color:#1d1d1f;font-size:14px;">✅ <b>$${discount} off</b> your next UHT event</p>
      <p style="margin:0 0 6px;color:#1d1d1f;font-size:14px;">✅ Teams already registered from <b>30+ states</b></p>
      <p style="margin:0 0 6px;color:#1d1d1f;font-size:14px;">✅ Last season <b>every event sold out</b></p>
      <p style="margin:0;color:#1d1d1f;font-size:14px;">✅ Every event had a <b>waitlist</b> — don't miss your spot</p>
    </div>

    <!-- Deadline urgency -->
    <div style="border:2px solid #e34948;border-radius:14px;padding:18px 22px;text-align:center;margin-bottom:26px;">
      <p style="margin:0 0 4px;color:#e34948;font-size:16px;font-weight:800;">⚠️ Register by ${deadlineStr} to claim this deal</p>
      <p style="margin:0;color:#6e6e73;font-size:13px;">Lock in your team's spot now — the offer ends <b>${deadlineStr}</b>${minEventStartStr ? `, and your $${discount} credit is good for any event starting <b>${minEventStartStr} or later</b>` : ''}.</p>
    </div>

    <div style="text-align:center;">
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
