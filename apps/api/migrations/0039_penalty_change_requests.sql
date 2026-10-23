-- Coach-requested penalty corrections: staff must approve before they apply
CREATE TABLE IF NOT EXISTS penalty_change_requests (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  game_event_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  team_id TEXT,
  change_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  requested_by TEXT,
  requested_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pcr_event_status ON penalty_change_requests(event_id, status);
