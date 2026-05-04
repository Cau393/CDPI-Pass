import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getValidatedNextPath } from "../../lib/authRedirect";

describe("getValidatedNextPath", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://example.org" },
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns home when absent or empty", () => {
    expect(getValidatedNextPath(null)).toBe("/");
    expect(getValidatedNextPath(undefined)).toBe("/");
    expect(getValidatedNextPath("   ")).toBe("/");
  });

  it("allows event path without promo", () => {
    expect(getValidatedNextPath("/event/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/event/550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("canonicalizes event path with promo query", () => {
    expect(
      getValidatedNextPath("/event/550e8400-e29b-41d4-a716-446655440000?promo=CDPI01"),
    ).toBe("/event/550e8400-e29b-41d4-a716-446655440000?promo=CDPI01");
    expect(
      getValidatedNextPath(
        "/event/550e8400-e29b-41d4-a716-446655440000?promo=a%20b",
      ),
    ).toBe("/event/550e8400-e29b-41d4-a716-446655440000?promo=a%20b");
  });

  it("ignores unrelated query params on event path (returns pathname only)", () => {
    expect(
      getValidatedNextPath("/event/550e8400-e29b-41d4-a716-446655440000?foo=bar"),
    ).toBe("/event/550e8400-e29b-41d4-a716-446655440000");
  });

  it("allows /cortesia without query", () => {
    expect(getValidatedNextPath("/cortesia")).toBe("/cortesia");
  });

  it("canonicalizes /cortesia with valid code", () => {
    expect(getValidatedNextPath("/cortesia?code=CDPITEST123")).toBe(
      "/cortesia?code=CDPITEST123",
    );
  });

  it("rejects cortesia with invalid or extra query params", () => {
    expect(getValidatedNextPath("/cortesia?code=ab")).toBe("/");
    expect(getValidatedNextPath("/cortesia?code=CDPI+space")).toBe("/");
    expect(getValidatedNextPath("/cortesia?code=X&other=1")).toBe("/");
    expect(getValidatedNextPath("/cortesia?foo=bar")).toBe("/");
  });

  it("rejects auth-like and protocol tricks", () => {
    expect(getValidatedNextPath("/login")).toBe("/");
    expect(getValidatedNextPath("/verify-email?email=x")).toBe("/");
    expect(getValidatedNextPath("//evil.com/path")).toBe("/");
    expect(getValidatedNextPath("https://evil.com/path")).toBe("/");
  });

  it("rejects unknown pathnames", () => {
    expect(getValidatedNextPath("/admin")).toBe("/");
    expect(getValidatedNextPath("/cortesia/extra")).toBe("/");
  });
});
