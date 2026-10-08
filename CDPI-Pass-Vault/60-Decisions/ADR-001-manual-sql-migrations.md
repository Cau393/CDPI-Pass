# ADR-001: Manual SQL migrations, no drizzle-kit push

- **Date**: recorded 2026-09-01 (decision predates)
- **Status**: superseded by [[60-Decisions/ADR-015-drizzle-kit-push|ADR-015]] (2026-10-07)

## Context
Schema lives in `shared/schema.ts` (Drizzle), DB on Neon. drizzle-kit push/generate applies diffs automatically, with no review gate, and can produce destructive statements against a shared staging DB and a separate prod DB.

## Decision
All schema and data changes are hand-written `.sql` files in `frontend/sql/`, run manually against Neon (staging first, prod at deploy). Idempotent, additive-first, `IF NOT EXISTS` guards, `TIMESTAMPTZ`. `db:push`/`db:generate`/`db:seed` are forbidden (`.claude/rules/database.md`).

## Alternatives considered
- drizzle-kit migrations folder + `db:migrate`: rejected, still auto-applies and drifts from the hand-run reality.
- Hosted migration tools: overkill for a single-team project.

## Consequences
- Every change is reviewable and ordered; prod deploys pair "run SQL, then deploy code".
- Cost: schema.ts and SQL must be kept in sync by hand; [[40-Database/Normalization-History]] is the ledger.
