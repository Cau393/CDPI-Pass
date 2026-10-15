import { describe, it, expect } from "vitest";
import { formatBadgeCompanyLine, formatBadgeDisplayName } from "../../lib/badgePrint";

describe("formatBadgeDisplayName", () => {
  it("keeps first and last parts for multi-word names", () => {
    expect(formatBadgeDisplayName("Maria Silva Santos")).toBe("Maria Santos");
  });

  it("keeps a single name", () => {
    expect(formatBadgeDisplayName("  Maria  ")).toBe("Maria");
  });

  it("uses Participante when empty", () => {
    expect(formatBadgeDisplayName("")).toBe("Participante");
    expect(formatBadgeDisplayName("   ")).toBe("Participante");
  });
});

describe("formatBadgeCompanyLine", () => {
  it("upper-cases the company, accents included", () => {
    expect(formatBadgeCompanyLine("  farmácia modelo ltda ")).toBe("FARMÁCIA MODELO LTDA");
  });

  it("returns null when there is no company", () => {
    expect(formatBadgeCompanyLine(null)).toBeNull();
    expect(formatBadgeCompanyLine(undefined)).toBeNull();
    expect(formatBadgeCompanyLine("   ")).toBeNull();
  });
});
