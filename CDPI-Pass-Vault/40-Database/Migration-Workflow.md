# Migration Workflow (drizzle-kit push)

`frontend/shared/schema.ts` is the source of truth. Schema changes reach Neon through `drizzle-kit push`, reviewed first with `pnpm db:diff`. Decision: [[60-Decisions/ADR-015-drizzle-kit-push]] (supersedes the old manual-SQL-only rule, ADR-001). Enforced for the agent by `frontend/.claude/rules/database.md`.

## Process for any schema change
1. Edit `frontend/shared/schema.ts`: columns, defaults, `check()`, `index()` / `uniqueIndex()`, `unique()`, FKs via `.references()`. **Declare every object.** Push drops whatever the schema does not declare.
2. `pnpm db:diff` (from `frontend/`): a dry run against `DATABASE_URL`. It prints the target endpoint id, warnings and every SQL statement push would run. It executes nothing. Exit 0 means DB and schema match.
3. If the diff contains anything destructive or anything that can fail, stop:
   - a column **type change** (drizzle-kit adds `TRUNCATE ... CASCADE` for any type change on a non-empty table)
   - `SET NOT NULL` on a column that has nulls
   - a rename (push offers drop + create)
   - any data backfill

   Write a transactional `.sql` file in `frontend/sql/` (`BEGIN … COMMIT`, idempotent guards, `TIMESTAMPTZ`). Apply it on staging, then prod, **before** pushing. Re-run `db:diff` until only the intended, safe statements remain.
4. `pnpm db:push` on staging (`frontend/.env` points at staging). Expect only the statements `db:diff` showed. Never pass `--force`, never accept a `truncate`.
5. Verify the app on staging.
6. Prod: the developer runs, in their own terminal, `DATABASE_URL=<prod url> pnpm db:diff`, then `DATABASE_URL=<prod url> pnpm db:push`. Agents never hold the prod URL. They can confirm afterwards with the Neon MCP `compare_database_schema` (staging vs prod).
7. Deploy app code that depends on the new schema only after the push (additive-first ordering).
8. Record notable changes in [[40-Database/Normalization-History]].

## Gotchas
- Push is **not transactional**: a failing statement leaves the earlier ones applied. Anything that can fail belongs in a `BEGIN … COMMIT` file.
- `frontend/patches/drizzle-kit@0.30.6.patch` fixes drizzle-kit reading empty-array defaults (`'{}'`) back as `'{""}'`, which made `events.interest_areas` diff on every push. It is still needed on 0.31.11. After any drizzle-kit upgrade, `db:diff` must still report 0 statements on staging.
- `drizzle-kit/api`'s ESM build throws "Dynamic require of fs is not supported"; `scripts/db-diff.ts` loads the CommonJS build.
- CI and `scripts/run-integration-tests.sh` build their throwaway test DB with `db:push`, so tests run against the real checks and indexes.
- Not used: `db:generate` / `db:migrate` (no `migrations/` folder; a stale `drizzle.__drizzle_migrations` table on Neon is from an old attempt). Never `db:seed` on Neon.

## Connections
- `server/db.ts`: Neon serverless driver + Drizzle, requires `DATABASE_URL`. drizzle-kit and `db:diff` connect with `pg`.
- `.env` points to **staging** Neon (`sa-east-1`). Prod uses its own `DATABASE_URL` on the server.
- See [[50-Infrastructure/Neon-Database]].
