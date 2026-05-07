import { describe, it, expect } from "vitest";
import {
  buildParticipantSheetRows,
  participantExcelHeaders,
  statusLabelForExcel,
  type ParticipantExportRow,
} from "../../lib/exportParticipantsExcel";

describe("statusLabelForExcel", () => {
  it("maps paid and courtesy to Portuguese labels", () => {
    expect(statusLabelForExcel("paid")).toBe("Pago");
    expect(statusLabelForExcel("courtesy")).toBe("Cortesia");
  });

  it("returns empty string for cancelled", () => {
    expect(statusLabelForExcel("cancelled")).toBe("");
  });
});

function baseRow(
  overrides: Partial<ParticipantExportRow> = {},
): ParticipantExportRow {
  return {
    name: "",
    cpf: "",
    email: "",
    phone: "",
    cargoQueOcupa: "",
    empresaQueTrabalha: "",
    presenca: "",
    orderStatus: "paid",
    ...overrides,
  };
}

describe("buildParticipantSheetRows", () => {
  it("produces rows with header keys and correct Status", () => {
    const participants: ParticipantExportRow[] = [
      baseRow({
        name: "Ana",
        cpf: "000.000.000-00",
        email: "a@b.com",
        phone: "(11) 9999-9999",
        orderStatus: "paid",
        presenca: "Não confirmou presença",
      }),
      baseRow({
        name: "Beto",
        cpf: "111.111.111-11",
        email: "b@b.com",
        phone: "(11) 8888-8888",
        orderStatus: "courtesy",
        cargoQueOcupa: "Engenheiro",
        empresaQueTrabalha: "ACME",
        presenca: "Presente",
      }),
    ];
    const rows = buildParticipantSheetRows(participants);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      Nome: "Ana",
      CPF: "000.000.000-00",
      "E-mail": "a@b.com",
      Telefone: "(11) 9999-9999",
      "Cargo que ocupa": "",
      "Empresa que trabalha": "",
      Presença: "Não confirmou presença",
      Status: "Pago",
    });
    expect(rows[1]?.Status).toBe("Cortesia");
    expect(rows[1]?.["Cargo que ocupa"]).toBe("Engenheiro");
    expect(rows[1]?.["Empresa que trabalha"]).toBe("ACME");
    expect(rows[1]?.Presença).toBe("Presente");
    expect(participantExcelHeaders()).toEqual([
      "Nome",
      "CPF",
      "E-mail",
      "Telefone",
      "Cargo que ocupa",
      "Empresa que trabalha",
      "Presença",
      "Status",
    ]);
  });
});
