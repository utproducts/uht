-- Pause switch for automated email templates (1/NULL = on, 0 = paused)
ALTER TABLE email_template_overrides ADD COLUMN enabled INTEGER DEFAULT 1;
