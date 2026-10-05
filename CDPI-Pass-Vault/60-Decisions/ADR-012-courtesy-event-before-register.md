# ADR-012: Courtesy guests see the event before registering

- **Date**: 2026-10-02
- **Status**: accepted

## Context
Free courtesy links (`courtesy_links.override_price` null) opened `/cortesia?code=CODE` and, for a logged-out visitor, toasted "Login necessário" and left for `/login` before any event details. Promo links already landed on `/event/:eventId?promo=CODE` and only asked for an account when the guest clicked buy. Guests receiving a courtesy were creating an account without having seen the event.

## Decision
New free-courtesy URLs are `/event/:eventId?cortesia=CODE`. Admin `redeemUrl`, the courtesy email button, and the template `{link}` variable all come from `server/utils/courtesyEntryUrl.ts`. Promo links stay `/event/:eventId?promo=CODE`.

The event page shows **Cortesia** and **Resgatar cortesia**. Login or register happens on that click. `?next=` returns to the same event URL with the code intact; the form does not open and redeem is not posted by itself. A logged-in click opens the existing attendee form at `/cortesia?code=CODE`. `POST /api/courtesy/redeem` is unchanged.

Already-sent mail that still uses `/cortesia?code=CODE` keeps working: a logged-out visit resolves `GET /api/courtesy-links/:code` and replaces the location with the event page. The manual code box stays; **Continuar** goes to the event page.

`getValidatedNextPath` keeps a single `?cortesia=` value that matches `COURTESY_CODE_PARAM_REGEX`. A cortesia query combined with `promo` or any other param is dropped (pathname only). A malformed cortesia code is rejected (`/`). `/cortesia?code=` stays allowed so the authenticated form can be a return path.

Closed sales do not disable the courtesy CTA. A full event and an existing paid order still do. An invalid code does not fall through to full-price checkout. A code that has `overridePrice` is rewritten to `?promo=` and uses checkout, never redeem.

## Alternatives considered
- Keep the login redirect and only change the email button. The guest would still register before seeing the event.
- Auto-open the attendee form, or auto-POST redeem, after login. The guest would not get a second chance to confirm after creating the account.
- Collect **Empresa que atua** and cargo on `/register`. Those fields stay on the courtesy form, after the guest has seen the event and chosen to redeem.

## Consequences
New links and new mail skip the login wall. Old `/cortesia?code=` links still resolve. The auth allowlist is stricter for `cortesia` than for `promo`: extra query params drop the code, and a bad code rejects the whole return path. Redeem, courtesy limits, mass-send CSV processing, and payments are untouched.
