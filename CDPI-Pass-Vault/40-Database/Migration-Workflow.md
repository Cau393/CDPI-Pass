# Migration Workflow (manual SQL only)

**Never push schema changes to the Neon database from tooling.** No `drizzle-kit push`, no `db:generate`, no `db:migrate`, no `db:seed`, no `migrations/` folder. This is enforced by `.claude/rules/database.md` in the repo.

## Why
The DB is shared (staging in `.env`; prod is separate) and changes are applied by hand with review. Automated pushes have no review gate and drizzle-kit diffs can generate destructive statements.

## Process for any schema change
1. Update `frontend/shared/schema.ts` (Drizzle definitions + types + zod schemas).
2. Write a plain `.sql` file in `frontend/sql/`, one file per logical change:
   - Header comment: purpose + "Run manually in PostgreSQL (no drizzle-kit push)" + apply-order notes if relevant.
   - `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guards, idempotent when possible.
   - `TIMESTAMPTZ` for timestamps, inline CHECK constraints for enums.
   - Never DROP without confirming data is dead. Never seed production data.
3. Hand the file to the developer, who runs it manually (Neon SQL editor or psql) on staging, then prod at deploy time.
4. Deploy app code that depends on the schema only **after** the SQL is applied (additive-first ordering).
5. Record the change in [[40-Database/Normalization-History]].

## Connections
- `server/db.ts`: Neon serverless driver + Drizzle, requires `DATABASE_URL`.
- `.env` currently points to **staging** Neon (`sa-east-1`). Prod uses its own `DATABASE_URL` on the server.
- See [[50-Infrastructure/Neon-Database]].
