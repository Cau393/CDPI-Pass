# ADR-017: Guest checkout, inline card payment and signup without an e-mail code

- **Date**: 2026-10-28
- **Status**: proposed (draft). Stage 1 is implemented (deploy A); stages 2, 3 and 4 are implemented on stacked local branches (deploy B, after the Stage 5 sandbox rehearsal); stages 5–7 are planned.

## Context
Buying a ticket took: log in (or sign up and type a 6-digit e-mail code), open the event, check out, then pay
the card on an Asaas page. The owner asked (2026-10-28) for a ticketing-site flow: a logged-out visitor opens
the event, clicks **Comprar / Inscrever-se**, fills a short form and pays **on our page** (PIX QR or a card
form), then gets the existing ticket e-mail. Accounts stay optional.

Removing the e-mail code reverses Security-Backlog #16 (hardening batch 2, 2026-10-13). An e-mail is no
longer proof of ownership at signup, so this ADR also records what replaces that proof.

## Owner decisions (interview, 2026-10-28)
| # | Decision |
|---|---|
| 1 | Fully inline card form. PCI **SAQ-D** scope accepted: card data transits our server to Asaas (Asaas has no client-side tokenization) |
| 2 | An e-mail that already has a password account can **buy anyway**, without logging in |
| 3 | Free guests give name, e-mail and phone (`users.phone` stays NOT NULL), plus the ADR-016 identity rules and the event questions |
| 4 | Password flows unchanged: forgot = e-mailed link, change = current password. Only the signup code goes |
| 5 | Cloudflare Turnstile on guest checkout and on every card submit, plus attempt limits |
| 6 | Courtesy stays login-only (a later stage); it only loses the e-mail-code gate |
| 7 | UI: the registration dialog on the event page, plus the payment modal in guest mode |
| 8 | Stage-by-stage rollout: deploy A = signup without a code; deploy B = guest checkout + inline card |

## Decision
Full design and red-first test list per stage: `~/.claude/plans/for-the-website-now-wiggly-willow.md`
(approved 2026-10-28). The summary:
- A guest is a `users` row keyed by lowercase e-mail with a NULL password, so `orders.userId` stays NOT NULL and
  QR, Meus Ingressos, Excel, print and certificates stay unchanged (stage 2).
- Orders placed without a session get `placed_as_guest = true` and stay hidden from Meus Ingressos until the
  account's e-mail is verified by a link: the reset/"Criar senha" link or "Ver em Meus Ingressos" in the
  ticket e-mail (stage 2).
- The card goes inline through `POST /payments` with `creditCard` + `creditCardHolderInfo`, and the webhook
  stays the source of truth (stage 3).

### Stage 1: signup without an e-mail code (deploy A, PR `feat/signup-without-code`)
- `POST /api/auth/register` returns `{ token, user }` (201) and sends no e-mail. The client stores the token and
  follows the validated `?next=`.
- `requireEmailVerification` is deleted. It guarded `POST /api/orders`, `POST /api/events/:id/subscribe`,
  `GET /api/orders` and `POST /api/courtesy/redeem`.
- `POST /api/auth/verify-code`, `POST /api/auth/resend-code` and `POST /api/auth/resend-verification` are
  deleted (404), as is `emailService.sendVerificationEmail`. `GET /api/auth/verify-email?token=` (a signed
  `{ type: "email-verification" }` link) is **kept**; stage 2 starts e-mailing it. `/verify-email` on the client
  is the link page (`VerifyEmailPage`); `VerifyCodePage` and `useVerifyEmailRedirect` are gone.
- **One session check.** `server/middleware/auth.ts` owns `signSessionToken`, `sessionUserFromToken` and
  `authenticateToken`. The duplicate in `routes.ts` is gone, and the print WebSocket uses the same check.
  - **`pv` claim:** `sha256(password hash).slice(0, 12)`, on every session token (login, register, password
    change). A token whose `pv` no longer matches is 401, so a password reset or change ends every older
    session. This is what stops someone who signed up with another person's e-mail from keeping the
    session once the real owner resets the password. A token **without** `pv` (issued before deploy A) is
    accepted until it expires (7 days), so the deploy logs no one out.
  - **Link tokens are never sessions:** any token with a `type` claim (`password-reset`, `email-verification`,
    later `order-access`) is 401 as a Bearer. Before this, a reset link token worked as a session (the
    integration test saw `GET /api/auth/me` → 200).
  - Every invalid session is now **401** (it was 403 for a bad signature or an expired token), so the client's
    401 handler clears the stored token.
- `POST /api/auth/reset-password` enforces `newPassword` ≥ 6 characters (as a string) and sets
  `emailVerified = true`. Only the mailbox owner receives the link.
- `PUT /api/profile/password` returns `{ message, token }`. The new hash ends the old session, so the tab that
  changed the password stores the fresh token (`ProfilePage`).
- No schema change. `email_verification_code` columns stay (still stripped by `toPublicUser`); they are no
  longer written.

### Stage 2: guest checkout backend (PR `feat/guest-checkout-backend`, stacked on PR #27)
Backend only: no client change, no card form. Gates on the last reviewed head: check 0 errors, backend unit,
frontend unit, integration on host PG17 (199 passed) and e2e (95 passed) all green.
- **Guest row:** a `users` row keyed by lowercase e-mail with `password` NULL (`createGuestUser`). `orders.userId`
  stays NOT NULL. A guest's identity is only what they typed (R6); an existing row is read for conflict checks
  only, and unauthenticated writes to it require `password IS NULL` (R7).
- **`orders.placed_as_guest`:** true for an order placed without a session. `POST /api/orders` and
  `POST /api/events/:id/subscribe` use `authenticateTokenOrGuest` (a valid session is used if sent, a bad
  Bearer is still 401, no header is a guest) and `resolveCheckoutBuyer` (session or `buyer` body, one 4xx
  contract: `invalid_buyer`, `identity_required`, `identity_conflict`, `foreign_paid_unavailable`).
- **Turnstile:** `turnstileToken` in the body, verified on every guest request, fail-closed in production when
  `TURNSTILE_SECRET_KEY` is unset (403 `turnstile_failed`). Guest-only in Stage 2 (R1).
- **Limits:** guest limiter 30 requests / 15 min / IP (`GUEST_CHECKOUT_RATE_LIMIT_MAX`; a session request skips
  it; 429 `rate_limited`). Pending cap: 3 open orders per buyer and event in 30 min, counted apart for guest-made
  and session-made orders (429 `too_many_pending_orders`).
- **Order access:** a paid guest order returns `orderAccessToken` (JWT `type: "order-access"`, 24 h, R3).
  `POST /api/orders/:id/check-status` with header `X-Order-Access` answers only `{ status, paymentStatus }`
  (404 for a token of another order, 401 with neither token nor session). The Asaas logic is the shared
  `refreshOrderPayment`; the guest `201` order body carries no `userId`.
- **Reset and claim links:** reset tokens are single use (`pv` = password version; a pv-less token is rejected, R2)
  and carry `ev` (hash of the account e-mail) so a link dies when the e-mail changes. `forgot-password` on a
  password-less row sends purpose `create` ("Criar senha"); `register` on such an e-mail is 409
  `guest_account_claim` plus the same mail, so a stranger cannot claim the row.
- **Visibility rule:** a guest order is hidden from its account until `email_verified` is true. `GET /api/orders`
  filters it; `GET /api/orders/:id`, owner check-status, cancel and certificates answer **404, never 403** (R4).
- **Ticket e-mail:** a guest ticket e-mail carries "Ver em Meus Ingressos", a 30-day `email-verification` link.
- Residual fix `920d52e` (reset-token `ev`, guest foreign card never reuses an Asaas
  customer, check-status 3 s backoff after an Asaas failure).

**Rulings (cost if wrong in parentheses)**
- R1 Turnstile guest-only now; Stage 3 adds it to every card submit, even logged in (the logged-in card path is
  still the hosted link, and fail-closed would break it if merged alone).
- R2 reset tokens without `pv` are rejected (links mailed before deploy fail once, within 30 min).
- R3 `orderAccessToken` only for paid orders (Stage 4 adds it to subscribe if the success screen needs it).
- R4 the visibility rule covers cancel and certificates too (a slightly larger diff).
- R5 Task 2 may add the `hasPassword` guard where `tsc` needs it; Task 3 owns behaviour (process only).
- R6 guest identity = typed only; a returning guest retypes the document each time (acceptable, the dialog asks).
- R7 unauthenticated identity writes require `password IS NULL` in the UPDATE (none).
- R8 the pending cap is split by `placed_as_guest` (a guest-only griefer can still block guest checkout for one
  e-mail; the owner can log in).
- Session buyers also get the already-registered 409 and the pending cap (a logged-in buyer with a paid
  registration or 3 pending orders gets a new 4xx).
- Owner check-status on a non-pending order makes no Asaas call (a cancelled or expired order paid late recovers
  only through the webhook).
- Final review, with the invariant below:
  - C1: the verify link on a password row with `email_verified` not true does not verify; it mails a reset and
    answers 409 `password_reset_required` (an unverified legit account clicking its own ticket link must set a new
    password). A password-less row still verifies; an already-verified one is unchanged.
  - C2: `PUT /api/profile` e-mail change: unverified account is 400 `email_not_verified`; a verified one changes
    it and `email_verified` becomes false (a mistyped e-mail cannot be fixed in the profile).
  - C3: `DELETE /api/profile` by an unverified account that owns guest orders deletes nothing: password becomes
    NULL (ends sessions), rows stay, same 200 body (that account's data stays on a guest row: an LGPD edge case).
  - I1: the admin reset link signs through `middleware/auth.ts` (it was pv-less, so always rejected).
  - I2: the guest Asaas customer uses the typed name, phone and e-mail, never the row's (this overrides the
    spec's "from the buyer row"; a boleto would name the account owner).
  - Residual (`920d52e`, after the re-review): reset tokens carry `ev`; a guest foreign card order never reuses an Asaas
    customer; check-status backs off about 3 s after an Asaas failure instead of silencing the order for 15 s.

**The invariant.** Since Stage 1 has no signup code, `email_verified` does not prove the password holder owns the
mailbox: anyone can register any address. Guest orders must show only to the mailbox owner, so any path that sets
`email_verified` or changes `users.email` must end every session (`pv`) or be impossible without the mailbox. C1,
C2 and C3 were three such paths. The plan's Design list of "ways to verify" was wrong about the ticket link for
password rows: it may flip only password-less rows.

**Accepted risks (Stage 2)**
- The already-registered 409 reveals that an e-mail or document has a paid registration for that event.
- `identity_conflict` 409 for a new e-mail reveals that the document belongs to some account (same as
  `PUT /api/profile/identity`).
- The ticket name comes from the account row when the e-mail has an account.
- First writer wins the document on a guest row.
- A guest-only griefer can block guest checkout for one e-mail (R8).
- The 30-day verify token travels in a URL query (nginx access logs). After C1 it can only flip password-less rows.
- An unverified account cannot change its e-mail (C2); a verified user who mistypes a new e-mail needs support.
- An unverified account clicking its own ticket link must set a new password (C1).
- C3 keeps that account's data on a guest row (LGPD edge case), and can be told apart by a follow-up register
  (409 `guest_account_claim`), which extends the guest-row leak to squatted rows.
- C3 check plus delete is not atomic (a millisecond window).
- Legacy prod rows with `email_verified = false` (prod login skipped verification "for MVP") now get the C1 409
  and the C2 400. Both recover through "Esqueci minha senha".
- The reset e-mail triggered by C1 says "Você solicitou…" even though the link triggered it (Stage 4 wording fix).

**Deploy notes (deploy B)**
- Prod migration is 2 statements (`pnpm db:diff` shows exactly these):
  `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;` and
  `ALTER TABLE "orders" ADD COLUMN "placed_as_guest" boolean DEFAULT false NOT NULL;`. Create a Neon backup
  branch first; the owner pushes it.
- `TURNSTILE_SECRET_KEY` must be set in prod, or every guest checkout gets 403 `turnstile_failed`.
- `infra/nginx/cdpipass.com.br.conf` adds `https://challenges.cloudflare.com` to the CSP (`script-src`,
  `frame-src`); the owner reloads nginx.
- **Rollback warning:** once guest rows exist, the old code's login runs `bcrypt.compare(pw, null)` and answers
  500, and the old `GET /api/orders` shows guest orders to unverified accounts. Roll back code only together with
  a plan for guest rows.

**Deferred**
- Stage 3 (done, see below): the inline card and Turnstile on every card submit.
- Stage 4 (client): the guest dialog reuses `EventRegistrationDialog` with name, e-mail and phone mandatory;
  `VerifyEmailPage` handles 409 `password_reset_required` and shows "Crie sua senha" for password-less rows
  (not a redirect to `/login`); the profile page handles 400 `email_not_verified`; the reset e-mail wording for the
  link-triggered case; Turnstile response hostname allowlist.
- Minors still open (the final reviewer's triage: can wait):
  - `refundReceivedPayment.ts` imports `escapeHtml` through the `onlineEventEmailTemplate` re-export; import
    `server/utils/escapeHtml.ts` instead.
  - Reset-password single use is read-then-update on `pv`; two concurrent requests with one link can both pass
    (`UPDATE … WHERE password = old hash` closes it).
  - The pending cap is count-then-create, not atomic; concurrent guest requests can exceed 3 (the limiter bounds it).
  - The guest foreign-card early 400 reads raw `req.body.buyer.isForeigner`, while the resolver uses the parsed
    value; check `parseGuestBuyer` if a payload can parse as foreign without the flag.
  - `vi.mock("@shared/foreignCheckout")` in the integration file is file-wide (unsafe only under concurrent tests).

### Stage 3: inline card backend (branch `feat/guest-checkout-card`, stacked on `feat/guest-checkout-backend`)
Backend only: no client change, no card form (Stage 4). Range `d55369b..198055a`. The card now goes to Asaas from our
server (`POST /payments` with `creditCard`); the hosted `/paymentLinks` card branch is gone.

**What changed**
- **Body of `POST /api/orders` for a Brazilian card order:** `card { holderName, number, expiryMonth, expiryYear, ccv }`,
  `cardHolder { name, cpf, postalCode, addressNumber }`, `installmentCount` 1 to 3. The holder e-mail and phone are the
  buyer's (typed for a guest, the row for a session).
- **Flow:** Turnstile on every card submit (guest or logged in), card limiters (5 per e-mail per hour, 10 per IP per
  hour; every card submit counts), card validation (Luhn, expiry, CPF, CEP; skipped for foreign buyers), the in-person
  QR is generated before the charge, `createCardPayment`, then the inline finalize (the same `finalize` the webhook
  uses, so the ticket e-mail goes out once).
- **Outcomes:**
  - 201 paid (ticket e-mail sent), or 201 pending when Asaas puts the charge in risk analysis.
  - 402 `card_declined`, order deleted. Only a 400 from `POST /payments` is a decline.
  - 400 `invalid_card` (local validation, nothing sent to Asaas).
  - 429 `rate_limited` (card limiter) or `too_many_pending_orders`.
  - 502 `payment_provider_error` for an Asaas HTTP error that is a definite rejection (401/403/404/429, or a
    customer-call error): nothing was charged, the order is deleted, retry is safe.
  - 500 "Erro ao processar pagamento. Tente novamente." for any other failure before the charge request (QR
    generation, a network error on the customer call, the "inline card path skipped" guard): nothing was charged and
    the order is deleted too. Only an `AsaasApiError` maps to 502 (`checkoutPaymentErrorResponse`).
  - Once the charge request was sent, the order is never deleted. Already paid: 201. Otherwise 202
    `payment_pending_confirmation` with `order.id` and, for a guest, `orderAccessToken`; the buyer must not pay again.
  - The card `POST /payments` times out at 90 s (`AbortSignal.timeout`); a timeout is an unknown outcome.
  - `check-status` on a pending card order with no `asaasPaymentId` looks the charge up by `externalReference` (the
    order id), stores the id it finds, and otherwise stays pending (never 400 "Pedido sem ID de pagamento").
- **Webhook:** `PAYMENT_REPROVED_BY_RISK_ANALYSIS` and `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` cancel a pending order
  matched by the stored payment id. `PAYMENT_APPROVED_BY_RISK_ANALYSIS` finalizes only when the payment status is
  CONFIRMED or RECEIVED (an approval on a cancelled order logs REFUND_NEEDED, like CONFIRMED). The webhook log no
  longer prints `creditCardToken`.
- **Legacy and foreign:** link support stays for in-flight orders (`getPayment` link path, `deactivatePaymentLink`,
  webhook link matching). A foreign buyer keeps the hosted invoice (`createForeignCardPayment`), still blocked by
  `FOREIGN_PAID_CHECKOUT_ENABLED`, and sends no card fields.
- **Malformed JSON:** body-parser's parse error echoed a snippet of the body (card data). The global handler
  (`server/utils/requestErrorHandler.ts`) now answers a fixed 400 `{ "message": "Requisição inválida." }` and never
  logs or rethrows the error message.
- **Card data hygiene:** nothing from the card is stored or logged; Asaas' `creditCard` answer is not kept (R14).

**Rulings (cost if wrong in parentheses)**
- R9 body = `card` + `cardHolder{name,cpf,postalCode,addressNumber}` + `installmentCount` 1 to 3; holder e-mail and phone
  are the buyer's, the client already has them (Stage 4 would add two fields).
- R10 foreign buyers keep the hosted invoice and need no card fields; "foreign" is decided where the Stage 2
  foreigner card-only check decides it (none while foreign paid is blocked).
- R11 card limiters get env overrides outside production, same pattern as the three existing limits, because e2e
  submits many cards from 127.0.0.1 (two env names nobody sets in prod).
- R12 e2e "BR pays with Cartão" becomes `test.fixme` until Stage 4 replaces the hosted link (the logged-in card UI
  path is uncovered between the Stage 3 and Stage 4 commits, never deployed apart).
- R13 delete `createPayment`'s CREDIT_CARD to `/paymentLinks` branch, no caller left; legacy link support stays
  (re-adding ~25 lines from git).
- R14 keep nothing from Asaas' `creditCard` response (no last4 or brand column); nothing reads it.
- R15 the webhook "Full webhook payload" log drops `creditCardToken`, a reusable charge token under our key.
- R16 the decline message is fixed Portuguese text; Asaas descriptions are never relayed.
- R17 the `cardCheckout` integration test uses the real `asaasService` with a stubbed `fetch`, so the real request
  builder and its logging sit inside the console-spy PCI proof.
- R18 PIX/boleto guest customer lookup by CPF is unchanged (out of scope; `identity_conflict` ties a typed CPF to
  its account, so a reused Asaas customer is the same person).
- R19 inline CONFIRMED runs finalize after the QR exists; `duplicate_other_paid` gives the already-registered 409;
  a finalize throw gives 201 pending and the webhook recovers.
- R20 only a 400 from `POST /payments` is `card_declined`; a 400 on `POST /customers` stays 502
  `payment_provider_error`.
- R21 (A1) card `dueDate` is the same +7 day date as PIX/boleto: the docs make it required and say it does not
  schedule capture, and the docs do not say explicitly whether a card payment can go OVERDUE (the webhook flow diagram shows OVERDUE
  followed by CONFIRMED), so a same-day date could cancel an order mid risk analysis.
- R22 (A2) card orders generate the in-person QR before calling Asaas: a webhook can race ahead of the
  `POST /payments` response and its finalize sends the ticket e-mail (a QR row for a declined order dies with it).
- R23 (A3) an unknown card outcome keeps the order pending instead of deleting it (docs: "Timeout não significa que a
  cobrança não foi criada"); deleting would orphan a real charge. Narrowed by I2 and M3 below.
- R24 (A4) the two risk/capture refusal events cancel a pending order matched by stored payment id only; id-only keeps
  legacy link orders safe. A reproval before the id is stored is ignored.
- R25 (A5) `PAYMENT_APPROVED_BY_RISK_ANALYSIS` finalizes only for CONFIRMED/RECEIVED (the docs do not say whether
  `PAYMENT_CONFIRMED` follows; finalize is idempotent).
- R26 3-D Secure, installment `value` semantics, GET status after a reproval, refund and chargeback events are not
  documented or out of scope: Stage 5 sandbox checklist and backlog (refund and chargeback events are unhandled
  today, also for link payments).
- R27 `FAKE_CARDS.declined` is Asaas' sandbox decline card 5184019740373151; Stage 5 reuses it.
- R28 accept the implementer's `typedForeigner` for the card-validation skip (session `isForeigner`, else the typed
  buyer flag): the Stage 2 card-only check is false for a guest passport buyer while the flag is off, and setting
  the flag only reroutes to the foreign path (403, or the hosted invoice when on), so it cannot dodge validation. This
  supersedes spec §5.3 wording.
- Park I1 (Task 2 review): the QR PNG of a declined in-person card order stays in S3. Same class as abandoned-PIX
  PNGs, the limiters bound it, and deleting is racy (unawaited upload).
- I2 (Task 2 review) overrides spec §5.8: only a non-400 failure of `POST /payments` is an unknown outcome
  (`CardChargeOutcomeUnknownError`, codes and status only, 502, order kept). A customer-phase or pre-charge error
  deletes the order as before (502 for an Asaas error, 500 otherwise), since it cannot have charged (otherwise pending orders pile up toward the 429 cap).
- Minor 5 raised to a fix (PCI): the parse-failure handler above.
- Fix round 1 ride-alongs: holder and customer phone through `brazilianNationalPhone` (a 13-digit phone 400 would
  label every guest card as declined); e-mail limiter key lower-cased (the lockout by typed e-mail is the
  plan-mandated limit, an accepted risk below); an approval on a non-pending order gets the REFUND_NEEDED handling;
  test expiry years come from the clock; a DB scan proves no PAN/CVV/token is stored.
- Fix round 2: once `createCardPayment` resolves, the catch never deletes the order (it logs order and payment id,
  answers 502 at that stage; replaced by I-1 below).
- Deferred and left: Minor 4 (reproval before the id is stored, by design), the install-total cent drift in the fake,
  and the test-suite minors recorded in the ledger.
- I-1 (final review) supersedes spec §5.8 "response as today": once the charge request was sent and the order is
  kept, an already paid order answers the normal 201; otherwise 202 `payment_pending_confirmation` with the order id
  and the guest token. A retry-safe 502 there invites a second real charge and leaves a guest no handle to poll
  (the Stage 4 client handles one more status).
- M3 (final review): Asaas 401/403/404/429 on `POST /payments` are definite rejections (no charge), so the order is
  deleted and the answer is the retry-safe 502; 408, 5xx, network and timeout stay unknown. (An undocumented Asaas
  429 that did charge would leave a charge with no order: webhook finds nothing, REFUND_NEEDED log path.)
- M1 (final review): a card submit that fails Turnstile does not consume the per-e-mail card bucket (the IP limiter
  still counts it). Without a solved challenge the lockout by typed e-mail would be free.
- M2 (final review): check-status reconciles a pending card order with no payment id by `externalReference`, so
  the 202's "wait" works without the webhook (one extra Asaas GET per poll, behind the existing backoff).
- M4 (final review): the after-charge failure log adds the error name and driver code (for example a pg SQLSTATE),
  never `err.message`, which can embed query params with buyer PII.
- M5, M6, N1, N2 (final review): tests for `duplicate_other_paid` and a finalize throw; the 90 s card timeout (nginx
  note below); the result mapping inside the unknown-outcome try and a "charge answered" flag independent of
  `payment.id`; a loud guard before `createPayment` for a non-foreign card order.
- M7 goes to the Stage 4 harness (the fake keeps card payments, answers `GET /payments/{id}`, flips status); M8 (Asaas
  notifications for inline charges) and M9/Q1 (polling never sees a deleted or reproved card payment) go to the Stage 5
  checklist; N3 is in API-Endpoints; Q3 client notes (reset Turnstile after every response, `installmentCount` is a
  number and `ccv` a string, handle 202, two check-status shapes, block double submits, a non-JSON 504 is an unknown
  outcome) go to the Stage 4 prompt.
- Parked nits: the M2 reconcile does not re-check the found payment's `externalReference` (Asaas filters by exact
  value and our references are full order UUIDs, so another charge cannot match); the already-paid 201 fallback
  synthesizes payment status and value when Asaas' answer was lost (`payment.id` may be null; `order.status` is the
  truth the client reads).

**Asaas docs research (drove A1 to A5 and R26)**
- "Timeout não significa que a cobrança não foi criada. Verifique o resultado antes de tentar novamente."
  (https://docs.asaas.com/docs/cobran%C3%A7a-duplicada-ap%C3%B3s-retry-sem-idempot%C3%AAncia). No idempotency key is
  documented; use one stable `externalReference` per operation (https://docs.asaas.com/docs/retries-e-idempotência).
  This drives R23, M2 and the 202.
- Minimum timeout of 60 seconds for requests, so the card POST waits 90 s ("Configure timeout mínimo de 60 segundos para esta
  requisição", https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito).
- `dueDate` is required on the card charge and does not schedule capture
  (https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito); whether a card payment can go OVERDUE is
  NOT DOCUMENTED explicitly; the webhook flow diagram shows PAYMENT_OVERDUE followed by CONFIRMED
  (https://docs.asaas.com/docs/webhook-para-cobrancas), which is why we treat OVERDUE as not terminal. Drives A1/R21.
- Risk-analysis events `PAYMENT_AWAITING_RISK_ANALYSIS`, `PAYMENT_APPROVED_BY_RISK_ANALYSIS`,
  `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`
  (https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito, https://docs.asaas.com/docs/webhook-para-cobrancas).
  "A criação da cobrança não representa a disponibilização definitiva do valor. Acompanhe o processamento pelos
  Webhooks." (https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito). Drives A4/A5, R24, R25.
- A webhook can arrive before the create response, so the finalize needs its rows first. Drives A2/R22.
- Sandbox decline card 5184019740373151 (https://docs.asaas.com/docs/testando-pagamento-com-cartão-de-crédito). R27.
- PCI: using the API keeps our infrastructure in scope (SAQ-D), and "Não armazene dados de autenticação sensíveis
  (CVV...) após a autorização" (https://docs.asaas.com/docs/pci-dss-1).
- Not documented (R26, Stage 5 checklist): 3-D Secure on our account, installment `value` semantics, GET status after a
  reproval, whether `PAYMENT_CONFIRMED` follows an approval by risk analysis, refund
  (https://docs.asaas.com/docs/estornos) and chargeback (https://docs.asaas.com/docs/chargeback) events.

**Accepted risks (Stage 3)**
- Anyone who types a victim's e-mail can use up that e-mail's 5 card submits per hour after solving Turnstile (the
  per-e-mail limiter is plan-mandated; a failed Turnstile does not count, M1).
- Orphan QR PNGs in S3 for a declined in-person card order (park I1).
- A risk reproval that arrives before `asaasPaymentId` is stored is ignored; check-status keeps polling.
- A definite-rejection 429 from Asaas that did charge would leave a charge with no order (M3).
- The already-paid 201 fallback can carry `payment.id` null and an approximated `value`.
- The after-charge 202 text is generic even when the charge was approved and finalized in the same request.
- Polling never sees a deleted or reproved card payment (it cancels only on OVERDUE/CANCELED); only the webhook cancels such an order (M9/Q1).

**Deploy notes (deploy B)**
- Asaas must enable the direct card API (`POST /payments` with `creditCard`) on the production account.
- nginx `proxy_read_timeout` of at least 120 s for `/api/orders`: the card POST times out at 90 s (Asaas asks for
  "timeout mínimo de 60 segundos"), and a shorter proxy timeout turns an unknown outcome into a non-JSON 504.
- `TURNSTILE_SECRET_KEY` and the hostname allowlist (Stage 2 note) now also gate every card submit.
- `CARD_ATTEMPT_EMAIL_RATE_LIMIT_MAX` and `CARD_ATTEMPT_IP_RATE_LIMIT_MAX` are ignored in production (defaults 5 and 10
  per hour).
- No schema change in Stage 3.

**Verification (head `198055a`, Postgres 17 on localhost:55434)**
- `pnpm check` exit 0; `test:backend` 53 files passed | 10 skipped, 594 passed | 259 skipped; `test:frontend` 41
  files, 439 passed | 4 skipped; integration 10 files, 255 passed | 4 skipped; `test:e2e` 92 passed | 12 skipped.
- Card curl on the local server with the fake Asaas: approved 201 paid (amount 95 = 90 + R$5 fee); declined 402
  `card_declined`; retry by the same buyer 201 paid; risk analysis 201 pending; 3 installments 201 paid with one
  Asaas POST carrying `installmentCount` 3; Luhn-invalid 400 `invalid_card`; malformed JSON holding a card number 400
  `Requisição inválida.`; DB afterwards: 3 paid, 1 pending, the declined row gone. Grep for card number, CVV, holder
  CPF, CEP and `creditCardToken`: server log 0, responses 0, DB dump 0.
- Stage 2 curl checks re-run on `1c1c4bf` (token path, 409s, 403s, pending cap, Turnstile and rate limits): green.
- Each fix-wave test failed before its code (21 new tests red first).

### Stage 4: client checkout UX + e2e (branch `feat/guest-checkout-client`, stacked on `feat/guest-checkout-card`)
Range `ecad8c7..8b01377`. Client checkout for guests and logged-in buyers, plus two small server changes (verify-email
`passwordSet`, link-triggered reset wording) and the e2e harness for the inline card. Contract: the SDD spec
`spec-stage4.md` (R29–R40); process: the SDD ledger `progress.md` (both under `.superpowers/sdd/for-the-website-now-wiggly-willow/` in the
`guest-s4` worktree).

**What changed**
- **T1 `d08636d` foundations.** Shared `@shared/cardPayment` (field validators + `parseCardPayment`), `@shared/cpf`,
  `@shared/maskEmail` (the server copies are gone); `apiRequest(method, url, data?, headers?)`; `parseApiError`
  (`client/src/lib/eventForm.ts`); `TurnstileWidget` (own component, no npm package, `VITE_TURNSTILE_SITE_KEY`).
- **T2 `707dbf8` + `8e932b0` guest dialog.** `EventRegistrationDialog` guest mode (`onConfirm({ answers, buyer?, turnstileToken? })`),
  logged-out entry points on the event page and the home page open the dialog, free guest subscribe, `CheckoutSuccess`
  (one success component), guest-safe `onSuccess` (a guest is never sent to `/profile`).
- **T3 `223e02b` card form and polling.** `CardPaymentForm.tsx` + `PaymentModal.tsx`: card body types, Turnstile reset
  after every response, a synchronous double-submit guard, every 201/202/400/402/403/429/502/5xx/network branch, 5 s
  polling (guest token header or session), success screen.
- **T4 `ae1de5d` accounts.** `GET /api/auth/verify-email` 200 body gains `passwordSet`; `VerifyEmailPage` states
  ("E-mail confirmado" / "Crie sua senha" / error with the server message); `ProfilePage` shows the 400
  `email_not_verified` message with an "Esqueci minha senha" link; `sendPasswordResetEmail(..., { purpose: "link" })`
  drops "Você solicitou…" on the verify-email 409 path.
- **T5 `74895cc` e2e harness.** The fake Asaas keeps payments (no card data), answers `GET /payments/{id}` and
  `?externalReference=`, flips status with `POST /__payments/{id}/status`; guest rate-limit env raised in `serve.ts`;
  helpers for the card form, `confirmFakePayment` (flip + app webhook) and `latestEmailLink` (reads `email_queue`);
  the `test.fixme` "BR pays with Cartão" in `events.spec.ts` is now the inline card.
- **T6 `4507ec2` guest e2e.** `e2e/tests/guest-checkout.spec.ts`: free online, free in-person, foreign free
  (passport), PIX then webhook, card approved, card declined then retry, risk card then flip, password-account e-mail
  (order hidden until the e-mail link), claim via reset link; 9 journeys on 3 projects.
- **Final-review fix wave** (opus review: merge with fixes, 0 Critical, 1 Important; scoped re-review: clean).
  - `dd32fa0` I1 card-charge lock (below), T3-M3 (X disabled and "Não feche nem recarregue esta página" while a request
    is in flight), N1 (tabs disabled in flight).
  - `dc647ca` T2-M1: the free guest success links the event's WhatsApp group (plain link, never auto-opened).
  - `8b01377` T6-M4: the e2e asserts "no reset e-mail yet" as a boolean, so a failure never prints a link or token.

**Rulings R29 to R40 (spec-stage4.md)**
- R29 Turnstile client is our own component (explicit render, shared script promise, `reset()` via ref). No site key
  renders nothing and sends no `turnstileToken`; with a key, submit waits for a token.
- R30 One source for card rules in `shared/` (`cardPayment`, `cpf`, `maskEmail`); the server and client import it.
- R31 `apiRequest` takes optional headers; one `parseApiError` for every status/code branch.
- R32 `onConfirm` takes one object `{ answers, buyer?, turnstileToken? }`; `buyer` only in guest mode.
- R33 Guest mode = no authenticated user when the dialog opens; "Seus dados" (name, e-mail, phone) plus system and
  event questions; it never PUTs `/api/profile/identity`.
- R34 Turnstile placement: the dialog (free guest flow only) and `PaymentModal` (guest any method, or card for
  anyone); reset after every response.
- R35 The caller keeps the last guest buyer and answers, so a reopened dialog is prefilled.
- R36 409 `identity_conflict`: dialog reopens prefilled with the message and the links "Esqueci meu e-mail" and "Entrar".
- R37 **AMENDED (final review).** Unknown card outcome (202, non-JSON 5xx, network failure): "Não conseguimos confirmar
  seu pagamento agora. Não pague de novo…". The card submit stays disabled **for that event until a page reload, or
  until polling reports paid or cancelled**. The lock is an in-memory per-event map (`client/src/lib/cardChargeLock.ts`,
  no storage, no card data) set when the card POST is sent, so it survives close, reopen and remount. With an order id
  (202 or 201 pending) polling resumes on reopen; without one (504, network) no polling. PIX and boleto stay usable.
- R38 One success component `CheckoutSuccess` (masked e-mail, total from `order.amount`); a guest gets "Crie sua
  senha" (→ `/forgot-password`, no e-mail in the URL) and "Fechar".
- R39 Verify-email for a password-less row shows "Crie sua senha" instead of redirecting to `/login`.
- R40 Turnstile hostname allowlist is a deploy note only (Cloudflare "Hostname Management"); no server check.

**Rulings from the ledger (each with its cost if wrong)**
- `useFreeSubscribe` gets new logged-out tests instead of "inverting :105-115": the plan's line reference was stale.
  Cost if wrong: none.
- The home page logged-out CTA also uses the guest flow: the subscribe signature changed, and leaving it on `/login`
  would be inconsistent. Cost if wrong: revert one hunk.
- T3 decisions (1) any card 5xx without JSON is an unknown outcome, (2) the modal cannot close while a request is in
  flight, (3) reopen starts over for PIX/boleto. Each closes a double-charge or stale-QR path. Cost if wrong: one more
  pending PIX order per close/reopen (the server caps 3 per 30 min).
- `passwordSet: false` shows the client text, not the 200 message, because the message tells the user to log in. Cost
  if wrong: one string.
- T3-M1 implemented now as the in-memory per-event lock (R37 amended). Cost if wrong: a buyer whose request truly
  failed must reload or use PIX/boleto to retry by card.
- The final fix wave also takes T2-M1, T3-M3, T6-M4 and N1; N2 waits (no money or account risk). Cost if wrong for N2:
  one confusing dialog for a logged-in user mid-load.
- A polled cancel clears the lock only when it is the locked order, so an expired PIX from a locked modal does not free
  a card still in risk analysis. Cost if wrong: none beyond one condition.
- The X is disabled with the "não feche" notice on every in-flight request, not only card (close was already blocked).
  Cost if wrong: cosmetic.
- A remount during an in-flight first card request starts locked without polling (it learns the order id on the next
  reopen). Fails safe. Cost if wrong: an amber notice without live status until reopen.
- Deploy note: the Turnstile site key (build) and secret (server) are set together (below). Cost if wrong: checkout
  outage at deploy B.

**Accepted risks and follow-ups (Stage 4)**
- **Parked (re-review), both real and low:**
  - R1: a stale `pollNotice` ("Pagamento cancelado" or the e-mail notice) carries into the next order's view in the same
    modal session (`PaymentModal.tsx:230-234`, `:252-260`). Cosmetic, no money path. Fix with the `useOrderPolling` extraction.
  - R2: the guest token held in the in-memory lock survives a same-tab login without a reload; another person logging in
    on that device sees the first buyer's order status only and stays card-locked until reload (`PaymentModal.tsx:111`).
    Follow-up: clear `cardChargeLock` on an auth change.
- **T3-M2:** extract a `useOrderPolling` hook (`PaymentModal.tsx` is now 748 lines); no behaviour change.
- **N2:** the event page, home page and `useFreeSubscribe` treat `!isAuthenticated` as a guest while `useAuth` is still
  loading with a stored token; the server ignores `buyer` for a session, so no wrong-account order. Fix: keep the CTA
  disabled while loading with a token.
- **Small minors that wait:** T1 (trailing blank line in `shared/cpf.ts`, Turnstile injection coverage); T2 (guest PII in
  react-query mutation variables, memory only; event query not invalidated on guest success; duplicated test helper and
  page state); T3 (no terminal cap on polling, the server limits Asaas calls to one per order per 15 s; coverage gaps
  for 5xx variants; duplicated CPF mask); T4 (redirect timer after unmount, profile message not cleared on edit, repeated
  "Esqueci minha senha" text, duplicated toast title); T5 (unused `context` destructure, paid `orderCount` without
  `expect.poll`, fake `externalReference` listing comment, duplicate payment query in `payments.ts`, `latestEmailLink`
  may return a stale link when the newest mail has the path only in its text part); T6 (duplicated reset/login block,
  loose button regexes, `placed_as_guest` asserted on one journey only, declined test checks visibility not message,
  dialog bounding-box heuristic). Details: `final-review.md` and `task-{1..6}-review.md`.

**Deploy notes (deploy B)**
- Build arg `VITE_TURNSTILE_SITE_KEY` (Vite build-time env). With no key the widget renders nothing.
- `VITE_TURNSTILE_SITE_KEY` (build) and `TURNSTILE_SECRET_KEY` (server) must be set **together**: a secret without a
  site key makes every guest order and every card order (logged in too) answer 403.
- Cloudflare Turnstile widget "Hostname Management" = the prod hostnames (R40; there is no server-side hostname check).
- nginx CSP is still `Content-Security-Policy-Report-Only` (`infra/nginx/cdpipass.com.br.conf:50`). It already lists
  `https://challenges.cloudflare.com` in script-src and frame-src; when it is switched to enforcing, keep both.
- One manual pass with a real site key on staging/sandbox before go-live (owner, after all automated tests are green).
- Stages 2–4 merge into `hotfix-frontend-update` together after the Stage 5 sandbox rehearsal.
- No schema change in Stage 4.

**Verification (head `8b01377`, Postgres 17 on localhost:55434, observed by the controller)**
- `pnpm check` exit 0; `test:backend` 596 passed | 260 skipped; `test:frontend` 548 passed | 4 skipped; integration
  256 passed | 4 skipped; `test:e2e` 125 passed | 9 skipped | 0 failed (1.8 min). The 9 skips are the foreign-paid
  tests (`FOREIGN_PAID_CHECKOUT_ENABLED` is false).
- The lock's e2e journey ("card in risk analysis, closed and bought again") failed on the old `PaymentModal` and passes
  on the fix; 11 mutations of the lock and in-flight guards were each caught by a test.
- Not yet run: a real Turnstile site key, the sandbox Asaas card, the CSP in enforcing mode (Stage 5).

## Alternatives considered
- **Keep the code, only for guests:** that keeps the step the owner wants gone, and a guest has no account to
  verify.
- **Magic-link login instead of passwords:** it changes decision 4 and every existing account.
- **Mass-logout on deploy** (reject tokens without `pv`): it is safer by days, but it logs out every buyer for
  no gain, because pre-deploy accounts were verified (grandfathered 2026-10-13).
- **Asaas hosted card page (current):** it has the least PCI scope, but it is the extra step the owner wants removed.

## Consequences
- Signup is one form. Anyone can create an account with any e-mail; that account cannot see guest orders
  (stage 2 visibility rule) and loses its session when the owner resets the password.
- **Accepted risks:**
  - SAQ-D scope.
  - First-writer-wins document on guest rows.
  - An e-mail squatter can set a write-once CPF on an unverified account (support fixes it).
  - When someone buys with an existing account's e-mail, the ticket name comes from the account row.
  - A pre-deploy token (no `pv`) outlives a reset for up to 7 days.
- **Rollback of deploy A:** code only. Old code would 403 the accounts created without a code, and those
  accounts would need to be set verified, as on 2026-10-13.
- Follow-ups: stages 2–6 in the plan; ADR-002 (card inline) and ADR-016 (guest dialog) are updated with stage 5.

## Related
- [[60-Decisions/ADR-016-event-registration-forms-and-minimal-signup]]
- [[60-Decisions/ADR-002-asaas-payments]]
- [[70-Operations/Security-Backlog]] (#16)
- [[20-Backend/Workers-and-Middleware]]
