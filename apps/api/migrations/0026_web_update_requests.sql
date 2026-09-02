-- Web Updates queue: Johnny/Cory file site change requests here; Claude
-- processes them and reports back. Statuses: new → in_progress → done,
-- or needs_info (question back to requester) / declined.
CREATE TABLE IF NOT EXISTS web_update_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  page_url TEXT,
  screenshot_url TEXT,
  status TEXT DEFAULT 'new' CHECK(status IN ('new','in_progress','done','needs_info','declined')),
  requested_by_id TEXT,
  requested_by_name TEXT,
  requested_by_email TEXT,
  result_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
