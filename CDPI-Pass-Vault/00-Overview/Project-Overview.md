# Project Overview

**CDPI Pass** is the event management platform for CDPI Pharma: ticket sales, event registration, attendee management, QR-code check-in, badge printing, certificates, and NPS surveys for pharmaceutical industry events.

- Prod URL: https://cdpipass.com.br
- Repo dir: `/Users/cauecasonato/Envs/CDPI-Pass/frontend` (single package containing `client/` + `server/` + `shared/`)
- Sibling dirs: `Documentation/` (PT-BR operator guides, docx/pdf), `backend/` (vestigial Python, unused), `CDPI-Pass-Vault/` (this vault)

## Main user flows
1. **Direct purchase**: register → verify email (6-digit code) → pick event → pay via Asaas (PIX/Boleto/Card) → webhook marks order paid. **Presencial:** QR ticket generated, stored in S3, emailed. **Online:** no QR; confirmation e-mail has the meeting URL; confirmed tickets also show **Acessar reunião** (and **Entrar no grupo** when a WhatsApp URL is set) on Meus Ingressos. See [[20-Backend/Event-Modality]].
2. **Courtesy redemption**: admin creates courtesy link → recipient redeems at `/cortesia` (account auto-created if needed) → order with `payment_method='courtesy'`, `status='paid'` (same QR vs meeting-link split as purchase).
3. **Check-in** (presencial): admin scans QR (`/admin/verificar`) → order `amnt_used` incremented → optional Zebra badge print job queued (see [[20-Backend/Print-Coordinator]]). Online events have no door QR.
4. **Certificate**: after event, user answers NPS form (type depends on `events.nps_type`) → Lambda fills .docx template → PDF stored in S3 → link shown/emailed.

## Admin capabilities
Events CRUD (including **Presencial / Online** + secret meeting URL, optional WhatsApp group URL, optional confirmation-email HTML), participants list, commercial sales report, courtesy links + quotas + redemptions + mass send, reminder/communicate email templates + mass jobs, NPS results + Excel export, certificate template upload, print terminal (WebUSB + WebSocket), QR scanner, mark order paid externally, undo check-in, generate password reset links.

## Related
- [[10-Architecture/Architecture-Overview]]
- [[20-Backend/API-Endpoints]]
- [[20-Backend/Event-Modality]]
- [[40-Database/Schema-Overview]]

## Contact details (single source)
Support e-mail and phones shown to customers live in `shared/contact.ts` (`CONTACT_EMAIL`, `CONTACT_CHANNELS`) and are imported by `SiteFooter` / `ContactChannels` and e-mail templates. Changing a number = one edit; `grep -rn "(62)" client server shared` must then return only that file (plus tests asserting the strings). Canonical set (2026-09-02): `relacionamento.mkt@cdpipharma.com.br` · `+55 (62) 3636-9909` (tel) · `(62) 99865-5500` / `(62) 99610-1694` (WhatsApp). See [[60-Decisions/ADR-009-canonical-contact]].
