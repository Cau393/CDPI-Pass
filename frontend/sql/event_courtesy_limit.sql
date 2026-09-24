-- Optional cap on successful courtesy redeems for an event.
--
--   events.courtesy_limit  NULL = no cap (existing rows stay unlimited).
--                          A positive integer is the maximum number of paid
--                          courtesy orders. When that count is reached, every
--                          courtesy link for the event is deactivated until an
--                          admin clears the cap or raises it above the count.
--                          Raising the number does not turn links back on.
--
-- Additive and nullable. Safe to re-run: every statement is guarded.
-- Run manually in PostgreSQL (no drizzle-kit push).

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS courtesy_limit INTEGER NULL;

COMMENT ON COLUMN events.courtesy_limit IS
  'Optional cap on paid courtesy redeems. NULL = unlimited. Links are deactivated when the count is reached and stay off until the cap is raised or cleared.';

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_courtesy_limit_chk;

ALTER TABLE events
  ADD CONSTRAINT events_courtesy_limit_chk
  CHECK (courtesy_limit IS NULL OR courtesy_limit >= 1);

COMMIT;
