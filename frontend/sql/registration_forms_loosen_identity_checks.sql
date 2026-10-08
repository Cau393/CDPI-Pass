-- ADR-016 Phase 2: loosen the identity CHECKs so an account, an online order
-- and an online courtesy attendee may exist without a document.
--
-- drizzle-kit 0.30 push matches CHECK constraints by name only and does not
-- emit a change when only the expression differs, so this file applies the
-- new expressions. Apply it BEFORE `pnpm db:push`; the push then adds the
-- jsonb columns and drops the NOT NULLs. The expressions match
-- shared/schema.ts exactly.
--
-- Loosening only: every existing row already satisfies the new checks.
-- Idempotent: drop-if-exists + add. Never re-tighten once rows without a
-- document exist (ADR-016).

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_document_chk;
ALTER TABLE users ADD CONSTRAINT users_identity_document_chk CHECK (
  (is_foreigner = false AND foreign_document IS NULL)
  OR
  (is_foreigner = true AND cpf IS NULL AND foreign_document IS NOT NULL)
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_identity_document_chk;
ALTER TABLE orders ADD CONSTRAINT orders_identity_document_chk CHECK (
  NOT (cpf IS NOT NULL AND foreign_document IS NOT NULL)
);

ALTER TABLE courtesy_attendees DROP CONSTRAINT IF EXISTS courtesy_attendees_identity_document_chk;
ALTER TABLE courtesy_attendees ADD CONSTRAINT courtesy_attendees_identity_document_chk CHECK (
  (is_foreigner = false AND foreign_document IS NULL)
  OR
  (is_foreigner = true AND cpf IS NULL AND foreign_document IS NOT NULL)
);

COMMIT;

-- Read-only verification (run separately):
-- SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conname LIKE '%identity_document_chk';
