/**
 * iCalendar invite attached to the online purchase-confirmation email.
 *
 * Events store a single start instant. DTEND is that instant plus three hours
 * (see ADR-013). Timestamps are written in UTC (`YYYYMMDDTHHMMSSZ`) from UTC
 * getters so the file is correct whether the Node process runs in UTC or in
 * America/Sao_Paulo. Calendar apps convert Zulu time to the viewer's zone.
 */

export const ONLINE_EVENT_DURATION_MS = 3 * 60 * 60 * 1000;

const ICS_LINE_MAX_OCTETS = 75;

export interface CalendarInviteInput {
  eventTitle: string;
  eventDate: Date;
  meetingUrl: string;
  attendeeName: string;
  attendeeEmail: string;
  orderId: string;
  organizerEmail: string;
  /** Defaults to now. Tests pass a fixed instant to assert DTSTAMP. */
  stampedAt?: Date;
}

export interface CalendarInviteAttachment {
  filename: string;
  content: string;
  type: string;
  disposition: string;
}

/** UTC instant as `YYYYMMDDTHHMMSSZ`. */
export function formatIcsUtc(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/** Escape TEXT values: backslash, semicolon, comma, and newlines. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function quoteIcsParam(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Fold at 75 octets (RFC 5545). Continuation lines start with a space.
 * ASCII content (URLs, titles we escape) stays within the octet limit
 * because each character is one byte after escaping.
 */
function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= ICS_LINE_MAX_OCTETS) return line;

  const parts: string[] = [];
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const limit = first ? ICS_LINE_MAX_OCTETS : ICS_LINE_MAX_OCTETS - 1;
    let bytes = 0;
    let take = 0;
    for (const ch of remaining) {
      const size = Buffer.byteLength(ch, "utf8");
      if (bytes + size > limit) break;
      bytes += size;
      take += ch.length;
    }
    if (take === 0) {
      take = 1;
    }
    const chunk = remaining.slice(0, take);
    parts.push(first ? chunk : ` ${chunk}`);
    remaining = remaining.slice(take);
    first = false;
  }
  return parts.join("\r\n");
}

export function buildCalendarInviteIcs(input: CalendarInviteInput): string | null {
  const start = new Date(input.eventDate);
  if (Number.isNaN(start.getTime())) return null;

  const meetingUrl = input.meetingUrl.trim();
  if (!meetingUrl) return null;

  const end = new Date(start.getTime() + ONLINE_EVENT_DURATION_MS);
  const stampedAt = input.stampedAt ? new Date(input.stampedAt) : new Date();
  const description = `${meetingUrl}\nLink da reunião online do CDPI Pass.`;

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//CDPI Pass//Online Event//PT",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:order-${input.orderId}@cdpipharma.com.br`,
    `DTSTAMP:${formatIcsUtc(stampedAt)}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(input.eventTitle)}`,
    `LOCATION:${escapeIcsText(meetingUrl)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `ORGANIZER;CN=${quoteIcsParam("CDPI Pass")}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${quoteIcsParam(input.attendeeName)};RSVP=TRUE:mailto:${input.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function buildCalendarInviteAttachment(
  input: CalendarInviteInput,
): CalendarInviteAttachment | null {
  const ics = buildCalendarInviteIcs(input);
  if (!ics) return null;

  return {
    filename: "invite.ics",
    content: Buffer.from(ics, "utf8").toString("base64"),
    type: "text/calendar; method=REQUEST",
    disposition: "attachment",
  };
}
