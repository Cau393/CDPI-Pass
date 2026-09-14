import { describe, it, expect } from "vitest";
import { normalizeConfirmationEmailHtml } from "../../utils/confirmationEmailHtml";

describe("normalizeConfirmationEmailHtml", () => {
  it("returns null for empty TipTap HTML", () => {
    expect(normalizeConfirmationEmailHtml("")).toBeNull();
    expect(normalizeConfirmationEmailHtml("   ")).toBeNull();
    expect(normalizeConfirmationEmailHtml("<p></p>")).toBeNull();
  });

  it("keeps sanitized HTML with text", () => {
    expect(normalizeConfirmationEmailHtml("<p>Traga o material</p>")).toBe(
      "<p>Traga o material</p>",
    );
  });

  it("strips script tags and keeps the paragraph", () => {
    const result = normalizeConfirmationEmailHtml(
      "<script>alert(1)</script><p>Oi</p>",
    );
    expect(result).toBe("<p>Oi</p>");
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
  });
});
