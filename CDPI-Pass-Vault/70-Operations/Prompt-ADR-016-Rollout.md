# Prompt: finish and roll out ADR-016 safely (multi-agent)

Paste everything below the line into a new Claude Code session opened at `/Users/cauecasonato/Envs/CDPI-Pass`. It orchestrates subagents; each declares its model. Background: [[60-Decisions/ADR-016-event-registration-forms-and-minimal-signup]], runbook [[70-Operations/Plan-Event-Registration-Forms]].

---

Orchestrate this with subagents. Goal: finish ADR-016 (per-event registration forms + minimal signup), fix every confirmed weakness, and prove — on staging, never prod — that the 3 live production events keep working and keep collecting the data they collect today, so that merging the combined PR into `hotfix-frontend-update` (which deploys prod) breaks nothing.

## 0. Start state (verify first, don't trust)
- Sync: `git fetch origin`, `gh pr list --author @me --state all`. If anything below changed, stop and report.
- Combined PR: branch `feat/registration-forms-all` (worktree `.claude/worktrees/combined`) = `origin/hotfix-frontend-update` + ADR-016 phases 1–4 + `fix/phone-input-keyboard` + `fix/foreign-card-checkout`. Gates there: tsc 0, test:frontend 355, test:backend 387, test:integration 72; browser e2e 12/12 + 7/7 + 3/3.
- Refuter report and its verification: `CDPI-Pass-Vault/70-Operations/ADR-016-Refuter-Findings.md` on that branch. #2, #3 and the CPF part of #4 are already fixed there (integration 72); every other item is in scope below.
- E2E reference (harness + scripts, not in git): `.claude/worktrees/_e2e-reference/README.md`.
- Prod DB already has the Phase 2 schema (applied 2026-10-08, backup branch `backup-pre-adr016-phase2-2026-10-08`). The deploy workflow never touches the prod schema or data; `sql/` files are applied by hand.
- Prod on 2026-10-09: 3 upcoming events — online free (92 paid orders), presencial free (190), presencial paid (1); none has interest areas or a registration form. Every existing user signed up with the old full form (document, birth date, address, occupation, company, area of activity).

## 1. Ground rules (non-negotiable)
- One feature branch per workstream, each in its own worktree **based on `feat/registration-forms-all`**; `git branch --unset-upstream` right after creating it. PRs target `feat/registration-forms-all` (so the owner reviews the delta and the combined PR grows), never `hotfix-frontend-update` or `main`.
- You may commit, push those feature branches and open PRs. You may NOT merge any PR, push to `main` / `hotfix-frontend-update`, or write to the prod DB.
- The main checkout has the owner's uncommitted work (R$ 0,01 test event: `shared/oneCentTestEvent.ts`, `PaymentModal.tsx`, `eventCta.ts`, `eventSalesPolicy.ts`; Cursor `#region agent log` blocks in `routes.ts`, `asaasService.ts`). Never touch, commit, stash or copy any of it.
- Neon project `snowy-cherry-46867295`. Prod `br-lucky-rice-acakvihn`: read-only — schema tools and aggregate queries only, never PII columns or rows. Staging `br-snowy-band-ac4kb1zm`: writes allowed (db:push, sql/, seed). Always pass `branch_id` explicitly.
- A prod write (schema or data) is prepared as an exact SQL statement, rehearsed on staging, and handed to the owner; it runs only after the owner approves that exact statement in the same turn, after a fresh Neon backup branch.
- No Asaas calls from tests or staging runs: Asaas is mocked or the network guard blocks it. Never use the production key. Never print secrets; never read `.env` values into output (a script may load `DATABASE_URL` and assert its host without printing it).
- TDD: a failing test before each change. Every PR pastes the real commands and outputs of `pnpm run check`, `pnpm run test:frontend`, `pnpm run test:backend`, `pnpm run test:integration` (throwaway local Postgres, never Neon), counts at or above the start state.
- Every flow has a foreigner path (passport, non-BR phone) with its own test.
- Docs are part of done: update the vault (runbook, API-Endpoints, Lessons-Learned) and add a one-line rule in `frontend/.claude/rules/` per lesson.
- Every subagent declares its model: `explorer` (Haiku) for search, `reviewer` (Sonnet) before each PR, `reviewer` on Opus as refuter before the owner merges, implementation agents on Sonnet. Tell the owner before escalating anything else to Opus.

## 2. Owner decisions (answered 2026-10-09; do not re-ask)
1. **Legacy questions:** attach `legacy-occupation` "Cargo que ocupa", `legacy-partner-company` "Empresa que trabalha", `legacy-area-of-activity` "Área de atuação" (text, required) to **all 3** upcoming events. No birth-date question: birth date is read only by the in-person courtesy redeem and the courtesy webhook payload (not by Make.com, Asaas, certificates or badges).
2. **Prefill + Excel:** prefill real profile values (not null / `NOT_APPLICABLE_PROFILE_VALUE`) in the dialog, editable; the participants Excel shows one column per legacy question: the answer, else the profile value.
3. **Old signup tabs (refuter #5):** 409 "Atualize a página para concluir o cadastro" when `/api/auth/register` receives a `cpf` or `birthDate` key.
4. **"Sou estrangeiro" on paid checkout (refuter #7):** keep as is (write-once document) — accepted risk; support corrects a wrong document per [[70-Operations/Operator-Guides]].
5. **Merging:** rollout PRs may be merged into `feat/registration-forms-all` by the lead after the `reviewer` passes and gates are green (never into `hotfix-frontend-update` or `main`).
6. **Rehearsal DB:** staging itself (`br-snowy-band-ac4kb1zm`), after a Neon backup branch of staging.

### Added 2026-10-09 (found while refreshing this prompt)
- **Mixed-version gap:** after the deploy, a tab still on the old bundle subscribes or checks out without `answers`, so the new required legacy questions would 400. The server fills a missing `legacy-*` answer from the account's real profile value (C1); a 4-field account with no value still gets 400.
- **Outbound webhooks (refuter S3):** the server calls out, it receives only Asaas. `COURTESY_WEBHOOK_URL` (`routes.ts`, courtesy redeem, added 2025-10-20) posts the full courtesy attendee (CPF, birth date, address, e-mail, phone) only when that env var is set; the owner does not recognise it. A hardcoded Make.com URL (`utils/finalizeOrderPaidLikeWebhook.ts`, added 2025-10-22) posts buyer name/e-mail, event (incl. `meetingUrl`) and order on every paid order — live in prod, unaffected by ADR-016. Owner gate: `grep -c '^COURTESY_WEBHOOK_URL=' <app>/.env` on EC2 (a count, never the value); if 0, delete the dead block (C2). The Make.com hook goes to [[70-Operations/Security-Backlog]] as an open question; not changed in this rollout.
- Lesson rules live in the main checkout's gitignored `frontend/.claude/rules/` (not in worktrees).
- The runbook status table still lists per-phase PRs that never opened (superseded by #4): fix in Phase F, plus a cleanup list of the 6 superseded worktrees/branches for the owner.

## 3. Phases

### Phase A — analysis (parallel, read-only)
- **A1 `explorer` (Haiku):** inventory every reader and writer of `occupation`, `partnerCompany`, `areaOfActivity`, `address`, `cpf`, `foreignDocument` across server, client and shared: badges/print jobs, certificates, NPS, e-mails and calendar invites, Excel, admin lists, Asaas customer payload, courtesy. (`birthDate` done, see §2.1.) Output: table `file:line | field | what breaks for a 4-field account`.
- **A2 prod-events analyst (Sonnet):** read-only on prod: per upcoming/active event, the non-PII config (id, title, date, modality, is_free, price, sales_closed, courtesy limits, interest_areas, registration_form, meeting fields replaced by placeholders) and aggregates (paid orders, foreigners count, phone country-code counts, users with "Nao aplicavel"/null in each legacy field). Also `describe_table_schema` for users, orders, events, courtesy_attendees on prod vs staging vs `shared/schema.ts` on `feat/registration-forms-all`. Output: `events-snapshot.json` (no PII) + a schema-drift table.
- ~~A3 refuter re-check~~ done 2026-10-09: on `a67183a` every open item still reproduces (#4 name/e-mail/phone, #5, #6, #9, S1, S2, race, admin concurrency, flaky tests).

### Phase B — rollout design (lead, then owner approval)
Write `CDPI-Pass-Vault/70-Operations/ADR-016-Rollout-Plan.md`: the backfill SQL (idempotent, by event id list from A2, only events whose form has no legacy ids yet, never overwriting admin questions), any prod schema delta from A2, code changes (prefill, Excel merge, refuter fixes), and the exact deploy order. Key property to prove: **old prod code (`origin/hotfix-frontend-update`) ignores `registration_form`**, so the backfill can run on prod *before* the merge — there is no window where a live event lacks its questions. Show the plan; wait for the owner's go.

### Phase C — implementation (parallel worktrees, Sonnet, TDD)
- **C1 backfill + legacy questions:** `frontend/sql/adr016_attach_legacy_questions.sql` (+ read-only verification query), prefill in the registration dialog, server fallback for missing `legacy-*` answers (§2 Added), Excel merge, integration tests (event with legacy questions; account with full legacy profile is prefilled; 4-field account must answer; foreigner path).
- **C2 refuter items + open follow-ups:** each with its own red test. Refuter (see the findings file): #4 courtesy rows still show the buyer's name / e-mail / phone (pre-existing; show the attendee's, like `commercialSalesMapper`); #5 per the owner's decision (#7 accepted); #6 invalidate `/api/events/:id` on `identity_required` / unknown-question 400s; #9 compare forms structurally; S1 one sanitizer that strips `emailVerificationCode` (and other secrets) from every user response; S2 courtesy-link lookup must not return `meetingUrl` / `meetingPassword`. Follow-ups: duplicate-inscription race (check-then-insert; propose a partial unique index on paid orders per user/event only after an A2 aggregate proves prod has no duplicates); concurrent admin form saves (optimistic `updated_at` check → 409); flaky `NpsCertificateModal` and `EventDetailsPage` override-price tests (find the cause, don't add retries). Delete the `COURTESY_WEBHOOK_URL` block only if the EC2 count is 0. The prod phone fix for the 1 non-55 user is a prepared statement for the owner, not executed.
- **C3 Playwright suite (Sonnet):** turn the reference scripts into a committed suite (`frontend/e2e/`; verify `@playwright/test` on the registry, add with `pnpm add -D`, and a `test:e2e` script). Cover the full current flow at 360/390/1280px, no horizontal scroll, no page errors:
  - BR 4-field signup → verify e-mail → `?next=` return; foreigner signup with +595 phone.
  - The 3 mirrored prod events (from `events-snapshot.json`) with their legacy questions: online free, presencial free (CPF/passport + address + questions), presencial paid (PIX/boleto/card for BR, card only for foreigner) with Asaas mocked at the HTTP boundary, including the 503 foreign-payers message.
  - An old full-profile account re-registering (prefilled, never re-asked for document/address).
  - Admin builder (add, reorder, archive), participants Excel columns, courtesy online and presencial, profile save for a 4-field account.
  - Phone keyboard cases (tab + `+595`).
  Runs in two modes: local harness DB (CI-able) and staging DB (Asaas still mocked; guard allows only the staging Neon host and asserts the host is not prod's `ep-curly-star-ac4ugpbh`).

### Phase D — staging rehearsal (lead)
On a fresh Neon child branch of staging (or staging itself if the owner prefers): apply any schema delta, seed the A2 snapshot events + synthetic users/orders in the same mix (BR/foreign, full-profile/4-field, ~5% of real volume), then:
1. Run **old prod code** against it, apply the backfill, run old prod code again — must pass its integration suite and a smoke e2e (old code + backfilled data = no behaviour change).
2. Run the new code + C3 suite in staging mode — all green.
3. Re-run the backfill — 0 rows changed (idempotent).
Paste every command and output.

### Phase E — review and refute
`reviewer` (Sonnet) on each PR; then a fresh refuter (`reviewer` on Opus, against the change, evidence-only, CONFIRMED/LIKELY/SPECULATIVE) on the final `feat/registration-forms-all`. Fix CONFIRMED items, re-run gates and C3.

### Phase F — owner's deploy runbook (deliverable, not executed)
Add to the runbook (and fix its status table) the exact order: 0) EC2 `COURTESY_WEBHOOK_URL` check; 1) owner approves the prod SQL; 2) Neon backup branch; 3) prod schema delta (if any) + backfill in one transaction; 4) verification query (counts only); 5) owner merges the combined PR; 6) post-deploy smoke (signup, each live event's CTA, admin Excel) with expected results; 7) rollback (revert merge commit; backfill is additive and ignored by old code); 8) real Asaas low-value charge only after the owner says Asaas enabled foreign payers.

## 4. Final report
PR links; per PR the gate counts and e2e results; staging rehearsal outputs; the prepared prod SQL statements awaiting approval (not run); refuter verdicts (fixed / accepted risk / refuted, with evidence); open gates. Update the memory file `project-cdpi-pass-registration-forms.md`.
