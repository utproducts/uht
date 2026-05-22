import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';

export const chatbotRoutes = new Hono<{ Bindings: Env }>();

const FAQ_CONTEXT = `You are the Ultimate Hockey Tournaments (UHT) assistant. You help answer questions about hockey tournaments run by UHT across the Midwest United States.

Key information:
- UHT runs youth and adult hockey tournaments in cities including Chicago IL, Wisconsin Dells, St. Louis MO, Notre Dame/South Bend IN, Madison WI, Holland MI, and Ann Arbor MI
- Events are listed on ultimatetournaments.com
- Registration is handled through the website
- Teams can register through their coach, manager, or organization portal
- UHT follows USA Hockey rules and requires USA Hockey registration
- We offer ice time booking at our outdoor rink in Rosemont, Illinois
- For specific questions about pricing, availability, or registration issues, direct them to contact us

Be friendly, helpful, and concise. If you don't know something, say so and suggest they contact us directly.`;

const chatSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

// Alias: /ask maps to same logic as /chat but returns { response } for backward compat
chatbotRoutes.post('/ask', zValidator('json', chatSchema), async (c) => {
  const data = c.req.valid('json');
  const env = c.env;

  // Simple AI generation — try Claude API, fallback to template
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
          model: 'claude-sonnet-4-20250514',
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

  // Fallback: generate a template description from the prompt
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

chatbotRoutes.post('/chat', zValidator('json', chatSchema), async (c) => {
  const data = c.req.valid('json');
  const env = c.env;

  // Fetch upcoming events for context
  const db = c.env.DB;
  const upcomingEvents = await db.prepare(`
    SELECT name, city, state, start_date, end_date,
    (SELECT GROUP_CONCAT(age_group, ', ') FROM event_divisions WHERE event_id = events.id) as divisions
    FROM events
    WHERE status IN ('published', 'registration_open')
    AND start_date >= date('now')
    ORDER BY start_date ASC LIMIT 10
  `).all();

  const eventsContext = upcomingEvents.results?.length
    ? `\n\nUpcoming events:\n${upcomingEvents.results.map((e: any) =>
        `- ${e.name} in ${e.city}, ${e.state} (${e.start_date} to ${e.end_date}) — Divisions: ${e.divisions || 'TBD'}`
      ).join('\n')}`
    : '';

  // Build messages for Claude
  const messages = [
    ...(data.conversationHistory || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: data.message },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: FAQ_CONTEXT + eventsContext,
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
        message: 'I\'m having a little trouble right now. For immediate help, please contact us at info@ultimatetournaments.com or visit our Contact page.',
      },
    });
  }
});
