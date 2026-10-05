# Neon Database

Postgres hosted on **Neon** (serverless), region `sa-east-1` (aws). Accessed via `@neondatabase/serverless` driver + Drizzle (`server/db.ts`, WebSocket transport).

## Environments
| Env | DATABASE_URL location | Notes |
|---|---|---|
| Staging | local `frontend/.env` | Neon pooler endpoint `ep-summer-sun-*-pooler.sa-east-1.aws.neon.tech` — this is what dev sessions hit |
| Production | on the EC2 server env | Separate database. `.env` comment notes data was migrated to the Brazilian DB |

## Hard rules
- **NEVER push schema or data to Neon from tooling** (`db:push`, `db:generate`, `db:migrate`, `db:seed` are all forbidden). Schema changes go through manual `.sql` files — see [[40-Database/Migration-Workflow]].
- The `.env` in the repo points at **staging**. Do not assume it is prod, and do not point tooling at prod.
- Data fixes are also manual SQL (see one-time scripts in `sql/`: status normalization, phone backfill, NPS backfill).

## Operational notes
- Connection uses Neon **pooler** endpoint with `sslmode=require&channel_binding=require`.
- The serverless driver needs a WebSocket constructor in Node (`ws` is wired in `db.ts`).
- If `DATABASE_URL` is missing the server throws at boot ("Did you forget to provision a database?").
