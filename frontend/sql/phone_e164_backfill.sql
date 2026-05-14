-- Run manually in PostgreSQL (no drizzle-kit push).
-- Normalize phones in users + courtesy_attendees to E.164 without '+'.
-- Existing data is BR-formatted "(00) 00000-0000"; this strips formatting
-- and prepends '55' to all 10–11 digit BR-domestic numbers.
--
-- Apply BEFORE deploying the new registration UI.
-- Idempotent: re-running is a no-op once data is normalized.

BEGIN;

-- Step 1: strip every non-digit (formatting, '+' signs, spaces, etc.)
UPDATE users
   SET phone = regexp_replace(phone, '\D', '', 'g')
 WHERE phone IS NOT NULL
   AND phone ~ '\D';

UPDATE courtesy_attendees
   SET phone = regexp_replace(phone, '\D', '', 'g')
 WHERE phone IS NOT NULL
   AND phone ~ '\D';

-- Step 2: prepend '55' (Brazil country code) to all BR-domestic numbers (10 or 11 digits).
UPDATE users
   SET phone = '55' || phone
 WHERE phone IS NOT NULL
   AND phone ~ '^[0-9]{10,11}$';

UPDATE courtesy_attendees
   SET phone = '55' || phone
 WHERE phone IS NOT NULL
   AND phone ~ '^[0-9]{10,11}$';

-- Sanity gate: every phone is now valid E.164 (10–15 digits, digits only).
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT count(*) INTO bad
    FROM users
   WHERE phone IS NOT NULL
     AND phone !~ '^[0-9]{10,15}$';
  IF bad > 0 THEN
    RAISE EXCEPTION 'phone backfill incomplete: % users still have non-E.164 phone', bad;
  END IF;

  SELECT count(*) INTO bad
    FROM courtesy_attendees
   WHERE phone IS NOT NULL
     AND phone !~ '^[0-9]{10,15}$';
  IF bad > 0 THEN
    RAISE EXCEPTION 'phone backfill incomplete: % courtesy_attendees still have non-E.164 phone', bad;
  END IF;
END $$;

COMMIT;

-- Read-only verification:
-- SELECT phone FROM users        WHERE phone !~ '^[0-9]{10,15}$';
-- SELECT phone FROM courtesy_attendees WHERE phone !~ '^[0-9]{10,15}$';
-- SELECT phone FROM users ORDER BY created_at DESC LIMIT 20;
