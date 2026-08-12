-- Separate accumulator for CARD money so manual payments (Venmo/check) can
-- never be misattributed to the Stripe line, and removing a manual payment
-- correctly lowers the total. amount_paid_cents = card + manual, recomputed.
ALTER TABLE event_registrations ADD COLUMN card_paid_cents INTEGER;
ALTER TABLE registrations ADD COLUMN card_paid_cents INTEGER;

UPDATE event_registrations SET card_paid_cents = COALESCE(payment_amount_cents, 0)
WHERE stripe_payment_id IS NOT NULL AND payment_status IN ('paid', 'partial') AND card_paid_cents IS NULL;

UPDATE registrations SET card_paid_cents = COALESCE(amount_cents, 0)
WHERE stripe_payment_id IS NOT NULL AND payment_status IN ('paid', 'partial') AND card_paid_cents IS NULL;

-- Recompute the total-paid accumulator from scratch (fixes rows where a
-- removed manual payment was stuck in the total, e.g. Peoria Mustangs)
UPDATE event_registrations SET amount_paid_cents =
  COALESCE(card_paid_cents, 0) + (SELECT COALESCE(SUM(rp.amount_cents), 0) FROM registration_payments rp WHERE rp.registration_id = event_registrations.id)
WHERE amount_paid_cents IS NOT NULL OR card_paid_cents IS NOT NULL;

UPDATE registrations SET amount_paid_cents =
  COALESCE(card_paid_cents, 0) + (SELECT COALESCE(SUM(rp.amount_cents), 0) FROM registration_payments rp WHERE rp.registration_id = registrations.id)
WHERE amount_paid_cents IS NOT NULL OR card_paid_cents IS NOT NULL;
