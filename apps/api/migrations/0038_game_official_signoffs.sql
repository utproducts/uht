-- Multiple referees can sign off on a game (legacy single columns on games kept as a joined display string)
CREATE TABLE IF NOT EXISTS game_official_signoffs (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  usa_hockey_number TEXT,
  signed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gos_game_name ON game_official_signoffs(game_id, name);
