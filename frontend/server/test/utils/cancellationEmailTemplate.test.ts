import { describe, it, expect } from "vitest";
import { buildCancellationEmailHtml } from "../../utils/cancellationEmailTemplate";

describe("buildCancellationEmailHtml", () => {
  it("substitutes nome and evento placeholders", () => {
    const html = buildCancellationEmailHtml("Maria", "Congresso 2026");
    expect(html).toContain("Maria");
    expect(html).toContain("Congresso 2026");
    expect(html).not.toContain("{nome}");
    expect(html).not.toContain("{evento}");
  });
});
