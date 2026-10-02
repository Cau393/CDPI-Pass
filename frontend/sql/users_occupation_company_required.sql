-- Makes users.occupation ("Cargo que ocupa") and users.partner_company
-- ("Empresa que trabalha") required.
--
-- Existing rows whose value IS NULL or blank (including whitespace-only)
-- become the literal 'Nao aplicavel' (no accent). partner_company already
-- exists; this file does not add it. occupation is added only when absent.
--
-- The column DEFAULT exists so raw INSERTs that omit the columns still
-- succeed (existing rows and test inserts). The public register API still
-- rejects a missing value.
--
-- Run manually in PostgreSQL (no drizzle-kit push).
-- Apply this SQL before deploying the app.
-- Idempotent: re-running is a no-op once both columns are NOT NULL
-- with default 'Nao aplicavel' and no blank values remain.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS occupation VARCHAR(255);

UPDATE users
   SET partner_company = 'Nao aplicavel'
 WHERE partner_company IS NULL
    OR btrim(partner_company) = '';

UPDATE users
   SET occupation = 'Nao aplicavel'
 WHERE occupation IS NULL
    OR btrim(occupation) = '';

ALTER TABLE users
  ALTER COLUMN partner_company SET DEFAULT 'Nao aplicavel';

ALTER TABLE users
  ALTER COLUMN occupation SET DEFAULT 'Nao aplicavel';

ALTER TABLE users
  ALTER COLUMN partner_company SET NOT NULL;

ALTER TABLE users
  ALTER COLUMN occupation SET NOT NULL;

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'users'
--    AND column_name IN ('occupation', 'partner_company');
-- SELECT count(*) FROM users
--  WHERE occupation IS NULL OR btrim(occupation) = ''
--     OR partner_company IS NULL OR btrim(partner_company) = '';
