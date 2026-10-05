-- Optional "Área de Interesse" labels on an event, and the buyer's snapshot on the order.
--
-- events.interest_areas is an ordered text[] (insertion order). '{}' means
-- inscription does not ask. orders.interest_area is a varchar(255) copy taken
-- when the order is created. It is not a foreign key. Existing orders stay
-- NULL. Later edits to the event list do not change existing orders.
--
-- This is not users.area_of_activity ("Área de Atuação" on the profile).
-- No backfill.
--
-- Run manually in PostgreSQL (no drizzle-kit push).
-- Apply this SQL before deploying the app.
-- Idempotent: re-running is a no-op once both columns exist.
--
-- Applied to the staging Neon database on 2026-10-05.
-- Production still needs this file in the Neon SQL editor before deploy.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS interest_areas text[] NOT NULL DEFAULT '{}';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS interest_area varchar(255);

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, is_nullable, column_default, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'events'
--    AND column_name = 'interest_areas';
-- SELECT column_name, is_nullable, data_type, character_maximum_length
--   FROM information_schema.columns
--  WHERE table_name = 'orders'
--    AND column_name = 'interest_area';
