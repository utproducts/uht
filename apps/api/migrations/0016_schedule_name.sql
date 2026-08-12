-- Schedule Name: what schedules, scoreboards, and standings display for a team.
-- Defaults to NULL (falls back to teams.name). Stats/games still key on team id,
-- so org rollups and the registered team are unaffected by renames.
ALTER TABLE teams ADD COLUMN schedule_name TEXT;

-- Coach contact fields on form-based registrations (legacy rows have no team link)
ALTER TABLE event_registrations ADD COLUMN coach_name TEXT;
ALTER TABLE event_registrations ADD COLUMN coach_email TEXT;
ALTER TABLE event_registrations ADD COLUMN coach_phone TEXT;
