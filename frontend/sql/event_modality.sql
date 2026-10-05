-- Adds event format (presencial | online) and an optional meeting URL.
--
--   events.modality      "Presencial" vs "Online". Existing rows become
--                        presencial via the DEFAULT so the current QR-ticket
--                        flow is unchanged.
--
--   events.meeting_url   Secret meeting link for online events. Required when
--                        modality = 'online' (CHECK). Never shown on public
--                        event pages; sent only in the confirmation e-mail.
--
-- Run manually in PostgreSQL (no drizzle-kit push). Additive and idempotent.
-- Safe to re-run: every statement is guarded.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'presencial';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS meeting_url VARCHAR(500);

COMMENT ON COLUMN events.modality IS
  'presencial (QR ticket, in-person) or online (meeting URL by e-mail, no QR).';

COMMENT ON COLUMN events.meeting_url IS
  'Meeting URL for online events. Secret: confirmation e-mail only. Null when presencial.';

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_modality_chk;

ALTER TABLE events
  ADD CONSTRAINT events_modality_chk
  CHECK (modality IN ('presencial', 'online'));

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_online_meeting_url_chk;

ALTER TABLE events
  ADD CONSTRAINT events_online_meeting_url_chk
  CHECK (modality <> 'online' OR (meeting_url IS NOT NULL AND btrim(meeting_url) <> ''));

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'events' AND column_name IN ('modality', 'meeting_url');
-- SELECT modality, count(*) FROM events GROUP BY 1;
