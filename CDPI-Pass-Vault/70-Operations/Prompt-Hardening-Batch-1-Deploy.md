# Prompt: deploy hardening batch 1 (PR #15), run A7, then write batch 2's prompt

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `.claude/worktrees/b1-payments/CDPI-Pass-Vault/70-Operations/Prompt-Hardening-Batch-1-Deploy.md` and deploy batch 1."

Written 2026-10-12 ~19:30 BRT, when the sandbox-run session reached its context budget. It replaces `Prompt-Hardening-Batch-1-Finish.md` (steps 1–3 of that file are done).

## Read first
- Memory `project-cdpi-pass-hardening.md` (owner decisions, don't re-ask) and `feedback-sandbox-card-via-playwright.md`.
- PR #15: https://github.com/Cau393/CDPI-Pass/pull/15. Its body has the sandbox table, the fixes and the known residuals.
- The plan: `~/.claude/plans/pasted-content-id-a811-read-cdpi-pass-v-twinkly-ladybug.md`, sections "Batch 1", "Batch 2", "Rules for every PR".

## Where to start
- Worktree `.claude/worktrees/b1-payments`, branch `fix/payment-webhook-hardening`, upstream unset: push only with `git push origin fix/payment-webhook-hardening`.
- Head: `a626294` (code) plus a docs commit on top (this file and the Lessons-Learned entry). Base `a4543f8` = prod head on 2026-10-12.
- Sync first: `git fetch origin`; if `origin/hotfix-frontend-update` moved past `a4543f8`, merge it in and rerun the gates.

## Done, with proof
- Real Asaas sandbox run (2026-10-11/12), app on this branch, real webhook through ngrok:
  - Late PIX refunded once.
  - Redelivery logs `REFUND_ALREADY_DONE`.
  - Late boleto refunded, with the form link e-mailed.
  - Second boleto call refused, no second e-mail.
  - Duplicate PIX refunded.
  - Duplicate card plan refunded with `/installments/{id}/refund`.
- Sandbox contradictions fixed in `a626294`, each with a test that failed first:
  - Boleto refund needs the customer's national `mobilePhone`.
  - A pending refund shows only in `refunds[]`.
  - A paid card link is switched off with `PUT active:false`, because `DELETE` is refused once the link has charges.
- Switch-off proven end to end: Playwright paid link `of4a89zgxkxi69n7` in 3x. The order became paid and the link `active=false`, with the 3 installments still CONFIRMED. The second attempt showed "Seu fornecedor desabilitou esse link de pagamento.", and the payment count stayed at 3.
- Gates at `a626294`:
  - tsc: 0
  - frontend: 382
  - backend: 406
  - integration: 122 (local Postgres + A7 index)
  - Local e2e was **not** rerun after `a626294`. Rerun it (last: 95 passed / 9 skipped at `ae19b59`).
- Sandbox torn down: the webhook was deleted, local services stopped. The owner should stop ngrok.
- Docs: Lessons-Learned "the Asaas stub agreed with our code, the real sandbox did not"; the backend rule line in the main checkout's `frontend/.claude/rules/backend.md` (gitignored) is extended.

## Not done
1. Local e2e rerun (see the Batch-1 prompt for the command and the `FOREIGN_PAID_CHECKOUT_ENABLED=false` skips).
2. Mark PR #15 ready (`gh pr ready 15`).
3. **Deploy**, which is the merge into `hotfix-frontend-update`.
   - Windows: **never on 2026-10-13** (the whole day). So either 2026-10-12 22:00–23:59 BRT, 2026-10-14 01–05h, 22h on any later day, or the owner's explicit go.
   - Pre-flight, aggregate reads only: fewer than 3 prod orders in 15 min, 0 pending in 60 min, the 3 legacy ids present.
   - Then `gh run watch`. CI pulls Postgres from public.ecr.aws, which is the first real test of E3.
   - Then `prod-smoke.mjs`.
4. **A7 on prod**, right after a green deploy.
   - The owner OK'd the exact statement in `frontend/sql/orders_asaas_payment_id_unique.sql` on 2026-10-09.
   - Run it alone (`CONCURRENTLY`), never in a transaction.
   - Verify with `pg_indexes` that the index exists and is valid (`pg_index.indisvalid`).
5. Docs and memory:
   - Mark `Prompt-Hardening-Batch-1.md`, `-Finish.md` and this file as executed.
   - Update the Security-Backlog statuses for the payment items.
   - Update memory `project-cdpi-pass-hardening.md`.
   - Write `Prompt-Hardening-Batch-2.md`: C1–C5 stacked on batch 1 (plan section "Batch 2").
   - Add to batch 2 for the owner to consider: an admin-visible signal for refunds awaiting Asaas authorization. Prod holds every API refund at `AWAITING_CRITICAL_ACTION_AUTHORIZATION`, and the buyer's e-mail says "estornamos" before anyone approves it.

## Decisions already made (don't re-ask)
- Card on a cancelled order: log `REFUND_NEEDED`, never auto-refund.
- The late refund runs only in the webhook path.
- A7 statement: OK (2026-10-09).
- Prod Asaas has critical-action authorization on, so refunds wait for approval in the panel. That is configured in the panel, not in code.
- A5 card residual (a second purchase completed in the ~1–2 s before the switch-off): accepted. Switch-off only, no new column (2026-10-12).
- Sandbox card checkouts are paid by the agent, with `sandbox-check/card-pay.mjs` and `HEADED=1` (headless gets "Verifique o recaptcha").

## Rules (non-negotiable)
- No prod writes and no real charges without the owner's go for that exact action. A7 and the merge are already OK'd within the windows above. Prod reads: aggregates or schema only.
- Asaas: sandbox key only, via `sbx-env.mjs` and `start*.sh`. Never print any key. Touch only the `cdpi-sbx-webhook-test` webhook.
- Never push to `main` or `hotfix-frontend-update` directly. The merge goes through PR #15.
- Never edit tracked files in `/Users/cauecasonato/Envs/CDPI-Pass` (the main checkout).
- The auto-mode classifier refuses ngrok and registering a tunnel URL with Asaas; the owner runs those in their own terminal (no leading `!` there).
- Every subagent declares its model.
- Context budget: soft limit ~120K tokens.
