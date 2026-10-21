# Lessons Learned (running log)

One entry per mistake or wrong assumption that cost time. Each entry: date · symptom · root cause · prevention (rule or check). Newest first. When a prevention changes how code must be written, it also gets a one-line rule in `frontend/.claude/rules/*.md`.

## 2026-10-07 — foreigners got a 500 on "Criar conta"
- **Symptom:** a Paraguayan attendee (passport, `+595` phone) got `500 {"message":"Erro interno do servidor"}` on registration, right after ADR-014 shipped. Asaas and the `users_foreigner.sql` migration looked like suspects but were not involved.
- **Root cause:** `PhoneInputE164` sends E.164 digits without `+` (`595981123456`), but every server caller ran `normalizePhoneE164(phone, "BR")`, which parsed those digits as a *Brazilian national* number (`+55595…`), found it invalid and threw. The register route called it inline in `createUser({...})`, so the plain `Error` hit the generic 500. Brazilians never noticed because their digits start with `55`. Some foreign numbers were silently corrupted instead: US `12025550100` was stored as BR `5512025550100`. Every test fixture was Brazilian.
- **Prevention:** `normalizePhoneE164` reads digits-only input as E.164 and uses `defaultCountry` only for formatted input. Register maps a bad phone to 400 like the other callers. Identity/phone tests carry a non-BR fixture, and a route-level integration test registers a foreigner. Rules added to `testing.md` and `error-handling.md`.

## 2026-09-03 — old contact info survived in emails after code fix
- **Symptom:** footer was updated but "Informações Importantes" in the email body still showed `99860-6833`.
- **Root cause:** courtesy, reminder, and communicate email bodies are stored in the database (`events.courtesy_template`, `reminder_templates.body`, `communicate_templates.body`). The admin typed old contact info into the TipTap editor and saved it. Changing `shared/contact.ts` only fixed the code-generated footer — the DB body was untouched.
- **Prevention:** `migrateTemplateContactInfo()` runs on every template before `renderTemplate()` as a runtime guard. SQL migration `sql/update_contact_info_in_templates.sql` fixes templates at rest. When contact info changes, grep the DB template columns too, not just code.

## 2026-09-02 — courtesy e-mail showed "Cau�" while the rest of the Portuguese was fine
- **Symptom:** `{nome}` rendered as `Cau�` (U+FFFD) in a courtesy mass e-mail; template copy (`satisfação`, `Farmácia`) was correct.
- **Root cause:** Excel in Brazil saves CSV as Windows-1252. The mass-send route decoded the upload with `buffer.toString("utf-8")`, which replaces the Latin-1 byte for `ê` with �. The template itself is typed in the browser (real UTF-8).
- **Prevention:** always decode CSV uploads with `decodeCsvBuffer` (UTF-8 if valid, otherwise Latin-1). Never `csvBuffer.toString("utf-8")` on an Excel export.

## 2026-09-02 — a reported bug was already fixed in production
- **Symptom:** the home-page cover crop was on the bug list, but production already rendered it correctly; the reporter's screenshot was taken minutes before that morning's deploy.
- **Root cause:** bug reports carry photos, not timestamps, and this branch auto-deploys, so "reported" and "current" can differ by minutes.
- **Prevention:** before planning any UI fix, open production and read the computed style ([[70-Operations/Verifying-UI-Fixes]]). It removed a whole phase of work here.

## 2026-09-02 — "Baixar" buttons did nothing on phones
- **Symptom:** QR download and certificate buttons silent on mobile; the reports themselves arrived through WhatsApp (in-app browser).
- **Root cause:** a detached data-URL anchor and `window.open` — both no-ops in in-app browsers and in iOS Safari with pop-ups blocked. The same defect was also sitting on the boleto button in `PaymentModal`, where it blocked a payment.
- **Prevention:** ADR-008; rule in `frontend.md`; when one instance of a browser-API bug is found, grep for every other call of that API before closing the task.

## 2026-09-02 — ProfilePage test hung forever
- **Symptom:** `vitest run ProfilePage.test.tsx` never finished (killed at 2 min).
- **Root cause:** the `useAuth` mock returned a fresh object literal on every call; `ProfilePage` runs `profileForm.reset(currentUser)` in a `useEffect` keyed on `[currentUser]`, so each render produced a new identity and re-triggered the effect.
- **Prevention:** module-mock return values that feed a `useEffect` dependency must be hoisted to a module-level constant so their identity is stable across renders.

## 2026-09-02 — profile tabs overlapped on phones
- **Symptom:** four tab labels drawn on top of each other at 390px.
- **Root cause:** `TabsList grid-cols-4` + shadcn `TabsTrigger whitespace-nowrap`, no mobile breakpoint. Measured at a 358px card: "Informações Pessoais" needed 117px inside an 88px cell.
- **Prevention:** any `TabsList` with more than three labelled tabs needs a `<sm` layout (2-column grid or scroll), a 44px touch target, and a jsdom class test; rule in `frontend.md`.

## 2026-09-02 — three different support numbers hard-coded
- **Symptom:** e-mails showed two old numbers, the site a third.
- **Root cause:** copy duplicated in five places, no shared constant.
- **Prevention:** customer-facing contact data only via `shared/contact.ts`; rule in `code-quality.md`.

## 2026-09-02 — free/courtesy tickets said "pagamento confirmado"
- **Symptom:** free-event and courtesy attendees received a payment confirmation for something they never paid.
- **Root cause:** one inline template for three flows; no field distinguished them.
- **Prevention:** transactional e-mail bodies live in `server/utils/*Template.ts` with unit tests; flow-specific copy is selected by an explicit **required** field (`confirmationKind`) so `tsc` flags every caller when a new flow appears.

## 2026-09-02 — editor blank lines missing on the public event page
- **Symptom:** admin sees blank lines in the description editor; `/event/:id` shows none.
- **Root cause:** a trailing `<br>` inside `<p>` renders as nothing in browsers but ProseMirror shows it; the display component only handled empty `<p></p>`. Existing `[&_br]:block [&_br]:mb-[0.65em]` styling did not help, because a trailing `<br>` still collapses.
- **Prevention:** description HTML always goes through `prepareDescriptionHtmlForDisplay`; when the editor and the page disagree, diff the stored HTML against what ProseMirror renders (`ProseMirror-trailingBreak`) and measure the real gap in a browser before touching CSS.

## 2026-09-02 — event poster cropped on `/event/:id`
- **Symptom:** sponsor row cut at desktop, sides cut on phones.
- **Root cause:** fixed-height frame (`h-64 md:h-96`) + `object-cover`; ADR-007 fixed the home card only, and its "detail page unchanged" line was read as a decision rather than a scope note.
- **Prevention:** uploaded artwork is never cropped: any event poster goes through `EventCoverImage` in an `aspect-video` frame. Rule added to `frontend/.claude/rules/frontend.md`.

## 2026-09-02 — `.claude/rules` is gitignored, vault is only untracked
- **Symptom:** `git add frontend/.claude/rules/documentation.md` refused: "paths are ignored by one of your .gitignore files".
- **Root cause:** `frontend/.gitignore:3` ignores `.claude/`. The rules are local-only, so they never reach CI, teammates or a fresh clone. `CDPI-Pass-Vault/` is *not* ignored, merely untracked, so it can be committed if we choose to.
- **Prevention:** do not plan commits for `frontend/.claude/**`; write rules there for the local agent and put anything a teammate needs into the vault instead. Check `git check-ignore -v <path>` before planning a docs commit.

## 2026-09-02 — push to `hotfix-frontend-update` deploys to production
- **Symptom:** the deploy note described a manual Docker flow; the CI workflow actually deploys on push to `hotfix-frontend-update`.
- **Root cause:** `Deployment.md` was never updated after `da67741 CI: deploy via git+PM2`.
- **Prevention:** infra/CI change → update `50-Infrastructure/Deployment.md` in the same commit (rule already in `documentation.md`; now also listed here).

## 2026-10-07 — `drizzle-kit push` "had bugs" and wanted to TRUNCATE users
- **Symptom:** pushing schema changes to Neon with Drizzle did not work; the push prompt offered 74 statements, including `TRUNCATE users CASCADE` and `TRUNCATE orders CASCADE`.
- **Root cause:** years of hand-written `sql/` files created checks, indexes, FK names, types and NOT NULLs that `shared/schema.ts` never declared. Push treats the schema as truth, so it tried to undo all of it. drizzle-kit 0.30 also turns any type change on a non-empty table into `TRUNCATE ... CASCADE`, and it misreads empty-array defaults (patched). Forbidding push hid the drift instead of fixing it.
- **Prevention:** `schema.ts` declares every DB object; `pnpm db:diff` must be 0 before and after a change; backfills and type changes go in a transactional `sql/` file applied before the push. See [[60-Decisions/ADR-015-drizzle-kit-push]] and `frontend/.claude/rules/database.md`.

## 2026-10-08 — "Área de interesse" was enforced on three routes but sent by one client
- **Symptom:** found during the ADR-016 analysis; no user hit it (prod had 0 events with interest areas). `resolveOrderInterestArea` rejects `POST /api/orders` and `POST /api/courtesy/redeem` with 400 "Selecione uma área de interesse" when the event has labels, but only `useFreeSubscribe` sends `interestArea`. `PaymentModal` and `CourtesyRedeemPage` never do, so paid checkout and courtesy redeem would fail on such an event.
- **Root cause:** the server gate was added to all three inscription routes, while client wiring and tests covered only the free-subscribe path.
- **Prevention:** a new inscription gate ships with a client caller **and** a test for each of the three entry points (`PaymentModal` → `/api/orders`, `useFreeSubscribe` → `/subscribe`, `CourtesyRedeemPage` → `/courtesy/redeem`). Phase 3 of [[70-Operations/Plan-Event-Registration-Forms]] replaces the gate and wires all three.

## 2026-10-08 — drizzle-kit push silently ignores a changed CHECK expression
- **Symptom:** while rehearsing ADR-016 Phase 2 locally, `pnpm db:diff` listed the new columns and DROP NOT NULLs but none of the three loosened `*_identity_document_chk` constraints; after the push it reported 0 statements while the database still had the strict checks.
- **Root cause:** drizzle-kit 0.30 push matches CHECK constraints by name only. The runbook assumed it would "drop and re-add".
- **Prevention:** a changed CHECK ships as a `sql/` drop + add applied before the push; verify with `pg_get_constraintdef` against a DB freshly pushed from `schema.ts`. Rule in `frontend/.claude/rules/database.md`.

## 2026-10-08 — a PATCH that treats a missing list as "empty" makes every caller resend it
- **Symptom:** found while replacing "Área de interesse" with the ADR-016 form. `PATCH /api/admin/events/:id` read a missing `interest_areas` as `[]`, so the "Encerrar vendas" toggle had to resend the whole list, or it would silently wipe the event's labels.
- **Root cause:** "missing" and "cleared" were the same input for a collection field.
- **Prevention:** on PATCH, a missing collection field means **unchanged**; clearing is an explicit empty value. `registration_form` follows this, and removing a question archives it instead of deleting it, so answers keep their export column. Integration test: "leaves the form alone when an admin edit does not send it".

## 2026-10-08 — prod schema applied on an earlier "go", minutes before a "staging only" message
- **Symptom:** the ADR-016 Phase 2 schema was applied to the Neon production branch after the owner wrote "you can do it"; minutes later they asked to change only staging until everything is clear. The change was additive and today's prod code passed its 22 integration tests on it, so it was kept, with a backup branch (`backup-pre-adr016-phase2-2026-10-08`).
- **Root cause:** a prod write was treated as still approved after the owner's scope had narrowed.
- **Prevention:** right before any prod DB write, re-confirm in the same turn; prove compatibility first by running the prod commit's integration suite against the new schema on a local DB; take a Neon backup branch.

## 2026-10-08 — the profile form sent the whole stored user back, so a nullable column broke "Salvar"
- **Symptom:** found by a red test while building ADR-016 Phase 4: an account from the four-field signup (no address, no birth date) clicking **Salvar Alterações** got 400, because ProfilePage submitted the full `/api/auth/me` object and `PUT /api/profile` rejects `address: null` / `birthDate: null`.
- **Root cause:** the form's values were the raw user row, so making a column nullable silently changed what the client sends.
- **Prevention:** forms send an explicit payload of the fields they edit (`profileUpdatePayload`), leaving empty optional fields out; when a column becomes nullable, grep its client readers and writers in the same PR.

## 2026-10-08 — Keyboard users lost "+55" in the phone field
- **Symptom:** since PR #2, tabbing into *Telefone* on `/register` and typing `11987654321` showed `+1 1 987 654 321` and `POST /api/auth/register` returned 400 "Telefone inválido". Clicking into the field worked. Typing `+595981123456` after a click gave `+55 595981123456` (400). Some Brazilian numbers turned silently into valid foreign ones (`51…` Peru, `33…` France).
- **Root cause:** `PhoneInputE164` (react-phone-number-input, `international` + `defaultCountry="BR"`, editable calling code) pre-fills `+55`. Keyboard focus selects the whole value, so the first digit replaced `+55` and became the calling code. A `+` typed after `+55` was dropped by the parser. Every test clicked into the field; none used Tab.
- **Prevention:** the component moves the caret to the end on focus, keeps the calling code when a digit is typed over a selection that includes the `+`, and lets a typed or pasted `+…` replace a lone calling code. `normalizePhoneE164` reads digits that are no valid E.164 number as Brazilian (never overriding a valid E.164 reading). Component tests cover the Tab path, select-and-retype and the `+595` typed/pasted paths; the fix PR records a Chromium run where both the Tab and the `+595` paths get 201. Trade-off of the server fallback: a foreign number that libphonenumber rejects but that also reads as a valid BR number is stored as +55 instead of returning 400.

## 2026-10-08 — Foreign card checkout failed with a generic 500, and local dev charged production Asaas
- **Symptom:** on 2026-10-06 a foreign buyer's card checkout returned 500 "Erro ao processar pagamento". The log held the raw Asaas body: 400 "Sua conta não tem permissão para gerar pagadores estrangeiros…" + "O CPF/CNPJ informado é inválido.".
- **Root cause:** `asaasService` hardcoded `https://api.asaas.com/v3` and ignored `ASAAS_API_URL`, so local dev with a production key hit production. Every Asaas error became `Error("…" + JSON.stringify(body))`, logged raw, and the route answered 500 for all of them. The vault described the URL as configurable, so nobody looked.
- **Prevention:** external-service base URLs come from env with a production default and a unit test. Asaas HTTP errors throw `AsaasApiError` (status + codes only), and `checkoutPaymentErrorResponse` maps them (503 foreign payers not enabled, 502 other Asaas errors). The client toast uses `parseApiErrorMessage`, never `error.message`.

## 2026-10-09 — a dedupe keyed on the account blocked people a sponsor had invited
- **Symptom:** found by the pre-merge refuter on the combined ADR-016 branch, reproduced against a local server: an account that redeemed a courtesy for a teammate could no longer subscribe itself (409), and a 5-ticket online courtesy link accepted only one attendee per account (400). Prod code was not affected.
- **Root cause:** ADR-016 added the account id to the "already registered" check because 4-field accounts may have no document, but courtesy orders belong to the redeeming account, not the attendee.
- **Prevention:** an inscription dedupe matches the person who attends: own inscriptions by account (`courtesy_attendee_id IS NULL`), courtesies by the attendee's document or e-mail. Integration tests cover sponsor → teammates and sponsor → self.

## 2026-10-09 — attaching required questions after launch breaks tabs on the old bundle
- **Symptom (caught at design time):** adding required `legacy-*` questions to live events makes any browser tab still running the pre-deploy bundle send `POST /api/orders` / `/subscribe` without `answers`, which would 400 for every old-bundle buyer.
- **Root cause:** the answers gate (`resolveRegistrationAnswers`) trusts only `body.answers`, and a form definition change on the server is visible to clients that cannot render it.
- **Prevention:** when a required question can be derived from data the server already has (here the account profile), the route fills the missing answer before validation (`withLegacyProfileAnswers`); the same question on the courtesy route uses the attendee, never `req.user`, because the redeeming account may be someone else. Integration tests run the old-bundle request (no `answers`) for free, paid (card and PIX) and both courtesy modalities, with a foreigner case.


## 2026-10-09 — a user response leaked a pending verification code, and a courtesy link leaked the meeting password
- **Symptom:** ADR-016 refuter S1/S2, reproduced with integration tests: `GET /api/auth/me`, `PUT /api/profile` and `PUT /api/profile/identity` returned `emailVerificationCode` and its expiry; `GET /api/courtesy-links/:code` (no login) returned `meetingUrl` and `meetingPassword`.
- **Root cause:** each route hand-stripped one field (`const { password, ...rest } = user`) or returned the raw event row, so every column added later leaked by default.
- **Prevention:** one sanitizer per entity, used by every route that returns it (`toPublicUser`, `toPublicEvent`); tests assert the secret keys are absent.

## 2026-10-09 — check-then-insert let eight concurrent subscribes create five orders
- **Symptom:** N parallel `POST /api/events/:id/subscribe` of one account (double click, two tabs) created several paid orders for the same event.
- **Root cause:** `isAlreadyRegisteredForEvent` ran, then `createOrder`, as two statements with no lock. A unique index is not an option: prod already has 7 (user, event) groups with several legitimate paid orders.
- **Prevention:** the check and the insert share one transaction holding `FOR UPDATE` on the event row (`createFreeSubscription`), like the courtesy claim. Integration test fires 8 concurrent requests for a Brazilian and a +595 account and expects exactly one order. Still open: `/courtesy/redeem` checks before its claim transaction.

## 2026-10-09 — flaky tests: one real race, the rest CPU starvation of the first, heaviest test
- **Symptom:** `EventDetailsPage.test.tsx` "switches an override-price code…" failed ~1 run in 5; `NpsCertificateModal.test.tsx` and the first test of `AdminEditEventPage.test.tsx` failed (`Test timed out in 5000ms`, `Unable to find a label`) only when the whole suite ran with competing CPU load.
- **Root cause:** (1) the override-price test asserted `Promoção aplicada` with `getByText` right after `Comprar Ingresso` appeared, but that text needs a second request (the promo lookup) issued after the cortesia lookup answered; it only passed when the mock answered fast enough. Reproduced deterministically by delaying that second response. (2) The NPS/admin tests are the heaviest interactions (Radix Select via `userEvent`, role-with-name queries over a large form) and run first in their file, so the cold render and the macrotask yield per user action exceed the default 5 s / 1 s budgets when workers compete for CPU; the per-test work was ~290 ms alone and 3 to 5 s under load.
- **Prevention:** assert anything that depends on a later request with `findBy*`, and pin the order by delaying that mock; interaction-heavy tests use `userEvent.setup({ delay: null })` and cheap queries. No retries and no longer timeouts were added.

## 2026-10-09 — a phone backfill that normalised by length would corrupt foreign numbers
- **Symptom:** found by the round-2 refuter: re-running `sql/phone_e164_backfill.sql` turns the valid foreign numbers `12025550123` (US) and `34612345678` (ES) into `5512025550123` / `5534612345678`, and its sanity gate (10-15 digits) still passes.
- **Root cause:** step 2 treats every 10-11 digit string as a Brazilian domestic number, true when all phones were "(11) 98765-4321" but false once foreign E.164 numbers are stored as digits (ADR-016 signup).
- **Prevention:** the historical script only got a DO NOT RE-RUN header; `sql/phone_parenthesized_br_fix.sql` is scoped to the rows it reformats (`^\(`) and its integration test asserts foreign numbers stay unchanged and a re-run is a no-op.

## 2026-10-09 — foreign card checkout sent the passport as `cpfCnpj`, and Asaas refused the customer
- **Symptom:** found by the first check against the real Asaas **sandbox** (owner's `ASAAS_API_KEY_SANDBOX`). `POST /api/orders` by card for a foreign account answered 502 "Não foi possível gerar a cobrança agora", because Asaas rejected `POST /customers` with 400 `invalid_object` "O CPF/CNPJ informado é inválido."
- **Root cause:** `createForeignCardPayment` put the passport in `cpfCnpj`. Asaas validates that field as a Brazilian document even with `foreignCustomer: true`. The unit and integration tests mocked Asaas, so they never saw the refusal, and one test even asserted the passport was sent.
- **Fix:** the foreign customer is created with `foreignCustomer: true` and `externalReference` (our user id) only. The passport stays on our order (`orders.foreign_document`). Sandbox proof: the same payload without `cpfCnpj` → 200 and a `CREDIT_CARD` charge with a `sandbox.asaas.com` invoice URL. App flow: card order for a +595 account → 201.
- **Prevention:** when payment code changes, run one check against the Asaas sandbox. The local fake only proves our side of the contract.


## 2026-10-09 — card bought through a payment link: the webhook could miss the order, then count it twice
- **Symptom:** found while testing the webhook on the Asaas sandbox (ngrok → `POST /api/webhooks/asaas`). PIX and boleto finalized because their payment carries our order id in `externalReference`. The card checkout uses a **payment link**, and the order stores the link id. A link purchase is a new `pay_…` per installment whose `paymentLink` is that link id, and the docs never say that the link's `externalReference` is copied. The handler only tried `externalReference`, then `payment.id`, so the order could stay `pending` forever.
- **Root cause, part 2 (reviewer):** once the link id matched, every installment resolved to the same order. `finalizeOrderPaidLikeWebhook` read a snapshot and then updated unconditionally, so two deliveries, or a delivery plus the check-status poll, both saw `pending` and counted two seats and two tickets. A test with two finalizers holding the same snapshot reproduced it deterministically; a parallel-HTTP test did not.
- **Fix:** paid events resolve `externalReference` → `payment.id` → `paymentLink` (`findOrderForPaidAsaasPayment`). Cancel events still match only the payment id the order holds. `storage.markPendingOrderPaid` flips `pending → paid` in one `UPDATE … WHERE status='pending' RETURNING`; only the caller that claims the row sends the ticket, increments and forwards.
- **Follow-up (owner's card test, same day):** Asaas *does* copy the link's `externalReference` onto each installment payment, so the fallback is a safety net. The atomic claim is what kept the 3 simultaneous installment confirmations to one seat and one e-mail.
- **Prevention:** before any side effect, claim a state change with a conditional UPDATE. Prove races with a deterministic stale-snapshot test, not with timing. Sandbox tips: `POST /v3/sandbox/payment/{id}/confirm` / `/overdue` simulate PIX and boleto. The card checkout pages are behind reCAPTCHA, so cards need a human. Asaas counts only HTTP 200 as delivered.

## 2026-10-09 — duplicate payments were never refunded: the "refund" was a DELETE
- **Symptom:** found while mapping hardening batch 1. `handleDuplicatePaidInscription` called `asaasService.cancelPayment`, which sends `DELETE /payments/{id}` (or `/paymentLinks/{id}`). Asaas deletes only unpaid charges, so a received duplicate kept the money; the error went to a log nobody read. The same snapshot-then-write pattern let two orders of one CPF both become paid, and a throw after `markPendingOrderPaid` left a paid order with no seat and no ticket (the redelivery saw `already_paid`).
- **Fix (PR #15):** `storage.claimPaidOrder` does the duplicate check, the conditional status flip, the seat and the courtesy usage in one transaction that locks the event row. Refunds go through `asaasService.refundReceivedPayment` on the **received** payment id: card plans use `/installments/{id}/refund`, boleto uses `/bankSlip/refund` (the buyer fills Asaas's `requestUrl`, which we e-mail), PIX uses `/payments/{id}/refund`. The e-mail goes out only when Asaas accepts the refund, since a second refund is refused.
- **Prevention:** "cancel" and "refund" are different Asaas calls. Every money path needs a test that asserts the exact Asaas request (method + path). The integration suite records them by stubbing `makeRequest`.

## 2026-10-12 — the Asaas stub agreed with our code, the real sandbox did not
- **Symptom:** the first real sandbox run of PR #15 found three things the stubbed tests had passed. A boleto refund always failed with "cliente não possui um celular válido": we create customers with `phone` only, and Asaas accepts only a national `mobilePhone` (`11…`; it stores `5511…` but rejects it). A refund awaiting authorization (`AWAITING_CRITICAL_ACTION_AUTHORIZATION`, on in prod too) keeps the payment `RECEIVED`, so a redelivery logged `REFUND_FAILED` and invited a manual second refund. And the same card payment link could be bought twice; Asaas refuses to `DELETE` a link that has charges.
- **Fix (PR #15, a626294):** the boleto refund sets the buyer's national phone first (`brazilianNationalPhone`); `isRefunded` also reads `refunds[]`; the paid claim switches the card link off (`PUT /paymentLinks/{id} {active:false}`, installments untouched). The integration stub now models the sandbox behaviour.
- **Prevention:** a stub encodes our assumptions about the provider, so it cannot catch a wrong one. Every new Asaas call gets one real sandbox run before merge, and the stub is updated to what the sandbox actually answered. Sandbox card checkouts are paid by Playwright (`sandbox-check/card-pay.mjs`), not by a human.

## 2026-10-13 — deploy day: the agent cannot merge, the deploy skips the e-mail worker, ECR rate-limits too
- **Symptom:** deploying batch 1 (PR #15) hit three things the plan had not written down. Claude Code's auto-mode classifier refused `gh pr merge` ("Merge Without Review"), so the owner ran the merge. The deploy restarted `cdpi-pass` but left `cdpi-pass-email-worker` on its 2-day-old process. And CI's first pull from `public.ecr.aws` (E3) also got `toomanyrequests: Rate exceeded`; the runner's automatic retry succeeded.
- **Fix:** none needed for batch 1. The refund e-mail is sent by the web process, and the only change in the worker's import graph was an `export` keyword. The merge command is now handed to the owner in the prompt, ready to paste with `!`.
- **Prevention:** a deploy prompt states that the owner runs `gh pr ready` + `gh pr merge` themselves and stays at the keyboard. Any change under `server/workers/`, `emailService.ts`, `storage.ts` or the templates the worker renders needs `pm2 restart cdpi-pass-email-worker` until `deploy.yml` restarts it (proposed in hardening batch 2). ECR public is not immune to rate limits; a red "Initialize containers" step is a rerun, not a code failure.

## 2026-10-13 — hardening batch 2: integration files share one database
- **Symptom:** three failures came from the shared integration database, not from the code under test.
  - On the BRT dev machine, a freshly written verification code read as expired.
  - The batch-2 users hit `users_cpf_unique` only when the whole suite ran.
  - The merge of PR #17 failed in CI with `deadlock detected` (40P01) in `registrationFormsSchema.integration.test.ts:193`, a test from ADR-016, so the deploy was skipped. The rerun of run `38429128533` passed.
- **Root cause:**
  - **Timestamps:** the fixture passed a JS `Date` to raw `pg`. node-postgres sends it in the machine's zone, a `timestamp without time zone` column keeps that wall time, and Drizzle reads it back as UTC: 3 h off in BRT. CI runs in UTC and never sees it.
  - **CPF prefix:** test files run in parallel on one database, and `888.` was already used by `eventOnlineAccess`.
  - **Deadlock:** the ADR-016 test ran `ALTER TABLE` on `users`, `courtesy_attendees` and `orders` inside one transaction. It held `ACCESS EXCLUSIVE` on `users` while another file's transaction held a share lock on `courtesy_attendees` and waited for `users`. Batch 2's concurrent courtesy redeems made that overlap more likely.
- **Fix:**
  - Fixtures write `date.toISOString()`.
  - Batch 2 uses CPF prefix `777.`.
  - The DDL test now runs on empty `CREATE TEMP TABLE … (LIKE public.… INCLUDING CONSTRAINTS)` copies (docs PR after #17). The new test "takes no ACCESS EXCLUSIVE lock on the tables the other suites use" found 3 such locks with the old approach and 0 now. The full suite passed twice, 129 passed / 4 skipped.
- **Prevention:** rules in `testing.md`: ISO strings for raw `pg` timestamps, one CPF prefix per file (999, 888, 111, 123, 222 and 777 are taken), and no DDL on shared tables. `deployment.md`: rerunning a red job ships the deploy, and the flaky test is fixed in the next PR. The CI rerun broke the "never retry to make it pass" rule once, to get the launch-day deploy out, and this fix pays that back.

## 2026-10-13 — hardening batch 2: tests that pass for the wrong reason, and a gate on existing accounts
- **Symptom:**
  - The C5 concurrent-redeem test passed in a full-file run on unfixed code.
  - Deleting the Make.com post broke an e2e test, even though nothing was wrong.
  - At deploy time, the verified-e-mail gate (#16) would have stopped 35 existing accounts at checkout on launch day.
- **Root cause:**
  - **Race test:** it only fails when the requests overlap, and in the full run the timing hid it. Run alone, it failed 10/10.
  - **e2e test:** `network-guard.spec.ts` asserted that the guard *blocked* the outbound call. With the call gone there was nothing to block, so it failed.
  - **The gate:** the PR counted the affected accounts but left what to do with them to deploy time.
- **Fix:**
  - C5 was proven by running the test alone in a loop: 0/10 before the change, 10/10 after.
  - The e2e test now asserts "a paid finalize makes no outbound call", after a later log marker.
  - The owner grandfathered the 35 accounts before the merge, with the same write that `verify-code` makes. Afterwards, 0 of 816 users were unverified.
- **Prevention:** rules in `testing.md` (race tests in a solo loop, rewrite guard tests when a call is removed) and `deployment.md` (a new gate on existing accounts ships with a decision for the rows it blocks).

## 2026-10-13 — pre-freeze deps: pnpm policies apply to frozen installs, and printing is off by default

- **pnpm policies:** pnpm 11 re-checks every lockfile entry against `minimumReleaseAge` and `trustPolicy` on every install, `--frozen-lockfile` included, so CI and the EC2 deploy run it too ("Lockfile passes supply-chain policies (993 entries)" is in the deploy log). The first attempt (7-day age, no trust cutoff) rejected 8 entries already in the lockfile: 3 playwright releases 6 days old, and 5 legitimate old-major maintenance releases that trip `no-downgrade`. Merged as is, it would have failed Run Tests and blocked every deploy.
  - **Fix:** 3-day age, plus `trustPolicyIgnoreAfter: 43200` (30 days).
  - **Prevention:** after any change to `pnpm-workspace.yaml` policies, run `pnpm install --frozen-lockfile` locally and see "Lockfile passes" before pushing.
- **A range blocks the patched version:** `qs` 6.16.0 is outside express 4.22.2's `~6.15.1`. Bumping express alone still left body-parser 1.20.6 on `qs` 6.15.3, which is the copy that parses request bodies. Check every parent in `pnpm why` after a bump, not just the first one.
- **Printing is off per event:** without an `event_print_settings` row, a check-in queues no label. Prod had never queued a print job as of 2026-10-13. See [[20-Backend/Print-Coordinator]]. Check the toggle before every in-person event.

## 2026-10-15 — print dry run: Windows driver, wrapped names, idle WebSocket

- **Windows:** "Não foi possível conectar" after picking the Zebra = WebUSB `open()` denied by the Windows printer driver. Fixed on the PC with Zadig → WinUSB, no code change. See [[20-Backend/Print-Coordinator]].
- **Name over company:** both flows used the same template; a long "First Last" wrapped to a second line that the company layout did not reserve. The manual test only looked right because its name was short. Fix: one-line fitted fonts, company placed under the real name height, company upper-cased.
- **WebSocket dropped after ~30–60 s idle** and never came back: no heartbeat, no reconnect. Fix: server ping every 20 s + client reconnect with backoff.
- **Prevention:** test label layout with the longest realistic names (render the ZPL), not one short sample; every long-lived WebSocket needs a heartbeat under the proxy idle timeout and a client reconnect loop.

## 2026-10-21 — manual print as typed, "Nome com Dr./Dra."

- **Request:** the owner wanted manual labels printed exactly as typed, and Dr./Dra. + first + second name from the manual form. Automatic queue and reprint stay first + last.
- **Layout rule:** once a field can wrap, every Y position must use its real height (`fieldHeight`), never `dots`. Otherwise a 2-line name overprints the company, which was the 2026-10-15 bug. The manual name now wraps only when one line would print under 50 dots. Checked with labelary renders of 40–66 char fake names.
- **"Second name" in pt-BR** skips connectors (de, da, do, dos, das, e): "Ana de Souza" prints as "Ana Souza", not "Ana de".

## 2026-10-21 — Security Scans red on a merge that changed no dependency

- **Symptom:** the PR #23 merge run (`39652913452`) had green tests and a green deploy, but Security Scans failed at "Dependencies and IaC (trivy)". #23 only touched print code.
- **Root cause:** the scanner database refreshes daily. Two new follow-redirects advisories (CVE-2026-111755/111756, published 2026-10-20) matched the unchanged lockfile, so every push and PR stays red until the dependency is fixed, whatever it contains. See [[70-Operations/Security-Backlog#27. `follow-redirects` 1.16.0: credential headers on cross-origin redirects (CVE-2026-111755, CVE-2026-111756, HIGH)|backlog #27]].
- **Prevention:** before blaming the PR, read trivy's table (package, CVE, fixed version) and check whether the lockfile changed. Reproduce locally with the pinned scanner versions from `deploy.yml`, verified by SHA256; the osv-scanner and `pnpm audit` cross-checks only reach the step summary. To prove "no outbound call" in a test, spy on `fetch` plus `node:http`/`node:https` `request` and `get`, not on one HTTP library's mock.

## 2026-10-21 — a committed build served stale pages during every deploy

- **Symptom:** found while removing the unused `axios` dependency: `frontend/dist` was tracked and was a build from 2026-05-20.
- **Root cause:** the deploy ran `git checkout -- frontend/dist` before building, to stop the pull from conflicting with the previous build. That put the stale May `index.html` and assets back on disk, so the box served them for the whole build, and a failed build left them there for a later pm2 restart. The build itself (vite `emptyOutDir`, tsup `clean`) wiped them every time, which hid the problem.
- **Fix:** untrack `frontend/dist` and ignore it. Because the transition deploy still sees it tracked and modified, the deploy keeps a tolerant `git checkout -- frontend/dist` for that one run and copies the rollback snapshot back after the pull. Proven with a local bare-origin simulation, old script vs new.
- **Prevention:** never commit build output; a deploy step that "restores" a path to make a pull work must be checked for what it leaves on disk during the build. Test a git-state migration on a throwaway clone with the real script lines, including the second run. Put new ignore rules in the tracked root `.gitignore`: it ignores the name `.gitignore`, so a new `frontend/.gitignore` would need `git add -f` and would silently overwrite the owner's local, ignored `frontend/.gitignore` on pull.
