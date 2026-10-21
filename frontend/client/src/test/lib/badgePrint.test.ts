import { describe, it, expect, vi } from "vitest";
import {
  formatBadgeCompanyLine,
  formatBadgeDisplayName,
  formatBadgeTitledName,
  printBadgeLabel,
  type BadgeNameStyle,
} from "../../lib/badgePrint";
import type { ZebraUsbSession } from "../../lib/webUsbZebra";

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

describe("formatBadgeTitledName", () => {
  it("adds Dr. before first and second name", () => {
    expect(formatBadgeTitledName("José Roberto Silva", "Dr.")).toBe("Dr. José Roberto");
  });

  it("skips a connector as second name", () => {
    expect(formatBadgeTitledName("Ana de Souza Lima", "Dra.")).toBe("Dra. Ana Souza");
  });

  it("skips connectors case-insensitively", () => {
    expect(formatBadgeTitledName("Maria Das Dores Lima", "Dra.")).toBe("Dra. Maria Dores");
  });

  it("skips the connector e", () => {
    expect(formatBadgeTitledName("Pedro e Paulo Souza", "Dr.")).toBe("Dr. Pedro Paulo");
  });

  it("keeps a single word after the title", () => {
    expect(formatBadgeTitledName("José", "Dr.")).toBe("Dr. José");
  });

  it("strips a leading Dr. so it never doubles", () => {
    expect(formatBadgeTitledName("Dr. José Roberto Silva", "Dr.")).toBe("Dr. José Roberto");
  });

  it("strips a leading dra without the dot, any case, and keeps name casing", () => {
    expect(formatBadgeTitledName("dra ana lima", "Dra.")).toBe("Dra. ana lima");
  });

  it("collapses extra whitespace", () => {
    expect(formatBadgeTitledName("  José   Roberto  Silva ", "Dr.")).toBe("Dr. José Roberto");
  });

  it("uses Participante when no words are left", () => {
    expect(formatBadgeTitledName("   ", "Dr.")).toBe("Participante");
  });

  it("strips a title glued to the first name", () => {
    expect(formatBadgeTitledName("Dr.José Roberto Silva", "Dr.")).toBe("Dr. José Roberto");
  });

  it("keeps a first name that only starts like a title", () => {
    expect(formatBadgeTitledName("Drew Silva", "Dr.")).toBe("Dr. Drew Silva");
  });

  it("uses Participante when only the title was typed", () => {
    expect(formatBadgeTitledName("Dra.", "Dra.")).toBe("Participante");
  });
});

describe("printBadgeLabel styles", () => {
  async function printed(
    params: { name: string; company?: string | null; style?: BadgeNameStyle },
  ): Promise<string> {
    const printZpl = vi.fn();
    await printBadgeLabel({ printZpl } as unknown as ZebraUsbSession, params);
    expect(printZpl).toHaveBeenCalledTimes(1);
    return new TextDecoder().decode(printZpl.mock.calls[0]![0] as Uint8Array);
  }

  it("defaults to first and last name with upper-case company", async () => {
    const t = await printed({ name: "Maria Silva Santos", company: "farmácia modelo" });
    expect(t).toContain("^FDMaria Santos^FS");
    expect(t).toContain("^FDFARMÁCIA MODELO^FS");
  });

  it("as-typed prints the full name", async () => {
    const t = await printed({ name: "Maria Silva Santos", style: "as-typed" });
    expect(t).toContain("^FDMaria Silva Santos^FS");
  });

  it("as-typed collapses repeated spaces", async () => {
    const t = await printed({ name: "  Maria   Silva   Santos ", style: "as-typed" });
    expect(t).toContain("^FDMaria Silva Santos^FS");
  });

  it("as-typed keeps the company as typed", async () => {
    const t = await printed({ name: "Maria Silva", company: "Farmácia Modelo", style: "as-typed" });
    expect(t).toContain("^FDFarmácia Modelo^FS");
    expect(t).not.toContain("FARMÁCIA MODELO");
  });

  it("Dr. style prints title with first and second name", async () => {
    const t = await printed({ name: "José Roberto Silva", style: "Dr." });
    expect(t).toContain("^FDDr. José Roberto^FS");
  });

  it("Dra. style keeps the company casing", async () => {
    const t = await printed({ name: "Ana Lima", company: "Clínica Bem Estar", style: "Dra." });
    expect(t).toContain("^FDDra. Ana Lima^FS");
    expect(t).toContain("^FDClínica Bem Estar^FS");
  });
});
