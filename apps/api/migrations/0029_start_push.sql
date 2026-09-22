-- Game-start push idempotency
ALTER TABLE games ADD COLUMN start_push_sent INTEGER DEFAULT 0;
