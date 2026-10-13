# Prompt: resume hardening batch 2 (C3–C5, gates, PR, deploy)

> **Executed 2026-10-13: batch 2 deployed.** PR #17 merged as `ffdb2c4` at 13:16 BRT on the owner's explicit go (launch day). CI run 38429128533 went green on rerun (attempt 1 hit an unrelated integration deadlock, fixed in the docs PR). EC2 `9e104d9..ffdb2c4`, the worker restarted `online`, `prod-smoke.mjs` clean. The 35 unverified accounts were grandfathered before the merge. Next: `Prompt-Hardening-Batch-3.md`.

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-2-Resume.md` in the worktree `.claude/worktrees/b2-security` and finish batch 2."

Written 2026-10-13 ~11:10 BRT. The first batch-2 session stopped at the context soft limit.

## Read first
- `CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-2.md`: the item list, the rules and what "done" means. It is on branch `docs/hardening-batch1-deployed` (worktree `.claude/worktrees/b1-payments`) until PR #16 merges.
- Memory `project-cdpi-pass-hardening.md` and `project-cdpi-pass-local-integration-tests.md`.

## Where to start
- Worktree `.claude/worktrees/b2-security`, branch `fix/security-batch-2`, off `origin/hotfix-frontend-update` at `9e104d9`. Pushed to `origin/fix/security-batch-2`; no PR yet. `frontend/node_modules` is installed.
- Sync first: `git fetch origin`, `gh pr list --author @me --state all --limit 5`. If `hotfix-frontend-update` moved, merge it in.
- Local Postgres: the last session's scratchpad cluster is gone. Re-create it from the memory file (port 55434, `createdb cdpi`, `db:push`).

## Owner decisions made in session 1 (don't re-ask)
- Add `pm2 restart cdpi-pass-email-worker --update-env` to `deploy.yml`, after the live check and before `pm2 save`.
- The signal for refunds awaiting Asaas authorization is **not** in batch 2. Log it as a Security-Backlog / ops item.
- On EC2, `JWT_SECRET` and `QR_CODE_SECRET` are both set in `~/CDPI-Pass/frontend/.env` (the owner checked, 2026-10-13). C4 is safe to deploy, and issued QR tickets keep their key.

## Done, with proof
- Prod aggregate for C3, read at 10:52 BRT and already reported to the owner:
  - 35 unverified accounts in total.
  - 18 with any order, 17 with a paid order.
  - 5 placed an order in the last 90 days.
  - QR data is a PNG data URL, so the database cannot show which key signed it.
- Red tests, all observed failing at the checkpoint commit:
  - `server/test/utils/finalizeOrderPaidLikeWebhook.test.ts`, "C1: …": `axios.post` was called.
  - `server/test/utils/requiredSecret.test.ts`: the 4 production cases resolved instead of throwing (auth, printCoordinator, emailService, qrCodeService).
  - `server/test/utils/authRateLimitMax.test.ts`: the module was missing.
  - `server/test/integration/securityBatch2.integration.test.ts`, 6 tests:
    - the courtesy redeem made an outbound fetch to `COURTESY_WEBHOOK_URL`;
    - subscribe, orders and redeem answered 201 instead of 403;
    - 8 concurrent redeems created 2 orders;
    - 101 logins with a rotating XFF got 0 × 429.
  - Client, 6 tests:
    - `authRedirect.test.ts`: `verifyEmailHref` and `isEmailNotVerified` are not defined yet.
    - `useFreeSubscribe.test.tsx` and `PaymentModal.test.tsx`: the 403 does not redirect.
- **C1 implemented (not yet run green):** the Make.com post is gone from `finalizeOrderPaidLikeWebhook.ts`, and the `COURTESY_WEBHOOK_URL` block is gone from `routes.ts`.
- **C2 implemented (not yet run green):**
  - `authLimiter` uses express-rate-limit 8.7's default key, `ipKeyGenerator(req.ip)` (the custom keyGenerator is deleted).
  - `max: authRateLimitMax()` comes from the new `server/utils/authRateLimitMax.ts`, which ignores `AUTH_RATE_LIMIT_MAX` in production.

## Not done: next steps, in order
1. Run the C1/C2 tests green.
2. **C3 server:** add `requireEmailVerification` after `authenticateToken` on `POST /api/orders`, `POST /api/events/:id/subscribe` and `POST /api/courtesy/redeem`.
3. **C3 client:**
   - In `client/src/lib/authRedirect.ts`, add `verifyEmailHref(email, next?)`, giving `/verify-email?email=…[&next=…]` with an empty `next` left out.
   - Add `isEmailNotVerified(err)` there too: it parses `403: {json}` with `code === "EMAIL_NOT_VERIFIED"`.
   - New hook `client/src/hooks/useVerifyEmailRedirect.ts` returns `(error) => boolean`. When the error is that code and `user.email` is known, it shows a "Verificação necessária" toast and calls `setLocation(verifyEmailHref(user.email, pathname + search))`.
   - Call that hook first in the `onError` of `useFreeSubscribe`, `PaymentModal` and `CourtesyRedeemPage`.
   - `LoginPage`/`RegisterPage` reuse `verifyEmailHref`.
4. **C4:**
   - New `server/utils/requiredSecret.ts` exports `getJwtSecret()` and `getQrCodeSecret()`. Each throws when its variable is empty and `NODE_ENV=production`, and returns the old dev fallback otherwise.
   - Each module evaluates it once at load: `middleware/auth.ts:6`, `routes.ts:150`, `print/printCoordinator.ts:8`, `services/emailService.ts:258` (move it to a module-level const) and `services/qrCodeService.ts:135`.
   - These getters live in `server/utils`, not in `middleware/auth.ts` as the plan said, so the worker's emailService and the qrCodeService don't import HTTP middleware. Say so in the PR.
5. **C5:**
   - `claimCourtesyRedeem` takes `holder: { cpf, foreignDocument, email }`, where `email` is set only for online events.
   - Inside its transaction, on the locked event row, it checks `isEventFull`. Copy `createFreeSubscription`, but select `maxAttendees`/`currentAttendees`/`price` and check `isEventFull`'s price semantics.
   - Also inside the transaction, it calls `isAlreadyRegisteredForEvent(…, tx)`.
   - It returns `{ ok: false, reason: "limit_reached" | "already_registered" | "event_full" }`.
   - The route drops its own unlocked checks (~3520–3545) and maps each reason to the old message: the CPF / Documento / "E-mail já inscrito neste evento." variants, "Evento lotado", and `COURTESY_LIMIT_REACHED`.
6. **e2e:**
   - Stop rotating `x-forwarded-for` in `e2e/support/fixtures.ts:12` (drop the header override), `e2e/support/ui.ts:24` and `e2e/tests/legacy-questions.spec.ts:49,102`.
   - Fix `e2e/README.md:50`.
   - In `e2e/harness/serve.ts`, add `AUTH_RATE_LIMIT_MAX: "100000"` to the env.
7. **deploy.yml:** the worker restart from decision 1.
8. **Gates:** tsc, frontend (382 + 6), backend (406 + 13), integration (122 + 6), local e2e (95 / 9). Run the long ones through a subagent that declares its model and reports counts only.
9. **Review:** a `reviewer` (Sonnet) pass, then fix what it finds.
10. **PR:** `--base hotfix-frontend-update`.
11. **Deploy:** in a window (22h or 01–05h BRT) or on the owner's go, following the batch-2 prompt's rules:
    - pre-flight, then the owner merges with `!`, then `gh run watch`, `prod-smoke.mjs` and the EC2 log;
    - the worker restart shows in the log;
    - afterwards the owner removes `COURTESY_WEBHOOK_URL` from the EC2 `.env`.
12. **Docs:**
    - Security-Backlog: #6, #14, #15 and #16 resolved with proof.
    - Lessons-Learned, the rule line in `frontend/.claude/rules/`, memory.
    - `Prompt-Hardening-Batch-3.md`.

## Known residual to tell the owner (C3)
The redirect follows LoginPage's flow: it lands on `/verify-email` without sending a new code. Old unverified accounts hold expired codes, and "Reenviar" waits 30 s. If the owner wants, the hook could call `POST /api/auth/resend-code` before redirecting.
