-- Idempotency log for cron-driven automated emails (30-day event info, etc.)
-- One row per template + registration + recipient; the sweep skips rows that exist.
CREATE TABLE IF NOT EXISTS automated_email_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  template_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  email TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now')),
  UNIQUE(template_id, registration_id, email)
);
CREATE INDEX IF NOT EXISTS idx_auto_email_log_event ON automated_email_log(template_id, event_id);
