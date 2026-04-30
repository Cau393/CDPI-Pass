import { describe, it, expect } from "vitest";
import { buildNameLabelZpl, escapeZplFieldData } from "../../lib/zebraZpl";

describe("escapeZplFieldData", () => {
  it("escapes backslash, caret, tilde and strips newlines", () => {
    expect(escapeZplFieldData("a\\b^c~d\ne")).toBe("a\\\\b\\^c\\~d e");
  });
});

describe("buildNameLabelZpl", () => {
  it("produces ZPL with UTF-8 bytes", () => {
    const b = buildNameLabelZpl("Test User");
    const t = new TextDecoder().decode(b);
    expect(t).toContain("^XA");
    expect(t).toContain("Test User");
    expect(t).toContain("^XZ");
  });

  it("name-only uses Y slightly above center for ^FO0", () => {
    // Center would be 125; NAME_ONLY_NUDGE_UP_DOTS=10 → y = 115
    const b = buildNameLabelZpl("Solo");
    const t = new TextDecoder().decode(b);
    expect(t).toMatch(/\^FO0,115\^/);
  });

  it("name+company uses stacked ^FO0 name then company (unchanged layout)", () => {
    // yName = max(0, floor((360-190)/2)+14) = 99; yCompany = 99+104+12 = 215
    const b = buildNameLabelZpl("Maria", "Acme Ltda");
    const t = new TextDecoder().decode(b);
    expect(t).toContain("Maria");
    expect(t).toContain("Acme Ltda");
    expect(t).toMatch(/\^FO0,99\^/);
    expect(t).toMatch(/\^FO0,215\^/);
  });
});
