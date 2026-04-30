import { describe, it, expect } from "vitest";
import { buildUndoCheckInPatch } from "../../utils/undoCheckInUpdate";
import type { Order } from "@shared/schema";

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    userId: "u1",
    eventId: "e1",
    courtesyAttendeeId: null,
    cpf: "000.000.000-00",
    status: "paid",
    paymentMethod: "pix",
    amount: "100.00",
    asaasPaymentId: null,
    courtesyLinkId: null,
    qrCodeData: null,
    qrCodeUsed: true,
    qrCodeUsedAt: new Date("2026-01-01T12:00:00Z"),
    maxUses: 2,
    amntUsed: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    qr_code_s3_url: null,
    ...overrides,
  };
}

describe("buildUndoCheckInPatch", () => {
  it("decrements amntUsed and clears flags when last use is removed", () => {
    const order = baseOrder({ amntUsed: 1, maxUses: 2 });
    const patch = buildUndoCheckInPatch(order);
    expect(patch.amntUsed).toBe(0);
    expect(patch.qrCodeUsed).toBe(false);
    expect(patch.qrCodeUsedAt).toBeNull();
  });

  it("keeps qrCodeUsedAt when uses remain", () => {
    const at = new Date("2026-06-01T10:00:00Z");
    const order = baseOrder({ amntUsed: 2, maxUses: 3, qrCodeUsedAt: at });
    const patch = buildUndoCheckInPatch(order);
    expect(patch.amntUsed).toBe(1);
    expect(patch.qrCodeUsed).toBe(true);
    expect(patch.qrCodeUsedAt).toEqual(at);
  });
});
