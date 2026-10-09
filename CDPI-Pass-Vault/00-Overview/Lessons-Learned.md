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
