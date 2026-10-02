# ADR-013: Online confirmation calendar invite

- **Date**: 2026-10-02
- **Status**: accepted

## Context
Online purchase confirmations email a meeting URL in the HTML body. Apple Mail and Outlook can show a native calendar card when the message also carries a `text/calendar` invite, but events only store a start instant (`events.date`). There is no end time.

## Decision
- `sendOnlineEventEmail` attaches `invite.ics` (`text/calendar; method=REQUEST`, disposition `attachment`, base64 content) when the start instant and meeting URL are present.
- `DTSTART` and `DTEND` are UTC (`YYYYMMDDTHHMMSSZ`), formatted with UTC getters. `DTEND` is the start plus 3 hours.
- The meeting URL is both `LOCATION` and part of `DESCRIPTION`. `UID` is `order-{orderId}@cdpipharma.com.br` so a resend updates the same calendar entry.
- The HTML and plain-text bodies mention that `invite.ics` is attached. Presencial ticket mail, courtesy mass-send, and reminders are unchanged.
- Builder: `server/utils/calendarInvite.ts`. No new dependency and no schema change.

## Alternatives considered
- `application/ics` without `METHOD:REQUEST`: rejected. Clients treat that as a generic download and skip the calendar card.
- A new end-time column on the event form: deferred. Operators asked for a fixed 3-hour duration instead.
- A `multipart/alternative` calendar part so classic Outlook shows Accept / Tentative / Decline: not available. SendGrid's mail API only accepts attachments.

## Consequences
- Calendar apps in America/Sao_Paulo show the same wall time as the confirmation email (UTC−3), three hours long.
- Classic Outlook may only offer Add to Calendar / open the file, not RSVP buttons.
- Changing the assumed duration means editing `ONLINE_EVENT_DURATION_MS` and this ADR together.
