-- One Asaas charge (pay_…) or payment link (lnk id) belongs to at most one order.
-- The webhook finds the order by this id (findOrderForPaidAsaasPayment and the
-- PAYMENT_OVERDUE/DELETED branch), so two rows with the same id would let one
-- payment pay or cancel the wrong order.
--
-- Checked on prod 2026-10-09 (aggregate only): 0 duplicated ids among 61 orders
-- with an id. Partial: most orders (free, courtesy) have no Asaas id.
--
-- CONCURRENTLY: no write lock on orders while live events sell. It cannot run
-- inside a transaction block, so run it alone. If it fails it leaves an INVALID
-- index: DROP INDEX CONCURRENTLY orders_asaas_payment_id_unique; then retry.
--
-- Run manually in PostgreSQL (no drizzle-kit push), only after the owner's OK.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS orders_asaas_payment_id_unique
  ON orders (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
