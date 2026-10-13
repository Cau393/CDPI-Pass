# Prompt: hardening batch 3, session 2 (merge the code-stage PRs, then the runtime scans)

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-3-Runtime.md` and continue hardening batch 3."

Written 2026-10-13 ~15:00 BRT, at the end of batch-3 session 1 (code stage + CI job).

## Read first
- Memory `project-cdpi-pass-hardening.md` (the last "State 2026-10-13 ~15:00" paragraph), `project-cdpi-pass-deploy-branch.md`, `reference-cdpi-pass-neon-mcp.md`, `project-cdpi-pass-local-integration-tests.md`.
- [[70-Operations/Prompt-Hardening-Batch-3]]: scope table, rules and the runtime rows.
- [[70-Operations/Security-Backlog]] items #18–#24, added in session 1.
- The report doc: https://claude.ai/code/artifact/7eaacbac-16d6-4a9c-8f0f-f5bfe0378a36. Extend it with the runtime findings; do not create a new one.

## Where things stand
- Worktree `.claude/worktrees/b3-assessment` (upstream unset).
  - `chore/security-batch-3` → PR #CI_PR (draft): CI `security` job, PR trigger, deploy only on push, SHA-pinned actions, `permissions: contents: read`, `.trivyignore.yaml`, vault backlog #18–#24, this prompt.
  - `fix/deps-batch-3`, stacked on it → PR #DEPS_PR (draft): drops the unused `next`, bumps proxy-addr 2.0.8, brace-expansion 2.1.7 and source-map-js 1.2.2, and prunes the baseline.
- Gates on the deps head: tsc 0 / fe 389 (4 skip) / be 419 / integration 129 (4 skip) / local e2e 95 (9 skip). Sonnet reviewer pass done (see the PR bodies).
- Code-stage result: no reachable HIGH/CRITICAL. Accepted until 2026-12-31: drizzle-orm, xlsx x2 (braces and Dockerfile DS-0002 were closed by the pre-freeze deps PR).
- Nothing deployed, no prod writes, no scans of prod or staging.

## Owner decisions already made (do not re-ask)
- The Make.com scenario is disabled. The owner removes `COURTESY_WEBHOOK_URL` from the EC2 `.env` themselves.
- The owner does the QR reader + printer dry run before the 2026-10-20 event. Prepare the test ticket **only when the owner asks**, and get their go before creating it on prod.
- **No deploys and no scans against prod or staging from 2026-10-18 to 2026-10-21.**
- The deploy job deliberately does not `need` the security job (a new CVE must not block a check-in or printing hotfix). Revisit after 10-21.

## Next steps
1. Sync (`git fetch`, `gh pr list --author @me --state all --limit 5`). Check the PR runs. The security job must be green, and the deploy job must show as skipped on the `pull_request` runs.
2. Merge window: 22h–23:59 or 01–05h BRT, or the owner's explicit go, and **never 2026-10-18..21**. Ask the owner whether the deps PR ships before their dry run (so the dry run covers it) or waits until after 10-21.
3. Pre-flight before each merge (Neon `br-lucky-rice-acakvihn`, aggregate only): fewer than 3 orders in 15 min, 0 pending in 60 min, the 3 legacy ids present. Then `TZ=America/Sao_Paulo date`.
4. The owner runs each merge: `! gh pr ready N --repo Cau393/CDPI-Pass && gh pr merge N --repo Cau393/CDPI-Pass --merge --subject "MERGE: … (#N)"`. Merge the CI PR first. Then retarget the deps PR to `hotfix-frontend-update` if GitHub has not already.
5. After each merge: `gh run watch`; the deploy log (fast-forward, "Smoke test OK", "Deploy OK", worker `online`); `prod-smoke.mjs`.
6. Runtime, active (local prod build + staging only): ZAP baseline + full active scan with a user and an admin context, nuclei standard templates, WSTG checks (auth, session, IDOR on `/api/orders/:id`, input validation, uploads, checkout/courtesy logic). Verify each tool (brew/official image, version, license) before installing.
7. Runtime, prod: passive only (ZAP baseline, testssl.sh, header review against backlog #24, nuclei TLS/misconfig/exposure at a low rate), at a quiet hour, **after the owner's go with a time**.
8. Add the findings to the report doc and the backlog. High/critical fixes go in their own PRs: red test → reviewer (Sonnet) → gates.

## Rules
Same as [[70-Operations/Prompt-Hardening-Batch-3]]. PRs go into `hotfix-frontend-update`; never push to it or to `main`. No prod writes or charges without the owner's go for that exact action. Prod reads are aggregates or schema only. Every subagent declares its model. Soft context limit ~120K.

## Owner items still open
- A go and a time for the prod passive scans.
- Run Prowler read-only (never with the local root AWS key).
- Tell the agent when Asaas enables foreign payers (`FOREIGN_PAID_CHECKOUT_ENABLED`).
- Backlog #21 is done: `frontend/Dockerfile` was deleted in the pre-freeze deps PR.
