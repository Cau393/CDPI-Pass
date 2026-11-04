import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { authEntryHref, getValidatedNextPath } from "../../lib/authRedirect";

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

  it("preserves a single valid cortesia query on an event path", () => {
    const eventId = "550e8400-e29b-41d4-a716-446655440000";
    expect(getValidatedNextPath(`/event/${eventId}?cortesia=CDPITEST123`)).toBe(
      `/event/${eventId}?cortesia=CDPITEST123`,
    );
  });

  it("rejects a malformed cortesia code on an event path", () => {
    const eventId = "550e8400-e29b-41d4-a716-446655440000";
    expect(getValidatedNextPath(`/event/${eventId}?cortesia=ab`)).toBe("/");
    expect(getValidatedNextPath(`/event/${eventId}?cortesia=`)).toBe("/");
    expect(getValidatedNextPath(`/event/${eventId}?cortesia=CDPI+space`)).toBe("/");
  });

  it("drops cortesia when it is combined with promo or any extra param", () => {
    const eventId = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      getValidatedNextPath(`/event/${eventId}?cortesia=CDPITEST123&promo=CDPITEST123`),
    ).toBe(`/event/${eventId}`);
    expect(
      getValidatedNextPath(`/event/${eventId}?cortesia=CDPITEST123&foo=1`),
    ).toBe(`/event/${eventId}`);
  });

  it("rejects a malformed cortesia code even when other params are present", () => {
    const eventId = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      getValidatedNextPath(`/event/${eventId}?cortesia=ab&promo=CDPITEST123`),
    ).toBe("/");
    expect(getValidatedNextPath(`/event/${eventId}?foo=1&cortesia=no+space`)).toBe(
      "/",
    );
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

describe("authEntryHref", () => {
  it("carries an event page back as next", () => {
    expect(authEntryHref("/register", "/event/abc?promo=CDPI01")).toBe(
      "/register?next=%2Fevent%2Fabc%3Fpromo%3DCDPI01",
    );
  });

  it("carries a courtesy code page back as next", () => {
    expect(authEntryHref("/login", "/cortesia?code=CDPI123")).toBe(
      "/login?next=%2Fcortesia%3Fcode%3DCDPI123",
    );
  });

  it("omits next on pages that are not return targets", () => {
    expect(authEntryHref("/register", "/eventos")).toBe("/register");
  });

  it("forwards the next of the auth page the visitor is on", () => {
    expect(authEntryHref("/register", "/login?next=%2Fevent%2Fabc")).toBe(
      "/register?next=%2Fevent%2Fabc",
    );
  });

  it("drops an invalid next forwarded from an auth page", () => {
    expect(authEntryHref("/login", "/register?next=https%3A%2F%2Fevil.example")).toBe(
      "/login",
    );
  });
});
