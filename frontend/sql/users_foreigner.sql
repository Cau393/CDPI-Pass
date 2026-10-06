-- Foreign accounts skip CPF and store a passport instead.
--
-- Brazilians keep a unique CPF and a null foreign_document.
-- Foreigners store a null CPF and a unique foreign_document.
-- PostgreSQL UNIQUE allows many NULLs, so several foreigners can omit CPF.
-- Do not backfill a fake CPF or an empty string.
--
-- orders and courtesy_attendees snapshot exactly one of the two documents.
-- Some historical orders have a null cpf even though the buyer account has
-- one. Those snapshots are copied from users.cpf before the check is added.
-- No fake CPF is invented. If a row still has neither document, the script
-- aborts and changes nothing.
--
-- Run manually in PostgreSQL (no drizzle-kit push).
-- Apply this SQL before deploying the app.
-- Idempotent: re-running drops and recreates the checks and skips
-- columns and indexes that already exist.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_foreigner boolean;

UPDATE users
   SET is_foreigner = false
 WHERE is_foreigner IS NULL;

ALTER TABLE users
  ALTER COLUMN is_foreigner SET DEFAULT false;

ALTER TABLE users
  ALTER COLUMN is_foreigner SET NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS foreign_document varchar(32);

ALTER TABLE users
  ALTER COLUMN cpf DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_foreign_document_unique
  ON users (foreign_document)
  WHERE foreign_document IS NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_document_chk;

ALTER TABLE users
  ADD CONSTRAINT users_identity_document_chk CHECK (
    (
      is_foreigner = false
      AND cpf IS NOT NULL
      AND foreign_document IS NULL
    )
    OR (
      is_foreigner = true
      AND cpf IS NULL
      AND foreign_document IS NOT NULL
    )
  );

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS foreign_document varchar(32);

ALTER TABLE orders
  ALTER COLUMN cpf DROP NOT NULL;

-- Historical orders can have a null cpf snapshot. Copy the account CPF.
UPDATE orders AS o
   SET cpf = u.cpf
  FROM users AS u
 WHERE o.user_id = u.id
   AND o.cpf IS NULL
   AND o.foreign_document IS NULL
   AND u.cpf IS NOT NULL
   AND btrim(u.cpf) <> '';

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
    FROM orders
   WHERE (cpf IS NULL AND foreign_document IS NULL)
      OR (cpf IS NOT NULL AND foreign_document IS NOT NULL);

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'orders still lack exactly one identity document: % row(s). Fix them before re-running.',
      missing_count;
  END IF;
END $$;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_identity_document_chk;

ALTER TABLE orders
  ADD CONSTRAINT orders_identity_document_chk CHECK (
    (cpf IS NOT NULL AND foreign_document IS NULL)
    OR (cpf IS NULL AND foreign_document IS NOT NULL)
  );

ALTER TABLE courtesy_attendees
  ADD COLUMN IF NOT EXISTS is_foreigner boolean;

UPDATE courtesy_attendees
   SET is_foreigner = false
 WHERE is_foreigner IS NULL;

ALTER TABLE courtesy_attendees
  ALTER COLUMN is_foreigner SET DEFAULT false;

ALTER TABLE courtesy_attendees
  ALTER COLUMN is_foreigner SET NOT NULL;

ALTER TABLE courtesy_attendees
  ADD COLUMN IF NOT EXISTS foreign_document varchar(32);

ALTER TABLE courtesy_attendees
  ALTER COLUMN cpf DROP NOT NULL;

UPDATE courtesy_attendees AS a
   SET cpf = u.cpf
  FROM orders AS o
  JOIN users AS u ON u.id = o.user_id
 WHERE o.courtesy_attendee_id = a.id
   AND a.cpf IS NULL
   AND a.foreign_document IS NULL
   AND u.cpf IS NOT NULL
   AND btrim(u.cpf) <> '';

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
    FROM courtesy_attendees
   WHERE (cpf IS NULL AND foreign_document IS NULL)
      OR (cpf IS NOT NULL AND foreign_document IS NOT NULL);

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'courtesy_attendees still lack exactly one identity document: % row(s). Fix them before re-running.',
      missing_count;
  END IF;
END $$;

ALTER TABLE courtesy_attendees DROP CONSTRAINT IF EXISTS courtesy_attendees_identity_document_chk;

ALTER TABLE courtesy_attendees
  ADD CONSTRAINT courtesy_attendees_identity_document_chk CHECK (
    (
      is_foreigner = false
      AND cpf IS NOT NULL
      AND foreign_document IS NULL
    )
    OR (
      is_foreigner = true
      AND cpf IS NULL
      AND foreign_document IS NOT NULL
    )
  );

COMMIT;

-- Read-only verification (run separately):
-- SELECT conname FROM pg_constraint
--  WHERE conname IN (
--    'users_identity_document_chk',
--    'orders_identity_document_chk',
--    'courtesy_attendees_identity_document_chk'
--  );
