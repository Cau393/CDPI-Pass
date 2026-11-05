# ADR-018: Lead tags on orders and the online-events dashboard feed

- **Date**: 2026-11-04
- **Status**: accepted (not deployed). Stage 1 (this repo) is implemented on a feature branch; Stage 2 (the dashboard repo) is a follow-up.

## Context
Marketing wants to know where each registration came from, per event: an e-mail campaign, a partner, a paid ad or
a consultant. Today nothing records it. A separate Masterclass dashboard (its own repo, Vercel) already shows
Sheets-based events; the owner wants the CDPI Pass online events next to them, with the count per channel.

## Owner decisions (2026-11-04)
| # | Decision |
|---|---|
| 1 | Four tags: `email`, `parceiros`, `patrocinado`, `consultores`. No tag = "Direto / sem tag". Labels: E-mail / Parceiros / Patrocinado / Consultores |
| 2 | The link is only `https://cdpipass.com.br/event/<id>?tag=<tag>` (the public route is `/event/:id`) |
| 3 | The tag belongs to the **ticket (order), per person per event**. The same person can carry different tags on two events. The tag saved is the last tagged link opened **for that event** before confirming; a later untagged visit never erases it |
| 4 | Persistence is a cookie per event. Where cookies are blocked, use the best fallback |
| 5 | Dashboard shows both sources side by side: the Sheets events (6 channels) plus every online CDPI Pass event (5 channels) |
| 6 | Dashboard counts **confirmed only**: `orders.status='paid'`, which includes free and courtesy. Pending and cancelled are excluded |

## Decision
- **One shared list.** `shared/leadTag.ts` owns `LEAD_TAGS`, `parseLeadTag` (trim + lowercase + array
  membership), `LEAD_TAG_LABELS` and `leadTagLabel` (null → "Direto"). Server and client both import it.
- **Order column.** `orders.lead_tag varchar(20)` nullable, plus CHECK `orders_lead_tag_chk`
  (`lead_tag IS NULL OR lead_tag IN ('email','parceiros','patrocinado','consultores')`). The tag is written only
  at insert. The Asaas webhook, `finalizeOrderPaid` and check-status never touch it, so the row keeps the tag
  that was current when the order was created.
- **Unknown value → NULL, never a 400.** `POST /api/orders`, `POST /api/events/:id/subscribe` and
  `POST /api/courtesy/redeem` read an optional `leadTag` body field through `parseLeadTag`. A junk string,
  number, object or array stores NULL and the order succeeds; the raw value is never logged. The CHECK still
  guards integrity at the database. `insertOrderSchema` types the field as the enum, never a free string.
- **Layered client persistence** (`client/src/lib/leadTag.ts`), all keyed per event, each layer in its own
  try/catch:
  1. Cookie `cdpi_lt_<eventId>` (Path=/, SameSite=Lax, Max-Age 30 days = 2592000, `Secure` on https). The owner's
     primary choice; survives a closed tab.
  2. `localStorage` key `cdpi:lt:<eventId>`: used when cookies are blocked.
  3. `sessionStorage`, same key: used when `localStorage` throws (some private modes).
  4. An in-memory `Map`: last resort, lives until the page reloads.
  A valid `?tag=` writes every layer; an invalid or missing one writes nothing, so an untagged visit never
  erases a stored tag. Reads go cookie, local, session, memory, each re-validated by `parseLeadTag`.
- **Capture point.** `EventDetailsPage` captures from `window.location.search` in the effect that already reads
  `promo` and `cortesia`, using the route `id`. The URL is not rewritten.
- **Senders read the tag at submit time**, not at page load: `PaymentModal` (one `POST /api/orders` body for PIX,
  card, guest, logged-in and foreign), `useFreeSubscribe`, and `CourtesyRedeemPage` (event id from the courtesy
  lookup, `event.id`; if absent the key is omitted). `leadTagBody` leaves the key out when there is no tag.
- **Admin participants.** New "Origem" column (`leadTagLabel`) and "Origem" as the **last** Excel column, so every
  existing column keeps its position (a question labelled "Origem" becomes "Origem (2)"). The participants API
  rows carry the raw `leadTag` (courtesy rows too).
- **Admin copy menu.** The events list has a "Copiar link" dropdown next to "Copiar ID" with the four tagged URLs
  (`buildTaggedEventUrl`, id URL-encoded) and a toast. Like "Copiar ID" it is hidden below `md`.
- **Dashboard feed.** `GET /api/integrations/dashboard/online-events`:
  - Auth: `Authorization: Bearer <DASHBOARD_API_TOKEN>`, compared with `timingSafeEqual` over SHA-256 digests
    (equal length, no early exit). Env var unset or blank → **503**; missing, non-Bearer or wrong → **401**; the
    token is never echoed. The env is read per request.
  - Limiter: 30 requests / minute / IP, mounted **before** the auth middleware, so guessing the token is
    throttled too (429). `trust proxy` is 1 in `server/index.ts`, so the key is the client IP behind nginx.
  - Query: one grouped Drizzle query, `events LEFT JOIN orders` on `orders.status='paid'`, filtered to
    `modality='online'` and `is_active`, newest first (tie-break `events.id desc`). Counts are `::int`.
  - Response: `{ events: [{ id, title, date, counts: { email, parceiros, patrocinado, consultores, none }, total }] }`.
    `date` is a UTC ISO string. No PII, only event ids and titles and aggregates. `Cache-Control: no-store`.
  - The count unit is one paid `orders` row, the same as the admin participants page (which filters
    `status='paid'`). The integration test checks the counts against its own SQL that re-implements that
    rule, not against the participants page itself.
  - The request logger logs method, path, status and up to 80 characters of the response body; it never reads
    headers, so the token cannot reach the logs, and the response body holds no PII.

## Alternatives considered
- **Tag on the user.** Rejected: one person, several events, different channels (decision 3).
- **Server-side session or a first-party redirect that sets the cookie.** Rejected: the tagged URL is the event
  page itself and a client write covers it with no new route.
- **Cookie only.** Rejected: blocked cookies would silently drop attribution; the fallbacks are cheap.
- **Free-text `utm_*` style tags.** Rejected: unbounded values, a dirty dashboard; a closed list with a CHECK
  keeps the grouped query and the labels simple.
- **Rejecting an unknown tag with 400.** Rejected: a stale or edited link must never block a paying customer.
- **A public dashboard feed.** Rejected for a bearer token; it costs one env var and the endpoint is off until
  it is set.

## Consequences
- Every order row can carry a tag; existing rows are NULL and read as "Direto".
- The dashboard repo (Stage 2) can poll one endpoint for online events; the Sheets events are untouched.
- A new optional secret `DASHBOARD_API_TOKEN` (see [[50-Infrastructure/Environment-Variables]]).
- Buyer-facing responses that return the raw created order include the buyer's own `leadTag`; harmless, left as is.

## Rollout gates
1. **Staging.** `pnpm db:push` (additive), then a manual run: open `/event/<id>?tag=parceiros`, revisit untagged,
   subscribe, and check the participants page shows Origem "Parceiros". Then `curl` the endpoint: 200 with
   counts using the token, 401 without it.
2. **Prod migration, before the code deploy.** Neon backup branch first. `db:diff` must show the two `lead_tag`
   statements below plus the known A7 `DROP INDEX "orders_asaas_payment_id_unique"`, which must **never** be run.
   Prod gets only `frontend/sql/orders_lead_tag.sql` (these two statements), in **one transaction** with
   `lock_timeout` 5s:
   ```sql
   ALTER TABLE "orders" ADD COLUMN "lead_tag" varchar(20);
   ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_tag_chk"
     CHECK ("lead_tag" IS NULL OR "lead_tag" IN ('email','parceiros','patrocinado','consultores'));
   ```
   After the migration, a Neon schema compare of prod against the backup branch must show exactly the new
   column and the new CHECK, and nothing else.
   **Never `db:push` prod:** prod has the A7 index `orders_asaas_payment_id_unique` that `schema.ts` lacks, and
   push would drop it.
3. **Token.** The owner generates a value (`openssl rand -hex 32`) and sets `DASHBOARD_API_TOKEN` in the EC2
   `frontend/.env`. Never in the repo or the vault. Unset, the endpoint answers 503.
4. **Code deploy.** PR into `hotfix-frontend-update`, green, the owner merges (= deploy). Then `curl` the live
   endpoint: 401 without the token, 200 with it. A Neon read-only aggregate
   (`SELECT lead_tag, count(*) FROM orders GROUP BY 1`) confirms tagged rows after real traffic; no PII.
5. **Rollback.** The code tolerates the column, so code can roll back without touching the database. Dropping
   the column needs the dashboard feed switched off first (the grouped query reads it).

## Risks and notes

- Adding a tag later: widen the CHECK `orders_lead_tag_chk` on prod **before** deploying the code that emits
  the new tag, otherwise purchases carrying it fail the constraint and return a 500.
- The client builds the cookie and storage keys only from a safe event id (`/^[A-Za-z0-9_-]{1,64}$/`) and
  captures `?tag=` keyed by the server's `event.id` after the event loads, so a crafted route param cannot
  inject cookie attributes or oversize the Path=/ cookie.
- A courtesy opened straight from `/cortesia?code=` without a tagged event visit counts as "Direto". Accepted;
  the admin shares the tagged event URL.
- A shared device can carry a 30-day tag to another person. Accepted attribution noise; the cookie holds no PII.
- Abandoned pending PIX retries create new rows. Only the paid row counts, with the tag current at that attempt.
- The cookie is first-party and functional, with no PII. There is no cookie banner today; mention it in the
  privacy text if one exists.
- The feed shows only aggregate counts and event names. The limiter is per process (in memory), fine for the
  single PM2 instance.
- There is no `.env.example` in the repo; the Environment-Variables note is the only env documentation.

## Deployment checklist
- [ ] Staging: schema done 2026-11-05 (the same two ALTERs, owner OK; column + CHECK verified); tagged-link manual run, participants shows Origem, `curl` 200 / 401 still open
- [x] Prod: Neon backup branch `backup-pre-adr018-lead-tag-2026-11-04` (`br-flat-fog-acqdv6as`, LSN 0/27EE0300)
- [x] Prod: no db:diff/db:push used; the explicit SQL from `frontend/sql/orders_lead_tag.sql` only
- [x] Prod: the two ALTERs ran in one transaction with `lock_timeout` 5s on 2026-11-05 ~00:57 UTC, before the code deploy (owner OK)
- [x] Prod: Neon compare against the backup = exactly `lead_tag varchar(20)` + `orders_lead_tag_chk`
- [ ] Owner set `DASHBOARD_API_TOKEN` in EC2 `frontend/.env`
- [ ] PR into `hotfix-frontend-update` green; owner merged
- [ ] Live `curl`: 401 without the token, 200 with it; counts match the participants page for one event (manual check)
- [ ] Neon read-only `GROUP BY lead_tag` shows tagged rows after traffic

## Tests
`server/test/utils/leadTag.test.ts`, `server/test/utils/dashboardAuth.test.ts`,
`server/test/integration/leadTag.integration.test.ts` (paid, free, guest, courtesy, two events, junk values, CHECK),
`server/test/integration/dashboardOnlineEvents.integration.test.ts` (auth, limiter before auth, counts, paid only,
no PII), client unit tests for `leadTag.ts`, the senders, the capture, the Excel column and the copy menu, and the
e2e `frontend/e2e/tests/lead-tag.spec.ts`: tagged link, untagged revisit, free guest subscribe, participants Origem
"Parceiros"; the same with hostile storage; the admin copy menu copies `?tag=email`.

## Stage 2 (follow-up, dashboard repo)
Poll the endpoint server-side (the token stays on the server), merge the online events with the Sheets events,
show the five channels, and degrade to a partial-error note when the Pass env is unset or the call fails. The
count should rise within about 45 s of a new tagged subscription (30 s poll + 15 s CDN cache).
