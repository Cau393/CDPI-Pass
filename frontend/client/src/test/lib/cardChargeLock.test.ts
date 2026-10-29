import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cardChargeLockFor,
  dropGuestAccessTokens,
  lockCardCharge,
  resetCardChargeLocks,
  subscribeGuestTokenDrop,
} from "../../lib/cardChargeLock";

afterEach(() => resetCardChargeLocks());

describe("cardChargeLock — dropGuestAccessTokens (R2)", () => {
  it("drops the guest token from every lock but keeps each lock and its order", () => {
    lockCardCharge("ev-1", { orderId: "o-1", accessToken: "tok-1" });
    lockCardCharge("ev-2", { orderId: "o-2", accessToken: "tok-2" });
    dropGuestAccessTokens();
    for (const [id, orderId] of [["ev-1", "o-1"], ["ev-2", "o-2"]] as const) {
      const lock = cardChargeLockFor(id);
      expect(lock).not.toBeNull();
      expect(lock!.orderId).toBe(orderId);
      expect(lock!.accessToken).toBeNull();
      expect(lock!.guestTokenDropped).toBe(true);
    }
  });

  it("leaves a logged-in lock (no token) untouched", () => {
    lockCardCharge("ev-1", { orderId: "o-1", accessToken: null });
    dropGuestAccessTokens();
    expect(cardChargeLockFor("ev-1")).toEqual({ orderId: "o-1", accessToken: null });
  });

  it("notifies subscribers, and an unsubscribed one hears nothing", () => {
    const heard = vi.fn();
    const off = subscribeGuestTokenDrop(heard);
    dropGuestAccessTokens();
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    dropGuestAccessTokens();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
