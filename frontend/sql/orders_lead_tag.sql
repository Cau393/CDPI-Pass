-- ADR-018 lead tags: orders.lead_tag (where the buyer came from) + its CHECK.
-- Run in PostgreSQL BEFORE the code deploy; never db:push against prod.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "orders" ADD COLUMN "lead_tag" varchar(20);
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_tag_chk"
  CHECK ("lead_tag" IS NULL OR "lead_tag" IN ('email','parceiros','patrocinado','consultores'));

COMMIT;
