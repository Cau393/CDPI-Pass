# ADR-009: Canonical contact list

- **Date**: 2026-09-02
- **Status**: accepted

## Context
Support numbers had drifted: the site showed `+55 (62) 99860-6833`, e-mails showed a different pair, and a later change treated numbers as append-only so old printed tickets would still match. The official block is now one e-mail and three numbers. Keeping retired numbers on the site confused buyers and made the footer a phone book.

## Decision
- `shared/contact.ts` is the single source. One structured list (`CONTACT_CHANNELS`) plus `CONTACT_EMAIL`. Site and e-mail footers import from it.
- Replace, do not append. Retired numbers (including `99860-6833`) leave the product.
- Landline uses `tel:`. Numbers whose national subscriber starts with 9 use `https://wa.me/`.
- Public ticket pages (`/`, `/eventos`, `/event/:id`, `/cortesia`) render `SiteFooter`. Transactional HTML mail uses `EMAIL_CONTACT_FOOTER_HTML`; plain-text ticket mail uses `EMAIL_CONTACT_LINE`.

## Alternatives considered
- Append-only lists so old printed tickets stay valid: rejected. The organisation supplied a canonical block; extra numbers look like the site is out of date.
- Separate site vs e-mail phone lists: rejected. Buyers should see the same channels everywhere.
- Giant stacked `text-2xl` phones: rejected. Ticket-sales sites (Sympla, Eventbrite) use a compact “Fale conosco” block with clickable channels.

## Consequences
- Changing a number is one edit in `shared/contact.ts`. `grep -rn "(62)" client server shared` should only hit that file plus tests that assert the strings.
- WhatsApp links open in a new tab on the site; landline stays in-place (`tel:`).
- **DB-stored email templates** (courtesy, reminder, communicate) can contain old contact info the admin typed in the TipTap editor. Two layers fix this:
  1. **Runtime guard**: `migrateTemplateContactInfo()` (`server/utils/migrateTemplateContactInfo.ts`) replaces retired numbers/emails before every `renderTemplate()` call in `emailWorker.ts`. Fixes on send.
  2. **SQL migration**: `sql/update_contact_info_in_templates.sql` fixes templates at rest in the DB. Run manually on Neon after deploying the code.
- When contact info changes in the future, add the old→new mapping to `migrateTemplateContactInfo.ts` AND add a `REPLACE()` to a new `sql/` file. Then grep `events.courtesy_template`, `reminder_templates.body`, `communicate_templates.body` for the old value.
