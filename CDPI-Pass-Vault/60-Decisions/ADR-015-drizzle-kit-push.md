# ADR-015: Schema changes via drizzle-kit push (supersedes ADR-001)

- **Date**: 2026-10-07
- **Status**: accepted

## Context
[[60-Decisions/ADR-001-manual-sql-migrations]] kept every schema change in hand-written `frontend/sql/` files and forbade `drizzle-kit push`. Over time those files created objects that `shared/schema.ts` never declared: 22 CHECK constraints, 7 indexes, and 18 foreign keys with Postgres default names (`<table>_<col>_fkey`). Some column types and NOT NULLs also differed. Running `drizzle-kit push` against staging would have executed 74 statements, including `TRUNCATE users CASCADE` and `TRUNCATE orders CASCADE`. So push looked "buggy" and stayed forbidden, which made the drift worse.

Two genuine drizzle-kit 0.30.6 behaviors were involved. Both still exist in the latest stable, 0.31.11:
- Any column type change on a non-empty table is turned into `TRUNCATE ... CASCADE`.
- Empty-array defaults (`'{}'`) are introspected as `'{""}'`, so `events.interest_areas` showed a change on every push.

## Decision
- `shared/schema.ts` is the single source of truth and declares every DB object (columns, defaults, checks, indexes, uniques, FKs).
- Workflow: edit schema → `pnpm db:diff` (dry run via `drizzle-kit/api` `pushSchema`, prints the SQL, executes nothing, exit 0 = in sync) → `pnpm db:push` on staging → verify → the developer pushes prod from their own machine with the prod `DATABASE_URL`. Agents push staging only.
- Anything push cannot do safely (type change, NOT NULL over existing nulls, rename, backfill) is a reviewed, transactional `.sql` file applied before the push.
- One-time reconciliation, `frontend/sql/reconcile_schema_for_drizzle_push.sql`: renamed the 18 FKs to drizzle names, backfilled `courtesy_attendees.event_title`, applied the NOT NULLs and the varchar types. Applied to staging on 2026-10-07; prod status in [[40-Database/Normalization-History]].
- `frontend/patches/drizzle-kit@0.30.6.patch` (pnpm `patchedDependencies`) fixes the empty-array default bug.

## Alternatives considered
- **Keep manual SQL only**: every change hand-synced in two places, and the drift had already made the ORM tooling unusable.
- **`drizzle-kit generate` + `migrate`**: an old `drizzle.__drizzle_migrations` table exists from an earlier attempt. It adds a migrations folder that would have to be reconciled with years of hand-run SQL. Push plus `db:diff` review gives the same visibility for a single-team project.
- **Upgrade drizzle-kit to fix the bugs**: 0.31.11 has the same code; 1.0 is still a release candidate and would need a drizzle-orm upgrade.
- **Move `interest_areas` default into the ORM (`$defaultFn`)**: drops a DB default that raw SQL inserts (integration tests) rely on.

## Consequences
- A push now shows only the change you made; `pnpm db:diff` exiting 0 proves DB and schema agree.
- The integration-test and CI databases are built by push, so they now carry the real checks and indexes.
- The patch must be revisited on any drizzle-kit upgrade. `db:diff` = 0 on staging is the check.
- Hand-creating a constraint or index outside `schema.ts` silently reintroduces drift: the next push drops it.
- (2026-10-08) Push does **not** detect a changed CHECK expression when the constraint name is unchanged; `db:diff` stays silent. Such a change ships as drop + add in a `sql/` file applied before the push, verified with `pg_get_constraintdef` against a fresh push (first case: ADR-016 Phase 2).
