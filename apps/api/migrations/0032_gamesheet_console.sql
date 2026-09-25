-- GameSheet-style console: per-player game status, starting goalie,
-- coach roster sign-off, officials post-game sign-off, scoresheet push flag
ALTER TABLE game_lineups ADD COLUMN status TEXT DEFAULT 'playing';
ALTER TABLE game_lineups ADD COLUMN is_starting_goalie INTEGER DEFAULT 0;
ALTER TABLE game_coaches ADD COLUMN signed_off_at TEXT;
ALTER TABLE games ADD COLUMN officials_signed_by TEXT;
ALTER TABLE games ADD COLUMN officials_signed_at TEXT;
ALTER TABLE games ADD COLUMN scoresheet_push_sent INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN officials_signed_number TEXT;
