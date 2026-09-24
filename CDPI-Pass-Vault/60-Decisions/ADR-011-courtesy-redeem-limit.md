# ADR-011: Event-wide courtesy redeem cap

- **Date**: 2026-09-24
- **Status**: accepted

## Context
Some events need a hard ceiling on how many courtesy seats can be claimed, across every courtesy link, not per link. After that ceiling, invited links must stop working and must not be switched back on until an admin raises the ceiling.

## Decision
`events.courtesy_limit` is an optional positive integer. NULL means no cap.

The count is the number of paid orders with `payment_method = 'courtesy'` for that event — one per successful `POST /api/courtesy/redeem`. Promo links (`override_price`) do not go through that endpoint and do not count, but they are courtesy-link rows: when the cap is hit they are deactivated with the rest and cannot be turned back on.

The redeem that makes the count equal the limit succeeds. The same transaction then sets every `courtesy_links.is_active` to false for the event. A later redeem is rejected. Saving a limit that is already less than or equal to the current count deactivates links immediately.

Clearing the field or setting a higher number only removes the block. It does not reactivate links. Admins turn links back on one by one (or via "Ativar todos") after the cap is raised.

The event row is locked (`SELECT … FOR UPDATE`) for the check and the order insert so two concurrent redeems cannot both take the last seat.

## Alternatives considered
- Summing `courtesy_links.used_count` would also count promo redemptions, which are not courtesy redeems.
- Auto-reactivating links when the cap is raised would undo an admin's manual deactivations and hide which links were stopped by the cap.

## Consequences
`frontend/sql/event_courtesy_limit.sql` was applied on Neon staging and production on 2026-09-24, before deploying code that reads `courtesy_limit`. Existing events stay unlimited. Mass-send skips rows for an event whose cap is already reached instead of creating active links.
