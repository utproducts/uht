-- Bracket/unmatched-team display labels ("1st Place Blue", raw CSV team name)
-- shown wherever a game has no linked team yet
ALTER TABLE games ADD COLUMN home_placeholder TEXT;
ALTER TABLE games ADD COLUMN away_placeholder TEXT;
