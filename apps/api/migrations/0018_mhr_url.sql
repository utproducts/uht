-- MyHockeyRankings link per team (USA Hockey roster URL column already exists).
-- Stored on the TEAM so every registration — past and future — shows the links
-- the moment the team submits them.
ALTER TABLE teams ADD COLUMN mhr_url TEXT;
