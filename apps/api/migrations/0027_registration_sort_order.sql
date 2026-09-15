-- Admin-controlled display order for participants lists (drag to reorder)
ALTER TABLE event_registrations ADD COLUMN sort_order INTEGER;
ALTER TABLE registrations ADD COLUMN sort_order INTEGER;
