-- Allow directors to be assigned to specific rinks within an event
-- A director with rink_id = NULL covers all rinks at the event
-- A director can have multiple rows (one per rink they cover)
ALTER TABLE event_directors ADD COLUMN rink_id TEXT REFERENCES venue_rinks(id);
