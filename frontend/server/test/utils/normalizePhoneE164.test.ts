import { describe, it, expect } from "vitest";
import { normalizePhoneE164 } from "../../utils/normalizePhoneE164";

describe("normalizePhoneE164", () => {
  it("BR mobile formatted", () => {
    expect(normalizePhoneE164("(11) 98765-4321", "BR")).toBe("5511987654321");
  });

  it("BR landline", () => {
    expect(normalizePhoneE164("(11) 3456-7890", "BR")).toBe("551134567890");
  });

  it("digits with country prefix", () => {
    expect(normalizePhoneE164("+5511987654321", "BR")).toBe("5511987654321");
  });

  it("US number with +1", () => {
    expect(normalizePhoneE164("+1 202 555 0100", "US")).toBe("12025550100");
  });

  it("strips garbage chars inside valid BR", () => {
    expect(normalizePhoneE164("+55 (11) 9.8765-4321", "BR")).toBe("5511987654321");
  });

  it("throws on empty", () => {
    expect(() => normalizePhoneE164("", "BR")).toThrow("obrigatório");
  });

  it("throws on invalid / too short", () => {
    expect(() => normalizePhoneE164("123", "BR")).toThrow();
  });
});
