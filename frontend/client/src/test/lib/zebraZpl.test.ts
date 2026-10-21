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

  it("shrinks a long name so it stays on one line above the company", () => {
    // "Mariana Albuquerque" wrapped to two lines at 100 dots and overprinted the company.
    const t = new TextDecoder().decode(
      buildNameLabelZpl("Mariana Albuquerque", "FARMACIA MODELO LTDA"),
    );
    const name = t.match(/\^FO0,(\d+)\^FB640,(\d+),\d+,C,0\^A0N,(\d+),(\d+)\^FDMariana Albuquerque/);
    const company = t.match(/\^FO0,(\d+)\^FB640,(\d+),\d+,C,0\^A0N,(\d+),\d+\^FDFARMACIA MODELO LTDA/);
    expect(name).not.toBeNull();
    expect(company).not.toBeNull();
    const [, nameY, nameLines, nameH] = name!.map(Number);
    const [, companyY, companyLines, companyH] = company!.map(Number);
    expect(nameLines).toBe(1);
    expect(companyLines).toBe(1);
    expect(nameH).toBeLessThan(100);
    expect(companyY).toBeGreaterThanOrEqual(nameY + nameH);
    expect(companyY + companyH).toBeLessThanOrEqual(360);
  });

  it("shrinks a long name-only label to one line", () => {
    const t = new TextDecoder().decode(buildNameLabelZpl("Maximiliano Albuquerque"));
    expect(t).toMatch(/\^FB640,1,\d+,C,0\^A0N,(\d+),\1\^FDMaximiliano Albuquerque/);
    expect(t).not.toMatch(/\^A0N,110,110/);
  });

  it("wraps a long company to two lines instead of cutting it, below the name", () => {
    const company = "LABORATÓRIO BIOLÓGICO E SINTÉTICO DE MANIPULAÇÃO SA";
    const t = new TextDecoder().decode(buildNameLabelZpl("Maria Bittencourt", company));
    const name = t.match(/\^FO0,(\d+)\^FB640,1,\d+,C,0\^A0N,(\d+),\d+\^FDMaria/);
    const comp = t.match(/\^FO0,(\d+)\^FB640,2,(\d+),C,0\^A0N,(\d+),\d+\^FD([^\^]+)\^FS/);
    expect(name).not.toBeNull();
    expect(comp).not.toBeNull();
    const [nameY, nameH] = [Number(name![1]), Number(name![2])];
    const [compY, gap, compH] = [Number(comp![1]), Number(comp![2]), Number(comp![3])];
    expect(comp![4]).toBe(company);
    expect(compY).toBeGreaterThanOrEqual(nameY + nameH);
    expect(compY + 2 * compH + gap).toBeLessThanOrEqual(360);
  });

  it("sizes a two-line company by its longest word so it cannot spill to a third line", () => {
    const word = "A".repeat(28);
    const t = new TextDecoder().decode(buildNameLabelZpl("Ana Lima", `A ${word}`));
    const comp = t.match(/\^FB640,2,\d+,C,0\^A0N,(\d+),\d+\^FDA A+\^FS/);
    expect(comp).not.toBeNull();
    expect(28 * Number(comp![1]) * 0.62).toBeLessThanOrEqual(600);
  });
});

describe("buildNameLabelZpl wrapName", () => {
  const LONG = "Maria Fernanda de Albuquerque Cavalcanti";
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);

  it("wraps a long name to two lines without company", () => {
    const t = decode(buildNameLabelZpl(LONG, null, { wrapName: true }));
    expect(t).toContain("^FB640,2,");
  });

  it("wraps a long name to two lines with company", () => {
    const t = decode(buildNameLabelZpl(LONG, "Farmácia Modelo Ltda", { wrapName: true }));
    expect(t).toMatch(/\^FB640,2,\d+,C,0\^A0N,\d+,\d+\^FDMaria Fernanda/);
  });

  it("keeps the company below a two-line name", () => {
    const t = decode(buildNameLabelZpl(LONG, "Farmácia Modelo Ltda", { wrapName: true }));
    const name = t.match(/\^FO0,(\d+)\^FB640,2,\d+,C,0\^A0N,(\d+),\d+\^FDMaria Fernanda/);
    const comp = t.match(/\^FO0,(\d+)\^FB640,\d+,\d+,C,0\^A0N,\d+,\d+\^FDFarmácia Modelo Ltda/);
    expect(name).not.toBeNull();
    expect(comp).not.toBeNull();
    const [nameY, nameDots] = [Number(name![1]), Number(name![2])];
    expect(Number(comp![1])).toBeGreaterThanOrEqual(nameY + 2 * nameDots + 6);
  });

  it("keeps a short name on one line with wrapName", () => {
    const t = decode(buildNameLabelZpl("Ana Clara Costa", null, { wrapName: true }));
    expect(t).toContain("^FB640,1,");
  });

  it("keeps a long name on one line without wrapName", () => {
    const t = decode(buildNameLabelZpl(LONG));
    expect(t).toContain("^FB640,1,");
    expect(t).not.toContain("^FB640,2,");
  });

  it("shrinks a wrapped name until its words fit on two lines", () => {
    // "A B" is 28 chars: at the char-share size (39 dots) it would need a third line.
    const t = decode(
      buildNameLabelZpl("Aaaaaaaaaaaaaa Bbbbbbbbbbbbb Cccccccccccccc", null, { wrapName: true }),
    );
    const dots = Number(t.match(/\^A0N,(\d+),\d+\^FDAaaa/)![1]);
    expect(28 * dots * 0.58).toBeLessThanOrEqual(600);
  });

  it("keeps a single long word on one line with wrapName", () => {
    const t = decode(
      buildNameLabelZpl("Pneumoultramicroscopicossilicovulcanoconiotico", null, { wrapName: true }),
    );
    expect(t).toContain("^FB640,1,");
  });

  it("keeps a wrapped name and a wrapped company inside the label", () => {
    const t = decode(
      buildNameLabelZpl(
        "Maria Fernanda de Albuquerque Cavalcanti",
        "Associação Brasileira de Farmácias de Manipulação",
        { wrapName: true },
      ),
    );
    const comp = t.match(/\^FO0,(\d+)\^FB640,(\d),\d+,C,0\^A0N,(\d+),\d+\^FDAssocia/)!;
    const [y, lines, dots] = [Number(comp[1]), Number(comp[2]), Number(comp[3])];
    expect(y + lines * dots + (lines - 1) * 6).toBeLessThanOrEqual(360);
  });
});
