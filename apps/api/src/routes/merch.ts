import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const merchRoutes = new Hono<{ Bindings: Env }>();

// Declare champion and trigger merch flow
const declareChampionSchema = z.object({
  eventId: z.string(),
  eventDivisionId: z.string(),
  teamId: z.string(),
  placement: z.enum(['champion', 'finalist', 'third']).default('champion'),
});

merchRoutes.post('/champions', authMiddleware, requireRole('admin', 'director'), zValidator('json', declareChampionSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO champions (id, event_id, event_division_id, team_id, placement)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, data.eventId, data.eventDivisionId, data.teamId, data.placement).run();

  // TODO: Auto-generate merch previews from team logo + event name
  // TODO: Send champion email via SendGrid
  // TODO: Send champion SMS via TextMagic

  return c.json({ success: true, data: { id } }, 201);
});

// Get champions for an event
merchRoutes.get('/champions/event/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = c.env.DB;

  const result = await db.prepare(`
    SELECT ch.*, t.name as team_name, t.logo_url as team_logo,
      ed.age_group, ed.division_level, e.name as event_name
    FROM champions ch
    JOIN teams t ON t.id = ch.team_id
    JOIN event_divisions ed ON ed.id = ch.event_division_id
    JOIN events e ON e.id = ch.event_id
    WHERE ch.event_id = ?
    ORDER BY ed.age_group ASC, ch.placement ASC
  `).bind(eventId).all();

  return c.json({ success: true, data: result.results });
});

// Get merch templates
merchRoutes.get('/templates', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const result = await db.prepare('SELECT * FROM merch_templates WHERE is_active = 1').all();
  return c.json({ success: true, data: result.results });
});

// Public: Browse champions locker for a team/player
merchRoutes.get('/locker/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const db = c.env.DB;

  const championships = await db.prepare(`
    SELECT ch.*, e.name as event_name, e.logo_url as event_logo,
      ed.age_group, ed.division_level
    FROM champions ch
    JOIN events e ON e.id = ch.event_id
    JOIN event_divisions ed ON ed.id = ch.event_division_id
    WHERE ch.team_id = ?
    ORDER BY ch.declared_at DESC
  `).bind(teamId).all();

  return c.json({ success: true, data: championships.results });
});
