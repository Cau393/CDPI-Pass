-- Fix the few phones still stored in the old BR format "(11) 98765-4321" (users
-- and courtesy_attendees): keep digits, prefix 55. Scoped ON PURPOSE to values that
-- start with "(" and have 10-11 digits, so valid foreign E.164 numbers stored as
-- digits (12025550123, 34612345678, 595981123456) are never touched.
-- Replaces re-running phone_e164_backfill.sql, whose step 2 corrupts those.
--
-- One transaction; the DO block aborts (rolls back) if any "(..." phone is left.
-- Re-running changes nothing.

BEGIN;

UPDATE users
   SET phone = '55' || regexp_replace(phone, '\D', '', 'g')
 WHERE phone ~ '^\('
   AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 11;

UPDATE courtesy_attendees
   SET phone = '55' || regexp_replace(phone, '\D', '', 'g')
 WHERE phone ~ '^\('
   AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 11;

DO $$
DECLARE
  bad INT;
BEGIN
  SELECT (SELECT count(*) FROM users WHERE phone ~ '^\(')
       + (SELECT count(*) FROM courtesy_attendees WHERE phone ~ '^\(')
    INTO bad;
  IF bad > 0 THEN
    RAISE EXCEPTION 'parenthesized phones remain after the fix: %', bad;
  END IF;
END $$;

COMMIT;

-- Read-only pre-check (run first; prod expects users 1, courtesy_attendees 3):
-- SELECT 'users' AS t, count(*) FROM users
--  WHERE phone ~ '^\(' AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 11
-- UNION ALL
-- SELECT 'courtesy_attendees', count(*) FROM courtesy_attendees
--  WHERE phone ~ '^\(' AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 11;
