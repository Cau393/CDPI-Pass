import { describe, it, expect } from "vitest";
import {
  filterEligibleReminderLinks,
  deduplicateReminderLinksByEmail,
} from "../../utils/reminderEligibility";
import type { CourtesyLinkMassSendLike } from "../../utils/massSendCourtesyQueries";

const base = (over: Partial<CourtesyLinkMassSendLike>): CourtesyLinkMassSendLike => ({
  id: "1",
  eventId: "e1",
  code: "CODE1",
  recipientEmail: "a@b.com",
  recipientName: "Alice",
  ticketCount: 3,
  usedCount: 1,
  isActive: true,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  ...over,
});

describe("filterEligibleReminderLinks", () => {
  it("should return empty array for empty input", () => {
    expect(filterEligibleReminderLinks([])).toEqual([]);
  });

  it("should include an active link with remaining > 0", () => {
    const link = base({ ticketCount: 3, usedCount: 1, isActive: true });
    expect(filterEligibleReminderLinks([link])).toHaveLength(1);
  });

  it("should exclude links where remaining is 0 (fully redeemed)", () => {
    const link = base({ ticketCount: 2, usedCount: 2, isActive: true });
    expect(filterEligibleReminderLinks([link])).toHaveLength(0);
  });

  it("should exclude links where isActive is false", () => {
    const link = base({ ticketCount: 3, usedCount: 0, isActive: false });
    expect(filterEligibleReminderLinks([link])).toHaveLength(0);
  });

  it("should exclude links where isActive is null", () => {
    const link = base({ ticketCount: 3, usedCount: 0, isActive: null });
    expect(filterEligibleReminderLinks([link])).toHaveLength(0);
  });

  it("should treat null usedCount as 0 when computing remaining", () => {
    const link = base({ ticketCount: 2, usedCount: null, isActive: true });
    expect(filterEligibleReminderLinks([link])).toHaveLength(1);
  });
});

describe("deduplicateReminderLinksByEmail", () => {
  it("should return empty for empty input", () => {
    expect(deduplicateReminderLinksByEmail([])).toEqual([]);
  });

  it("should keep only the first link when two share the same email", () => {
    const l1 = base({ id: "1", recipientEmail: "a@b.com" });
    const l2 = base({ id: "2", recipientEmail: "a@b.com" });
    const result = deduplicateReminderLinksByEmail([l1, l2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("should keep all links when emails are different", () => {
    const l1 = base({ id: "1", recipientEmail: "a@b.com" });
    const l2 = base({ id: "2", recipientEmail: "c@d.com" });
    expect(deduplicateReminderLinksByEmail([l1, l2])).toHaveLength(2);
  });

  it("should be case-insensitive when deduplicating emails", () => {
    const l1 = base({ id: "1", recipientEmail: "A@B.COM" });
    const l2 = base({ id: "2", recipientEmail: "a@b.com" });
    const result = deduplicateReminderLinksByEmail([l1, l2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});
