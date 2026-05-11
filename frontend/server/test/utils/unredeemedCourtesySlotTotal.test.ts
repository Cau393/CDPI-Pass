import { describe, it, expect } from "vitest";

/**
 * Mirrors storage.getCourtesyUnredeemedSlotTotalForEvent SQL:
 * SUM(GREATEST(ticket_count - COALESCE(used_count, 0), 0))
 * WHERE event_id matches AND is_active = true AND override_price IS NULL (cortesia only, not promo).
 */
function expectedUnredeemedTotal(
  rows: ReadonlyArray<{
    ticketCount: number;
    usedCount?: number | null;
    isActive?: boolean | null;
    overridePrice?: string | null;
  }>,
): number {
  return rows.reduce((sum, row) => {
    if (row.isActive !== true) return sum;
    if (row.overridePrice != null) {
      return sum;
    }
    const remaining = row.ticketCount - (row.usedCount ?? 0);
    return sum + Math.max(0, remaining);
  }, 0);
}

describe("unredeemed courtesy slot total (cortesia only, excludes promo)", () => {
  it("sums remaining uses for active cortesia rows only", () => {
    const rows = [
      { ticketCount: 10, usedCount: 3, isActive: true },
      { ticketCount: 5, usedCount: 5, isActive: true },
      { ticketCount: 2, usedCount: 0, isActive: true },
    ];
    expect(expectedUnredeemedTotal(rows)).toBe(7 + 0 + 2);
  });

  it("ignores inactive links entirely", () => {
    expect(
      expectedUnredeemedTotal([
        { ticketCount: 100, usedCount: 0, isActive: false },
        { ticketCount: 1, usedCount: 0, isActive: true },
      ]),
    ).toBe(1);
  });

  it("excludes promotional links (override_price set)", () => {
    expect(
      expectedUnredeemedTotal([
        {
          ticketCount: 50,
          usedCount: 0,
          isActive: true,
          overridePrice: "49.99",
        },
        { ticketCount: 3, usedCount: 1, isActive: true, overridePrice: null },
      ]),
    ).toBe(2);
  });

  it("treats null used_count as zero", () => {
    expect(
      expectedUnredeemedTotal([{ ticketCount: 4, usedCount: null, isActive: true }]),
    ).toBe(4);
  });

  it("floors exhausted links at zero (used_count > ticket_count)", () => {
    expect(
      expectedUnredeemedTotal([{ ticketCount: 1, usedCount: 5, isActive: true }]),
    ).toBe(0);
  });
});
