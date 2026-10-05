# ADR-005: Courtesy represented as a paid order

- **Date**: recorded 2026-09-01 (decision predates; normalization applied via SQL)
- **Status**: accepted

## Context
Early rows used `orders.status = 'courtesy'`, which forked every status check (check-in, reports, certificates) into special cases.

## Decision
Orders have exactly three statuses: `pending | paid | cancelled`. A courtesy is a normal order with `payment_method = 'courtesy'`, `status = 'paid'`, `amount` = 0 or `override_price`, linked via `courtesy_link_id` and `courtesy_attendee_id`. Legacy rows converted by `sql/normalize_order_status_courtesy_to_paid.sql`.

## Consequences
- Check-in, participants, sales and certificate logic treat courtesy tickets identically to purchased ones.
- Origin queries filter on `payment_method`, never on status.
- **Do not add new status values**; put provenance in `payment_method` or dedicated columns.
