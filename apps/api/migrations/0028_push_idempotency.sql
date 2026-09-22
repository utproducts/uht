-- Automatic game pushes: idempotency flags so finals and delay edits
-- never double-push
ALTER TABLE games ADD COLUMN final_push_sent INTEGER DEFAULT 0;
ALTER TABLE games ADD COLUMN delay_push_sig TEXT;
