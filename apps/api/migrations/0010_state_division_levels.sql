-- State-specific division levels
-- Each state has its own set of division level names
-- e.g., IL → A, AA, AAA; MI → Tier 1, Tier 2, Tier 3
CREATE TABLE IF NOT EXISTS state_division_levels (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  state TEXT NOT NULL,
  level_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(state, level_name)
);

CREATE INDEX IF NOT EXISTS idx_state_div_levels_state ON state_division_levels(state);
