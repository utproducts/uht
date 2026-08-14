-- Super Saver: the $400 credit can be restricted to events starting on/after
-- a date (e.g. register in 2026, credit applies to events starting Jan 1 2027+)
ALTER TABLE super_saver_promos ADD COLUMN min_event_start TEXT;
