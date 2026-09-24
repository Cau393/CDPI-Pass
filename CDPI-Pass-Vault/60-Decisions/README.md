# Decisions (ADRs)

Architecture Decision Records. One file per decision: `ADR-NNN-short-title.md`. Use [[60-Decisions/ADR-template]].

**Rule:** whenever a non-obvious technical choice is made, add an ADR here so the next decision is better informed.

**Vault updates** (see [`.cursor/rules/update-vault.mdc`](../../.cursor/rules/update-vault.mdc)): schema, API, email, and user-visible flow changes update the matching vault notes in the **same commit** as the code. Work is incomplete if the vault still describes the previous system. Never copy secrets or `.env` values here.

## Index
- [[60-Decisions/ADR-001-manual-sql-migrations]]
- [[60-Decisions/ADR-002-asaas-payments]]
- [[60-Decisions/ADR-003-postgres-job-queues]]
- [[60-Decisions/ADR-004-lambda-certificates]]
- [[60-Decisions/ADR-005-courtesy-as-paid-order]]
- [[60-Decisions/ADR-006-pm2-in-docker]]
- [[60-Decisions/ADR-007-home-event-cover-contain]]
- [[ADR-008-mobile-downloads|ADR-008: Mobile-safe downloads and file viewing]]
- [[ADR-009-canonical-contact|ADR-009: Canonical contact list]]
- [[60-Decisions/ADR-010-online-vs-presencial]]
- [[60-Decisions/ADR-011-courtesy-redeem-limit]]
