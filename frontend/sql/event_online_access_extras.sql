-- Adds optional WhatsApp group URL (online events) and optional confirmation
-- e-mail HTML (any modality).
--
--   events.whatsapp_group_url       Optional invite link. Secret: confirmed
--                                   attendees only. Null when presencial or unset.
--
--   events.confirmation_email_html  Optional TipTap HTML injected into the
--                                   purchase confirmation e-mail. Null/empty =
--                                   default hardcoded template.
--
-- Run manually in PostgreSQL (no drizzle-kit push). Additive and idempotent.
-- Safe to re-run: every statement is guarded.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS whatsapp_group_url VARCHAR(500);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS confirmation_email_html TEXT;

COMMENT ON COLUMN events.whatsapp_group_url IS
  'Optional WhatsApp group invite URL for online events. Secret: confirmed attendees only. Null when presencial or unset.';

COMMENT ON COLUMN events.confirmation_email_html IS
  'Optional TipTap HTML injected into the purchase confirmation e-mail. Null/empty = default template.';

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'events'
--    AND column_name IN ('whatsapp_group_url', 'confirmation_email_html');
