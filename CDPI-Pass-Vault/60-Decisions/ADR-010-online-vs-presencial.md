# ADR-010: Online vs presencial event modality

- **Date**: 2026-09-14
- **Status**: accepted

## Context
Events were always treated as in-person: every confirmed purchase generated a QR ticket and the confirmation e-mail attached that QR. Online courses need a meeting URL instead of a door ticket, and that URL must not leak on the public event page before purchase.

## Decision
- `events.modality` is `presencial` (default) or `online`. Existing rows stay presencial via the SQL DEFAULT.
- Online events require `events.meeting_url`. The URL is omitted from public `GET /api/events` responses. After purchase (paid, free, or courtesy) it is sent in the confirmation e-mail **and** shown in-app on Meus Ingressos (`Acessar reunião`). Optional `events.whatsapp_group_url` follows the same secrecy: public APIs omit it; confirmed holders get **Entrar no grupo**. Free subscribe also `window.open`s the WhatsApp URL when present.
- Online events skip QR generation. The order row is still created for attendance tracking.
- Presencial flow is unchanged (QR + ticket e-mail). Optional `confirmation_email_html` may be injected into either confirmation e-mail.

## Alternatives considered
- Show the meeting URL on the public event page: rejected. Anyone could join without buying.
- Keep the meeting URL confirmation-e-mail-only and never show it in the app: rejected. Confirmed attendees need the meeting (and optional WhatsApp group) on Meus Ingressos without digging through e-mail.
- Keep generating a QR for online events and hide it only in the e-mail: rejected. Online events have no door check-in.

## Consequences
- Admin create/edit forms gain a Presencial/Online selector, a conditional meeting URL, optional WhatsApp group URL (online), and optional confirmation-email HTML (all modalities).
- Confirmation e-mail for online events uses `onlineEventEmailTemplate.ts` instead of the ticket template; optional TipTap HTML injects into both templates.
- Public surfaces show "Online" / "Evento Online" and never the meeting or WhatsApp URL.
- Schema: `frontend/sql/event_modality.sql` + `frontend/sql/event_online_access_extras.sql`. Implementation notes: [[20-Backend/Event-Modality]].
