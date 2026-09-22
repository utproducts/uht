-- Event-day check-in: desk check-in per registration + per-player game-day
-- status (playing / absent / suspended) scoped to the event
ALTER TABLE event_registrations ADD COLUMN checked_in_at TEXT;
ALTER TABLE event_registrations ADD COLUMN checked_in_by TEXT;
CREATE TABLE IF NOT EXISTS event_player_status (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('playing','absent','suspended')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(event_id, player_id)
);
