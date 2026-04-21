-- Add per-event hotel pricing
-- price_per_night stores the nightly rate in cents (e.g., 12900 = $129.00)
-- This allows the same hotel to have different rates for different events
ALTER TABLE event_hotels ADD COLUMN price_per_night INTEGER;
