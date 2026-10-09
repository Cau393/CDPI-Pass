# Plan: event registration forms + minimal signup

The step-by-step runbook for [[60-Decisions/ADR-016-event-registration-forms-and-minimal-signup]]. Pushing to `hotfix-frontend-update` deploys prod, so never commit to it or to `main` directly. The phases were first planned as one PR each; they shipped instead as **one combined PR, #4 `feat/registration-forms-all`**, which the rollout PRs (#5–#7) were merged into. A phase is done only when its **Done when** list has observed output, written in a PR description.

| Phase | Scope | Status (2026-10-09) |
|---|---|---|
| 0 | Prerequisites (sync, baseline, foreign-card fix) | ✅ except Asaas enabling foreign payers in prod (gate b, pending) |
| 1 | Visible *Cadastre-se* CTA | ✅ in #4 |
| 2 | DB expand (schema only) | ✅ staging and prod applied 2026-10-08 (backup branch `backup-pre-adr016-phase2-2026-10-08`); code in #4 |
| 3 | Form builder + locked fields + answers + Excel | ✅ in #4 |
| 4 | Minimal signup | ✅ in #4 |
| 6 | Rollout ([[70-Operations/Prompt-ADR-016-Rollout]], design [[70-Operations/ADR-016-Rollout-Plan]]): legacy questions (#5), refuter items (#6), Playwright suite (#7), rehearsals | 🟡 code merged into #4; prod SQL awaiting owner approval; see **Deploy checklist** |
| 5 | Docs (part of every PR) | ongoing |

## Who is asked what

| Event | Brazilian | Foreigner | Payment |
|---|---|---|---|
| Free online | custom questions only | custom questions only | none |
| Paid online | CPF (once, saved on account) | passport (once, saved on account) | BR: PIX / boleto / card (`paymentLinks`) · foreigner: international card only (`createForeignCardPayment`) |
| Free in-person | CPF + address | passport + address (free text, any country) | none |
| Paid in-person | CPF + address | passport + address | same as paid online |
| Courtesy in-person | today's courtesy form, unchanged (it has its own foreigner toggle) | same | none |
| Courtesy online | name, e-mail, phone + custom questions | same | none |

Existing accounts that already have a document or an address are never re-asked.

## Phase 0: Prerequisites

1. Work in a **worktree or branch off `origin/hotfix-frontend-update`**, not `main`. Unset its upstream (`git branch --unset-upstream`) so a bare `git push` cannot target the deploy branch.
2. Baseline from the `frontend/` directory: `pnpm run check`, `pnpm run test:frontend`, `pnpm run test:backend`, `pnpm run test:integration`.
   - Write down the counts.
   - On 2026-10-08 they were: tsc 0, frontend 244, backend 342, integration 22.
3. Confirm `pnpm db:diff` against staging reports **0 statements** before touching the schema.
4. **Foreign card checkout is a prerequisite for "foreigners can buy"; give it its own `fix/` PR.**
   - With a sandbox key, `POST /customers` with `foreignCustomer: true` and a passport, then `POST /payments` with `CREDIT_CARD`. It must return an `invoiceUrl` (see [[60-Decisions/ADR-014-foreigner-without-cpf]]).
   - Ask Asaas to enable foreign payers in production.
   - Free and courtesy inscriptions for foreigners do not depend on this.
5. Warn admins **not to configure "Área de interesse" on paid or courtesy events until Phase 3 ships**: those paths do not send the answer and return 400.

## Phase 1: *Cadastre-se* visibility ✅

- `components/Navigation.tsx` (logged out):
  - The desktop header shows *Entrar* (ghost) and *Cadastre-se* (white pill, `nav-register`).
  - The mobile top bar always shows the *Cadastre-se* pill (`nav-register-mobile`), and the menu lists *Entrar* and *Criar conta*.
  - Logged-in users keep *Área de acesso*.
- `lib/authRedirect.ts` `authEntryHref(base, currentPath)` adds `?next=` only for valid return targets (event and courtesy pages, via `getValidatedNextPath`). On an auth page it forwards that page's own `next`.
- `pages/LoginPage.tsx`: the old text link is now a full-width outline button, *Criar conta*, built with `authEntryHref` (an invalid `next` is dropped).
- Proof: tests in `test/components/Navigation.test.tsx`, `test/pages/LoginPage.test.tsx` and `test/lib/authRedirect.test.ts`; Chromium measurements in the PR (pill 116×44, *Entrar* and menu items 44px tall; fits at 360px with no horizontal scroll).

## Phase 2: DB expand (schema only, no behaviour change)

Edit `frontend/shared/schema.ts`. Each change only **adds or loosens**. drizzle-kit truncates tables on type changes, so never change a type here.

| Change | drizzle emits |
|---|---|
| `events.registration_form jsonb NOT NULL DEFAULT '[]'::jsonb`, `.$type<RegistrationField[]>()` | ADD COLUMN |
| `orders.registration_answers jsonb NOT NULL DEFAULT '[]'::jsonb`, `.$type<RegistrationAnswer[]>()` | ADD COLUMN |
| `users.birth_date`, `users.address` | DROP NOT NULL |
| `users_identity_document_chk` → `(is_foreigner = false AND foreign_document IS NULL) OR (is_foreigner = true AND cpf IS NULL AND foreign_document IS NOT NULL)` | **nothing**: push ignores a changed CHECK expression; `sql/registration_forms_loosen_identity_checks.sql` |
| `orders_identity_document_chk` → `NOT (cpf IS NOT NULL AND foreign_document IS NOT NULL)` | same SQL file |
| `courtesy_attendees_identity_document_chk` relaxed like `users`; `courtesy_attendees.birth_date`, `address` DROP NOT NULL | same SQL file; DROP NOT NULL by push |

Add `frontend/sql/backfill_interest_areas_into_registration_form.sql`. It is idempotent and safe to re-run:

```sql
UPDATE events
SET registration_form = jsonb_build_array(jsonb_build_object(
  'id','interest-area','type','select','label','Área de interesse',
  'options',to_jsonb(interest_areas),'required',true,'archived',false))
WHERE registration_form = '[]'::jsonb AND cardinality(interest_areas) > 0;
```

Mark `events.interest_areas` and `orders.interest_area` as deprecated in schema comments. **Do not drop them**; that is a later, separately approved step.

**Rollout order (staging, then prod):**
1. `sql/registration_forms_loosen_identity_checks.sql` (idempotent);
2. `pnpm db:diff` shows exactly 6 statements (2 ADD COLUMN, 4 DROP NOT NULL), no TRUNCATE; then `pnpm db:push`;
3. `sql/backfill_interest_areas_into_registration_form.sql` (idempotent);
4. `pnpm db:diff` = 0, and the three `*_identity_document_chk` from `pg_get_constraintdef` match the SQL file.

Prod schema goes **before** the Phase 2 code is deployed: the new code selects `registration_answers`.

**Done when**
- `pnpm db:diff` on staging shows exactly the statements above, with no TRUNCATE. ✅ 2026-10-08
- After `pnpm db:push` on staging, `pnpm db:diff` shows **0**. If the jsonb default keeps re-appearing, declare it as ``sql`'[]'::jsonb` `` and re-check. ✅ 2026-10-08 (declared that way from the start)
- The backfill has been applied on staging. ✅ 2026-10-08 (0 staging events had labels)
- `pnpm run test:integration` is green.
- The developer pushes prod and confirms with a staging-vs-prod schema compare.

**Rollback:** all of it is additive, and old code ignores the new columns. Once accounts without a document exist (Phase 4), **never re-tighten the CHECKs**.

## Phase 3: Form builder, locked fields, answers, Excel

### Shared rules: `frontend/shared/eventRegistrationForm.ts`

Mirror `shared/interestAreas.ts`: result types plus PT-BR error constants.

**Types**
- `RegistrationFieldType = "text" | "select" | "radio"`
- `RegistrationField = { id, type, label, options: string[], required, archived }`
- `RegistrationAnswer = { fieldId, label, value }`, with `label` snapshotted when answered.

**`parseRegistrationFormField(raw, previous)`**: admin save.
- Limits:
  - max 20 active fields;
  - label 1–120 chars;
  - select/radio need 2–50 unique options of at most 80 chars.
- New fields get server UUIDs.
- A previous id missing from the input is kept with `archived: true`.
- A type change on an existing id is rejected.

**`systemFieldsFor(event)`**
- `presencial`: `["document","address"]`.
- Paid `online`: `["document"]`.
- Free `online`: `[]`.

**`resolveRegistrationAnswers({ fields, body })`**: replaces `resolveOrderInterestArea`.
- Reads `body.answers: Record<fieldId,string>`.
- Required active fields must be non-blank.
- Select/radio answers must exactly match an option.
- Text answers are at most 500 chars.
- Unknown or archived ids are rejected.
- Returns an ordered snapshot.

**Validation reuse:** `refineAccountDocument`, `CPF_FORMAT` and `FOREIGN_DOCUMENT_PATTERN` (`shared/schema.ts`), and `server/utils/validation.ts`. Do not write a second CPF validator.

### Server

**`PUT /api/profile/identity`** (authenticated, next to `PUT /api/profile`)
- Body: `{ cpf }` | `{ isForeigner: true, foreignDocument }`, plus an optional `address` (min 10 chars, free text).
- The document is write-once: `UPDATE users SET … WHERE id=… AND cpf IS NULL AND foreign_document IS NULL`.
  - Already set with a different value: 409 "Documento já informado; fale com o suporte para alterar."
  - Unique violation: 409 "Este documento já está cadastrado em outra conta."
- The `PUT /api/profile` allowlist keeps stripping `cpf`, `isForeigner` and `foreignDocument`.

**`server/utils/inscriptionIdentity.ts`**
- `missingIdentityFields(event, user)` returns `document` and/or `address` when required and absent.
- Routes answer **400** `{ code: "identity_required", missing }`.
- In `POST /api/orders`, this replaces the two ad-hoc "Complete seu CPF/documento" returns.

**`storage.isAlreadyRegisteredForEvent({ cpf, foreignDocument, userId, eventId })`**
- Checks the document when present, and **always** the `userId`.
- Replaces the `cpf!` call sites in `/subscribe` and `/courtesy/redeem`.

**Route wiring**
- `/api/orders` and `/subscribe`: run the identity gate, then `resolveRegistrationAnswers`, then `storage.createOrder({ …, registrationAnswers })`.
  - Everything after the gate in `/api/orders` stays as is: the foreigner card-only rule, `createForeignCardPayment`, the BR `paymentLinks` path, and the order snapshot from `req.user`.
- `/courtesy/redeem`:
  - In-person keeps today's form.
  - Online makes CPF, birth date and address optional in `courtesyRedemptionSchema` (enforced by modality in the route).
  - Also adds `resolveRegistrationAnswers`.
- Stop writing `orders.interest_area`.
- Admin create and edit routes: `parseRegistrationFormField(raw, existing.registrationForm)` replaces `parseInterestAreasField` and `sameInterestAreas`.
- `GET /api/admin/events/:eventId/participants` returns, per row:
  - `address` (`courtesy_attendees.address ?? users.address`);
  - `isForeigner`;
  - `registrationAnswers`;

  plus the event's `registrationForm`, including archived fields.
- Buyer-facing order payloads omit `registrationAnswers` (extend the `withoutBuyerInterestArea` pattern).

### Client

**`components/admin/RegistrationFormBuilder.tsx`**
- Inside `EventFormFields.tsx`, replacing the interest-areas editor, as a "Formulário de inscrição" section.
- Uses `useFieldArray`.
- Each row has:
  - a label input;
  - a type select (disabled once saved);
  - an options editor;
  - an *Obrigatório* switch;
  - up/down reorder;
  - remove.
- Read-only locked rows (with a lock icon) sit on top, computed from the form's `modality` and `isFree`.

**`components/RegistrationFields.tsx`**: the shared renderer, used by both the preview and the attendee dialog.

**`components/EventRegistrationDialog.tsx`** replaces `InterestAreaDialog`.
- Missing document:
  - a CPF input, or "Sou estrangeiro / I'm a foreign visitor" swapping to "Passaporte / Passport";
  - extract the RegisterPage block into `DocumentFields`;
  - the hint "Estrangeiros pagam apenas com cartão de crédito internacional / Foreign visitors pay by international credit card only".
- Address: prefilled and editable.
- Then the custom fields.
- Submit:
  - `PUT /api/profile/identity` when something changed, then invalidate `["/api/auth/me"]`.
  - Then return `answers` to the caller.
  - A 409 is shown inline.
- Skip the dialog when nothing needs asking.

**Call sites**
- `hooks/useFreeSubscribe.tsx`.
- `pages/EventDetailsPage.tsx`, paid path: dialog first, then `PaymentModal` (which adds `answers` to `POST /api/orders`). It keeps reading the refreshed `user.isForeigner` for card-only. On `identity_required`, reopen the dialog.
- `pages/CourtesyRedeemPage.tsx`: hide CPF, birth date and address on online events; append `RegistrationFields`.
- Delete `InterestAreaDialog.tsx` and `InterestAreaSelect.tsx` once nothing imports them.

**`lib/exportParticipantsExcel.ts`**
- Switch from `json_to_sheet` to `aoa_to_sheet` with an explicit header row.
- `CPF` becomes `CPF / Passaporte`.
- Add `Estrangeiro` (Sim/Não) and `Endereço`.
- Then one column per question in form order, then archived ones with " (removida)".
- Duplicate or colliding labels get " (2)".
- Answers are looked up by `fieldId`.

## Phase 4: Minimal signup

**`shared/schema.ts`**
- Add `registerUserSchema = { name, email, phone, password }`.
- Make cpf, birthDate, address, occupation, partnerCompany and areaOfActivity optional in `insertUserObjectSchema`.

**`pages/RegisterPage.tsx`**
- Fields: Nome, E-mail + confirmation, Telefone (`PhoneInputE164`), Senha + confirmation, terms.
- Remove CPF, the foreigner toggle, birth date, address, cargo, empresa and área. Keep `?next=`.

**Register route** (`server/routes.ts`, `POST /api/auth/register`)
- Parse with `registerUserSchema`.
- Drop `resolveRegisterIdentity` and the CPF/passport uniqueness checks.
- Insert a null document, birth date and address.
- Keep the phone 400 and the e-mail verification.

**Fix every `pnpm run check` error** caused by `birthDate`/`address` becoming nullable.
- ProfilePage shows `'Nao aplicavel'` or null as empty.
- CPF stays non-editable in the profile.
- `server/utils/printDisplayName.ts` must treat `'Nao aplicavel'` as no company.

## Phase 5: Docs (every PR)

Follow `frontend/.claude/rules/documentation.md`:
- `20-Backend/API-Endpoints.md` (new body fields, `PUT /api/profile/identity`, `identity_required`, 409s);
- `20-Backend/Event-Modality.md`;
- `40-Database/Schema-Overview.md` + `Normalization-History.md`;
- `30-Frontend/Frontend-Overview.md`;
- `00-Overview/Lessons-Learned.md`;
- an "Como montar o formulário de inscrição" guide in [[70-Operations/Operator-Guides]], including how support corrects a wrong document;
- an amendment note on ADR-014 (the document is chosen at the first in-person or paid inscription, not at signup).

## Verification matrix

Every new test must **fail before** its change. Gates per PR: `pnpm run check`, `pnpm run test:frontend`, `pnpm run test:backend`, `pnpm run test:integration`, all green and at or above the baseline counts.

**Unit**
- `eventRegistrationForm`:
  - limits;
  - archive on remove;
  - type change rejected;
  - `systemFieldsFor` per modality and free/paid;
  - required, wrong option, unknown and archived ids;
  - label snapshot.
- Excel:
  - dynamic columns;
  - "(removida)";
  - label collisions;
  - Endereço and Estrangeiro;
  - an empty list still has headers.
- `registerUserSchema`: 4 fields; phone required.

**Integration** (`server/test/integration/eventSalesFlows.integration.test.ts`)
- Register with 4 fields returns 201 with `cpf` null.
- Free online subscribe with no document returns 201, and the order has neither `cpf` nor `foreign_document`.
- Free in-person with no document returns 400 `identity_required`. After `PUT /api/profile/identity`, it returns 201 and `users.cpf/address` are set.
- The same CPF from a second account returns 409.
- Paid online with no document returns 400.
- A missing required answer returns 400. Answers are snapshotted and survive an archive.
- Online courtesy without CPF returns 201; in-person courtesy is unchanged.
- A duplicate inscription for a user without a document is rejected by `userId`.
- An existing full-profile user is not re-asked.
- **Foreigners:**
  - A +595 account on a free online event returns 201.
  - On in-person it gets `identity_required`, then the passport + address, then 201 with the `foreign_document` snapshot.
  - Their `POST /api/orders` with PIX returns 400; with card it reaches `createForeignCardPayment` (mocked).
  - A duplicate passport returns 409.
  - An existing ADR-014 account is never asked.

**Staging e2e** (390px and 1280px)
- Header CTA, then a 4-field signup, then a free online event with no extra questions.
- An in-person event asks for CPF and address.
- An admin builds a text/select/radio form; an attendee answers; the Excel shows the columns. After an archive, the answer is still there under "(removida)".
- A paid online event in the Asaas sandbox asks for CPF.
- Foreigner walkthrough (card-only `invoiceUrl`). Report it as **blocked**, not passed, until the Phase 0 foreign-card fix lands.

## Deploy checklist (Phase 6)

**Progress (2026-10-09):**
- Step 1 ✅: `ASAAS_API_URL` = `https://api.asaas.com/v3`. `COURTESY_WEBHOOK_URL` **is set** (count 1), so the webhook block stays; see [[70-Operations/Security-Backlog]] #14.
- Steps 2–5 ✅ (17:13 UTC), approved by the owner:
  - Backup branch `backup-pre-adr016-rollout-2026-10-09` (`br-floral-sound-ac45fm5s`).
  - Legacy backfill on prod: 3/3/3, and exactly 3 events have a form.
  - Phone fix on prod: users 797→798 well-formed, attendees 682→685, the 2 foreign numbers untouched, 0 parenthesized left.
- **Asaas sandbox check** (combined code + `ASAAS_API_KEY_SANDBOX`, network guard allowing only `api-sandbox.asaas.com`):
  - BR PIX (QR + payload), boleto and card link → 201 with real sandbox charges; the legacy answers are copied from the profile (3 per order).
  - 4-field account: `identity_required` → CPF + address → PIX 201.
  - Foreigner: PIX → 400, card → **502, fixed by #12** (passport sent as `cpfCnpj`) → 201 with a sandbox invoice URL.
  - The sandbox objects were deleted afterwards (8 payments, 2 links, 5 customers).
- Step 6: the 22:27 BRT 2026-10-09 merge was **cancelled**: the owner wanted the webhook proven on the sandbox first.
- **Asaas sandbox webhook** (2026-10-09, combined code on a local DB, sandbox webhook → ngrok → a proxy that forwards only `POST /api/webhooks/asaas`). Every delivery carried the token and got HTTP 200.
  - Payments were simulated with `POST /v3/sandbox/payment/{id}/confirm` (PIX, boleto) and `/overdue`. Card checkout pages (`/c/…`, `/i/…`) are behind reCAPTCHA, so cards need a human.
  - BR PIX `PAYMENT_RECEIVED` → `paid`, attendees +1, ticket e-mail queued, Make.com blocked by the guard. Boleto → `paid`. 4-field account PIX → `paid` with answers.
  - Replayed delivery ×2 → still one paid order, the counter did not double. Wrong token → 401, nothing changed.
  - `PAYMENT_OVERDUE` and `PAYMENT_DELETED` → pending order `cancelled`. `PAYMENT_CREATED` → 200, no change.
  - **Card through the payment link:** Asaas creates a new `pay_…` (one per installment) with `paymentLink` = the link id. Not proven whether it copies the link's `externalReference`, so the handler now falls back to `paymentLink` (fix PR into #4).
  - **Foreign card:** Asaas has not enabled foreign customers on the account yet (owner, 2026-10-09: next week). Until then the site blocks paid checkout for foreigners; they can still sign up for free events.
  - A foreign invoice paid by hand in the sandbox: `PAYMENT_CONFIRMED`, then `PAYMENT_RECEIVED` 5 s later → `paid` once, attendees +1 only.
  - An overdue PIX paid after the order was cancelled: `PAYMENT_RECEIVED` → the order **stays cancelled**. The customer paid and has no ticket. This is pre-existing prod behaviour; the owner decides whether a late payment should revive the order or alert an admin.
  - Fixes in PR #13 (into #4): `paymentLink` fallback, atomic `pending → paid` claim, foreign paid block.
- **Gate before the deploy (owner, 2026-10-09):** the owner runs a complete purchase and sign-up on **localhost with the staging DB and the sandbox key**, with the sandbox webhook live through ngrok. Only after that is #4 merged into `hotfix-frontend-update`.

Merge #4 only after every step before it has observed output. The why behind each step is in [[70-Operations/ADR-016-Rollout-Plan]].

1. **EC2 env checks** (in the app directory):
   - `grep '^ASAAS_API_URL=' .env`. It must print nothing, or exactly `ASAAS_API_URL=https://api.asaas.com/v3`. The new code reads this variable; any other value, even `https://api.asaas.com` without `/v3`, makes every paid checkout fail with 502. The value is a URL, not a secret.
   - **Webhook:** `grep -c '^COURTESY_WEBHOOK_URL=' .env`. Expected `0`, which means the courtesy webhook is dead code; see [[70-Operations/Security-Backlog]] #14. A `1` means someone consumes it: find them before the deploy, because online courtesies now send null birth date and address.
2. **Owner approves the exact prod SQL:** `frontend/sql/adr016_attach_legacy_questions.sql` (3 event ids) and `frontend/sql/phone_parenthesized_br_fix.sql`. **Never re-run `phone_e164_backfill.sql`:** it would put `55` in front of valid foreign numbers (refuter round 2).
3. **Neon backup branch of prod:** `backup-pre-adr016-rollout-<date>`, parent `br-lucky-rice-acakvihn`.
4. **Backfill on prod.** The live code ignores the column, so this is safe before the merge. Then run the file's verification query: expect `legacy_ids_present = 3` for each of the 3 events. A re-run must change nothing.
5. **Phone fix on prod:** `phone_parenthesized_br_fix.sql`. First run its read-only pre-check; expect 1 `users` row and 3 `courtesy_attendees` rows in the `(00) 00000-0000` shape. It touches only that shape, and rolls back if any is left.
6. **Merge #4 into `hotfix-frontend-update` off-peak, and not on an event day.** The Jornada is on 2026-10-13. The deploy workflow runs and never touches the DB.
7. **Post-deploy smoke test** (prod, real accounts, no purchase):
   - Logged out, the header shows *Cadastre-se*. A 4-field signup sends the verification e-mail.
   - Each live event's CTA. Jornada (online free): the dialog shows the 3 questions, prefilled for a full-profile account. Peptídeos (sales closed): the courtesy link asks for "Área de atuação" only, next to the attendee's own Cargo and Empresa fields. Emagrecimento (paid): the dialog opens, then the payment modal; stop before paying.
   - Admin: the participants Excel for Jornada has "Área de atuação" as the last fixed column, and the old rows show the profile values.
8. **Rollback: prefer rolling forward.** Reverting the merge commit is safe for the data: the backfill is additive and the old code ignores it (rehearsed). But **4-field accounts created after the deploy cannot inscribe anywhere on the old code.** It requires a CPF, its profile has no way to set one, and their profile save fails with 400 (`address: null`).
   - Count them before deciding: `SELECT count(*) FROM users WHERE cpf IS NULL AND foreign_document IS NULL;`.
   - If you do revert, support has to set each person's document by hand, once they have given it, using write-once SQL per account (the same rule as `PUT /api/profile/identity`).
9. **Real Asaas charge:** a low-value charge, only after the owner confirms Asaas enabled foreign payers (gate b).
10. **After the deploy (owner's choice):**
    - Remove the superseded worktrees and branches `register-cta-visibility`, `registration-forms-db`, `registration-form-builder`, `minimal-signup`, `phone-input-keyboard`, `foreign-card-checkout`, the `adr016-*` rollout worktrees and `prod-b0a6359`.
    - Delete the `[REHEARSAL]` rows on staging and the backup branch `backup-staging-pre-adr016-rehearsal-2026-10-09`.

## Out of scope

- Dropping the deprecated interest-area columns.
- Conditional, checkbox and multi-select questions; drag-and-drop.
- Per-ticket-type questions.
- Editing answers after purchase.
- Self-service document change.
