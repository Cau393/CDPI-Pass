import { describe, it, expect } from "vitest";
import {
  buildCalendarInviteAttachment,
  buildCalendarInviteIcs,
  formatIcsUtc,
} from "../../utils/calendarInvite";

const input = {
  eventTitle: "Workshop, Online; São Paulo",
  eventDate: new Date("2026-10-20T11:30:00.000Z"),
  meetingUrl: "https://zoom.us/j/123456",
  attendeeName: "Maria",
  attendeeEmail: "maria@example.com",
  orderId: "abc-123",
  organizerEmail: "relacionamento.mkt@cdpipharma.com.br",
  stampedAt: new Date("2026-10-02T14:20:00.000Z"),
};

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

describe("formatIcsUtc", () => {
  it("formats a UTC instant as YYYYMMDDTHHMMSSZ", () => {
    expect(formatIcsUtc(new Date("2026-10-20T11:30:00.000Z"))).toBe(
      "20261020T113000Z",
    );
  });
});

describe("buildCalendarInviteIcs", () => {
  it("writes start and a three-hour end in UTC", () => {
    const ics = unfold(buildCalendarInviteIcs(input)!);
    expect(ics).toContain("DTSTART:20261020T113000Z");
    expect(ics).toContain("DTEND:20261020T143000Z");
    expect(ics).toContain("DTSTAMP:20261002T142000Z");
    expect(ics).toContain("UID:order-abc-123@cdpipharma.com.br");
    expect(ics).toContain("METHOD:REQUEST");
  });

  it("puts the meeting URL in LOCATION and DESCRIPTION", () => {
    const ics = unfold(buildCalendarInviteIcs(input)!);
    expect(ics).toContain("LOCATION:https://zoom.us/j/123456");
    expect(ics).toContain(
      "DESCRIPTION:https://zoom.us/j/123456\\nLink da reunião online do CDPI Pass.",
    );
  });

  it("escapes commas and semicolons in the title", () => {
    const ics = unfold(buildCalendarInviteIcs(input)!);
    expect(ics).toContain("SUMMARY:Workshop\\, Online\\; São Paulo");
  });

  it("uses CRLF and folds lines longer than 75 octets", () => {
    const longUrl = `https://zoom.us/j/${"a".repeat(80)}`;
    const ics = buildCalendarInviteIcs({ ...input, meetingUrl: longUrl })!;
    expect(ics).toContain("\r\n");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(
      true,
    );
    expect(unfold(ics)).toContain(`LOCATION:${longUrl}`);
  });

  it("returns null for an invalid start or a blank meeting URL", () => {
    expect(buildCalendarInviteIcs({ ...input, eventDate: new Date(Number.NaN) })).toBeNull();
    expect(buildCalendarInviteIcs({ ...input, meetingUrl: "   " })).toBeNull();
  });
});

describe("buildCalendarInviteAttachment", () => {
  it("returns a base64 text/calendar attachment named invite.ics", () => {
    const attachment = buildCalendarInviteAttachment(input)!;
    expect(attachment.filename).toBe("invite.ics");
    expect(attachment.type).toBe("text/calendar; method=REQUEST");
    expect(attachment.disposition).toBe("attachment");
    const decoded = Buffer.from(attachment.content, "base64").toString("utf8");
    expect(decoded).toContain("BEGIN:VCALENDAR");
    expect(decoded).toContain("DTSTART:20261020T113000Z");
    expect(decoded.endsWith("\r\n")).toBe(true);
  });

  it("returns null when the invite cannot be built", () => {
    expect(buildCalendarInviteAttachment({ ...input, meetingUrl: "" })).toBeNull();
  });
});
