# Workers & Middleware

## Email worker (`server/workers/emailWorker.ts`)
Dedicated process (`server/run-email-worker.ts`, PM2 app `cdpi-pass-email-worker`).

- Cycle every **20s**, max **5 concurrent** jobs, guards against overlapping cycles.
- Processes:
  - `email_queue` rows (`pending` → send via SendGrid → `sent`/`failed`, attempts++).
  - `mass_send_jobs` (courtesy CSV mass sends): parses `csv_data`, creates courtesy links + queues emails.
  - `reminder_jobs`: finds unredeemed courtesy links (`reminderEligibility.ts`: filter + dedupe by email), renders template (`templateRenderer.ts` with `{nome} {evento} {data} {link}`), queues emails.
  - `communicate_jobs`: recipients per `recipient_mode` (`participants | participants_and_unredeemed | unredeemed_only`).
- **Important**: the worker is a separate process. Changing worker code requires restarting `cdpi-pass-email-worker`, not just the server.

### Email templates stored in the database (not in code)

The courtesy, reminder, and communicate email **bodies** are NOT hardcoded in `emailService.ts` — they are HTML strings the admin types in a TipTap editor and save to the database:

| Table | Column | Used by |
|---|---|---|
| `events.courtesy_template` | `text` | courtesy invite + reminder emails |
| `events.courtesy_email_subject` | `text` | courtesy email subject line |
| `reminder_templates.body` | `text` | reminder emails |
| `reminder_templates.subject` | `text` | reminder subject line |
| `communicate_templates.body` | `text` | communicate/announcement emails |
| `communicate_templates.subject` | `text` | communicate subject line |

The code in `emailService.ts` only provides the **shell** (header, CTA, notice box, footer). The **message body** — including any "Informações Importantes" section with contact info — comes from these DB-stored templates via `renderTemplate()`.

**Consequence**: changing contact info in `shared/contact.ts` updates the code-generated footer, but does NOT update contact info the admin baked into the template body. To fix old contact info in stored templates:
1. **Runtime guard**: `migrateTemplateContactInfo()` (`server/utils/migrateTemplateContactInfo.ts`) runs on every template before `renderTemplate()`, replacing retired numbers/emails with canonical ones. This fixes emails on send.
2. **SQL migration**: `sql/update_contact_info_in_templates.sql` fixes templates at rest in the DB so the admin editor also shows correct info. Run this manually on Neon after deploying the code.

See [[60-Decisions/ADR-009-canonical-contact]].

Purchase/inscription confirmation e-mails (presencial ticket + QR, online meeting URL, optional `confirmation_email_html` inject) are **not** in this table. They are TypeScript templates plus an optional per-event TipTap field on the event form. Do not look for them in `/admin/templates`. See [[20-Backend/Event-Modality]].

### CSV encoding

CSV uploads from Brazilian Excel are often Windows-1252, not UTF-8. The mass-send route decodes with `decodeCsvBuffer()` (`server/utils/decodeCsvBuffer.ts`): UTF-8 if valid, otherwise Latin-1. Never `csvBuffer.toString("utf-8")` or names like Cauê become `Cau�`. See [[00-Overview/Lessons-Learned]].

## Middleware (`server/middleware/`)

### auth.ts
- `authenticateToken`: reads `Authorization: Bearer <jwt>`, verifies with `JWT_SECRET`, loads user from DB, attaches `req.user`. 401 on missing/invalid.
- `requireEmailVerification`: 403 unless `req.user.emailVerified`.
- Admin checks are done **inside handlers** via `req.user.isAdmin` (no admin middleware).

### errorHandler.ts
Central error handler; `server/index.ts` also has a fallback JSON error handler (`{message}` with status).

## Related
- [[20-Backend/Services-Overview]]
- [[40-Database/Schema-Overview]] (queue tables)
