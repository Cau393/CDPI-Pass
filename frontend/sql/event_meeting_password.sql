-- Adds an optional meeting password for online events.
--
--   events.meeting_password  Optional secret (any characters, max 100 after
--                            trim). Confirmation e-mail and Meus Ingressos for
--                            confirmed holders. Null when presencial, unset, or
--                            blank. Not required when modality is online.
--
-- Run manually in PostgreSQL (no drizzle-kit push). Additive and idempotent.
-- Safe to re-run: every statement is guarded.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS meeting_password VARCHAR(100);

COMMENT ON COLUMN events.meeting_password IS
  'Optional meeting password for online events. Secret: confirmation e-mail and confirmed Meus Ingressos only. Null when presencial, unset, or blank. Not required for online events.';

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, data_type, character_maximum_length, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'events'
--    AND column_name = 'meeting_password';
