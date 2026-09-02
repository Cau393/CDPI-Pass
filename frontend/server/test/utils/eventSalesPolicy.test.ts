import { describe, it, expect } from "vitest";
import {
  CONVENIENCE_FEE,
  checkFreeSubscriptionAllowed,
  checkPaidPurchaseAllowed,
  computeOrderTotal,
  isEventFull,
  isFreeEvent,
  isSalesClosed,
  normalizeEventPrice,
  parseBooleanField,
  salesBlockedMessage,
  salesBlockedStatus,
  type EventSalesFacts,
} from "../../utils/eventSalesPolicy";

/** A normal paid event with sales open and no capacity limit. */
const paidOpen: EventSalesFacts = {
  price: "100.00",
  isFree: false,
  salesClosed: false,
  maxAttendees: null,
  currentAttendees: 0,
};

const freeOpen: EventSalesFacts = { ...paidOpen, price: "0.00", isFree: true };

describe("flag readers", () => {
  it("treats missing flags as false, so legacy rows stay paid and open", () => {
    const legacy: EventSalesFacts = { price: "50.00" };
    expect(isFreeEvent(legacy)).toBe(false);
    expect(isSalesClosed(legacy)).toBe(false);
  });

  it("treats null flags as false", () => {
    expect(isFreeEvent({ price: "1", isFree: null })).toBe(false);
    expect(isSalesClosed({ price: "1", salesClosed: null })).toBe(false);
  });
});

describe("isEventFull", () => {
  it("is never full when maxAttendees is unset", () => {
    expect(isEventFull({ price: "1", currentAttendees: 9999 })).toBe(false);
  });

  it("is full only at or above capacity", () => {
    expect(isEventFull({ price: "1", maxAttendees: 2, currentAttendees: 1 })).toBe(false);
    expect(isEventFull({ price: "1", maxAttendees: 2, currentAttendees: 2 })).toBe(true);
    expect(isEventFull({ price: "1", maxAttendees: 2, currentAttendees: 3 })).toBe(true);
  });
});

describe("checkPaidPurchaseAllowed (POST /api/orders)", () => {
  it("allows a normal paid purchase", () => {
    expect(checkPaidPurchaseAllowed(paidOpen)).toEqual({ ok: true });
  });

  it("blocks when sales are closed", () => {
    expect(checkPaidPurchaseAllowed({ ...paidOpen, salesClosed: true })).toEqual({
      ok: false,
      reason: "sales_closed",
    });
  });

  it("blocks paid checkout on a free event, so no Asaas charge is ever created", () => {
    expect(checkPaidPurchaseAllowed(freeOpen)).toEqual({
      ok: false,
      reason: "event_is_free",
    });
  });

  it("blocks when the event is full", () => {
    expect(
      checkPaidPurchaseAllowed({ ...paidOpen, maxAttendees: 10, currentAttendees: 10 }),
    ).toEqual({ ok: false, reason: "event_full" });
  });

  it("reports sales_closed ahead of event_full when both apply", () => {
    const blocked = checkPaidPurchaseAllowed({
      ...paidOpen,
      salesClosed: true,
      maxAttendees: 1,
      currentAttendees: 1,
    });
    expect(blocked).toEqual({ ok: false, reason: "sales_closed" });
  });
});

describe("checkFreeSubscriptionAllowed (POST /api/events/:id/subscribe)", () => {
  it("allows a free subscription on a free, open event", () => {
    expect(checkFreeSubscriptionAllowed(freeOpen)).toEqual({ ok: true });
  });

  it("blocks free subscription on a PAID event — the key anti-fraud check", () => {
    expect(checkFreeSubscriptionAllowed(paidOpen)).toEqual({
      ok: false,
      reason: "event_is_paid",
    });
  });

  it("blocks free subscription when sales are closed", () => {
    expect(checkFreeSubscriptionAllowed({ ...freeOpen, salesClosed: true })).toEqual({
      ok: false,
      reason: "sales_closed",
    });
  });

  it("blocks free subscription when the event is full", () => {
    expect(
      checkFreeSubscriptionAllowed({ ...freeOpen, maxAttendees: 5, currentAttendees: 5 }),
    ).toEqual({ ok: false, reason: "event_full" });
  });

  it("does not let a client-claimed free flag bypass a paid event", () => {
    // Simulates the event row as stored: paid. Whatever the client sent is irrelevant.
    const storedPaid: EventSalesFacts = { price: "250.00", isFree: false };
    expect(checkFreeSubscriptionAllowed(storedPaid).ok).toBe(false);
  });
});

describe("computeOrderTotal", () => {
  it("adds the R$5 convenience fee to a paid event", () => {
    expect(computeOrderTotal(paidOpen)).toBe(105);
  });

  it("applies the fee on top of a promo override price", () => {
    expect(computeOrderTotal(paidOpen, "40.00")).toBe(45);
  });

  it("charges exactly zero for a free event — no price, no fee", () => {
    expect(computeOrderTotal(freeOpen)).toBe(0);
  });

  it("ignores a promo override on a free event", () => {
    expect(computeOrderTotal(freeOpen, "99.00")).toBe(0);
  });

  it("never charges the fee alone on a malformed price", () => {
    expect(computeOrderTotal({ price: "not-a-number", isFree: false })).toBe(
      CONVENIENCE_FEE,
    );
  });
});

describe("normalizeEventPrice", () => {
  it("pins a free event to 0.00 regardless of the submitted price", () => {
    expect(normalizeEventPrice("199.90", true)).toBe("0.00");
  });

  it("leaves a paid event price untouched", () => {
    expect(normalizeEventPrice("199.90", false)).toBe("199.90");
  });
});

describe("parseBooleanField (multipart sends strings)", () => {
  it("accepts the truthy spellings a form can produce", () => {
    for (const v of ["true", "TRUE", " true ", "1", "on", "yes", true]) {
      expect(parseBooleanField(v)).toBe(true);
    }
  });

  it("treats anything else as false, so garbage cannot make an event free", () => {
    for (const v of ["false", "0", "off", "", "banana", undefined, null, {}, 1]) {
      expect(parseBooleanField(v)).toBe(false);
    }
  });
});

describe("blocked-sale responses", () => {
  it("uses 409 for sales_closed and 400 for the rest", () => {
    expect(salesBlockedStatus("sales_closed")).toBe(409);
    expect(salesBlockedStatus("event_full")).toBe(400);
    expect(salesBlockedStatus("event_is_free")).toBe(400);
    expect(salesBlockedStatus("event_is_paid")).toBe(400);
  });

  it("has a distinct pt-BR message for every reason", () => {
    const messages = (
      ["sales_closed", "event_full", "event_is_free", "event_is_paid"] as const
    ).map(salesBlockedMessage);
    expect(new Set(messages).size).toBe(messages.length);
    for (const m of messages) expect(m.length).toBeGreaterThan(0);
  });
});
