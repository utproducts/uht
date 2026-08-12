-- Admin-recorded payments (Venmo, check, cash, ...) against a registration.
-- These are back-office records only — never offered during registration.
-- Payment status on the registration recomputes automatically from
-- stripe charge + these records vs the expected price.
CREATE TABLE IF NOT EXISTS registration_payments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  registration_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  note TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reg_payments_reg ON registration_payments(registration_id);
