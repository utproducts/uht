-- City invite submissions from the "Invite UHT to your city" form
CREATE TABLE IF NOT EXISTS city_invites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  role TEXT DEFAULT 'other',
  arenas TEXT,
  message TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_city_invites_city_state ON city_invites(city, state);
CREATE INDEX IF NOT EXISTS idx_city_invites_status ON city_invites(status);
