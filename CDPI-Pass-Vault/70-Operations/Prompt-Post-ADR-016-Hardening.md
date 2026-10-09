# Prompt: payment gaps, webhook hardening and security backlog after ADR-016 (next session)

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Post-ADR-016-Hardening.md` (on `origin/hotfix-frontend-update` after PR #14, or on branch `docs/adr016-deployed`) and execute it."

## Owner, before starting (10 min)
Answer these in the first message. Items marked **(decision)** block their task until answered.
1. **(decision) Late payment of a cancelled order.** An overdue PIX or boleto was paid after the app cancelled the order. Today the order stays `cancelled`: the money is taken and there is no ticket (proven on the sandbox on 2026-10-09).
   - Choose one:
     - (a) Revive the order when a seat is free, send the ticket, and alert an admin otherwise.
     - (b) Keep it cancelled, refund through Asaas and e-mail the buyer.
     - (c) Keep it cancelled and only alert an admin.
2. **(decision) Security #16, login without a verified e-mail.** Choose one: block login until the e-mail is verified, or keep allowing it.
3. **Security #14, outbound webhooks.**
   - Is the Make.com scenario (`hook.us2.make.com/…`) still used? If yes, rotate its URL in Make.com once the code reads it from an env var.
   - Who consumes `COURTESY_WEBHOOK_URL`? On EC2, print only the host: `grep '^COURTESY_WEBHOOK_URL=' .env | cut -d/ -f1-3`.
4. **Asaas prod dashboard → Integrações → Webhooks.**
   - Status: active or interrupted? Failed queue?
   - `sendType`: SEQUENTIALLY or NON_SEQUENTIALLY?
   - Is an auth token set? On EC2, `grep -c '^ASAAS_WEBHOOK_TOKEN=' .env` must print `1`. Never print the value.
5. **Allow staging writes?** The session needs to seed the 3 prod-id events on staging, so the staging e2e can run. On 2026-10-09 the classifier blocked it without your explicit OK.
6. **Sandbox webhook tests.** Be reachable to run `ngrok http 127.0.0.1:5073` in your own terminal (the agent is not allowed to start ngrok). Keep the laptop on the charger: on 2026-10-09 it slept on battery and broke an e2e run.
7. **Has Asaas enabled foreign customers yet?** If yes, task D runs.

---

Run this with individual subagents; every subagent declares its model (explorer = Haiku, reviewer = Sonnet). Goal: close the known payment and webhook gaps and the code-level security backlog, without disturbing the live events. Deploy in at most 3 batches.

## 0. Start state (verify first, don't trust)
- **Repo and prod head:**
  - Run `git fetch origin` and `gh pr list --author @me --state all`.
  - Prod = `origin/hotfix-frontend-update`, `f937827` or newer (ADR-016 + #13, deployed 2026-10-09 17:34 BRT).
  - PR #14 (vault docs only) may still be open. Merging it redeploys.
- **The main checkout is DIRTY.**
  - `/Users/cauecasonato/Envs/CDPI-Pass` sits on `hotfix-frontend-update` at the old `7778208`, with the owner's uncommitted edits: `PaymentModal.tsx`, `eventCta.ts`, `routes.ts`, `asaasService.ts`, `eventSalesPolicy.ts`, `dist/…`.
  - Never stash, reset, checkout or pull there. Ask the owner what those edits are before any work touches the same files.
  - Work in fresh worktrees from `origin/hotfix-frontend-update` under `.claude/worktrees/`. Run `git branch --unset-upstream` in each.
  - The old `combined` worktree (branch `docs/adr016-deployed`) can be removed once #14 merges.
- **Gates at `f937827`:**
  - tsc 0.
  - frontend 382, +4 skipped by the flag.
  - backend 403.
  - integration 111, +4 skipped by the flag.
  - e2e local 95, +9 skipped by the flag.
- **Live events:**
  - Jornada Analítica & Regulatória (online, free) on **2026-10-13**.
  - Peptídeos (in person, free, sales closed) on 2026-10-20.
  - Emagrecimento e Medicina de Precisão (in person, paid R$ 632) on 2026-10-22.
- **Tooling facts:**
  - **Bash sandbox:** it blocks outbound network. Asaas sandbox, Neon, ngrok and remote Playwright need the sandbox disabled per command. The classifier still refuses to start ngrok and to run direct SQL writes on staging.
  - **Playwright MCP:** it needs Google Chrome, which is not installed. Use the project's `@playwright/test` with `executablePath` pointing at `~/Library/Caches/ms-playwright/chromium-1243/...`, or run `pnpm exec playwright install chromium` first.
  - **Local Postgres 17:** see memory `project-cdpi-pass-local-integration-tests`. Run `initdb` in the scratchpad, start on port 55434, `db:push`.
  - **git push over SSH:** works from the normal sandbox with `GIT_SSH_COMMAND="ssh -o BatchMode=yes"`.
  - **Long runs:** wrap them in `caffeinate -i`.
  - **Reusable helpers:** `.claude/worktrees/_e2e-reference/sandbox-check/` (README → "Webhook, staging and prod helpers").
    - The sandbox webhook path: `webhook-proxy.mjs`, `webhooks.mjs`, `sbx-pay.mjs` (`/v3/sandbox/payment/{id}/confirm|overdue`).
    - The app launchers: `start.sh` / `start-staging.sh`.
    - The Playwright and smoke scripts: `staging-flow.mjs`, `prod-smoke.mjs`.
- **Docs:**
  - [[00-Overview/Lessons-Learned]], especially the 2026-10-09 entries.
  - [[70-Operations/Security-Backlog]].
  - [[70-Operations/Plan-Event-Registration-Forms]] → Deploy checklist → Progress.
  - [[70-Operations/ADR-016-Rollout-Plan]].

## 1. Ground rules (non-negotiable)
- **Prod writes:** no prod DB writes and no real Asaas charges without the owner's explicit go for that exact statement or action.
- **Prod reads:** aggregates or schema only, never PII columns.
- **Asaas key:** only `ASAAS_API_KEY_SANDBOX` / `ASAAS_API_URL_SANDBOX`, through `sbx-env.mjs` / `start*.sh`. Never print them. The main checkout's `frontend/.env` also holds the PROD key.
- **Sandbox webhooks:** create and delete only `cdpi-sbx-webhook-test`. Never touch other sandbox webhooks: "Workshop ingressos" → `workshopemagrecimento.lovable.app` is not ours.
- **Branching:** never push to `main` or `hotfix-frontend-update`. Each fix goes through a branch off `origin/hotfix-frontend-update` and a PR into it.
- **Every fix:**
  - Write the red test first. Prove races with deterministic tests (a stale snapshot passed twice, or two transactions under a lock), not with timing. A parallel-HTTP test passed without the fix on 2026-10-09.
  - Get a `reviewer` (Sonnet) pass.
  - Pass the 4 gates and local e2e.
  - Payment fixes also need a sandbox webhook run.
- **Merging is deploying.**
  - Merge only at a quiet hour: 22h or 01–05h BRT, not on an event day. Or merge when the owner says go.
  - Pre-flight first: fewer than 3 prod orders in 15 min, 0 pending in 60 min (aggregate), and the 3 events still have 3 legacy ids.
  - Then `gh run watch` the "CI/CD Pipeline" and run `prod-smoke.mjs`.
  - Rollback rule: revert only if the site is down or answers 5xx.
- **Docs are part of done:** the vault (Lessons-Learned, Security-Backlog statuses, runbook) plus a one-line rule in the main checkout's gitignored `frontend/.claude/rules/`. Writing to that directory does not touch the owner's dirty files.

## 2. Work items, in priority order

### A. Payment correctness (batch 1)
- **A1. Two orders of the same person can both become paid.**
  - `finalizeOrderPaidLikeWebhook` runs `existsOtherPaidOrderFor…` before `storage.markPendingOrderPaid`.
  - Failure: two pending orders (same CPF, passport or user, same event) confirmed concurrently both pass the check and both claim.
  - Fix: run the check and the claim in one transaction holding `SELECT … FOR UPDATE` on the event row, the same pattern as `createFreeSubscription` and `claimCourtesyRedeem`.
  - Test: two orders, each finalized with a stale pending snapshot. Expect one paid and the other discarded (`refund_then_discard`) or rejected (`reject_only`).
- **A2. A side effect that throws after the claim is never retried.**
  - Example: `incrementEventAttendees` or `incrementCourtesyLinkUsage` throws. The order is already `paid`, so a redelivery returns `already_paid`.
  - Fix: put the claim and the DB side effects in one transaction, so a failure rolls back and the webhook answers 500, which makes Asaas retry. The e-mail and the Make.com post run after commit, best-effort and logged.
  - Test: inject a failure. Expect the order to stay pending, and one redelivery to finalize once.
- **A3. The duplicate branch cancels the charge before its read-then-cancel discard.**
  - In `handleDuplicatePaidInscription`, `cancelPayment` runs, then `discardPendingOrder` reads and cancels in two steps.
  - Fix: make the discard a conditional `UPDATE … WHERE status='pending'`, and cancel or refund the Asaas charge only after the discard succeeded.
- **A4. Late payment of a cancelled order. Implement the owner's decision 1.**
  - PIX and boleto charges have `dueDate` = now + 7 days (`routes.ts` ~2566/2580). `PAYMENT_OVERDUE` then cancels the order, but Asaas still accepts the payment.
  - Also decide whether `PAYMENT_OVERDUE` should cancel at all, or only stop holding the seat.
  - Test with the sandbox: `sbx-pay.mjs try <id> overdue`, then `confirm`.
- **A5. A card payment link may accept a second purchase.**
  - The link URL stays reusable, so a second payment after the order is paid would take money with no ticket.
  - Verify on the sandbox: a human pays the same link twice.
  - If confirmed, delete or deactivate the link once its order is paid (`asaasService.cancelPayment` already does `DELETE /paymentLinks/{id}` for link ids). Handle a payment that arrives after that (refund or alert, per decision 1).
- **A6 (low).** Log, never block, when the paid total differs from `orders.amount`. Card links pay in installments: sum all the installments of the link before comparing.
- **A7 (low).** `orders.asaas_payment_id` has no unique index.
  - Count duplicates on prod (aggregate only).
  - If there are none, propose a partial unique index as a `sql/` file. Prod DDL needs the owner's approval of the exact statement. Otherwise document it.

### B. Webhook robustness (batch 1)
- **B1. Token check fails open.** `asaasService.validateWebhookSignature` returns `true` when `ASAAS_WEBHOOK_TOKEN` is unset, so anyone could post "paid".
  - Fix: fail closed when `NODE_ENV=production`: answer 401 and log loudly.
  - Before deploying, the owner must confirm the env var is set on EC2 and matches the Asaas prod webhook token (owner item 4). Otherwise every prod webhook would start failing.
- **B2. A delivery without `payment` returns 500.** The cancel branch reads `payment.id` without a guard, so a malformed or non-payment event throws, which means 500 and an Asaas retry. 15 failures interrupt the queue.
  - Fix: answer 200 for unhandled or malformed events. Keep 500 only for transient errors (DB).
  - Optional: idempotency on the Asaas event `id`.
- **B3.** Keep exactly HTTP 200 for success: Asaas treats any other status (201, 204, …) as a failure.

### C. Security backlog, code-level (batch 2)
- **C1. #14 Make.com hook in a public repo.** Move it to an env var `MAKE_WEBHOOK_URL`; when unset, skip the post. Stop sending `meetingUrl` unless the scenario needs it. The owner rotates the hook in Make.com after the deploy.
- **C2. #15 login limiter keyed on `X-Forwarded-For`.** Key it on `req.ip` (with `trust proxy` = 1). Integration test: 101 requests with rotating headers get 429. Adapt the e2e suite, which rotates that header.
- **C3. #16 login without a verified e-mail.** Implement the owner's decision 2.
- **C4. #6 `JWT_SECRET` falls back to `"your-secret-key"`.** The fallback appears in `server/routes.ts`, `server/middleware/auth.ts`, `server/print/printCoordinator.ts` and `server/services/emailService.ts`. Fix: refuse to start in production without the variable, and use a single getter.
- **C5. `/courtesy/redeem` checks before its claim transaction.** This is still open from the 2026-10-09 lesson. Move the dedupe into `claimCourtesyRedeem`'s transaction, with an N-concurrent integration test.
- **Not code.** Infra items #1–#4, #7 and #9–#13 (AWS backups, root key, IAM, public bucket, OIDC deploy) are console work. List them for the owner with the fix steps from Security-Backlog. Do not do them unless asked.

### D. Foreign customers (only when the owner confirms Asaas enabled them)
- Set `FOREIGN_PAID_CHECKOUT_ENABLED = true` in `frontend/shared/foreignCheckout.ts`. The guarded tests then run again; all must pass.
- Sandbox foreign card case: create the order through the app, then a human pays the invoice page. Expect the order paid once.
- Deploy as its own small PR.

### E. Test infrastructure (anytime, with owner OK)
- **E1. Seed staging so the staging e2e can run.** With owner item 5 approved, seed the 3 prod-id events on staging. Use the events statement of `_e2e-reference/rehearsal/seed.sql` with `ON CONFLICT (id) DO NOTHING`, then `frontend/sql/adr016_attach_legacy_questions.sql`. Then run `E2E_MODE=staging E2E_DATABASE_URL=<main .env DATABASE_URL, never printed; host ep-summer-sun-acft18c1> pnpm run test:e2e`.
- **E2. Playwright browser version.** Align the installed Chromium with `@playwright/test` (it expects 1248; 1243 is installed).

## 3. Final report
- Per item: the fix, the PR link, the red→green proof, gates, and the sandbox evidence for payment items.
- Deploys: run ids, merge sha, smoke output.
- What waits for the owner (decisions, infra items, Make.com rotation).
- Update memory `project-cdpi-pass-registration-forms.md` (or a new hardening memory) and mark this prompt executed.
