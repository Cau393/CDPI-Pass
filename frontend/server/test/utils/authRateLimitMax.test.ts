import { describe, it, expect } from "vitest";
import { authRateLimitMax, guestCheckoutRateLimitMax, lookupEmailRateLimitMax } from "../../utils/authRateLimitMax";

describe("authRateLimitMax (#15)", () => {
  it("is 100 by default", () => {
    expect(authRateLimitMax({ NODE_ENV: "development" })).toBe(100);
  });

  it("takes the e2e harness override outside production", () => {
    expect(authRateLimitMax({ NODE_ENV: "development", AUTH_RATE_LIMIT_MAX: "100000" })).toBe(100000);
  });

  it("ignores the override in production", () => {
    expect(authRateLimitMax({ NODE_ENV: "production", AUTH_RATE_LIMIT_MAX: "100000" })).toBe(100);
  });

  it("ignores a value that is not a positive integer", () => {
    expect(authRateLimitMax({ NODE_ENV: "development", AUTH_RATE_LIMIT_MAX: "lots" })).toBe(100);
    expect(authRateLimitMax({ NODE_ENV: "development", AUTH_RATE_LIMIT_MAX: "0" })).toBe(100);
  });
});

describe("lookupEmailRateLimitMax", () => {
  it("is 10 by default", () => {
    expect(lookupEmailRateLimitMax({ NODE_ENV: "development" })).toBe(10);
  });

  it("takes the test override outside production", () => {
    expect(lookupEmailRateLimitMax({ NODE_ENV: "test", LOOKUP_EMAIL_RATE_LIMIT_MAX: "500" })).toBe(500);
  });

  it("ignores the override in production and invalid values", () => {
    expect(lookupEmailRateLimitMax({ NODE_ENV: "production", LOOKUP_EMAIL_RATE_LIMIT_MAX: "500" })).toBe(10);
    expect(lookupEmailRateLimitMax({ NODE_ENV: "test", LOOKUP_EMAIL_RATE_LIMIT_MAX: "0" })).toBe(10);
  });
});

describe("guestCheckoutRateLimitMax (ADR-017)", () => {
  it("is 30 by default", () => {
    expect(guestCheckoutRateLimitMax({ NODE_ENV: "development" })).toBe(30);
  });

  it("takes the test override outside production", () => {
    expect(guestCheckoutRateLimitMax({ NODE_ENV: "test", GUEST_CHECKOUT_RATE_LIMIT_MAX: "5" })).toBe(5);
  });

  it("ignores the override in production", () => {
    expect(guestCheckoutRateLimitMax({ NODE_ENV: "production", GUEST_CHECKOUT_RATE_LIMIT_MAX: "5" })).toBe(30);
  });

  it("ignores a value that is not a positive integer", () => {
    expect(guestCheckoutRateLimitMax({ NODE_ENV: "test", GUEST_CHECKOUT_RATE_LIMIT_MAX: "lots" })).toBe(30);
    expect(guestCheckoutRateLimitMax({ NODE_ENV: "test", GUEST_CHECKOUT_RATE_LIMIT_MAX: "0" })).toBe(30);
  });
});
