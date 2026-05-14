import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  buildNpsExcelWorkbook,
  cdpiApoiandoExcelHeaders,
  cdpiEventExcelHeaders,
} from "@shared/npsExcel";

describe("buildNpsExcelWorkbook", () => {
  it("empty rows yields header-only sheet", () => {
    const wb = buildNpsExcelWorkbook([], "cdpi_event", "E1");
    expect(wb.SheetNames.length).toBe(1);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    expect(data[0]).toEqual([...cdpiEventExcelHeaders()]);
  });

  it("preserves row order for cdpi_event", () => {
    const h = cdpiEventExcelHeaders();
    const row: Record<string, string> = Object.fromEntries(h.map((k) => [k, k === "Nome completo" ? "A" : "v"])) as Record<
      string,
      string
    >;
    row["Respondido em"] = "2026-01-01";
    const wb = buildNpsExcelWorkbook([row], "cdpi_event", "X");
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    expect(aoa[1][0]).toBe("A");
    expect(aoa[1][aoa[1].length - 1]).toBe("2026-01-01");
  });

  it("truncates sheet name to 31 chars and strips forbidden chars", () => {
    const long = "a".repeat(50) + "?*[]:/\\bad";
    const wb = buildNpsExcelWorkbook([], "cdpi_apoiando", long);
    expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31);
    expect(wb.SheetNames[0]).not.toMatch(/[/?*[\]:\\]/);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    expect(data[0]).toEqual([...cdpiApoiandoExcelHeaders()]);
  });
});
