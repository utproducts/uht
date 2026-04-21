-- Add hotel preference columns to event_registrations
-- Teams pick their top 3 hotels in priority order during registration
ALTER TABLE event_registrations ADD COLUMN hotel_choice_1 TEXT;
ALTER TABLE event_registrations ADD COLUMN hotel_choice_2 TEXT;
ALTER TABLE event_registrations ADD COLUMN hotel_choice_3 TEXT;
