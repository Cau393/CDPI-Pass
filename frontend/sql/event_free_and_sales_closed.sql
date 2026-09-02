-- Adds two independent event flags:
--
--   events.is_free       "Evento Grátis". Price is forced to 0, the R$5 convenience
--                        fee is skipped, and inscription goes through
--                        POST /api/events/:id/subscribe with no Asaas charge.
--
--   events.sales_closed  "Encerrar Vendas". Blocks new purchases and free
--                        subscriptions but leaves the event ACTIVE and visible.
--                        Deliberately separate from is_active so that courtesy
--                        redemption (/api/courtesy/redeem) keeps working after
--                        sales are closed.
--
-- Both are additive, NOT NULL with a DEFAULT, so existing rows keep today's
-- behaviour (paid event, sales open) with no backfill required.
--
-- Safe to re-run: every statement is guarded.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS sales_closed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN events.is_free IS
  'Evento Grátis: price forced to 0, no convenience fee, no Asaas charge. Enforced server-side.';

COMMENT ON COLUMN events.sales_closed IS
  'Encerrar Vendas: blocks new purchases/subscriptions. Does NOT deactivate the event; courtesy redemption still works.';

-- A free event must be priced at 0. Enforced in the DB as well as in the API so
-- the two can never drift.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_free_price_zero_chk;

ALTER TABLE events
  ADD CONSTRAINT events_free_price_zero_chk
  CHECK (is_free = FALSE OR price = 0);

COMMIT;

-- Read-only verification (run separately):
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'events' AND column_name IN ('is_free', 'sales_closed');
-- SELECT is_free, sales_closed, count(*) FROM events GROUP BY 1, 2;
