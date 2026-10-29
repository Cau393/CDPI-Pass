import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

const authState: { user: { id: string } | undefined } = { user: undefined };
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user: authState.user }) }));

import { useDropGuestTokenOnAuthChange } from "../../hooks/useDropGuestTokenOnAuthChange";
import { cardChargeLockFor, lockCardCharge, resetCardChargeLocks } from "../../lib/cardChargeLock";

afterEach(() => {
  resetCardChargeLocks();
  authState.user = undefined;
});

function mountWithLock() {
  lockCardCharge("ev-1", { orderId: "o-1", accessToken: "tok-1" });
  return renderHook(() => useDropGuestTokenOnAuthChange());
}

describe("useDropGuestTokenOnAuthChange (R2)", () => {
  it("keeps the token on mount and on a re-render with the same user", () => {
    authState.user = { id: "u-1" };
    const { rerender } = mountWithLock();
    rerender();
    expect(cardChargeLockFor("ev-1")!.accessToken).toBe("tok-1");
  });

  it.each([
    ["login", undefined, { id: "u-2" }],
    ["logout", { id: "u-1" }, undefined],
    ["a different account", { id: "u-1" }, { id: "u-2" }],
  ])("drops the token on %s but keeps the lock", (_name, before, after) => {
    authState.user = before;
    const { rerender } = mountWithLock();
    authState.user = after;
    rerender();
    const lock = cardChargeLockFor("ev-1");
    expect(lock).not.toBeNull();
    expect(lock!.orderId).toBe("o-1");
    expect(lock!.accessToken).toBeNull();
  });
});
