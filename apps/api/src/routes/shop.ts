import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Env } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

export const shopRoutes = new Hono<{ Bindings: Env }>();

// ==================
// Table initialization
// ==================
async function initShopTables(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS shop_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 34.99,
      category TEXT NOT NULL,
      image_url TEXT,
      image_urls TEXT,
      event_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS shop_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subtotal REAL NOT NULL,
      shipping REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      shipping_name TEXT,
      shipping_address TEXT,
      shipping_city TEXT,
      shipping_state TEXT,
      shipping_zip TEXT,
      stripe_payment_intent_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS shop_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES shop_orders(id),
      FOREIGN KEY (product_id) REFERENCES shop_products(id)
    )
  `).run();
}

// Middleware: ensure tables exist before any route
shopRoutes.use('*', async (c, next) => {
  await initShopTables(c.env.DB);
  await next();
});

// ==================
// PUBLIC: List active products
// ==================
shopRoutes.get('/products', async (c) => {
  const db = c.env.DB;
  const category = c.req.query('category');
  const eventId = c.req.query('eventId');

  let sql = `
    SELECT p.*, e.name as event_name
    FROM shop_products p
    LEFT JOIN events e ON e.id = p.event_id
    WHERE p.active = 1
  `;
  const params: string[] = [];

  if (category) {
    sql += ' AND p.category = ?';
    params.push(category);
  }
  if (eventId) {
    sql += ' AND p.event_id = ?';
    params.push(eventId);
  }

  sql += ' ORDER BY p.sort_order ASC, p.created_at DESC';

  const stmt = db.prepare(sql);
  const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

  return c.json({ success: true, data: result.results });
});

// ==================
// PUBLIC: Get single product
// ==================
shopRoutes.get('/products/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const product = await db.prepare(`
    SELECT p.*, e.name as event_name
    FROM shop_products p
    LEFT JOIN events e ON e.id = p.event_id
    WHERE p.id = ? AND p.active = 1
  `).bind(id).first();

  if (!product) {
    return c.json({ success: false, error: 'Product not found' }, 404);
  }

  return c.json({ success: true, data: product });
});

// ==================
// ADMIN: Create product
// ==================
const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  price: z.number().positive().default(34.99),
  category: z.enum(['beanies', 'hats', 'blankets', 'pins']),
  image_url: z.string().nullish(),
  image_urls: z.array(z.string()).optional(),
  event_id: z.string().nullish(),
  active: z.number().min(0).max(1).default(1),
  sort_order: z.number().int().default(0),
});

shopRoutes.post('/products', authMiddleware, requireRole('admin'), zValidator('json', createProductSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const id = crypto.randomUUID().replace(/-/g, '');

  await db.prepare(`
    INSERT INTO shop_products (id, name, description, price, category, image_url, image_urls, event_id, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.name,
    data.description || null,
    data.price,
    data.category,
    data.image_url || null,
    data.image_urls ? JSON.stringify(data.image_urls) : null,
    data.event_id || null,
    data.active,
    data.sort_order,
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// ==================
// ADMIN: Update product
// ==================
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  price: z.number().positive().optional(),
  category: z.enum(['beanies', 'hats', 'blankets', 'pins']).optional(),
  image_url: z.string().nullish(),
  image_urls: z.array(z.string()).optional(),
  event_id: z.string().nullish(),
  active: z.number().min(0).max(1).optional(),
  sort_order: z.number().int().optional(),
});

shopRoutes.put('/products/:id', authMiddleware, requireRole('admin'), zValidator('json', updateProductSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  // Check product exists
  const existing = await db.prepare('SELECT id FROM shop_products WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Product not found' }, 404);
  }

  // Build dynamic update
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.price !== undefined) { fields.push('price = ?'); values.push(data.price); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.image_url !== undefined) { fields.push('image_url = ?'); values.push(data.image_url); }
  if (data.image_urls !== undefined) { fields.push('image_urls = ?'); values.push(JSON.stringify(data.image_urls)); }
  if (data.event_id !== undefined) { fields.push('event_id = ?'); values.push(data.event_id); }
  if (data.active !== undefined) { fields.push('active = ?'); values.push(data.active); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order); }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  values.push(id);
  await db.prepare(`UPDATE shop_products SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json({ success: true, data: { id } });
});

// ==================
// ADMIN: Soft delete product
// ==================
shopRoutes.delete('/products/:id', authMiddleware, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM shop_products WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Product not found' }, 404);
  }

  await db.prepare('UPDATE shop_products SET active = 0 WHERE id = ?').bind(id).run();

  return c.json({ success: true, message: 'Product deactivated' });
});

// ==================
// AUTH: Create order with Stripe PaymentIntent
// ==================
const createOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
  shipping: z.object({
    name: z.string().min(1),
    address: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
  }),
});

shopRoutes.post('/orders', authMiddleware, zValidator('json', createOrderSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.env.DB;
  const user = c.get('user') as { id: string };
  const orderId = crypto.randomUUID().replace(/-/g, '');

  // Look up product prices and validate availability
  const productIds = data.items.map(i => i.productId);
  const placeholders = productIds.map(() => '?').join(', ');
  const products = await db.prepare(
    `SELECT id, price, name FROM shop_products WHERE id IN (${placeholders}) AND active = 1`
  ).bind(...productIds).all();

  const productMap = new Map<string, { price: number; name: string }>();
  for (const p of products.results as any[]) {
    productMap.set(p.id, { price: p.price, name: p.name });
  }

  // Verify all products exist
  for (const item of data.items) {
    if (!productMap.has(item.productId)) {
      return c.json({ success: false, error: `Product ${item.productId} not found or inactive` }, 400);
    }
  }

  // Calculate totals
  let subtotal = 0;
  for (const item of data.items) {
    const product = productMap.get(item.productId)!;
    subtotal += product.price * item.quantity;
  }
  const shipping = 0; // Free shipping for now
  const total = subtotal + shipping;
  const totalCents = total * 100;

  // Create Stripe PaymentIntent
  const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount: String(Math.round(totalCents)),
      currency: 'usd',
      'metadata[orderId]': orderId,
      'metadata[type]': 'shop',
    }).toString(),
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.text();
    console.error('Stripe PaymentIntent error:', err);
    return c.json({ success: false, error: 'Payment processing failed' }, 500);
  }

  const paymentIntent = await stripeRes.json() as { id: string; client_secret: string };

  // Insert order
  await db.prepare(`
    INSERT INTO shop_orders (id, user_id, status, subtotal, shipping, total, shipping_name, shipping_address, shipping_city, shipping_state, shipping_zip, stripe_payment_intent_id)
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId,
    user.id,
    subtotal,
    shipping,
    total,
    data.shipping.name,
    data.shipping.address,
    data.shipping.city,
    data.shipping.state,
    data.shipping.zip,
    paymentIntent.id,
  ).run();

  // Insert order items
  for (const item of data.items) {
    const product = productMap.get(item.productId)!;
    const itemId = crypto.randomUUID().replace(/-/g, '');
    await db.prepare(`
      INSERT INTO shop_order_items (id, order_id, product_id, quantity, price)
      VALUES (?, ?, ?, ?, ?)
    `).bind(itemId, orderId, item.productId, item.quantity, product.price).run();
  }

  return c.json({
    success: true,
    data: {
      orderId,
      clientSecret: paymentIntent.client_secret,
      total,
    },
  }, 201);
});

// ==================
// AUTH: List user's orders
// ==================
shopRoutes.get('/orders/mine', authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get('user') as { id: string };

  const orders = await db.prepare(`
    SELECT * FROM shop_orders WHERE user_id = ? ORDER BY created_at DESC
  `).bind(user.id).all();

  // Fetch items for each order
  const result = [];
  for (const order of orders.results as any[]) {
    const items = await db.prepare(`
      SELECT oi.*, p.name as product_name, p.image_url as product_image, p.category
      FROM shop_order_items oi
      JOIN shop_products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).bind(order.id).all();
    result.push({ ...order, items: items.results });
  }

  return c.json({ success: true, data: result });
});

// ==================
// AUTH: Get single order detail
// ==================
shopRoutes.get('/orders/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const user = c.get('user') as { id: string; roles?: string[] };

  const order = await db.prepare('SELECT * FROM shop_orders WHERE id = ?').bind(id).first() as any;

  if (!order) {
    return c.json({ success: false, error: 'Order not found' }, 404);
  }

  // Users can only view their own orders; admins can view any
  const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
  if (order.user_id !== user.id && !isAdmin) {
    return c.json({ success: false, error: 'Order not found' }, 404);
  }

  const items = await db.prepare(`
    SELECT oi.*, p.name as product_name, p.image_url as product_image, p.category
    FROM shop_order_items oi
    JOIN shop_products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).bind(id).all();

  return c.json({ success: true, data: { ...order, items: items.results } });
});

// ==================
// ADMIN: List all orders
// ==================
shopRoutes.get('/orders', authMiddleware, requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const status = c.req.query('status');

  let sql = `
    SELECT o.*, u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name
    FROM shop_orders o
    LEFT JOIN users u ON u.id = o.user_id
  `;
  const params: string[] = [];

  if (status) {
    sql += ' WHERE o.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY o.created_at DESC';

  const stmt = db.prepare(sql);
  const orders = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

  // Fetch items for each order
  const result = [];
  for (const order of orders.results as any[]) {
    const items = await db.prepare(`
      SELECT oi.*, p.name as product_name, p.image_url as product_image, p.category
      FROM shop_order_items oi
      JOIN shop_products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).bind(order.id).all();
    result.push({ ...order, items: items.results });
  }

  return c.json({ success: true, data: result });
});

// ==================
// ADMIN: Update order status
// ==================
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']),
  notes: z.string().optional(),
});

shopRoutes.put('/orders/:id/status', authMiddleware, requireRole('admin'), zValidator('json', updateStatusSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const db = c.env.DB;

  const existing = await db.prepare('SELECT id FROM shop_orders WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Order not found' }, 404);
  }

  let sql = `UPDATE shop_orders SET status = ?, updated_at = datetime('now')`;
  const params: (string)[] = [data.status];

  if (data.notes !== undefined) {
    sql += ', notes = ?';
    params.push(data.notes);
  }

  sql += ' WHERE id = ?';
  params.push(id);

  await db.prepare(sql).bind(...params).run();

  return c.json({ success: true, data: { id, status: data.status } });
});
