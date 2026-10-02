-- Makes users.area_of_activity ("Área de Atuação") required.
--
-- Existing rows whose value IS NULL or blank (including whitespace-only)
-- become the literal 'Nao aplicavel' (no accent).
--
-- The column DEFAULT exists so raw INSERTs that omit the column still
-- succeed (existing rows and test inserts). The public register API still
-- rejects a missing value.
--
-- Run manually in PostgreSQL (no drizzle-kit push).
-- Apply this SQL before deploying the app.
-- Idempotent: re-running is a no-op once the column is NOT NULL
-- with default 'Nao aplicavel' and no blank values remain.
--
-- Apply after users_occupation_company_required.sql.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS area_of_activity VARCHAR(255);

UPDATE users
   SET area_of_activity = 'Nao aplicavel'
 WHERE area_of_activity IS NULL
    OR btrim(area_of_activity) = '';

ALTER TABLE users
  ALTER COLUMN area_of_activity SET DEFAULT 'Nao aplicavel';

ALTER TABLE users
  ALTER COLUMN area_of_activity SET NOT NULL;

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'users'
--    AND column_name = 'area_of_activity';
-- SELECT count(*) FROM users
--  WHERE area_of_activity IS NULL OR btrim(area_of_activity) = '';
