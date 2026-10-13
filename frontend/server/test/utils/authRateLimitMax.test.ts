import { describe, it, expect } from "vitest";
import { authRateLimitMax } from "../../utils/authRateLimitMax";

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
