# Plan: event registration forms + minimal signup

The step-by-step runbook for [[60-Decisions/ADR-016-event-registration-forms-and-minimal-signup]]. Each phase is **one feature branch and one PR into `hotfix-frontend-update`**. Pushing to that branch deploys prod, so never commit to it or to `main` directly. A phase is done only when its **Done when** list has observed output, written in the PR description.

| Phase | Scope | Status |
|---|---|---|
| 0 | Prerequisites (sync, baseline, foreign-card fix) | ⏳ |
| 1 | Visible *Cadastre-se* CTA | ✅ PR `feat/register-cta-visibility` |
| 2 | DB expand (schema only) | ✅ staging and prod applied 2026-10-08 (prod via one transaction; backup branch `backup-pre-adr016-phase2-2026-10-08`); code in PR `feat/registration-forms-db` |
| 3 | Form builder + locked fields + answers + Excel | 🟡 implemented on `feat/registration-form-builder` (stacked on Phase 2), not merged |
| 4 | Minimal signup | 🟡 implemented on `feat/minimal-signup` (stacked on Phase 3), not merged |
| — | Combined PR `feat/registration-forms-all` (phases 1–4 + phone + foreign-card fixes) | 🟡 open, not merged; refuter fixes in ([[70-Operations/ADR-016-Refuter-Findings]]) |
| 6 | Rollout: legacy questions on live events, remaining refuter items, Playwright suite, staging rehearsal | ⏳ run [[70-Operations/Prompt-ADR-016-Rollout]]; merge the combined PR only after it |
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

## Out of scope

- Dropping the deprecated interest-area columns.
- Conditional, checkbox and multi-select questions; drag-and-drop.
- Per-ticket-type questions.
- Editing answers after purchase.
- Self-service document change.
