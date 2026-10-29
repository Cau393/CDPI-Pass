import { describe, it, expect, afterEach } from "vitest";
import { isAuthResolving } from "../../lib/authResolving";

afterEach(() => localStorage.clear());

describe("isAuthResolving (N2)", () => {
  it("is true only while loading with a session token stored", () => {
    localStorage.setItem("token", "t");
    expect(isAuthResolving(true)).toBe(true);
    expect(isAuthResolving(false)).toBe(false);
    expect(isAuthResolving(undefined)).toBe(false);
  });
  it("is false without a token: the guest is never stuck behind a spinner", () => {
    expect(isAuthResolving(true)).toBe(false);
  });
});
