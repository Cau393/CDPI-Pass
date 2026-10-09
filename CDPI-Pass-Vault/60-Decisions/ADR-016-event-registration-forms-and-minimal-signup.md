# ADR-016: Per-event registration forms and minimal signup

- **Date**: 2026-10-08
- **Status**: accepted. The sign-up CTA shipped in PR 1. Phases 2–4 are pending; see [[70-Operations/Plan-Event-Registration-Forms]].

## Context

CDPI Pass now serves two audiences:

- **Online attendees:** often first contact, frequently free events, sometimes abroad.
- **In-person attendees:** need an identity document at the door.

Registration currently requires CPF (or a passport, per [[60-Decisions/ADR-014-foreigner-without-cpf]]), birth date, address, cargo, empresa and Área de Atuação for every account. That is far more than an online attendee needs. LGPD Art. 6º III (necessidade) asks for the minimum data for the purpose. Forced signup and long forms are documented conversion killers: Baymard reports about 19% abandonment when account creation is forced.

Event creators also want to ask their own questions per event. The only existing mechanism is a single "Área de interesse" dropdown (`events.interest_areas`). It was wired only into free subscribe, so paid checkout and courtesy redeem would return 400 on an event that uses it; see Lessons-Learned 2026-10-08.

Asaas requires `cpfCnpj` to create a customer (https://docs.asaas.com/reference/create-new-customer), so **any paid charge needs a document**, online or not.

## Decision

1. **Signup collects Name, E-mail, Password and Phone only**, plus password confirmation and the terms checkbox. Phone stays international (E.164 digits, PR #2). There is no foreigner toggle at signup.
2. **Per-event form.** The creator builds questions with these types: short text, dropdown and radio. Each question has an *Obrigatório* toggle.
   - The definition lives in `events.registration_form` (jsonb) with stable field ids.
   - Answers are a jsonb snapshot on `orders.registration_answers` (`{fieldId, label, value}`). Orders are the tickets.
   - Removing a question that already has answers soft-deletes it (`archived`). Its answers stay exportable.
3. **Locked questions are computed by code, never stored in the form, so no creator can remove them:**

   | Event | Locked questions |
   |---|---|
   | In-person | Document (CPF, or passport for foreigners) + address |
   | Paid online | Document only (the Asaas requirement) |
   | Free online | None |

   Answers are written to the **existing `users` columns** (`cpf`/`is_foreigner`/`foreign_document`, `address`) through `PUT /api/profile/identity`. The document is **write-once**; the address can be updated. Later inscriptions are prefilled and do not ask again.
4. **"Área de interesse" is merged into the builder** as a regular dropdown question via a one-time backfill. `events.interest_areas` and `orders.interest_area` stay read-only until a separately approved contract step.
5. **Birth date, Cargo, Empresa and Área de Atuação** keep their columns but are profile-only. A creator who needs them adds them as custom questions.
6. **Address is a single free-text field**, the existing `users.address`, so foreign addresses work.
7. **Foreigners** become foreign accounts the first time they choose "Sou estrangeiro" in the document question. Everything downstream of ADR-014 is unchanged:
   - card-only checkout;
   - `createForeignCardPayment`;
   - duplicate detection by passport plus `userId`;
   - the `foreign_document` snapshot.
8. **The header shows a visible *Cadastre-se* CTA** (shipped first, PR 1). Entry points use `authEntryHref` so event and courtesy pages survive the sign-up round trip.

## Alternatives considered

- **Collect CPF and address on the online form too.** This violates data minimisation and keeps the friction the change is meant to remove.
- **No CPF on paid online events.** Asaas cannot create the customer, so the charge fails.
- **Asaas hosted checkout collecting payer data.** This is a larger payment rewrite, and the Brazilian path is unverified. Rejected for now.
- **Normalized `event_form_fields` and answers tables (EAV).** These need joins and a pivot for the Excel export; jsonb plus a snapshot is enough at our scale. Revisit only if questions must be reused across events.
- **Storing the locked fields inside the form JSON with a `locked` flag.** A crafted PATCH could remove them. Computing them from modality and free/paid in code makes them impossible to drop.
- **A form-builder library (SurveyJS, Form.io, rjsf).** These are commercial or heavy, or are renderers rather than builders. react-hook-form `useFieldArray` plus shadcn covers v1.
- **Keeping "Área de interesse" separate.** That leaves two dropdown mechanisms, and the existing one had the client wiring gap.

## Consequences

- Identity CHECKs on `users`, `orders` and `courtesy_attendees` are **loosened**: an account or an online order may have no document. Do not re-tighten them once such rows exist.
- Every inscription route must gate on `missingIdentityFields(event, user)` and `resolveRegistrationAnswers`. Never assume `users.cpf` or `users.address` is non-null.
- A document entered wrongly is write-once. Correcting it is a support action ([[70-Operations/Operator-Guides]]).
- The participants Excel gains `Endereço`, `Estrangeiro` and one column per question (archived ones suffixed "(removida)"). `CPF` becomes `CPF / Passaporte`.
- Foreign paid checkout still depends on the open ADR-014 items: an Asaas production foreign-payer enablement, and a sandbox `invoiceUrl` probe.
