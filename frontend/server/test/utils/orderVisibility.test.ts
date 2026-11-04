import { describe, it, expect } from "vitest";
import { ownerCanSeeOrder } from "../../utils/orderVisibility";

// ADR-017 Stage 2: an order placed as a guest stays hidden from the account that owns
// the e-mail until that e-mail is verified (a squatter could otherwise read it).
const user = { id: "u1", emailVerified: true as boolean | null };

describe("ownerCanSeeOrder", () => {
  it("shows a normal order to its owner, verified or not", () => {
    expect(ownerCanSeeOrder({ userId: "u1", placedAsGuest: false }, { ...user, emailVerified: true })).toBe(true);
    expect(ownerCanSeeOrder({ userId: "u1", placedAsGuest: false }, { ...user, emailVerified: false })).toBe(true);
  });

  it("shows a guest order only once the e-mail is verified", () => {
    expect(ownerCanSeeOrder({ userId: "u1", placedAsGuest: true }, { ...user, emailVerified: true })).toBe(true);
    expect(ownerCanSeeOrder({ userId: "u1", placedAsGuest: true }, { ...user, emailVerified: false })).toBe(false);
  });

  it("hides a guest order when emailVerified is null", () => {
    expect(ownerCanSeeOrder({ userId: "u1", placedAsGuest: true }, { ...user, emailVerified: null })).toBe(false);
  });

  it("never shows another user's order", () => {
    expect(ownerCanSeeOrder({ userId: "u2", placedAsGuest: false }, user)).toBe(false);
    expect(ownerCanSeeOrder({ userId: "u2", placedAsGuest: true }, user)).toBe(false);
  });
});
