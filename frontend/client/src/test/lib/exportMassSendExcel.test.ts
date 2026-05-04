import { describe, it, expect } from "vitest";
import {
  buildMassSendSheetRows,
  massSendExcelHeaders,
  massSendStatusLabel,
  type MassSendExportRow,
} from "../../lib/exportMassSendExcel";

describe("massSendStatusLabel", () => {
  it('returns "Ativo" when active', () => {
    expect(massSendStatusLabel(true)).toBe("Ativo");
  });

  it('returns "Inativo" when inactive', () => {
    expect(massSendStatusLabel(false)).toBe("Inativo");
  });
});

describe("buildMassSendSheetRows", () => {
  it("produces rows with header keys and string counts", () => {
    const recipients: MassSendExportRow[] = [
      {
        recipientName: "Ana",
        recipientEmail: "a@b.com",
        code: "CODE1",
        ticketCount: 3,
        usedCount: 1,
        remaining: 2,
        isActive: true,
      },
      {
        recipientName: "Beto",
        recipientEmail: "b@b.com",
        code: "CODE2",
        ticketCount: 5,
        usedCount: 0,
        remaining: 5,
        isActive: false,
      },
    ];
    const rows = buildMassSendSheetRows(recipients);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      Nome: "Ana",
      "E-mail": "a@b.com",
      Código: "CODE1",
      Enviadas: "3",
      Utilizadas: "1",
      Restantes: "2",
      Status: "Ativo",
    });
    expect(rows[1]?.Status).toBe("Inativo");
    expect(massSendExcelHeaders()).toEqual([
      "Nome",
      "E-mail",
      "Código",
      "Enviadas",
      "Utilizadas",
      "Restantes",
      "Status",
    ]);
  });
});
