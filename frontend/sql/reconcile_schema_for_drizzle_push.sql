-- Make the database match shared/schema.ts so `pnpm db:push` has nothing to do.
--
-- Before this, push against Neon wanted 74 statements, including
-- TRUNCATE users CASCADE and TRUNCATE orders CASCADE. shared/schema.ts now
-- declares the checks and indexes the hand-written SQL files created. This
-- file fixes the rest on the database side:
--
-- 1. Foreign keys created by hand got Postgres default names (<table>_<col>_fkey).
--    Drizzle names them <table>_<col>_<ref table>_<ref col>_fk, so push would
--    drop and recreate each one. Rename only; the ON DELETE actions already match.
-- 2. courtesy_attendees.event_title, orders.max_uses and orders.amnt_used are
--    NOT NULL in the schema but nullable here. The few null event titles are
--    copied from the attendee's order's event before the constraint is added.
-- 3. users.email_verification_code and orders.qr_code_s3_url are text here and
--    varchar(6) / varchar(500) in the schema. drizzle-kit turns a type change on
--    a non-empty table into TRUNCATE ... CASCADE, so the type is changed here.
--    Existing values are at most 6 and 117 characters.
--
-- This is the last hand-written schema file. After it, schema changes go
-- through shared/schema.ts and `pnpm db:push` (see .claude/rules/database.md).
--
-- Apply on staging, then production. All or nothing: if any row still blocks
-- a NOT NULL or a type change, the transaction aborts and nothing changes.
-- Idempotent: renames are skipped once done; the ALTERs are no-ops on re-run.
-- Takes a brief ACCESS EXCLUSIVE lock on users and orders; run off-peak.

BEGIN;

DO $$
DECLARE
  fk text[];
BEGIN
  FOREACH fk SLICE 1 IN ARRAY ARRAY[
    ['certificates', 'certificates_event_id_fkey', 'certificates_event_id_events_id_fk'],
    ['certificates', 'certificates_user_id_fkey', 'certificates_user_id_users_id_fk'],
    ['communicate_jobs', 'communicate_jobs_created_by_fkey', 'communicate_jobs_created_by_users_id_fk'],
    ['communicate_jobs', 'communicate_jobs_event_id_fkey', 'communicate_jobs_event_id_events_id_fk'],
    ['communicate_templates', 'communicate_templates_event_id_fkey', 'communicate_templates_event_id_events_id_fk'],
    ['event_print_settings', 'event_print_settings_event_id_fkey', 'event_print_settings_event_id_events_id_fk'],
    ['event_print_settings', 'event_print_settings_updated_by_fkey', 'event_print_settings_updated_by_users_id_fk'],
    ['mass_send_jobs', 'mass_send_jobs_created_by_fkey', 'mass_send_jobs_created_by_users_id_fk'],
    ['nps_cdpi_apoiando_responses', 'nps_cdpi_apoiando_responses_event_id_fkey', 'nps_cdpi_apoiando_responses_event_id_events_id_fk'],
    ['nps_cdpi_apoiando_responses', 'nps_cdpi_apoiando_responses_user_id_fkey', 'nps_cdpi_apoiando_responses_user_id_users_id_fk'],
    ['nps_cdpi_event_responses', 'nps_cdpi_event_responses_event_id_fkey', 'nps_cdpi_event_responses_event_id_events_id_fk'],
    ['nps_cdpi_event_responses', 'nps_cdpi_event_responses_user_id_fkey', 'nps_cdpi_event_responses_user_id_users_id_fk'],
    ['orders', 'orders_courtesy_attendee_id_fkey', 'orders_courtesy_attendee_id_courtesy_attendees_id_fk'],
    ['print_jobs', 'print_jobs_event_id_fkey', 'print_jobs_event_id_events_id_fk'],
    ['print_jobs', 'print_jobs_order_id_fkey', 'print_jobs_order_id_orders_id_fk'],
    ['reminder_jobs', 'reminder_jobs_created_by_fkey', 'reminder_jobs_created_by_users_id_fk'],
    ['reminder_jobs', 'reminder_jobs_event_id_fkey', 'reminder_jobs_event_id_events_id_fk'],
    ['reminder_templates', 'reminder_templates_event_id_fkey', 'reminder_templates_event_id_events_id_fk']
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk[2] AND conrelid = format('public.%I', fk[1])::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', fk[1], fk[2], fk[3]);
    END IF;
  END LOOP;
END $$;

UPDATE courtesy_attendees ca
SET event_title = (
  SELECT e.title
  FROM orders o
  JOIN events e ON e.id = o.event_id
  WHERE o.courtesy_attendee_id = ca.id
  ORDER BY o.created_at
  LIMIT 1
)
WHERE ca.event_title IS NULL;

ALTER TABLE courtesy_attendees ALTER COLUMN event_title SET NOT NULL;

ALTER TABLE orders
  ALTER COLUMN max_uses SET NOT NULL,
  ALTER COLUMN amnt_used SET NOT NULL,
  ALTER COLUMN qr_code_s3_url TYPE varchar(500);

ALTER TABLE users ALTER COLUMN email_verification_code TYPE varchar(6);

COMMIT;
