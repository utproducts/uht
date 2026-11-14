import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';
import { authMiddleware, requireRole, isDataRestricted } from '../middleware/auth';

export const financialRoutes = new Hono<{ Bindings: Env }>();

// ==========================================
// SETUP: Create expense tables if not exist
// ==========================================
financialRoutes.post('/setup-tables', authMiddleware, requireRole('admin'), async (c) => {
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
financialRoutes.get('/expenses/:eventId', authMiddleware, requireRole('admin'), async (c) => {
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
financialRoutes.post('/expenses', authMiddleware, requireRole('admin'), zValidator('json', expenseSchema), async (c) => {
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
financialRoutes.patch('/expenses/:id', authMiddleware, requireRole('admin'), async (c) => {
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
financialRoutes.delete('/expenses/:id', authMiddleware, requireRole('admin'), async (c) => {
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
financialRoutes.get('/rebates/:eventId', authMiddleware, requireRole('admin'), async (c) => {
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
financialRoutes.post('/rebates', authMiddleware, requireRole('admin'), zValidator('json', rebateSchema), async (c) => {
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
financialRoutes.patch('/rebates/:id', authMiddleware, requireRole('admin'), async (c) => {
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
financialRoutes.delete('/rebates/:id', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.prepare('DELETE FROM hotel_rebates WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ==========================================
// REPORTS: Dashboard overview
// ==========================================

  // Expected revenue = money owed but not yet collected: approved teams whose
  // payment is not settled, division price minus discount minus what's paid
  const OWED_SQL = `
    SELECT COALESCE(SUM(MAX(0,
      COALESCE(NULLIF(ed.price_cents, 0), er.payment_amount_cents, 0)
      - COALESCE(er.discount_cents, 0)
      - MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)
    )), 0) as owed_cents,
    COUNT(CASE WHEN MAX(0,
      COALESCE(NULLIF(ed.price_cents, 0), er.payment_amount_cents, 0)
      - COALESCE(er.discount_cents, 0)
      - MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)
    ) > 0 THEN 1 END) as owing_teams
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
    WHERE er.status = 'approved' AND er.payment_status NOT IN ('comp', 'paid')
      AND e.status NOT IN ('cancelled', 'draft')`;

financialRoutes.get('/dashboard', authMiddleware, requireRole('admin'), async (c) => {
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
      (SELECT COUNT(*) FROM event_registrations er2 WHERE er2.event_id = e.id AND er2.status = 'approved') as team_count,
      (SELECT COALESCE(SUM(MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)),0) FROM event_registrations er WHERE er.event_id = e.id AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment')) as revenue_cents
    FROM events e
    WHERE e.status != 'cancelled' ${dateFilter}
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
      SUM((SELECT COUNT(*) FROM event_registrations er2 WHERE er2.event_id = e.id AND er2.status = 'approved')) as team_count,
      SUM((SELECT COALESCE(SUM(MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)),0) FROM event_registrations er WHERE er.event_id = e.id AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment'))) as revenue_cents
    FROM events e
    WHERE e.status != 'cancelled' ${dateFilter}
    GROUP BY e.city, e.state
    ORDER BY revenue_cents DESC
  `).bind(...params).all();

  // Revenue by month (for charts)
  const revenueByMonth = await db.prepare(`
    SELECT substr(er.created_at, 1, 7) as month,
      COUNT(DISTINCT er.event_id) as event_count,
      COUNT(CASE WHEN er.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)), 0) as revenue_cents
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    WHERE er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment') AND e.status != 'cancelled' ${dateFilter}
    GROUP BY substr(er.created_at, 1, 7)
    ORDER BY month ASC
  `).bind(...params).all();

  const outstandingRow = await db.prepare(OWED_SQL + ' ' + dateFilter).bind(...params).first<any>();
  const outstanding = { owed_cents: outstandingRow?.owed_cents || 0, owing_teams: outstandingRow?.owing_teams || 0 };

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
      outstanding: outstanding,
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
financialRoutes.get('/event-pnl/:eventId', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');

  // Event info
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Revenue from registrations
  const revenue = await db.prepare(`
    SELECT
      COUNT(CASE WHEN er.status = 'approved' THEN 1 END) as team_count,
      COUNT(CASE WHEN er.status = 'approved' AND er.payment_status = 'paid' THEN 1 END) as paid_teams,
      COUNT(CASE WHEN er.status = 'approved' AND er.payment_status != 'paid' THEN 1 END) as unpaid_teams,
      COALESCE(SUM(CASE WHEN er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment') THEN MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END) ELSE 0 END), 0) as total_revenue_cents,
      COALESCE(SUM(CASE WHEN er.status = 'approved' THEN COALESCE(ed.price_cents, er.payment_amount_cents, 0) ELSE 0 END), 0) as expected_revenue_cents
    FROM event_registrations er
    LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
    WHERE er.event_id = ?
  `).bind(eventId).first();

  // Revenue by division
  const revenueByDivision = await db.prepare(`
    SELECT ed.age_group, ed.division_level, ed.price_cents as division_price,
      COUNT(CASE WHEN er.status = 'approved' THEN 1 END) as team_count,
      COALESCE(SUM(CASE WHEN er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment') THEN MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END) ELSE 0 END), 0) as revenue_cents
    FROM event_divisions ed
    LEFT JOIN event_registrations er ON er.event_division_id = ed.id
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

// Email the event P&L (logo header, event details, full breakdown)
financialRoutes.post('/event-pnl/:eventId/email', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const eventId = c.req.param('eventId');
  const body = await c.req.json().catch(() => ({})) as any;
  const to = String(body.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return c.json({ success: false, error: 'Valid recipient email required' }, 400);

  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first<any>();
  if (!ev) return c.json({ success: false, error: 'Event not found' }, 404);

  const rev = await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment') THEN MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END) ELSE 0 END), 0) as total
    FROM event_registrations er WHERE er.event_id = ?
  `).bind(eventId).first<any>();
  const expenses = (await db.prepare('SELECT * FROM event_expenses WHERE event_id = ? ORDER BY category, date').bind(eventId).all()).results || [];
  const rebates = (await db.prepare('SELECT * FROM hotel_rebates WHERE event_id = ? ORDER BY hotel_name').bind(eventId).all()).results || [];
  const totalExp = (expenses as any[]).reduce((s2, e) => s2 + (e.amount_cents || 0), 0);
  const totalReb = (rebates as any[]).reduce((s2, r) => s2 + (r.total_rebate_cents || 0), 0);
  const net = (rev?.total || 0) + totalReb - totalExp;
  const fmt = (cents: number) => '$' + ((cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fd = (d: string) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const hotels = (rebates as any[]).filter(r => r.rebate_type !== 'other');
  const vendors = (rebates as any[]).filter(r => r.rebate_type === 'other');
  const line = (l: string, v: string, color = '#1d2b3d') => `<tr><td style="padding:5px 0;border-bottom:1px solid #f0f0f3;font-size:13px;color:#2a3c52;">${l}</td><td style="padding:5px 0;border-bottom:1px solid #f0f0f3;font-size:13px;font-weight:bold;color:${color};text-align:right;">${v}</td></tr>`;
  const section = (t: string) => `<tr><td colspan="2" style="padding:18px 0 6px;font-size:12px;font-weight:800;letter-spacing:2px;color:#003e79;border-bottom:2px solid #00ccff;">${t.toUpperCase()}</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f2f4f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:24px 14px;">
    <div style="background:#ffffff;border:2px solid #003e79;border-radius:18px;overflow:hidden;padding:26px;">
      <table role="presentation" width="100%" style="border-collapse:collapse;"><tr>
        ${ev.logo_url ? `<td width="76"><img src="${ev.logo_url}" width="68" style="display:block;" /></td>` : ''}
        <td style="padding-left:12px;">
          <div style="font-size:10px;letter-spacing:2.5px;color:#b8860b;font-weight:bold;">EVENT PROFIT &amp; LOSS</div>
          <div style="font-size:21px;font-weight:900;color:#003e79;">${ev.name}</div>
          <div style="font-size:12.5px;color:#5b6b80;">${fd(ev.start_date)}${ev.end_date && ev.end_date !== ev.start_date ? ' - ' + fd(ev.end_date) : ''} &middot; ${ev.city}, ${ev.state}</div>
        </td>
        <td width="50" align="right"><img src="https://ultimatetournaments.com/uht-logo.png" width="44" style="display:block;" /></td>
      </tr></table>
      <table role="presentation" width="100%" style="border-collapse:collapse;margin-top:14px;">
        ${section('Summary')}
        ${line('Registration revenue', fmt(rev?.total || 0), '#15803d')}
        ${line('Rebates', fmt(totalReb), '#2563eb')}
        ${line('Expenses', fmt(totalExp), '#dc2626')}
        ${line('<b>Net ' + (net >= 0 ? 'profit' : 'loss') + '</b>', fmt(net), net >= 0 ? '#15803d' : '#dc2626')}
        ${expenses.length ? section('Expenses') + (expenses as any[]).map(e2 => line(`${e2.description}${e2.vendor ? ' &middot; ' + e2.vendor : ''}${e2.date ? ' &middot; ' + e2.date : ''}`, fmt(e2.amount_cents), '#dc2626')).join('') : ''}
        ${hotels.length ? section('Hotel Rebates') + hotels.map(r2 => line(`${r2.hotel_name}${r2.room_nights ? ' &middot; ' + r2.room_nights + ' blocks' : ''}`, fmt(r2.total_rebate_cents), '#2563eb')).join('') : ''}
        ${vendors.length ? section('Other Vendor Rebates') + vendors.map(r2 => line(`${r2.hotel_name}${r2.notes ? ' &middot; ' + r2.notes : ''}`, fmt(r2.total_rebate_cents), '#2563eb')).join('') : ''}
      </table>
      <p style="font-size:10px;color:#8295ab;text-align:center;margin:18px 0 0;">Ultimate Hockey Tournaments &middot; generated ${new Date().toLocaleDateString('en-US')}</p>
    </div>
  </div></body></html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.env.RESEND_API}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Ultimate Hockey Tournaments <info@ultimatetournaments.com>',
      to: [to], subject: `P&L - ${ev.name}`, html,
    }),
  });
  return c.json({ success: r.ok, ...(r.ok ? {} : { error: 'Email send failed' }) });
});

// ==========================================
// REPORTS: Year-over-year comparison
// ==========================================
financialRoutes.get('/yoy', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;

  const data = await db.prepare(`
    SELECT substr(e.start_date, 1, 4) as year,
      COUNT(DISTINCT e.id) as event_count,
      SUM((SELECT COUNT(*) FROM event_registrations er2 WHERE er2.event_id = e.id AND er2.status = 'approved')) as team_count,
      SUM((SELECT COALESCE(SUM(MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)),0) FROM event_registrations er WHERE er.event_id = e.id AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment'))) as revenue_cents,
      COUNT(DISTINCT e.city || ',' || e.state) as city_count
    FROM events e
    WHERE e.status != 'cancelled'
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
financialRoutes.get('/by-city', authMiddleware, requireRole('admin'), async (c) => {
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
      SUM((SELECT COUNT(*) FROM event_registrations er2 WHERE er2.event_id = e.id AND er2.status = 'approved')) as team_count,
      SUM((SELECT COALESCE(SUM(MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)),0) FROM event_registrations er WHERE er.event_id = e.id AND er.status NOT IN ('withdrawn','denied','rejected','awaiting_payment'))) as revenue_cents
    FROM events e
    WHERE e.status != 'cancelled' ${dateFilter}
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

// Lightweight expected-revenue figure for the admin overview dashboard
financialRoutes.get('/outstanding', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const row = await c.env.DB.prepare(OWED_SQL).first<any>();
  return c.json({ success: true, data: { owed_cents: row?.owed_cents || 0, owing_teams: row?.owing_teams || 0 } });
});

// The teams behind that number: who owes, how much, for which event — same
// formula as OWED_SQL, one row per registration still carrying a balance
financialRoutes.get('/outstanding/detail', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const restricted = await isDataRestricted(c);
  const OWED_EXPR = `MAX(0,
    COALESCE(NULLIF(ed.price_cents, 0), er.payment_amount_cents, 0)
    - COALESCE(er.discount_cents, 0)
    - MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END)
  )`;
  const rows = await c.env.DB.prepare(`
    SELECT er.id, er.team_name, e.id as event_id, e.name as event_name, e.start_date,
      ed.age_group, ed.division_level, er.payment_status,
      COALESCE(NULLIF(ed.price_cents, 0), er.payment_amount_cents, 0) as price_cents,
      COALESCE(er.discount_cents, 0) as discount_cents,
      MAX(COALESCE(er.amount_paid_cents,0), COALESCE(er.card_paid_cents,0), CASE WHEN er.payment_status IN ('paid','partial') THEN COALESCE(er.payment_amount_cents,0) ELSE 0 END) as paid_cents,
      ${OWED_EXPR} as owed_cents,
      LOWER(COALESCE(NULLIF(er.email1, ''), er.coach_email)) as email, er.phone
    FROM event_registrations er
    JOIN events e ON e.id = er.event_id
    LEFT JOIN event_divisions ed ON ed.id = er.event_division_id
    WHERE er.status = 'approved' AND er.payment_status NOT IN ('comp', 'paid')
      AND e.status NOT IN ('cancelled', 'draft')
      AND ${OWED_EXPR} > 0
    ORDER BY e.start_date ASC, er.team_name ASC
  `).all<any>();
  const data = (rows.results || []).map((r: any) => restricted ? { ...r, email: null, phone: null } : r);
  return c.json({ success: true, data });
});

// Payment-method breakdown for the admin overview: Stripe card money from
// both registration tables + the manual payments ledger grouped by method
financialRoutes.get('/payment-methods', authMiddleware, requireRole('admin', 'director'), async (c) => {
  const db = c.env.DB;
  const [manual, card] = await Promise.all([
    db.prepare(`
      SELECT LOWER(COALESCE(method, 'other')) AS method, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total_cents
      FROM registration_payments GROUP BY LOWER(COALESCE(method, 'other'))
    `).all<any>(),
    db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(card_paid_cents), 0) FROM event_registrations WHERE status NOT IN ('denied','rejected','withdrawn')) +
        (SELECT COALESCE(SUM(card_paid_cents), 0) FROM registrations WHERE status NOT IN ('rejected','withdrawn')) AS total_cents,
        (SELECT COUNT(*) FROM event_registrations WHERE COALESCE(card_paid_cents, 0) > 0) +
        (SELECT COUNT(*) FROM registrations WHERE COALESCE(card_paid_cents, 0) > 0) AS n
    `).first<any>(),
  ]);
  const methods = [
    { method: 'card', label: 'Credit Card (Stripe)', n: card?.n || 0, total_cents: card?.total_cents || 0 },
    ...(manual.results || []).map((r: any) => ({
      method: r.method,
      label: r.method === 'check' ? 'Check' : r.method.charAt(0).toUpperCase() + r.method.slice(1),
      n: r.n, total_cents: r.total_cents,
    })),
  ].sort((a, b) => b.total_cents - a.total_cents);
  return c.json({ success: true, data: methods });
});
