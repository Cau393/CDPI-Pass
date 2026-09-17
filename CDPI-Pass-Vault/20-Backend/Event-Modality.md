# Event modality (presencial vs online)

Events are either **presencial** (door ticket + QR e-mail) or **online** (meeting URL, no QR). Decision: [[60-Decisions/ADR-010-online-vs-presencial]]. SQL: `frontend/sql/event_modality.sql` (additive; existing rows default to `presencial`) plus `frontend/sql/event_online_access_extras.sql` (optional WhatsApp group URL + confirmation-email HTML).

**Apply before deploy.** Staging Neon already has `modality` / `meeting_url` (applied 2026-09-14). Prod still needs that file in the Neon SQL editor before the matching app release. Apply `event_online_access_extras.sql` on the same databases before shipping WhatsApp / extra confirmation HTML.

## Schema
`events.modality` — `presencial` | `online`, `NOT NULL`, default `presencial`. CHECK `events_modality_chk`.
`events.meeting_url` — varchar(500), nullable. CHECK `events_online_meeting_url_chk`: required (non-blank) when modality is `online`. Secret on public APIs; confirmation e-mail **and** Meus Ingressos for confirmed holders.
`events.whatsapp_group_url` — varchar(500), nullable. Optional, **online only**. Secret on public APIs; confirmed holders get **Entrar no grupo**. Switching to presencial clears it.
`events.confirmation_email_html` — text, nullable. Optional TipTap HTML injected into the purchase confirmation e-mail (both modalities). Empty/`<p></p>` = default template. Stripped from public APIs.

## Admin
Create/edit (`/admin/events?tab=novo` and `/admin/events/:id`) share `EventFormFields`:
- Radio **Presencial** / **Online**.
- **Link da reunião** appears only for online; required; `https://` URL.
- **Link do grupo no WhatsApp** appears only for online; optional; `https://` URL.
- **Mensagem extra no e-mail de confirmação** TipTap editor (all modalities; same stack as cortesia/lembrete/comunicado). Empty editor stores null.
- `location` stays required for both (online: platform name such as Zoom).

API: `POST /api/admin/events` and `PATCH /api/admin/events/:eventId` accept `modality`, `meeting_url`, `whatsapp_group_url`, `confirmation_email_html` (multipart). Switching back to presencial clears `meeting_url` and `whatsapp_group_url`. Admin GET returns the secrets; public GET does not (`toPublicEvent`).

## After purchase
All confirmation paths go through `server/utils/sendPurchaseConfirmationEmail.ts` (paid webhook `finalizeOrderPaidLikeWebhook`, free `POST /api/events/:id/subscribe`, courtesy `POST /api/courtesy/redeem`):

| Modality | QR | E-mail | In-app (paid / courtesy) |
|---|---|---|---|
| presencial | generated and stored on the order | ticket + inline QR (`ticketEmailTemplate.ts`) + optional HTML inject | QR actions on Meus Ingressos |
| online | skipped | meeting link, no ticket (`onlineEventEmailTemplate.ts`) + optional HTML inject | **Acessar reunião**; **Entrar no grupo** if WhatsApp is set |

The order row is still created (attendance / Make.com). Check-in via QR does not apply to online events.

Paid finalization also POSTs to Make.com with `event.modality` and `event.meetingUrl` (internal webhook). Confirmed attendees also see meeting + optional WhatsApp on `GET /api/orders`. Free subscribe 201 includes `whatsappGroupUrl` so the client can `window.open` the group. Home hero and Event Details both go through `useFreeSubscribe`.

Pending paid orders must not include meeting or WhatsApp URLs.

## Public UI
Home, `/eventos`, `/event/:id`, EventCard, PaymentModal: show **Online** / badge **Evento Online**. Never render `meetingUrl` or `whatsappGroupUrl` on public pages. Helper: `shared/eventModality.ts` (`isOnlineEvent`, `publicEventLocationLabel`). Public list/detail strip the three secrets via `toPublicEvent` in `server/utils/eventModality.ts`.

Profile Meus Ingressos (confirmed online): buttons, not “link enviado por e-mail.” See [[30-Frontend/Frontend-Overview]].

## Changing the confirmation e-mail
Hardcoded online/presencial templates are **not** the admin HTML templates (cortesia / lembrete / comunicado). Edit the TypeScript files and restart the server. Per-event extras go through the TipTap field on the event form (`confirmation_email_html`); they are sanitized with the courtesy allow-list and injected after the greeting.

| What | File |
|---|---|
| Online HTML/text + instruction list | `server/utils/onlineEventEmailTemplate.ts` (`ONLINE_EVENT_INSTRUCTIONS`, `buildOnlineEventEmailHtml` / `Text`) |
| Online subject | `emailService.sendOnlineEventEmail` — `Seu link de acesso - ${title} - CDPI Pass` |
| Presencial HTML/text + QR instructions | `server/utils/ticketEmailTemplate.ts` (`TICKET_INSTRUCTIONS`, `TICKET_CONFIRMATION_LINE`) |
| Presencial subject | `emailService.sendTicketEmail` — `Seu ingresso para ${title} - CDPI Pass` |
| Optional inject | `events.confirmation_email_html` via `confirmationEmailCustomBlockHtml` |

`TICKET_CONFIRMATION_LINE` (`paid` / `free` / `courtesy`) is shared by both templates. Online data: `userName`, `eventTitle`, `eventDate`, `meetingUrl`, `orderId`, `confirmationKind`, optional `customHtml`. Keep the meeting URL as an `href` and as visible text. Copy tests: `server/test/utils/onlineEventEmailTemplate.test.ts`, `ticketEmailTemplate.test.ts`. Combos: `server/test/integration/eventOnlineAccess.integration.test.ts`.

## Related
- [[60-Decisions/ADR-010-online-vs-presencial]]
- [[20-Backend/API-Endpoints]]
- [[20-Backend/Services-Overview]]
- [[30-Frontend/Frontend-Overview]]
- [[40-Database/Schema-Overview]]
- [[40-Database/Normalization-History]]
