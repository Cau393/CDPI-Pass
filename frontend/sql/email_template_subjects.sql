-- Run manually in PostgreSQL (no drizzle-kit push).
-- Per-event courtesy + reminder subject templates; widen queued mail subject column.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS courtesy_email_subject TEXT;

ALTER TABLE reminder_templates
  ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '';

ALTER TABLE email_queue
  ALTER COLUMN subject TYPE TEXT;
