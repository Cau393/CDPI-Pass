import { describe, it, expect } from "vitest";
import { formatBadgeDisplayName } from "../../lib/badgePrint";

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
