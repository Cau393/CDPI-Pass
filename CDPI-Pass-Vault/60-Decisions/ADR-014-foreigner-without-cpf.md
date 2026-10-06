# ADR-014: Foreigner accounts without CPF

- **Date**: 2026-10-06
- **Status**: accepted

## Context

Registration required a unique Brazilian CPF on `users`, and every later step (free inscription, courtesy, paid checkout, duplicate detection) assumed that CPF existed. Foreign attendees have no CPF. Email is already the account key (`users.email` unique, plus `users_email_lower_unique` on `lower(email)`).

Asaas still requires `name` and `cpfCnpj` on `POST /v3/customers`. `foreignCustomer: true` marks a non-Brazilian payer. The help article updated 23 Sep 2026 ("Como receber pagamentos internacionais") says that, after the production account is enabled, those payers can pay only with an international credit or debit card on a one-off charge or a subscription. PIX, boleto, installments, and payment links are not available. Production enablement is requested from Asaas (up to 4 business days). Sandbox can exercise the flag without that enablement.

The current card path creates `POST /paymentLinks` with `chargeType: INSTALLMENT`. That path stays for Brazilians. It is the wrong call for a foreign payer.

## Probe (6 Oct 2026)

The only local credential is a production key (`$aact_prod_…` in `frontend/.env`) while `ASAAS_API_URL` points at sandbox. Both sandbox hosts rejected it:

- `GET https://api-sandbox.asaas.com/v3/customers?limit=1` → **401** `invalid_environment` ("A chave de API informada não pertence a este ambiente")
- `GET https://sandbox.asaas.com/api/v3/customers?limit=1` → **401** same code

No sandbox key exists on this machine. The probe did **not** create a customer or a charge on the production account. So these are still unverified against a live response:

- whether an alphanumeric passport is accepted in `cpfCnpj` when `foreignCustomer` is true
- whether `GET /customers?externalReference=` returns that customer
- whether `POST /payments` with `billingType: CREDIT_CARD` and no card number returns `invoiceUrl`
- the expected failures of `POST /paymentLinks` and `POST /payments` PIX for that customer

The implementation follows the published contract anyway: send the normalized passport as `cpfCnpj`, set `foreignCustomer: true`, look the customer up by `externalReference` (the user id), and create one credit-card charge. If `invoiceUrl` is missing, the pending order is deleted and checkout returns 500. Re-run the probe with a sandbox key before relying on production foreign charges. Production also needs the Asaas foreign-payer permission; until then this call fails in production and Brazilian checkout is unchanged.

## Decision

- A foreign account sets `users.is_foreigner = true`, `users.cpf = NULL`, and `users.foreign_document` to a normalized passport (5–32 letters or digits, uppercase). A Brazilian account is the reverse. A check constraint enforces that. Do not store a fake CPF or an empty string (a unique column allows many nulls and only one `''`).
- `users.foreign_document` is unique where not null. Email uniqueness is unchanged.
- `orders` and `courtesy_attendees` snapshot exactly one of `cpf` or `foreign_document`.
- Duplicate inscription for a CPF still uses `orders.cpf`. When `orders.cpf` is null, duplicate detection uses the passport snapshot and `user_id`.
- Foreign paid checkout rejects PIX, boleto, and the payment-link call. It uses the one-off credit-card charge above.

## Alternatives considered

- Sentinel CPF (`000.000.000-00`): collides on the unique column, fails the checksum, and is a bad Asaas document.
- Nullable CPF with no passport: Asaas still requires `cpfCnpj`, so paid checkout would have nothing honest to send.
- Sending foreigners down the existing payment link: Asaas documents that links and installments are unavailable for international payers.

## Consequences

- Apply `frontend/sql/users_foreigner.sql` on Neon before deploying.
- Ask Asaas to enable foreign payers on the production account, then confirm a sandbox (or a tiny production) charge returns `invoiceUrl` for a passport `cpfCnpj`.
- Profile cannot change CPF, the foreigner flag, or the passport after registration (allowlist strips them).
- [[60-Decisions/ADR-002-asaas-payments]] still uses Asaas. CPF is required only for Brazilian payers.
