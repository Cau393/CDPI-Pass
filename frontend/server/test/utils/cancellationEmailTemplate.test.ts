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

  it("includes the canonical support footer", () => {
    const html = buildCancellationEmailHtml("Maria", "Congresso 2026");
    expect(html).toContain('href="mailto:relacionamento.mkt@cdpipharma.com.br"');
    expect(html).toContain("3636-9909");
    expect(html).toContain("99865-5500");
    expect(html).toContain("99610-1694");
  });
});
