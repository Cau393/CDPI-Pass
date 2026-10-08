# Neon Database

Postgres hosted on **Neon** (serverless), region `sa-east-1` (aws). Accessed via `@neondatabase/serverless` driver + Drizzle (`server/db.ts`, WebSocket transport).

## Environments
| Env | DATABASE_URL location | Notes |
|---|---|---|
| Staging | local `frontend/.env` | Neon pooler endpoint `ep-summer-sun-*-pooler.sa-east-1.aws.neon.tech` — this is what dev sessions hit |
| Production | on the EC2 server env | Separate database. `.env` comment notes data was migrated to the Brazilian DB |

## Hard rules
- Schema changes go through `pnpm db:diff` (dry run) then `pnpm db:push`, staging first. Prod is pushed by the developer from their own machine. See [[40-Database/Migration-Workflow]]. Never `--force`, never accept a `truncate`, never `db:seed` on Neon.
- The `.env` in the repo points at **staging**. Do not assume it is prod. Agents never point tooling at prod.
- Data fixes, backfills and type changes are reviewed transactional SQL in `sql/` (status normalization, phone backfill, NPS backfill, the 2026-10-07 push reconciliation), applied before the push.

## Operational notes
- Connection uses Neon **pooler** endpoint with `sslmode=require&channel_binding=require`.
- The serverless driver needs a WebSocket constructor in Node (`ws` is wired in `db.ts`).
- If `DATABASE_URL` is missing the server throws at boot ("Did you forget to provision a database?").
