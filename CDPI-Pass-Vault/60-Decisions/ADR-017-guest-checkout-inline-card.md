# ADR-017: Guest checkout, inline card payment and signup without an e-mail code

- **Date**: 2026-10-28
- **Status**: proposed (draft). Stage 1 is implemented (deploy A); stages 2–6 are planned.

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
