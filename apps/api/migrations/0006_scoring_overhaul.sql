-- =====================================================
-- 0006: Scoring System Overhaul
-- Adds tables for GameSheets-style score sheets:
--   game_lineups, game_three_stars, goalie_game_stats,
--   shootout_rounds, game_period_scores, game_notes
-- =====================================================

-- Active lineup for a game (which rostered players actually dressed)
CREATE TABLE IF NOT EXISTS game_lineups (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  jersey_number TEXT NOT NULL,
  position TEXT DEFAULT 'F',  -- F, D, G
  is_starter INTEGER DEFAULT 0,
  is_scratched INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, team_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_game_lineups_game ON game_lineups(game_id);
CREATE INDEX IF NOT EXISTS idx_game_lineups_team ON game_lineups(game_id, team_id);

-- Three stars of the game
CREATE TABLE IF NOT EXISTS game_three_stars (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  star_number INTEGER NOT NULL CHECK(star_number IN (1, 2, 3)),
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT REFERENCES players(id),
  jersey_number TEXT,
  player_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, star_number)
);

-- Goalie game stats (time on ice, saves, goals against)
CREATE TABLE IF NOT EXISTS goalie_game_stats (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT REFERENCES players(id),
  jersey_number TEXT,
  player_name TEXT,
  toi_minutes INTEGER DEFAULT 0,   -- time on ice in minutes
  shots_against INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  is_starter INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, team_id, player_id)
);

-- Shootout rounds (individual attempts)
CREATE TABLE IF NOT EXISTS shootout_rounds (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT REFERENCES players(id),
  jersey_number TEXT,
  player_name TEXT,
  goalie_jersey TEXT,              -- opposing goalie jersey number
  round_number INTEGER NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('goal', 'save', 'miss')),
  sequence_order INTEGER NOT NULL, -- overall order of attempts
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shootout_game ON shootout_rounds(game_id);

-- Period-by-period scores (for display in score sheet)
CREATE TABLE IF NOT EXISTS game_period_scores (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  period INTEGER NOT NULL,
  goals INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, team_id, period)
);

-- Game notes / scorekeeper notes
CREATE TABLE IF NOT EXISTS game_notes (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  note_type TEXT DEFAULT 'general',  -- general, timeout, injury, official
  content TEXT NOT NULL,
  period INTEGER,
  game_time TEXT,
  created_by TEXT,  -- scorekeeper or admin id
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_notes_game ON game_notes(game_id);

-- Game-level coach assignments (who was on the bench for this game)
CREATE TABLE IF NOT EXISTS game_coaches (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT REFERENCES users(id),
  coach_name TEXT,
  role TEXT DEFAULT 'head',  -- head, assistant, manager
  signature_data TEXT,       -- base64 signature image
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, team_id, user_id)
);

-- Game-level referee assignments for the score sheet
-- (supplements the referee_game_assignments from 0005 with on-sheet data)
CREATE TABLE IF NOT EXISTS game_officials (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  referee_id TEXT REFERENCES referees(id),
  official_name TEXT,
  role TEXT DEFAULT 'referee',  -- referee, linesman, supervisor
  jersey_number TEXT,
  signature_data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_officials_game ON game_officials(game_id);

-- Add scorekeeper info columns to games table
-- (who was keeping score, their phone, their name)
ALTER TABLE games ADD COLUMN scorekeeper_name TEXT;
ALTER TABLE games ADD COLUMN scorekeeper_phone TEXT;

-- Add period lengths to games (can vary by age group)
ALTER TABLE games ADD COLUMN period_length_minutes INTEGER DEFAULT 12;
ALTER TABLE games ADD COLUMN flood_after_period INTEGER DEFAULT 2;
