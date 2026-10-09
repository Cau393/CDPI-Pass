# Prompt: finish hardening batch 1 (sandbox proof, A5 card, deploy), then write batch 2's prompt

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `.claude/worktrees/b1-payments/CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-1-Finish.md` and finish batch 1."

Written 2026-10-09, when the batch-1 session reached its context budget (rule in `~/.claude/CLAUDE.md`, "Context budget").

## Read first
- The plan: `~/.claude/plans/pasted-content-id-a811-read-cdpi-pass-v-twinkly-ladybug.md`, sections "Batch 1" and "Rules for every PR".
- Memory: `project-cdpi-pass-hardening.md` holds the owner's decisions. Don't re-ask them.
- PR #15 (draft): https://github.com/Cau393/CDPI-Pass/pull/15. Its body lists what changed, the proof and the known residuals.
- `70-Operations/Prompt-Hardening-Batch-1.md`, the original batch-1 prompt, for the step list.

## Where to start
- Worktree `.claude/worktrees/b1-payments`, branch `fix/payment-webhook-hardening`.
  - Code commit `ae19b59`, plus a docs commit on top (this file and the Lessons-Learned entry).
  - Base: `a4543f8` (prod head when it was written).
  - Upstream unset after the push, so a bare `git push` can't target prod; push with `git push origin fix/payment-webhook-hardening`.
  - `node_modules` is installed. There is no `.env`.
- Sync first: `git fetch origin`, then `gh pr list --author @me --state all`. If `origin/hotfix-frontend-update` moved past `a4543f8`, merge it into the branch and rerun the gates.
- Integration DB: a new throwaway Homebrew `postgresql@17` cluster in the new session's scratchpad on port 55434 (memory `project-cdpi-pass-local-integration-tests`). Then `pnpm run db:push`. Wrap long runs in `caffeinate -i`.
- Sandbox helpers: `.claude/worktrees/_e2e-reference/sandbox-check/`. See its README section "Webhook, staging and prod helpers".

## Done, with proof (local, at ae19b59)
- A1, A2, A3, A4 (PIX and boleto), A5 (PIX/boleto part), A6, B1, B2/B3, E3, and conditional cancels for expired charges.
- 9 red integration cases failed on the old code for the expected reasons, then went green.
- Gates:
  - tsc: 0
  - frontend: 382
  - backend: 404
  - integration: 122
  - local e2e: 95 passed, 9 skipped (`FOREIGN_PAID_CHECKOUT_ENABLED=false`)
- A7:
  - Prod aggregate: 0 duplicated `asaas_payment_id` across 61 orders.
  - `frontend/sql/orders_asaas_payment_id_unique.sql` is written. It was applied only to the local DB, where integration stays 122/122. **It is not applied on prod.**
- The `reviewer` (Sonnet) pass is done and its findings are folded in.
- Docs:
  - The Lessons-Learned entry ("duplicate payments were never refunded").
  - The one-line rule in the main checkout's `frontend/.claude/rules/backend.md` (gitignored).

## Not done
1. **Sandbox webhook run (step 9).** It was never run against the real Asaas sandbox; every refund endpoint so far is proven only against a stub.
   - Setup: `start.sh`, `webhook-proxy.mjs`, `ngrok http 127.0.0.1:5073` (the owner allows it; if the harness refuses, ask the owner to run it), then `webhooks.mjs create`, which touches only `cdpi-sbx-webhook-test`.
   - Cases to prove:
     - `sbx-pay.mjs try <id> overdue`, then `confirm`: the order stays cancelled and the PIX shows as refunded.
     - A duplicate PIX for a holder who already has a paid order: refunded.
     - A second refund of the same payment is refused (400), and the log says `REFUND_ALREADY_DONE`.
     - Boleto: `bankSlip/refund` returns `requestUrl`. Record what a second call returns, and the status the payment shows meanwhile (`isRefunded` relies on `REFUND*`).
     - The card installment-plan refund `POST /installments/{id}/refund` works on a card bought in installments through a link (needs a human to pay; reCAPTCHA).
   - Afterwards, `webhooks.mjs delete`. Save `deliveries.jsonl` as evidence in the PR.
2. **A5 card (step 5).** A human pays the same card link twice on the sandbox.
   - If the second payment goes through:
     - Deactivate the link after the paid commit (`DELETE /paymentLinks/{id}`). First confirm on the sandbox that deleting a link leaves the installments 2/3 of the first purchase intact.
     - Refund a payment for an already-paid order whose `installment` differs from the first purchase's installment.
   - Red test first. The legit installments 2/3 are never refunded; a test already asserts it.
3. Fix whatever the sandbox run contradicts (for example, the response shapes of the refund endpoints), with a red test.
4. Mark PR #15 ready.
5. **Deploy:**
   - Merging = deploying to prod. Merge only at 22h or 01–05h BRT, never on 2026-10-13, or on the owner's go.
   - Pre-flight: fewer than 3 prod orders in 15 min, 0 pending in 60 min, the 3 legacy ids present (aggregate reads only).
   - Then `gh run watch` (CI now pulls Postgres from public.ecr.aws, which is the first real test of E3), then `prod-smoke.mjs`.
6. **A7 on prod:** only after the owner OKs the exact statement in `frontend/sql/orders_asaas_payment_id_unique.sql`. Run it alone (`CONCURRENTLY`), never in a transaction.
7. **Docs and memory:**
   - Mark `Prompt-Hardening-Batch-1.md` and this file as executed.
   - Update the Security-Backlog statuses for the payment items.
   - Update memory `project-cdpi-pass-hardening.md`.
   - Write `Prompt-Hardening-Batch-2.md`, for C1–C5 stacked on batch 1 (plan section "Batch 2").

## Decisions already made (don't re-ask)
- Card on a cancelled order: log `REFUND_NEEDED`, never auto-refund. Card RECEIVED comes ~30 days after CONFIRMED, so an auto-refund would refund admin-cancelled paid orders.
- The late refund runs only in the webhook path. check-status and the poll never refund a cancelled order.
- The refund and the A6 check stay awaited inside the webhook request (crash safety over latency).

## Rules (non-negotiable)
- No prod writes and no real charges without the owner's go for that exact action. Prod reads: aggregates or schema only.
- Asaas: sandbox key only, via `sbx-env.mjs`/`start*.sh`. Never print any key. Touch only the `cdpi-sbx-webhook-test` webhook.
- Never push to `main` or `hotfix-frontend-update`.
- The agent never edits `/Users/cauecasonato/Envs/CDPI-Pass` tracked files; its cleanup is the owner's job. The gitignored `.claude/rules/` files are the exception.
- Every subagent declares its model (explorer = Haiku, reviewer = Sonnet).
- Context budget: soft limit ~120K tokens. At the soft limit, hand off with the next prompt.
