-- Cached MyHockeyRankings rating per team, pulled from their MHR page on
-- admin-triggered refresh.
ALTER TABLE teams ADD COLUMN mhr_rating REAL;
ALTER TABLE teams ADD COLUMN mhr_rating_updated_at TEXT;
