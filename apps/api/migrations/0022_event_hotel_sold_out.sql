-- Per-event hotel sell-out flag: sold-out hotels can't be picked as a
-- preference during registration (admins can still assign them manually)
ALTER TABLE event_hotels ADD COLUMN sold_out INTEGER DEFAULT 0;
