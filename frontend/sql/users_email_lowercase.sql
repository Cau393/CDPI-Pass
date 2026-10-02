-- Lowercases users.email and adds a unique index on lower(email)
-- so two accounts cannot share a mailbox that differs only by case or spaces.
--
-- If two rows collapse to the same mailbox, this script aborts and changes
-- nothing. Resolve those accounts by hand, then run it again.
--
-- Run manually in PostgreSQL (no drizzle-kit push).
-- Apply this SQL before deploying the app.
-- Idempotent once every email is already lowercase and the index exists.

BEGIN;

DO $$
DECLARE
  collision_count integer;
BEGIN
  SELECT count(*) INTO collision_count
  FROM (
    SELECT lower(btrim(email)) AS mailbox
    FROM users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) collisions;

  IF collision_count > 0 THEN
    RAISE EXCEPTION
      'users.email lowercase collision: % mailbox(es) belong to more than one user. Resolve them before re-running.',
      collision_count;
  END IF;
END $$;

UPDATE users
   SET email = lower(btrim(email))
 WHERE email IS DISTINCT FROM lower(btrim(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (lower(email));

COMMIT;

-- Read-only verification (run separately):
-- SELECT email FROM users WHERE email IS DISTINCT FROM lower(btrim(email));
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'users' AND indexname = 'users_email_lower_unique';
