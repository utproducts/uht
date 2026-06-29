import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { rateLimit } from '../middleware/rate-limit';

export const chatbotRoutes = new Hono<{ Bindings: Env }>();

const SYSTEM_PROMPT = `You are the AI assistant for Ultimate Hockey Tournaments (UHT), a premier youth and adult hockey tournament organization based in the Midwest United States. You are embedded on the website ultimatetournaments.com.

## About UHT
- UHT is owned and operated by the Schwarz family — John Schwarz (Owner), Johnny Schwarz (Tournament Operations), and Cory Schwarz (Tournament Operations)
- UHT runs USA Hockey-sanctioned youth and adult hockey tournaments in cities across the Midwest
- Tournament cities include: Chicago IL, Wisconsin Dells WI, St. Louis MO, Notre Dame/South Bend IN, Madison WI, Holland MI, Ann Arbor MI, and others
- UHT also operates an outdoor ice rink in Rosemont, Illinois available for booking

## Registration & How It Works
- Teams register through the website at ultimatetournaments.com
- A coach, manager, or organization admin can register teams
- Registration requires creating an account, selecting an event, choosing your age group/division, and completing payment
- Multiple teams can be registered for the same event in one session
- USA Hockey registration is required for all players
- Teams can upload rosters after registration (players with name, number, position)
- Hotels are suggested for each tournament — teams select their preferred hotel during registration

## Tournament Format
- Tournaments typically run Friday through Sunday
- Teams are guaranteed 3-4 games (pool play + bracket/playoffs)
- Pool play determines seeding for the bracket round
- Games follow USA Hockey rules with certified officials
- Live scoring is available on the website during events

## Pricing
- Pricing varies by age group/division — younger divisions are typically less expensive
- Each event page shows the price range across all available divisions
- Exact pricing for each age group is shown during registration

## Contact Information
- John Schwarz (Owner): john@ultimatetournaments.net, (630) 336-6160
- Johnny Schwarz (Operations): johnny@ultimatetournaments.com, (630) 336-6175
- Cory Schwarz (Operations): cory@ultimatetournaments.com, (630) 336-0608
- General email: info@ultimatetournaments.com
- Website: ultimatetournaments.com

## Your Behavior
- Be friendly, enthusiastic about hockey, and helpful
- Keep responses concise — 2-3 sentences for simple questions, more for complex ones
- When listing events, mention the city, dates, and key details
- For specific pricing questions, direct users to the event page or registration flow for exact per-division pricing
- If you don't know something specific, say so honestly and suggest contacting the team directly
- You can suggest the user email the team if their question needs a personal response — offer to help them send a message
- Never make up event details, dates, or prices that aren't in your context
- When someone asks about registration, guide them to create an account first, then find their event
- Keep the tone warm and professional — you're representing a family-run business that loves hockey`;

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).optional(),
});

// Build dynamic context from the database
async function buildDynamicContext(db: D1Database): Promise<string> {
  const parts: string[] = [];

  // Upcoming events with pricing
  try {
    const events = await db.prepare(`
      SELECT e.name, e.city, e.state, e.start_date, e.end_date, e.status, e.price_cents,
        (SELECT GROUP_CONCAT(DISTINCT ed.age_group) FROM event_divisions ed WHERE ed.event_id = e.id) as divisions,
        (SELECT MIN(ed2.price_cents) FROM event_divisions ed2 WHERE ed2.event_id = e.id AND ed2.price_cents > 0) as price_min,
        (SELECT MAX(ed3.price_cents) FROM event_divisions ed3 WHERE ed3.event_id = e.id AND ed3.price_cents > 0) as price_max,
        v.name as venue_name
      FROM events e
      LEFT JOIN venues v ON v.id = e.venue_id
      WHERE e.status IN ('published', 'registration_open', 'sold_out')
        AND e.start_date >= date('now')
      ORDER BY e.start_date ASC
      LIMIT 15
    `).all();

    if (events.results?.length) {
      parts.push('\n## Upcoming Events');
      for (const e of events.results as any[]) {
        const price = e.price_min && e.price_max
          ? e.price_min === e.price_max
            ? `$${(e.price_min / 100).toLocaleString()}`
            : `$${(e.price_min / 100).toLocaleString()} – $${(e.price_max / 100).toLocaleString()}`
          : e.price_cents
            ? `$${(e.price_cents / 100).toLocaleString()}`
            : 'Pricing TBD';
        const status = e.status === 'registration_open' ? '(Registration Open)'
          : e.status === 'sold_out' ? '(SOLD OUT)'
          : '(Coming Soon)';
        parts.push(`- ${e.name} — ${e.city}, ${e.state} | ${e.start_date} to ${e.end_date} | ${price} ${status}`);
        if (e.divisions) parts.push(`  Divisions: ${e.divisions}`);
        if (e.venue_name) parts.push(`  Venue: ${e.venue_name}`);
      }
    }
  } catch (err) {
    console.error('Error fetching events for chatbot:', err);
  }

  // Venue info
  try {
    const venues = await db.prepare(`
      SELECT DISTINCT v.name, v.city, v.state
      FROM venues v
      INNER JOIN event_venues ev ON ev.venue_id = v.id
      INNER JOIN events e ON e.id = ev.event_id AND e.status IN ('published', 'registration_open') AND e.start_date >= date('now')
      ORDER BY v.state, v.city
      LIMIT 10
    `).all();

    if (venues.results?.length) {
      parts.push('\n## Tournament Venues');
      for (const v of venues.results as any[]) {
        parts.push(`- ${v.name} in ${v.city}, ${v.state}`);
      }
    }
  } catch (err) {
    console.error('Error fetching venues for chatbot:', err);
  }

  return parts.join('\n');
}

// Alias: /ask maps to same logic as /chat but returns { response } for backward compat (used by AI description generator)
chatbotRoutes.post('/ask', rateLimit(20, 60_000), zValidator('json', chatSchema), async (c) => {
  const data = c.req.valid('json');
  const env = c.env;

  try {
    if (env.CLAUDE_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{ role: 'user', content: data.message }],
        }),
      });
      if (response.ok) {
        const result = await response.json() as any;
        const text = result.content?.[0]?.text || '';
        if (text) return c.json({ success: true, data: { response: text } });
      }
    }
  } catch (e) {
    console.error('AI generation error:', e);
  }

  const nameMatch = data.message.match(/called "([^"]+)"/);
  const cityMatch = data.message.match(/in ([^.]+)\./);
  const name = nameMatch?.[1] || 'this tournament';
  const location = cityMatch?.[1] || 'a premier venue';

  const templates = [
    `Get ready for ${name}! Join us in ${location} for an exciting weekend of competitive youth hockey. Teams from across the region will battle it out on the ice in this action-packed tournament featuring top-tier competition at every level.`,
    `${name} returns to ${location} for another thrilling weekend of youth hockey action. This premier tournament brings together talented teams for intense competition, great sportsmanship, and unforgettable memories on the ice.`,
    `Experience the excitement of ${name} in ${location}! This premier youth hockey tournament features competitive divisions, professional officiating, and an electric atmosphere that players and families love.`,
  ];
  const text = templates[Math.floor(Math.random() * templates.length)];
  return c.json({ success: true, data: { response: text } });
});

// Main chat endpoint — used by the live chat widget
chatbotRoutes.post('/chat', rateLimit(20, 60_000), zValidator('json', chatSchema), async (c) => {
  const data = c.req.valid('json');
  const env = c.env;

  const dynamicContext = await buildDynamicContext(env.DB);

  const messages = [
    ...(data.conversationHistory || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: data.message },
  ];

  try {
    if (!env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT + dynamicContext,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json() as any;
    const assistantMessage = result.content?.[0]?.text || 'I apologize, I\'m having trouble right now. Please try again or contact us directly.';

    return c.json({
      success: true,
      data: { message: assistantMessage },
    });
  } catch (err) {
    console.error('Chatbot error:', err);
    return c.json({
      success: true,
      data: {
        message: 'I\'m having a little trouble right now. For immediate help, please contact us at info@ultimatetournaments.com or call (630) 336-6160.',
      },
    });
  }
});

// Email escalation endpoint
const escalateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  message: z.string().min(1).max(5000),
  chatHistory: z.string().optional(),
});

chatbotRoutes.post('/escalate', rateLimit(5, 60_000), zValidator('json', escalateSchema), async (c) => {
  const data = c.req.valid('json');
  const env = c.env;

  try {
    if (!env.SENDGRID_API_KEY) {
      console.error('SendGrid API key not configured for chat escalation');
      return c.json({ success: true, data: { sent: false, fallback: true } });
    }

    const chatSummary = data.chatHistory
      ? `\n\n--- Chat History ---\n${data.chatHistory}`
      : '';

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'info@ultimatetournaments.com', name: 'UHT Team' }],
        }],
        from: { email: 'noreply@ultimatetournaments.com', name: 'UHT Chat Widget' },
        reply_to: { email: data.email, name: data.name },
        subject: `Chat Support Request from ${data.name}`,
        content: [{
          type: 'text/html',
          value: `<div style="font-family:Arial,sans-serif;max-width:600px"><h2 style="color:#003e79">New Chat Support Request</h2><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;font-weight:bold;color:#666;width:100px">Name:</td><td style="padding:8px">${data.name}</td></tr><tr><td style="padding:8px;font-weight:bold;color:#666">Email:</td><td style="padding:8px"><a href="mailto:${data.email}">${data.email}</a></td></tr></table><div style="background:#f5f5f7;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0;white-space:pre-wrap">${data.message}</p></div>${chatSummary ? `<details style="margin-top:16px"><summary style="cursor:pointer;color:#003e79;font-weight:bold">Chat History</summary><pre style="background:#f9f9f9;padding:12px;border-radius:6px;font-size:13px;overflow-x:auto;white-space:pre-wrap">${chatSummary}</pre></details>` : ''}<p style="color:#999;font-size:12px;margin-top:20px">Sent from the UHT website chat widget.</p></div>`,
        }],
      }),
    });

    if (response.ok || response.status === 202) {
      return c.json({ success: true, data: { sent: true } });
    }

    const errText = await response.text();
    console.error('SendGrid escalation error:', response.status, errText);
    return c.json({ success: true, data: { sent: false, fallback: true } });
  } catch (err) {
    console.error('Email escalation error:', err);
    return c.json({ success: true, data: { sent: false, fallback: true } });
  }
});
