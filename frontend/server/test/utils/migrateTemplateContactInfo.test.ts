import { describe, it, expect } from "vitest";
import { migrateTemplateContactInfo } from "../../utils/migrateTemplateContactInfo";

describe("migrateTemplateContactInfo", () => {
  it("replaces bare 99860-6833 with the primary WhatsApp number", () => {
    const html = "<p>Ligue: 99860-6833</p>";
    expect(migrateTemplateContactInfo(html)).toContain("(62) 99865-5500");
  });

  it("replaces the full-format retired number", () => {
    const html = "<p>+55 (62) 99860-6833</p>";
    expect(migrateTemplateContactInfo(html)).toContain("(62) 99865-5500");
    expect(migrateTemplateContactInfo(html)).not.toContain("99860-6833");
  });

  it("replaces the retired number inside <strong> and <a> tags", () => {
    const html = '<p><strong>99860-6833</strong></p><a href="tel:99860-6833">ligue</a>';
    const result = migrateTemplateContactInfo(html);
    expect(result).not.toContain("99860-6833");
    expect(result).toContain("(62) 99865-5500");
  });

  it("preserves HTML structure and {nome} placeholders", () => {
    const html = '<p>Olá {nome}!</p><p>Contato: 99860-6833</p>';
    const result = migrateTemplateContactInfo(html);
    expect(result).toContain("{nome}");
    expect(result).toContain("<p>");
    expect(result).toContain("</p>");
  });

  it("is a no-op when the template has no old contact info", () => {
    const html = "<p>Olá {nome}!</p><p>Bem-vindo ao evento.</p>";
    expect(migrateTemplateContactInfo(html)).toBe(html);
  });

  it("is a no-op when the template already has the canonical number", () => {
    const html = "<p>WhatsApp: (62) 99865-5500</p>";
    expect(migrateTemplateContactInfo(html)).toBe(html);
  });

  it("replaces old contato@cdpipharma.com.br email with the canonical email", () => {
    const html = '<p>Email: <a href="mailto:contato@cdpipharma.com.br">contato@cdpipharma.com.br</a></p>';
    const result = migrateTemplateContactInfo(html);
    expect(result).not.toContain("contato@cdpipharma.com.br");
    expect(result).toContain("relacionamento.mkt@cdpipharma.com.br");
  });

  it("does not touch event descriptions or non-contact text", () => {
    const html = "<p>O maior evento de peptídeos da América Latina.</p>";
    expect(migrateTemplateContactInfo(html)).toBe(html);
  });

  it("handles multiple occurrences of the retired number in one template", () => {
    const html = "<p>Telefone: 99860-6833</p><p>WhatsApp: +55 (62) 99860-6833</p>";
    const result = migrateTemplateContactInfo(html);
    expect(result.match(/99860-6833/g)).toBeNull();
    expect((result.match(/\(62\) 99865-5500/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
