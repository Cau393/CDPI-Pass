import { describe, it, expect } from "vitest";
import {
  courtesyActivationBlocked,
  isCourtesyLimitReached,
  parseCourtesyLimit,
} from "../../utils/courtesyRedeemLimit";

describe("parseCourtesyLimit", () => {
  it("treats empty and missing as no cap", () => {
    expect(parseCourtesyLimit("")).toEqual({ ok: true, value: null });
    expect(parseCourtesyLimit(undefined)).toEqual({ ok: true, value: null });
    expect(parseCourtesyLimit(null)).toEqual({ ok: true, value: null });
    expect(parseCourtesyLimit("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts an integer of at least 1", () => {
    expect(parseCourtesyLimit("10")).toEqual({ ok: true, value: 10 });
    expect(parseCourtesyLimit("1")).toEqual({ ok: true, value: 1 });
  });

  it("rejects zero, negatives, decimals, and non-numeric text", () => {
    expect(parseCourtesyLimit("0")).toEqual({
      ok: false,
      error: "O limite deve ser um número inteiro maior ou igual a 1.",
    });
    expect(parseCourtesyLimit("-1")).toEqual({
      ok: false,
      error: "O limite deve ser um número inteiro maior ou igual a 1.",
    });
    expect(parseCourtesyLimit("1.5")).toEqual({
      ok: false,
      error: "O limite deve ser um número inteiro maior ou igual a 1.",
    });
    expect(parseCourtesyLimit("abc")).toEqual({
      ok: false,
      error: "O limite deve ser um número inteiro maior ou igual a 1.",
    });
  });
});

describe("isCourtesyLimitReached", () => {
  it("is never reached when the limit is null", () => {
    expect(isCourtesyLimitReached(100, null)).toBe(false);
  });

  it("is reached when redeemed count is at or above the limit", () => {
    expect(isCourtesyLimitReached(5, 5)).toBe(true);
    expect(isCourtesyLimitReached(6, 5)).toBe(true);
  });

  it("is not reached when redeemed count is below the limit", () => {
    expect(isCourtesyLimitReached(4, 5)).toBe(false);
  });
});

describe("courtesyActivationBlocked", () => {
  it("blocks activation only while the cap is set and already reached", () => {
    expect(courtesyActivationBlocked(5, 5)).toBe(true);
    expect(courtesyActivationBlocked(4, 5)).toBe(false);
    expect(courtesyActivationBlocked(5, null)).toBe(false);
  });
});
