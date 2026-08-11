-- Super Saver promo windows + applied credits.
-- A promo is activated automatically when a Super Saver email campaign is sent.
-- Credits are applied at payment time when a team has registered for 2+ events
-- during the window (one featured, with hotel) — one credit per team per promo.
CREATE TABLE IF NOT EXISTS super_saver_promos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT,
  discount_cents INTEGER NOT NULL DEFAULT 40000,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  event_ids TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS super_saver_credits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  promo_id TEXT NOT NULL REFERENCES super_saver_promos(id),
  team_key TEXT NOT NULL,
  qualifying_reg_id TEXT,
  applied_reg_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  confirmed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(promo_id, team_key)
);

CREATE INDEX IF NOT EXISTS idx_ss_credits_applied ON super_saver_credits(applied_reg_id);
