# Prompt: Asaas sandbox webhook test, then deploy ADR-016 (next session)

> **Executed 2026-10-09.** Webhook proven on the sandbox (plus the owner's card-link test), fixes in PR #13, foreign paid checkout blocked until Asaas enables it, PR #4 deployed at 17:34 BRT (`f937827`), prod smoke passed. Results: [[70-Operations/Plan-Event-Registration-Forms]] → Deploy checklist → Progress.

How to use it: open a new Claude Code session at `/Users/cauecasonato/Envs/CDPI-Pass` and say: "Read `.claude/worktrees/combined/CDPI-Pass-Vault/70-Operations/Prompt-ADR-016-Sandbox-Webhook-And-Deploy.md` and execute it."

## Owner, before starting (5 min)
1. **Sandbox PIX key.** In the Asaas **sandbox** dashboard, go to Pix → Minhas chaves and add a random key, if there is none. Without one, sandbox PIX charges cannot produce a QR code (on 2026-10-09 one call answered `invalid_action`).
2. **ngrok.** `ngrok config check` must say "Valid configuration file"; it did on 2026-10-09. The free plan is enough.
3. **Deploy window.** Leave the laptop awake, with this session open, until the deploy finishes. The session picks a quiet hour itself: 22h or 01–05h BRT, not on an event day. The Jornada is on 2026-10-13.
4. **Be reachable for one possible click.** If Asaas refuses to create the sandbox webhook through the API, or has no API to simulate a PIX payment, the session will ask you to do that one action in the sandbox dashboard. It will give you the exact URL and steps.

---

Run this with individual subagents; every subagent declares its model. Goal: prove on the **Asaas sandbox** that the payment webhook works end to end on the combined branch, fix whatever it finds, and then deploy PR #4.

## 0. Start state (verify first, don't trust)
- `git fetch origin`; `gh pr list --author @me --state all`.
- PR #4 `feat/registration-forms-all` → `hotfix-frontend-update`: open, CLEAN, head `9573e44` or newer, with #5–#12 merged in. If it is already merged, stop and report.
- Gates at `9573e44`: tsc 0 · frontend 383 · backend 402 · integration 103 · e2e local 101/101.
- **Prod, already applied 2026-10-09:**
  - Backup `backup-pre-adr016-rollout-2026-10-09` (`br-floral-sound-ac45fm5s`).
  - Legacy questions on the 3 live events (3/3/3).
  - Phone fix: 1 user + 3 attendees.
  - The live code (`b0a6359`) ignores both: `/api/events` has no `registrationForm` key.
  - EC2: `ASAAS_API_URL=https://api.asaas.com/v3`; `COURTESY_WEBHOOK_URL` is set (keep that block).
- **Sandbox checkout, already proven 2026-10-09:**
  - BR PIX, boleto and card link → 201.
  - 4-field account: `identity_required` → identity → 201.
  - Foreigner card → 201, after PR #12 stopped sending the passport as `cpfCnpj`.
  - **The webhook was NOT tested yet.**
- Docs: runbook + Deploy checklist in [[70-Operations/Plan-Event-Registration-Forms]]; [[70-Operations/ADR-016-Rollout-Plan]]; [[70-Operations/ADR-016-Refuter-Findings]].

## 1. Ground rules (non-negotiable)
- **Never** use the prod Asaas key or `api.asaas.com`. The main checkout's `frontend/.env` holds the PROD `ASAAS_API_KEY` + `ASAAS_API_URL`.
  - Use only `ASAAS_API_KEY_SANDBOX` + `ASAAS_API_URL_SANDBOX`, read at runtime and never printed or written to a file.
  - The outbound network guard allows only localhost and `api-sandbox.asaas.com`.
- Reuse `.claude/worktrees/_e2e-reference/sandbox-check/` (see its `README.md`).
  - `start.sh` runs the combined app on :5071 with the sandbox key and URL. `SBX_FE` sets the tree; `SBX_WEBHOOK_TOKEN` and `SBX_AWS_ENDPOINT_URL` can be overridden.
  - `sbx-env.mjs` loads the sandbox env for scripts.
  - `check.mjs` runs the checkout cases; `verify.mjs` reads payments by `externalReference`; `cleanup.mjs` deletes this run's sandbox objects.
  - `seed.sql` and `cpfs.txt` seed a throwaway local DB `sbx_check` (Postgres 17 on localhost:55434; recreate the cluster in the scratchpad).
- **Prod DB:** read-only aggregates only. **No prod writes and no real charges** in this session.
- Fixes go through a branch off `feat/registration-forms-all`, a PR into it, TDD, a `reviewer` (Sonnet) pass and green gates. The lead may merge into `feat/registration-forms-all`. PR #4 into `hotfix-frontend-update` is merged only in step 4 below. Never push to `main` or `hotfix-frontend-update`.
- Docs are part of done: vault (runbook progress, Lessons-Learned) plus a one-line rule in the main checkout's gitignored `frontend/.claude/rules/`.

## 2. Sandbox webhook test (lead + one Sonnet helper for research)
1. **Research first** (helper: WebSearch the Asaas docs). Find:
   - The v3 API to create, list and delete webhooks (`/v3/webhooks`) and its required fields (`authToken`, `email`, `sendType`, `events`).
   - How to **simulate payment** in sandbox for PIX, boleto and card: a sandbox confirm endpoint, `receiveInCash`, or the sandbox test cards on the invoice page.
   - Which events each one emits.
2. **Setup.**
   - A local DB from `seed.sql`, with `adr016_attach_legacy_questions.sql` applied.
   - Run `frontend/e2e/harness/fake-asaas.ts` on its own port (`E2E_ASAAS_PORT=5072 pnpm exec tsx e2e/harness/fake-asaas.ts`) only for its fake **S3** (it answers S3 `PUT object`). Asaas stays the real sandbox, because `start.sh` sets `ASAAS_API_URL` from `ASAAS_API_URL_SANDBOX`. Set `SBX_AWS_ENDPOINT_URL=http://127.0.0.1:5072`: the payment-confirmation step uploads the QR code and sends e-mails. Check how `server/services/emailService.ts` sends, and that it can't reach a real mailbox.
   - Generate a random `SBX_WEBHOOK_TOKEN` and keep it in a `chmod 600` file in the scratchpad. Start the app with `start.sh`.
   - Run `ngrok http 5071` to get the public URL.
   - `GET /v3/webhooks`: record the existing ones and never modify them. Create a temporary one with `url = <ngrok>/api/webhooks/asaas`, `authToken = SBX_WEBHOOK_TOKEN`, and the PAYMENT_* events.
3. **Cases.** For each, record the Asaas delivery, the server log line, the DB rows, `current_attendees`, the fake S3 QR upload and the fake SES send. The Make.com call must be blocked by the guard.
   - **BR PIX** → simulate the payment → order `paid`, counter +1, QR + e-mail.
   - **BR card through the payment link** → pay the sandbox invoice with a test card (Playwright) → `PAYMENT_CONFIRMED`. **This is the riskiest case:** our order stores the link id, so finalisation depends on Asaas copying the link's `externalReference` (our order id) onto the payment. If it doesn't, the order never becomes paid. Find out and fix if needed.
   - **BR boleto** → simulate → paid.
   - **Foreigner card** (invoice URL) → pay with a test card → paid.
   - **Wrong `asaas-access-token`** → 401, nothing changes.
   - **The same event delivered twice** (Asaas resend, or replay the logged body) → still one paid order; the counter must not double.
   - **`PAYMENT_OVERDUE` / `PAYMENT_DELETED`** → the behaviour the code intends.
4. **Cleanup.** Delete the temporary webhook (only that one) and this run's sandbox payments, links and customers (`cleanup.mjs`). Stop ngrok, the app, the fakes and Postgres.
5. Write the results into the runbook (Deploy checklist → Progress) and the Rollout-Plan evidence.

## 3. Fixes (if any)
Each fix: red test first, `reviewer` (Sonnet), four gates, local e2e (`pnpm run test:e2e`) and staging-mode e2e. To run staging mode, pass `E2E_DATABASE_URL` from the main checkout's `.env` `DATABASE_URL` without printing it; the host must be `ep-summer-sun-acft18c1`. Then re-run the failing sandbox case. Merge into `feat/registration-forms-all`.

## 4. Deploy (only when every case above passes)
- **Pre-flight:**
  - PR #4 CLEAN, at the expected head.
  - Prod quiet: fewer than 3 orders in the last 15 min.
  - The 3 events still have `legacy_ids_present = 3`.
  - It's a quiet hour and not an event day.
  - If the hour is not quiet, schedule a one-shot `CronCreate` in this session for 22:27 BRT or 02:13 BRT, and tell the owner.
- **Merge:** `gh pr ready 4`, then `gh pr merge 4 --merge`. Then `gh run watch` the "CI/CD Pipeline". If a known-flaky frontend test fails, `gh run rerun --failed` once.
- **Smoke test** (read-only, https://cdpipass.com.br):
  - `/api/events` is 200 and the 3 events carry `registrationForm` with the 3 legacy ids.
  - The 3 event pages load in Playwright at 390 and 1280px with no page errors; "Cadastre-se" is visible.
  - After confirming the new code is live: POST `/api/auth/register` with an old-shape body (`cpf` + `birthDate`, `@example.invalid` e-mail) → 409, and no user is created.
- **Rollback rule:** revert the merge only if the site is down or returns 5xx and the script did not already roll back. If the site is up, report and let the owner decide.
- **Owner check after the deploy:** Asaas **prod** dashboard → Integrações → Webhooks: active, not interrupted, no failed queue.

## 5. Final report
- The sandbox webhook results per case.
- Fixes, with PR links and gates.
- The deploy run, the smoke output and the merge sha.
- Cleanup done.
- Update memory `project-cdpi-pass-registration-forms.md`, and mark this prompt executed.
