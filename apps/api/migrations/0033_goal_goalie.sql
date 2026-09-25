-- Which goalie each goal was scored on ('EN' = empty net) - needed for stats
ALTER TABLE game_events ADD COLUMN goalie_jersey TEXT;
