# Prompt: hardening batch 2 (security code fixes C1–C5), then write batch 3's prompt

> **Executed 2026-10-13: batch 2 deployed.** PR #17 merged as `ffdb2c4` at 13:16 BRT on the owner's explicit go (launch day). CI run 38429128533 went green on rerun (attempt 1 hit an unrelated integration deadlock, fixed in the docs PR). EC2 `9e104d9..ffdb2c4`, the worker restarted `online`, `prod-smoke.mjs` clean. The 35 unverified accounts were grandfathered before the merge. Next: `Prompt-Hardening-Batch-3.md`.

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-2.md` on `origin/hotfix-frontend-update` and execute batch 2." If the docs PR that adds this file is not merged yet, read it from branch `docs/hardening-batch1-deployed`, in the worktree `.claude/worktrees/b1-payments`.

Written 2026-10-13 ~10:50 BRT, right after batch 1 was deployed. One batch per session (rule in `~/.claude/CLAUDE.md`, "Context budget").

## Read first
- Memory `project-cdpi-pass-hardening.md`: the owner's decisions. Don't re-ask them.
- The plan: `~/.claude/plans/pasted-content-id-a811-read-cdpi-pass-v-twinkly-ladybug.md`, sections "Batch 2", "Rules for every PR", "Docs and memory".
- `70-Operations/Security-Backlog.md` items 6, 14, 15 and 16. `00-Overview/Lessons-Learned.md`, the 2026-10-12 and 2026-10-13 entries.

## Where to start
- Batch 1 is **deployed**: PR #15 merged as `9e104d9` on 2026-10-13 10:34 BRT; that is prod's head. Batch 2 is no longer stacked. Branch it off `origin/hotfix-frontend-update`.
- New worktree, for example `git worktree add .claude/worktrees/b2-security -b fix/security-batch-2 origin/hotfix-frontend-update`. Never edit tracked files in the main checkout.
- Sync first: `git fetch origin`, and `gh pr list --author @me --state all --limit 5` (the docs PR `docs/hardening-batch1-deployed` may have merged).

## Batch 1 state, with proof (don't redo)
- CI run 38406064415 green, EC2 fast-forwarded `f937827..9e104d9`, live `/api/events` 200.
- `prod-smoke.mjs`: 6 event pages, each 200 with the right CTA, no horizontal scroll and no page errors. The old-shape register gets 409.
- A7 is live: `orders_asaas_payment_id_unique` has `indisvalid`, `indisready` and `indisunique` all true.
- Pre-flight at 10:31 BRT: 0 orders in 15 min, 0 pending in 60 min, the 3 legacy ids present.

## The items (detail in the plan, "Batch 2"; anchors re-checked at `9e104d9`)
- **C1 (#14):** delete the Make.com post: `MAKE_WEBHOOK_URL` at `server/utils/finalizeOrderPaidLikeWebhook.ts:10`, the `axios.post` at `:123`. Also delete the `COURTESY_WEBHOOK_URL` block in `server/routes.ts` (~3599). Test: a paid finalize and a courtesy redeem make no outbound HTTP call. The owner then removes the variable from the EC2 `.env`.
- **C2 (#15):** `authLimiter.keyGenerator` (`routes.ts:213`) keys on `ipKeyGenerator(req.ip)`; `trust proxy` is already 1 (`index.ts:11`).
  - Integration test: 101 logins with rotating `X-Forwarded-For` → 429.
  - The e2e suite stops rotating the header (`e2e/support/fixtures.ts:12`, `e2e/support/ui.ts:24`, `legacy-questions.spec.ts`).
  - Instead, `e2e/harness/serve.ts` sets a test-only `AUTH_RATE_LIMIT_MAX`, ignored when `NODE_ENV=production`.
- **C3 (#16):** reuse `requireEmailVerification` (`server/middleware/auth.ts:72`, 403 `EMAIL_NOT_VERIFIED`) on `POST /api/events/:id/subscribe`, `POST /api/orders` and courtesy redeem. Login stays open.
  - Client: on that code, redirect to `/verify-email?email=…&next=<current>`, the same flow as `LoginPage.tsx`.
  - Before deploying, count unverified accounts with orders on prod (aggregate only) and report the number to the owner.
  - Tests: integration 403 when unverified, 201 after verifying; a client test for the redirect.
- **C4 (#6):** one `getJwtSecret()` in `server/middleware/auth.ts` that throws at boot when `JWT_SECRET` is missing and `NODE_ENV=production`.
  - There are **four** fallbacks, not three: `routes.ts:150`, `middleware/auth.ts:6`, `print/printCoordinator.ts:8`, `services/emailService.ts:258`.
  - Same guard for `QR_CODE_SECRET` (`qrCodeService.ts:135`, fallback `'default-secret-key'`).
  - Test: importing the module in prod mode without the variable throws.
  - **`emailService.ts` runs in the e-mail worker too**, so this item needs the worker restart (see below).
- **C5:** move the `isAlreadyRegisteredForEvent` and event-full checks (`routes.ts` ~3535) inside `claimCourtesyRedeem` (~3574), through the tx executor. Integration test: 8 concurrent redeems for the same attendee → exactly 1 order (pattern in `refuterItems.integration.test.ts`).

## Added on 2026-10-13, for the owner to decide (ask once, early in the session)
1. **Restart the e-mail worker on deploy.** `deploy.yml` restarts only `cdpi-pass`; `cdpi-pass-email-worker` keeps running old code after every deploy. C4 touches `emailService.ts`, which the worker imports, so batch 2 needs either `pm2 restart cdpi-pass-email-worker --update-env` added to `deploy.yml` next to the app restart (recommended), or a manual restart by the owner after the merge.
2. **An admin-visible signal for refunds awaiting Asaas authorization.** Prod holds every API refund at `AWAITING_CRITICAL_ACTION_AUTHORIZATION`, and the buyer's e-mail already says "estornamos" before anyone approves it. Options: list pending refunds in the admin panel, or e-mail the admin when a refund is requested, or reword the buyer e-mail to "estorno solicitado". Not in batch 2 unless the owner says so.

## Rules (non-negotiable)
- A red test first, then a `reviewer` (Sonnet) pass, then green gates: tsc, frontend, backend, integration, local e2e. Last counts at `a626294`: tsc 0, frontend 382, backend 406, integration 122, e2e 95 passed / 9 skipped. Integration and e2e run on the throwaway Homebrew Postgres (memory `project-cdpi-pass-local-integration-tests.md`).
- PR into `hotfix-frontend-update`. Never push to it or to `main`.
- **The agent cannot merge.** The auto-mode classifier refuses `gh pr merge` ("Merge Without Review"). Hand the owner the exact command to paste with `!`, and keep the owner at the keyboard for the whole window.
- Deploy windows: 22h or 01–05h BRT, or the owner's explicit go. Run `TZ=America/Sao_Paulo date` before the pre-flight, before the merge and before any prod statement.
- Pre-flight (aggregate, Neon `br-lucky-rice-acakvihn`, db `neondb`): fewer than 3 orders in 15 min, 0 pending in 60 min, the 3 legacy ids present. The query is in `Prompt-Hardening-Batch-1-Deploy.md`.
- After the merge: `gh run watch`, then `.claude/worktrees/_e2e-reference/sandbox-check/prod-smoke.mjs`, then confirm the EC2 fast-forward in the deploy log. Revert only if the site is down or answers 5xx.
- If CI's "Initialize containers" fails with `toomanyrequests`, that is the registry, not the code: rerun the job (ECR public rate-limits too; seen 2026-10-13).
- No prod writes and no real charges without the owner's go for that exact action. Prod reads: aggregates or schema only, never PII.
- Every subagent declares its model. Context budget: soft limit ~120K tokens.

## Done means
- Each item's red→green output, the gate counts, the reviewer pass, CI run id, merge sha, smoke output.
- Security-Backlog: #6, #14, #15, #16 moved to Resolved with proof. Memory `project-cdpi-pass-hardening.md` updated.
- `Prompt-Hardening-Batch-3.md` written (plan section "Batch 3": security assessment, OWASP WSTG / Top 10 / ASVS L1; active scans only on a local prod build and staging).
