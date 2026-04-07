-- ============================================================
-- Director Features: Locker Rooms, Game Delays, Check-in
-- ============================================================

-- Locker rooms belong to a rink
CREATE TABLE IF NOT EXISTS locker_rooms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  rink_id TEXT NOT NULL REFERENCES venue_rinks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- 'Home 1', 'Away 2', 'Locker A', etc.
  sort_order INTEGER DEFAULT 0,
  UNIQUE(rink_id, name)
);

CREATE INDEX IF NOT EXISTS idx_locker_rooms_rink ON locker_rooms(rink_id);

-- Assign locker rooms to teams in a game
CREATE TABLE IF NOT EXISTS game_locker_rooms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  locker_room_id TEXT NOT NULL REFERENCES locker_rooms(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_game_locker_rooms_game ON game_locker_rooms(game_id);

-- Add delay and check-in fields to games
-- delay_minutes: how many minutes this game is delayed (0 = on time)
-- delay_note: optional reason for delay (e.g., 'ice resurfacing', 'previous game overtime')
-- checked_in_at: when the director confirmed they're at the rink for this game
-- checked_in_by: which director checked in
ALTER TABLE games ADD COLUMN delay_minutes INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN delay_note TEXT;
ALTER TABLE games ADD COLUMN checked_in_at TEXT;
ALTER TABLE games ADD COLUMN checked_in_by TEXT REFERENCES users(id);

-- Game status log for audit trail
CREATE TABLE IF NOT EXISTS game_status_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  delay_minutes INTEGER,
  note TEXT,
  changed_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_status_log_game ON game_status_log(game_id);

-- Add 'delayed' to the games status check constraint
-- SQLite doesn't support ALTER CHECK, so we handle this in application code
-- The status field will now accept: scheduled, delayed, warmup, in_progress, intermission, final, cancelled, forfeit
