-- Scoresheets are staff-only; coaches/managers share via this per-game token
ALTER TABLE games ADD COLUMN share_token TEXT;
