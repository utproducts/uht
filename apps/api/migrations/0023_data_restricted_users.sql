-- Restricted-staff flag: registration access with contact info redacted and
-- bulk/export surfaces blocked (server-enforced in middleware/auth.ts)
ALTER TABLE users ADD COLUMN data_restricted INTEGER DEFAULT 0;
