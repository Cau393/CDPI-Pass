import { describe, it, expect } from "vitest";
import {
  filterMassSendLinksByEvent,
  isMassSendCourtesyLinkRow,
  mapRedemptionRowFromOrder,
  buildMassSendRecipientIlikePattern,
  type CourtesyLinkMassSendLike,
} from "../../utils/massSendCourtesyQueries";

const baseLink = (over: Partial<CourtesyLinkMassSendLike>): CourtesyLinkMassSendLike => ({
  id: "1",
  eventId: "e1",
  code: "CDPITEST",
  recipientEmail: "a@b.com",
  recipientName: "Alice",
  ticketCount: 3,
  usedCount: 1,
  isActive: true,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  ...over,
});

describe("massSendCourtesyQueries (T-01 — mass send filter)", () => {
  it("treats rows with name and email as mass-send", () => {
    expect(isMassSendCourtesyLinkRow(baseLink({}))).toBe(true);
  });

  it("excludes when recipientEmail is null or empty", () => {
    expect(
      isMassSendCourtesyLinkRow(baseLink({ recipientEmail: null })),
    ).toBe(false);
    expect(
      isMassSendCourtesyLinkRow(baseLink({ recipientEmail: "  " })),
    ).toBe(false);
  });

  it("excludes when recipientName is null or empty", () => {
    expect(
      isMassSendCourtesyLinkRow(baseLink({ recipientName: null })),
    ).toBe(false);
  });

  it("filterMassSendLinksByEvent returns only that event and mass-send rows", () => {
    const links = [
      baseLink({ id: "1", eventId: "e1" }),
      baseLink({ id: "2", eventId: "e2" }),
      baseLink({ id: "3", eventId: "e1", recipientName: null }),
    ];
    const out = filterMassSendLinksByEvent(links, "e1");
    expect(out.map((l) => l.id)).toEqual(["1"]);
  });
});

describe("mapRedemptionRowFromOrder (T-02 — join + fallback)", () => {
  it("uses attendee when present", () => {
    const row = mapRedemptionRowFromOrder({
      orderId: "o1",
      orderStatus: "paid",
      amntUsed: 0,
      maxUses: 1,
      qrCodeUsedAt: null,
      orderCreatedAt: new Date("2026-04-20T12:00:00.000Z"),
      attName: "Maria",
      attEmail: "m@x.com",
      attCpf: "111.111.111-11",
      attPhone: "(11) 99999-9999",
      uName: "Buyer",
      uEmail: "b@u.com",
      uCpf: "222.222.222-22",
      uPhone: "(21) 88888-8888",
    });
    expect(row.attendeeName).toBe("Maria");
    expect(row.attendeeEmail).toBe("m@x.com");
    expect(row.amntUsed).toBe(0);
  });

  it("falls back to buyer (user) when courtesy attendee is missing", () => {
    const row = mapRedemptionRowFromOrder({
      orderId: "o1",
      orderStatus: "paid",
      amntUsed: 0,
      maxUses: 1,
      qrCodeUsedAt: null,
      orderCreatedAt: new Date("2026-04-20T12:00:00.000Z"),
      attName: null,
      attEmail: null,
      attCpf: null,
      attPhone: null,
      uName: "Comprador",
      uEmail: "c@u.com",
      uCpf: "333.333.333-33",
      uPhone: "(31) 77777-7777",
    });
    expect(row.attendeeName).toBe("Comprador");
    expect(row.attendeeEmail).toBe("c@u.com");
  });
});

describe("buildMassSendRecipientIlikePattern", () => {
  it("returns null for empty search", () => {
    expect(buildMassSendRecipientIlikePattern("  ")).toBeNull();
  });

  it("caps at 120 chars", () => {
    const long = "x".repeat(200);
    const p = buildMassSendRecipientIlikePattern(long);
    expect(p).not.toBeNull();
    expect(p!.length).toBe(122);
  });
});
