-- Referee pay rates by age group (per game, in cents)
CREATE TABLE IF NOT EXISTS referee_rates (
  id TEXT PRIMARY KEY,
  age_group TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'referee',  -- 'referee' or 'linesman'
  rate_cents INTEGER NOT NULL,
  season TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(age_group, role, season)
);

-- Referees and referee assigners
CREATE TABLE IF NOT EXISTS referees (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'individual',  -- 'individual' or 'assigner'
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  city_id TEXT REFERENCES cities(id),
  -- Stripe Connect
  stripe_account_id TEXT,
  stripe_onboarding_complete INTEGER DEFAULT 0,
  -- 1099 info (stored in Stripe, we just track status)
  tax_info_collected INTEGER DEFAULT 0,
  -- Status
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  invite_token TEXT,
  invite_sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Referee game assignments (individual refs only)
CREATE TABLE IF NOT EXISTS referee_game_assignments (
  id TEXT PRIMARY KEY,
  referee_id TEXT NOT NULL REFERENCES referees(id),
  game_id TEXT NOT NULL REFERENCES games(id),
  role TEXT NOT NULL DEFAULT 'referee',  -- 'referee' or 'linesman'
  rate_cents INTEGER,  -- snapshot of rate at time of assignment
  status TEXT DEFAULT 'assigned',  -- 'assigned', 'completed', 'no_show', 'cancelled'
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(referee_id, game_id)
);

-- Referee assigner event contracts (assigners only)
CREATE TABLE IF NOT EXISTS referee_assigner_contracts (
  id TEXT PRIMARY KEY,
  referee_id TEXT NOT NULL REFERENCES referees(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  flat_fee_cents INTEGER NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending',  -- 'pending', 'paid', 'cancelled'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(referee_id, event_id)
);

-- Payment records (for both types)
CREATE TABLE IF NOT EXISTS referee_payments (
  id TEXT PRIMARY KEY,
  referee_id TEXT NOT NULL REFERENCES referees(id),
  event_id TEXT REFERENCES events(id),
  amount_cents INTEGER NOT NULL,
  payment_type TEXT NOT NULL,  -- 'game_pay', 'assigner_contract', 'adjustment', 'bonus'
  stripe_transfer_id TEXT,
  status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
  description TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
