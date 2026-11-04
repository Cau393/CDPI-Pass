import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cardChargeLockFor,
  dropGuestAccessTokens,
  guestTokenEpoch,
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

  it("one throwing listener does not stop the others", () => {
    const heard = vi.fn();
    const offBad = subscribeGuestTokenDrop(() => {
      throw new Error("boom");
    });
    const offGood = subscribeGuestTokenDrop(heard);
    expect(() => dropGuestAccessTokens()).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });

  it("each drop moves the auth epoch", () => {
    const before = guestTokenEpoch();
    dropGuestAccessTokens();
    expect(guestTokenEpoch()).toBe(before + 1);
  });
});
