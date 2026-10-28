# ADR-017: Guest checkout, inline card payment and signup without an e-mail code

- **Date**: 2026-10-28
- **Status**: proposed (draft). Stage 1 is implemented (deploy A); stage 2 is implemented on its branch (deploy B); stages 3–6 are planned.

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
- Stage 3: the inline card (`POST /payments` with `creditCard`), Turnstile on every card submit even when logged in
  (the end of R1's deferral).
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
