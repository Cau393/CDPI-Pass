# Prompt: hardening batch 1 (payments + webhook), then batches 2 and 3

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `.claude/worktrees/b1-payments/CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-1.md` and execute batch 1."

Written 2026-10-09, when the previous session reached its context budget (rule in `~/.claude/CLAUDE.md`, "Context budget"). One batch per session. At the end of each batch, write the prompt for the next one the same way.

## Read first
- The approved plan: `~/.claude/plans/pasted-content-id-a811-read-cdpi-pass-v-twinkly-ladybug.md`. It holds every item, test and rule.
- Memory: `project-cdpi-pass-hardening.md`, which holds the owner's decisions. Don't re-ask them.
- The original prompt: `CDPI-Pass-Vault/70-Operations/Prompt-Post-ADR-016-Hardening.md`.
- `CDPI-Pass-Vault/00-Overview/Lessons-Learned.md` (the 2026-10-09 entries) and `70-Operations/Security-Backlog.md` (#6, #14–16).

## Where to start
- Worktree `.claude/worktrees/b1-payments`, branch `fix/payment-webhook-hardening` at `a4543f8` (= prod head, upstream unset). It has no `node_modules` and no `.env`: run `pnpm install` in `frontend/`.
- First run `git fetch origin` and `gh pr list --author @me --state all`. If `origin/hotfix-frontend-update` moved past `a4543f8`, rebase this branch first.
- Integration DB: Homebrew `postgresql@17` in the scratchpad on port 55434 (memory `project-cdpi-pass-local-integration-tests`). Wrap long runs in `caffeinate -i`.
- Sandbox helpers: `.claude/worktrees/_e2e-reference/sandbox-check/` (README → "Webhook, staging and prod helpers").

## Done in the previous session
- Owner decisions collected (see memory).
- Code mapped. The key finding is now part of the plan: the duplicate "refund" (`handleDuplicatePaidInscription` → `asaasService.cancelPayment`) sends `DELETE`, which Asaas refuses on a received payment. **Duplicates have never been refunded.**
- Asaas refund API checked:
  - PIX and card: `POST /v3/payments/{id}/refund`. PIX must be RECEIVED and needs enough balance; card must be CONFIRMED or RECEIVED.
  - Boleto: `POST /v3/payments/{id}/bankSlip/refund`, which returns a `requestUrl` that the buyer fills in. The refund is done only when its status is `DONE`.
- Batch-1 worktree created.

## Not done, or blocked
- **The main checkout cleanup was refused by the auto-mode classifier.** The owner does it themselves. The agent never touches `/Users/cauecasonato/Envs/CDPI-Pass` working files. Check `git -C /Users/cauecasonato/Envs/CDPI-Pass status --short` only to report.
- Prod-head gates not yet re-verified. Expected at `a4543f8`: tsc 0, frontend 382, backend 403, integration 111, e2e 95 (skips from `FOREIGN_PAID_CHECKOUT_ENABLED=false` are expected).
- The old `combined` worktree (`docs/adr016-deployed`, merged) can be removed once the owner OKs it.
- E2 (Playwright Chromium to match `@playwright/test` 1.64.0) not done.

## Batch 1 steps (the plan's "Batch 1" section has the detail)
1. Red tests first:
   - A1: two orders of the same CPF, finalized from stale snapshots → one paid.
   - A2: a throw after the claim → the order stays pending, the webhook answers 500, and one redelivery finalizes once.
   - A3: a lost discard → no refund call.
   - A4: overdue, then paid → one refund, no second e-mail.
   - B1: prod without the token → 401.
   - B2: no `payment` → 200.
2. `asaasService.refundReceivedPayment(payment)`: refund the received `payment.id` (never the link id). Boleto goes through `bankSlip/refund` and e-mails the `requestUrl`. A failure logs `REFUND_FAILED` and the webhook still answers 200.
3. `storage.claimPaidOrder` does everything in one transaction:
   - `FOR UPDATE` on the event row
   - the `existsOtherPaidOrderFor*` checks through the tx
   - a conditional `pending→cancelled` (duplicate) or `pending→paid`
   - the attendee and courtesy-usage increments
   After commit, best-effort: the ticket e-mail, and the refund only when the discard happened. `finalizeOrderPaidLikeWebhook` stays as the entry point for its 3 callers: the webhook, `/api/orders/:id/check-status` and `paymentStatusService`.
4. A4: a paid event for a `cancelled` order → refund + "pagamento estornado" e-mail. `PAYMENT_OVERDUE` keeps cancelling.
5. A5: prove on the sandbox that a card link can be paid twice (a human pays it). If it can, deactivate the link after commit and refund a payment that is not part of the paying purchase. The card rule comes from the sandbox evidence, so installments 2 and 3 are never refunded.
6. A6 (log a paid-total mismatch), A7 (prod aggregate count of duplicate `asaas_payment_id`; a `sql/` partial unique index only with the owner's OK on the exact DDL), B1/B2/B3.
7. E3, in this PR: CI Postgres image `public.ecr.aws/docker/library/postgres:16-alpine` (`.github/workflows/deploy.yml:18` and `frontend/scripts/run-integration-tests.sh`).
8. A `reviewer` (Sonnet) pass, then the gates and local e2e.
9. Sandbox webhook run:
   - Setup: `start.sh`, `webhook-proxy.mjs`, ngrok (the owner allowed the agent to start it; if the harness refuses, ask the owner), and `webhooks.mjs create`, which creates only `cdpi-sbx-webhook-test`.
   - Cases: overdue→confirm refund, a duplicate PIX refund, a card link paid twice.
   - Afterwards, `webhooks.mjs delete`.
10. Open a PR into `hotfix-frontend-update`. Merging deploys: only at 22h or 01–05h BRT, never on 2026-10-13, or on the owner's go. Pre-flight, `gh run watch`, then `prod-smoke.mjs`.
11. Docs: Lessons-Learned, a one-line rule in the main checkout's `frontend/.claude/rules/` (gitignored), and the memory update. Then write `Prompt-Hardening-Batch-2.md` for the next session.

## Later sessions
- **Batch 2:** C1–C5 (the plan's "Batch 2"). Stacked on batch 1.
- **Batch 3:** the security assessment (the plan's "Batch 3"):
  - code scanners plus the CI security job
  - active ZAP/nuclei only on the local prod build and staging, with E1 seeding staging first (allowed)
  - prod passive only, at a quiet hour after the owner's go
  - the owner runs Prowler

## Rules (non-negotiable)
- No prod writes and no real charges without the owner's go for that exact action. Prod reads: aggregates or schema only.
- Asaas: sandbox key only, via `sbx-env.mjs`/`start*.sh`. Never print any key. Touch only the `cdpi-sbx-webhook-test` webhook.
- Never push to `main` or `hotfix-frontend-update`.
- Every subagent declares its model (explorer = Haiku, reviewer = Sonnet).
- Context budget: soft limit ~120K tokens. At the soft limit, or at the end of the batch, hand off with the next prompt.
