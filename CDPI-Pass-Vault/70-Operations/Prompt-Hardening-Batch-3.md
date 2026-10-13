# Prompt: hardening batch 3, security assessment (OWASP WSTG / Top 10 / ASVS L1)

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-3.md` and run hardening batch 3."

Written 2026-10-13 ~14:00 BRT, after batch 2 was deployed (`ffdb2c4`).

## Read first
- Memory `project-cdpi-pass-hardening.md`, `project-cdpi-pass-deploy-branch.md`, `reference-cdpi-pass-neon-mcp.md` and `project-cdpi-pass-local-integration-tests.md`.
- The plan: `~/.claude/plans/pasted-content-id-a811-read-cdpi-pass-v-twinkly-ladybug.md`, sections "Batch 3" and "Rules for every PR".
- [[70-Operations/Security-Backlog]]. Items #6 and #14–#16 are resolved; #17 (admin signal for refunds held for authorization) and the infra items are open.

## Where to start
- Sync first: `git fetch origin`, then `gh pr list --author @me --state all --limit 5`. Find out whether the batch-2 docs PR (`docs/hardening-batch2-deployed`, which carries #16 as well) has merged, and check that its deploy run went green.
- Create a worktree off `origin/hotfix-frontend-update` under `.claude/worktrees/b3-assessment`, then run `git branch --unset-upstream`.

## Priority before anything else: the event on 2026-10-20
The owner needs the QR reader and the printers working for the 2026-10-20 event. Nothing in batch 3 may put that at risk.
- **Before 2026-10-20:** dry run on prod with the owner. Scan one test ticket with the QR reader and print one label.
  - The test ticket is a prod write (a courtesy or free order). It needs the owner's go for that exact action.
  - Batch 2 kept `QR_CODE_SECRET` and `JWT_SECRET` at the same values (they are read at load now), so issued tickets and print-agent tokens should still validate. The dry run is the proof.
- **From 2026-10-18 to 2026-10-21:** no deploys and no scans against prod or staging, unless the owner asks or it fixes check-in or printing.

## Scope (plan section "Batch 3")
Before installing any tool, check that it exists and that its version, maintenance and license are sound (brew formula or official image). Use pnpm, never npm.

| Stage | Tools | Target |
|---|---|---|
| Code | gitleaks (whole git history; the repo is public), semgrep (OWASP and Node rules), osv-scanner + `pnpm audit`, trivy fs/config (deps, `infra/`, the nginx config) | the worktree |
| CI | a new `security` job in `.github/workflows/deploy.yml` running those 4 tools. The first run is a non-blocking baseline; after that, new high/critical findings fail the build | each PR |
| Runtime, active | OWASP ZAP baseline + full active scan with an authenticated context (one user, one admin); nuclei standard templates; the WSTG checklist (auth, session, access control / IDOR on `/api/orders/:id`, input validation, uploads, the checkout and courtesy business logic) | **only** the prod build running locally (sandbox Asaas, fake S3, e-mails queued) and the staging app |
| Runtime, prod | **passive only**: ZAP baseline (spider + passive rules), testssl.sh, a security-header review, nuclei limited to TLS / misconfiguration / exposure templates at a low rate | `cdpipass.com.br`, at a quiet hour, **after the owner's go** |
| Infra | Prowler, read-only | **the owner runs it** (never with the local root AWS key); the agent triages the output |

Output:
- a findings report (severity, evidence, fix, the tool versions and commands used), published as an artifact;
- new items in [[70-Operations/Security-Backlog]];
- code fixes for high/critical findings in their own PR(s), under the rules below.

## Open owner items carried over
- Remove `COURTESY_WEBHOOK_URL` from `~/CDPI-Pass/frontend/.env` on EC2 (no restart needed), and disable the Make.com scenario: its hook URL is in public git history.
- Run Prowler.
- Give the go for the prod passive scans, with a time.
- Tell the agent when Asaas enables foreign payers (task D, `FOREIGN_PAID_CHECKOUT_ENABLED`).

## Rules
- Every fix: a red test first, then a `reviewer` (Sonnet) pass, then green gates (tsc, frontend, backend, integration, local e2e).
- PR into `hotfix-frontend-update`. Never push to it or to `main`. The owner runs the merge; hand them the exact `! gh pr ready N … && gh pr merge N …` line.
- Merging deploys. Merge only at 22h–23:59 or 01–05h BRT, or on the owner's explicit go. Run `TZ=America/Sao_Paulo date` right before the merge.
- Pre-flight before each merge (Neon `br-lucky-rice-acakvihn`, aggregate only): fewer than 3 orders in 15 min, 0 pending in 60 min, and the 3 legacy ids present.
- After each merge:
  - `gh run watch`;
  - the deploy log (fast-forward, "Smoke test OK", "Deploy OK", the worker `online`);
  - `prod-smoke.mjs`.
  - A red Run Tests means a rerun ships the deploy, but the flaky test gets fixed in the next PR.
- No prod writes and no real charges without the owner's go for that exact action. Prod reads are aggregates or schema only, never PII.
- Integration tests: each file has its own CPF prefix (999, 888, 111, 123, 222 and 777 are taken), there is no DDL on shared tables, and raw `pg` timestamps are ISO strings.
- Every subagent declares its model.
- Soft context limit ~120K. Code stage + CI job fit in one session; the runtime scans are a second session.
