import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';

export const financialRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// SETUP: Create expense tables if not exist
// ==========================================
financialRoutes.post('/setup-tables', async (c) => {
  const db = c.env.DB;
  const results: string[] = [];

  const statements = [
    `CREATE TABLE IF NOT EXISTS event_expenses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      event_id TEXT NOT NULL REFERENCES events(id),
      category TEXT NOT NULL CHECK(category IN ('rink_rental', 'referees', 'trophies', 'hotel_costs', 'marketing', 'travel', 'supplies', 'insurance', 'staff', 'other')),
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      vendor TEXT,
      date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_event_expenses_event ON event_expenses(event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_event_expenses_category ON event_expenses(category)`,
    `CREATE TABLE IF NOT EXISTS hotel_rebates (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      event_id TEXT NOT NULL REFERENCES events(id),
      hotel_name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      rebate_type TEXT NOT NULL CHECK(rebate_type IN ('per_night', 'flat_fee', 'percentage', 'other')),
      rate_amount REAL,
      room_nights INTEGER,
      total_rebate_cents INTEGER NOT NULL,
      notes TEXT,
      date_received TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hotel_rebates_event ON hotel_rebates(event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hotel_rebates_city ON hotel_rebates(city)`,
  ];

  for (const stmt of statements) {
    try {
      await db.prepare(stmt).run();
      results.push('OK');
    } catch (e: any) {
      results.push(`ERR: ${e.message}`);
    }
  }

  return c.json({ success: true, data: { results } });
});

// ==========================================
// EXPENSES: CRUD
// ==========================================
const expenseSchema = z.object({
  event_id: z.string(),
  category: z.enum(['rink_rental', 'referees', 'trophies', 'hotel_costs', 'marketing', 'travel', 'supplies', 'insurance', 'staff', 'other']),
  description: z.string().min(1),
  amount_cents: z.number().int(),
  vendor: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// List expenses for an event
financialRoutes.get('/expenses/:eventId', async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');
  try {
    const result = await db.prepare(`
      SELECT * FROM event_expenses WHERE event_id = ? ORDER BY category ASC, date DESC
    `).bind(eventId).all();
    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    return c.json({ success: true, data: [] });
  }
});

// Create expense
financialRoutes.post('/expenses', zValidator('json', expenseSchema), async (c) => {
  const db = c.env.DB;
  const data = c.req.valid('json');
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO event_expenses (id, event_id, category, description, amount_cents, vendor, date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.event_id, data.category, data.description, data.amount_cents, data.vendor || null, data.date || null, data.notes || null).run();

  const row = await db.prepare('SELECT * FROM event_expenses WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

// Update expense
financialRoutes.patch('/expenses/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json() as Record<string, any>;

  const allowed = ['category', 'description', 'amount_cents', 'vendor', 'date', 'notes'];
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(body[key]);
    }
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push("updated_at = datetime('now')");
  params.push(id);
  await db.prepare(`UPDATE event_expenses SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const row = await db.prepare('SELECT * FROM event_expenses WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

// Delete expense
financialRoutes.delete('/expenses/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM event_expenses WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ==========================================
// HOTEL REBATES: CRUD
// ==========================================
const rebateSchema = z.object({
  event_id: z.string(),
  hotel_name: z.string().min(1),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  rebate_type: z.enum(['per_night', 'flat_fee', 'percentage', 'other']),
  rate_amount: z.number().nullable().optional(),
  room_nights: z.number().int().nullable().optional(),
  total_rebate_cents: z.number().int(),
  notes: z.string().nullable().optional(),
  date_received: z.string().nullable().optional(),
});

// List rebates for an event
financialRoutes.get('/rebates/:eventId', async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');
  try {
    const result = await db.prepare(`
      SELECT * FROM hotel_rebates WHERE event_id = ? ORDER BY hotel_name ASC
    `).bind(eventId).all();
    return c.json({ success: true, data: result.results });
  } catch (e: any) {
    return c.json({ success: true, data: [] });
  }
});

// Create rebate
financialRoutes.post('/rebates', zValidator('json', rebateSchema), async (c) => {
  const db = c.env.DB;
  const data = c.req.valid('json');
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(`
    INSERT INTO hotel_rebates (id, event_id, hotel_name, city, state, rebate_type, rate_amount, room_nights, total_rebate_cents, notes, date_received)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.event_id, data.hotel_name, data.city || null, data.state || null, data.rebate_type, data.rate_amount || null, data.room_nights || null, data.total_rebate_cents, data.notes || null, data.date_received || null).run();

  const row = await db.prepare('SELECT * FROM hotel_rebates WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

// Update rebate
financialRoutes.patch('/rebates/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = await c.req.json() as Record<string, any>;

  const allowed = ['hotel_name', 'city', 'state', 'rebate_type', 'rate_amount', 'room_nights', 'total_rebate_cents', 'notes', 'date_received'];
  const sets: string[] = [];
  const params: any[] = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(body[key]);
    }
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push("updated_at = datetime('now')");
  params.push(id);
  await db.prepare(`UPDATE hotel_rebates SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  const row = await db.prepare('SELECT * FROM hotel_rebates WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

// Delete rebate
financialRoutes.delete('/rebates/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM hotel_rebates WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ==========================================
// REPORTS: Dashboard overview
// ==========================================
financialRoutes.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const { year, season } = c.req.query();

  // Build date filter
  let dateFilter = '';
  const params: string[] = [];
  if (year) {
    dateFilter = `AND e.start_date >= ? AND e.start_date < ?`;
    params.push(`${year}-01-01`, `${parseInt(year) + 1}-01-01`);
  }
  if (season) {
    dateFilter += ` AND e.season = ?`;
    params.push(season);
  }

  // Revenue by event
  const revenueByEvent = await db.prepare(`
    SELECT e.id, e.name, e.city, e.state, e.start_date, e.end_date, e.season,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as revenue_cents
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.id
    ORDER BY e.start_date DESC
  `).bind(...params).all();

  // Expenses by event
  let expensesByEvent: any[] = [];
  try {
    expensesByEvent = (await db.prepare(`
      SELECT ee.event_id, e.name as event_name, e.city, e.state, ee.category,
        SUM(ee.amount_cents) as total_cents
      FROM event_expenses ee
      JOIN events e ON e.id = ee.event_id
      WHERE 1=1 ${dateFilter.replace(/e\./g, 'e.')}
      GROUP BY ee.event_id, ee.category
      ORDER BY e.start_date DESC
    `).bind(...params).all()).results;
  } catch (e) { /* table may not exist yet */ }

  // Hotel rebates by event
  let rebatesByEvent: any[] = [];
  try {
    rebatesByEvent = (await db.prepare(`
      SELECT hr.event_id, e.name as event_name, e.city, e.state, hr.hotel_name,
        hr.total_rebate_cents, hr.room_nights
      FROM hotel_rebates hr
      JOIN events e ON e.id = hr.event_id
      WHERE 1=1 ${dateFilter.replace(/e\./g, 'e.')}
      ORDER BY e.start_date DESC
    `).bind(...params).all()).results;
  } catch (e) { /* table may not exist yet */ }

  // Revenue by city
  const revenueByCity = await db.prepare(`
    SELECT e.city, e.state,
      COUNT(DISTINCT e.id) as event_count,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as revenue_cents
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.city, e.state
    ORDER BY revenue_cents DESC
  `).bind(...params).all();

  // Revenue by month (for charts)
  const revenueByMonth = await db.prepare(`
    SELECT substr(e.start_date, 1, 7) as month,
      COUNT(DISTINCT e.id) as event_count,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as revenue_cents
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE 1=1 ${dateFilter}
    GROUP BY substr(e.start_date, 1, 7)
    ORDER BY month ASC
  `).bind(...params).all();

  // Registrations by city (for city breakdown)
  const regsByCity = await db.prepare(`
    SELECT e.city, e.state,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as total_teams,
      COUNT(CASE WHEN r.status = 'approved' AND r.payment_status = 'paid' THEN 1 END) as paid_teams,
      COUNT(CASE WHEN r.status = 'approved' AND r.payment_status != 'paid' THEN 1 END) as unpaid_teams
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.city, e.state
    ORDER BY total_teams DESC
  `).bind(...params).all();

  // Available seasons and years for filters
  const seasons = await db.prepare(`
    SELECT DISTINCT season FROM events WHERE season IS NOT NULL ORDER BY season DESC
  `).all();

  const years = await db.prepare(`
    SELECT DISTINCT substr(start_date, 1, 4) as year FROM events ORDER BY year DESC
  `).all();

  return c.json({
    success: true,
    data: {
      revenueByEvent: revenueByEvent.results,
      expensesByEvent,
      rebatesByEvent,
      revenueByCity: revenueByCity.results,
      revenueByMonth: revenueByMonth.results,
      regsByCity: regsByCity.results,
      filters: {
        seasons: seasons.results.map((s: any) => s.season),
        years: years.results.map((y: any) => y.year),
      },
    },
  });
});

// ==========================================
// REPORTS: Single event P&L
// ==========================================
financialRoutes.get('/event-pnl/:eventId', async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');

  // Event info
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Revenue from registrations
  const revenue = await db.prepare(`
    SELECT
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COUNT(CASE WHEN r.status = 'approved' AND r.payment_status = 'paid' THEN 1 END) as paid_teams,
      COUNT(CASE WHEN r.status = 'approved' AND r.payment_status != 'paid' THEN 1 END) as unpaid_teams,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as total_revenue_cents,
      COALESCE(SUM(CASE WHEN r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as expected_revenue_cents
    FROM registrations r
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE r.event_id = ?
  `).bind(eventId).first();

  // Revenue by division
  const revenueByDivision = await db.prepare(`
    SELECT ed.age_group, ed.division_level, ed.price_cents as division_price,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as revenue_cents
    FROM event_divisions ed
    LEFT JOIN registrations r ON r.event_division_id = ed.id
    WHERE ed.event_id = ?
    GROUP BY ed.id
    ORDER BY ed.age_group ASC
  `).bind(eventId).all();

  // Expenses
  let expenses: any[] = [];
  try {
    expenses = (await db.prepare(`
      SELECT * FROM event_expenses WHERE event_id = ? ORDER BY category ASC, amount_cents DESC
    `).bind(eventId).all()).results;
  } catch (e) {}

  // Expense totals by category
  let expenseTotals: any[] = [];
  try {
    expenseTotals = (await db.prepare(`
      SELECT category, SUM(amount_cents) as total_cents, COUNT(*) as line_items
      FROM event_expenses WHERE event_id = ?
      GROUP BY category ORDER BY total_cents DESC
    `).bind(eventId).all()).results;
  } catch (e) {}

  // Hotel rebates
  let rebates: any[] = [];
  try {
    rebates = (await db.prepare(`
      SELECT * FROM hotel_rebates WHERE event_id = ? ORDER BY total_rebate_cents DESC
    `).bind(eventId).all()).results;
  } catch (e) {}

  const totalExpenses = expenseTotals.reduce((sum: number, e: any) => sum + e.total_cents, 0);
  const totalRebates = rebates.reduce((sum: number, r: any) => sum + r.total_rebate_cents, 0);
  const totalRevenue = (revenue as any)?.total_revenue_cents || 0;

  return c.json({
    success: true,
    data: {
      event,
      revenue,
      revenueByDivision: revenueByDivision.results,
      expenses,
      expenseTotals,
      rebates,
      summary: {
        total_revenue_cents: totalRevenue,
        total_expenses_cents: totalExpenses,
        total_rebates_cents: totalRebates,
        net_income_cents: totalRevenue + totalRebates - totalExpenses,
      },
    },
  });
});

// ==========================================
// REPORTS: Year-over-year comparison
// ==========================================
financialRoutes.get('/yoy', async (c) => {
  const db = c.env.DB;

  const data = await db.prepare(`
    SELECT substr(e.start_date, 1, 4) as year,
      COUNT(DISTINCT e.id) as event_count,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as revenue_cents,
      COUNT(DISTINCT e.city || ',' || e.state) as city_count
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    GROUP BY substr(e.start_date, 1, 4)
    ORDER BY year DESC
  `).all();

  // Expenses by year
  let expensesByYear: any[] = [];
  try {
    expensesByYear = (await db.prepare(`
      SELECT substr(e.start_date, 1, 4) as year,
        SUM(ee.amount_cents) as total_expenses_cents
      FROM event_expenses ee
      JOIN events e ON e.id = ee.event_id
      GROUP BY substr(e.start_date, 1, 4)
      ORDER BY year DESC
    `).all()).results;
  } catch (e) {}

  // Rebates by year
  let rebatesByYear: any[] = [];
  try {
    rebatesByYear = (await db.prepare(`
      SELECT substr(e.start_date, 1, 4) as year,
        SUM(hr.total_rebate_cents) as total_rebates_cents
      FROM hotel_rebates hr
      JOIN events e ON e.id = hr.event_id
      GROUP BY substr(e.start_date, 1, 4)
      ORDER BY year DESC
    `).all()).results;
  } catch (e) {}

  return c.json({
    success: true,
    data: {
      yearly: data.results,
      expensesByYear,
      rebatesByYear,
    },
  });
});

// ==========================================
// REPORTS: City breakdown
// ==========================================
financialRoutes.get('/by-city', async (c) => {
  const db = c.env.DB;
  const { year } = c.req.query();

  let dateFilter = '';
  const params: string[] = [];
  if (year) {
    dateFilter = `AND e.start_date >= ? AND e.start_date < ?`;
    params.push(`${year}-01-01`, `${parseInt(year) + 1}-01-01`);
  }

  const data = await db.prepare(`
    SELECT e.city, e.state,
      COUNT(DISTINCT e.id) as event_count,
      COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.status = 'approved' THEN COALESCE(r.amount_cents, ed.price_cents) ELSE 0 END), 0) as revenue_cents
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
    LEFT JOIN event_divisions ed ON ed.id = r.event_division_id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.city, e.state
    ORDER BY revenue_cents DESC
  `).bind(...params).all();

  // Expenses by city
  let expensesByCity: any[] = [];
  try {
    expensesByCity = (await db.prepare(`
      SELECT e.city, e.state, ee.category,
        SUM(ee.amount_cents) as total_cents
      FROM event_expenses ee
      JOIN events e ON e.id = ee.event_id
      WHERE 1=1 ${dateFilter}
      GROUP BY e.city, e.state, ee.category
      ORDER BY total_cents DESC
    `).bind(...params).all()).results;
  } catch (e) {}

  // Rebates by city
  let rebatesByCity: any[] = [];
  try {
    rebatesByCity = (await db.prepare(`
      SELECT hr.city, hr.state, SUM(hr.total_rebate_cents) as total_rebates_cents,
        SUM(hr.room_nights) as total_room_nights
      FROM hotel_rebates hr
      JOIN events e ON e.id = hr.event_id
      WHERE 1=1 ${dateFilter}
      GROUP BY hr.city, hr.state
      ORDER BY total_rebates_cents DESC
    `).bind(...params).all()).results;
  } catch (e) {}

  return c.json({
    success: true,
    data: {
      cities: data.results,
      expensesByCity,
      rebatesByCity,
    },
  });
});
