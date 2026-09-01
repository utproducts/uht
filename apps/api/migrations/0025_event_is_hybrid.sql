-- Hybrid events: flag set by admins to mark events run in hybrid format
ALTER TABLE events ADD COLUMN is_hybrid INTEGER DEFAULT 0;
