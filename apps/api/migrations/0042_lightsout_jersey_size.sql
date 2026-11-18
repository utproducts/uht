-- Swag sizes + balance payments for Lights Out.
-- jersey_size / tee_size: filled by parents via /lights-out/size?id=<regId>
-- (linked from the acceptance email) or at registration.
-- balance_session_id: Stripe checkout session for paying off a deposit.
-- Applied to the remote uht-db by hand on 2026-11-17.
ALTER TABLE lights_out_registrations ADD COLUMN jersey_size TEXT;
ALTER TABLE lights_out_registrations ADD COLUMN tee_size TEXT;
ALTER TABLE lights_out_registrations ADD COLUMN balance_session_id TEXT;
-- Personalization for the glow jerseys: requested number + name on the back.
ALTER TABLE lights_out_registrations ADD COLUMN jersey_number_request TEXT;
ALTER TABLE lights_out_registrations ADD COLUMN jersey_name TEXT;
-- One-shot guard for the swag sizes email blast (admin button).
ALTER TABLE lights_out_registrations ADD COLUMN sizes_email_sent_at TEXT;
