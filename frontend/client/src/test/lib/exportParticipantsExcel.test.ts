import { describe, it, expect } from "vitest";
import { LEGACY_QUESTIONS, type RegistrationField } from "@shared/eventRegistrationForm";
import {
  buildParticipantSheet,
  statusLabelForExcel,
  type ParticipantExportRow,
} from "../../lib/exportParticipantsExcel";

const FIXED_HEADERS = [
  "Nome",
  "CPF / Passaporte",
  "Estrangeiro",
  "E-mail",
  "Telefone",
  "Endereço",
  "Cargo que ocupa",
  "Empresa que trabalha",
  "Presença",
  "Status",
  "Área de atuação",
];

function field(overrides: Partial<RegistrationField> & Pick<RegistrationField, "id" | "label">): RegistrationField {
  return {
    type: "text",
    options: [],
    required: false,
    archived: false,
    ...overrides,
  };
}

function participant(overrides: Partial<ParticipantExportRow> = {}): ParticipantExportRow {
  return {
    name: "Ana",
    cpf: "000.000.000-00",
    isForeigner: false,
    email: "ana@example.com",
    phone: "5511999999999",
    address: "Rua A, 100, São Paulo",
    cargoQueOcupa: "",
    empresaQueTrabalha: "",
    areaDeAtuacao: "",
    presenca: "Não confirmou presença",
    orderStatus: "paid",
    registrationAnswers: [],
    ...overrides,
  };
}

describe("statusLabelForExcel", () => {
  it("maps paid and courtesy to Portuguese labels", () => {
    expect([statusLabelForExcel("paid"), statusLabelForExcel("courtesy")]).toEqual([
      "Pago",
      "Cortesia",
    ]);
  });

  it("returns empty string for cancelled", () => {
    expect(statusLabelForExcel("cancelled")).toBe("");
  });
});

describe("buildParticipantSheet", () => {
  it("still has the header row when nobody is registered", () => {
    expect(buildParticipantSheet([], [])).toEqual([FIXED_HEADERS]);
  });

  it("writes the fixed columns for a Brazilian buyer", () => {
    const [, row] = buildParticipantSheet([participant()], []);
    expect(row).toEqual([
      "Ana",
      "000.000.000-00",
      "Não",
      "ana@example.com",
      "5511999999999",
      "Rua A, 100, São Paulo",
      "",
      "",
      "Não confirmou presença",
      "Pago",
      "",
    ]);
  });

  it("fills the profile columns and gives the legacy questions no columns of their own", () => {
    const legacyForm = LEGACY_QUESTIONS.map((q, i) =>
      field({ id: q.id, label: q.label, required: true, archived: i === 2 }),
    );
    const sheet = buildParticipantSheet(
      [
        participant({
          cargoQueOcupa: "Médica",
          empresaQueTrabalha: "Clínica Aurora",
          areaDeAtuacao: "Pesquisa",
          registrationAnswers: [{ fieldId: "q-turno", label: "Turno", value: "Tarde" }],
        }),
      ],
      [...legacyForm, field({ id: "q-turno", label: "Turno" })],
    );
    expect(sheet[0]).toEqual([...FIXED_HEADERS, "Turno"]);
    expect(sheet[1].slice(6, 8)).toEqual(["Médica", "Clínica Aurora"]);
    expect(sheet[1][10]).toBe("Pesquisa");
    expect(sheet[1][11]).toBe("Tarde");
  });

  it("drops a legacy answer that is still in the snapshot instead of adding a '(removida)' column", () => {
    const sheet = buildParticipantSheet(
      [
        participant({
          registrationAnswers: [{ fieldId: "legacy-occupation", label: "Cargo que ocupa", value: "Médica" }],
        }),
      ],
      [],
    );
    expect(sheet[0]).toEqual([...FIXED_HEADERS]);
  });

  it("shows Estrangeiro Sim and the passport for a foreign visitor", () => {
    const [, row] = buildParticipantSheet(
      [
        participant({
          name: "Juan",
          cpf: "AB123456",
          isForeigner: true,
          phone: "595981123456",
          address: "Av. Mariscal López 1234, Asunción, Paraguay",
        }),
      ],
      [],
    );
    expect(row.slice(0, 6)).toEqual([
      "Juan",
      "AB123456",
      "Sim",
      "ana@example.com",
      "595981123456",
      "Av. Mariscal López 1234, Asunción, Paraguay",
    ]);
  });

  it("leaves Endereço and the document blank when the account has none", () => {
    const [, row] = buildParticipantSheet(
      [participant({ cpf: null, address: null })],
      [],
    );
    expect([row[1], row[5]]).toEqual(["", ""]);
  });

  it("adds one column per active question in form order, answered by fieldId", () => {
    const form = [
      field({ id: "q-cargo", label: "Cargo" }),
      field({ id: "q-area", label: "Área", type: "select", options: ["Pesquisa", "Indústria"] }),
    ];
    const sheet = buildParticipantSheet(
      [
        participant({
          registrationAnswers: [
            { fieldId: "q-area", label: "Área", value: "Indústria" },
            { fieldId: "q-cargo", label: "Cargo", value: "Farmacêutica" },
          ],
        }),
      ],
      form,
    );
    expect([sheet[0].slice(11), sheet[1].slice(11)]).toEqual([
      ["Cargo", "Área"],
      ["Farmacêutica", "Indústria"],
    ]);
  });

  it("keeps an archived question with answers as '(removida)' after the active ones", () => {
    const form = [
      field({ id: "q-old", label: "Como soube", archived: true }),
      field({ id: "q-new", label: "Cargo" }),
    ];
    const [header] = buildParticipantSheet(
      [
        participant({
          registrationAnswers: [{ fieldId: "q-old", label: "Como soube", value: "Instagram" }],
        }),
      ],
      form,
    );
    expect(header.slice(11)).toEqual(["Cargo", "Como soube (removida)"]);
  });

  it("drops an archived question nobody answered", () => {
    const form = [field({ id: "q-old", label: "Como soube", archived: true })];
    const [header] = buildParticipantSheet([participant()], form);
    expect(header).toEqual(FIXED_HEADERS);
  });

  it("numbers a question whose label collides with another column", () => {
    const form = [
      field({ id: "q-phone", label: "Telefone" }),
      field({ id: "q-a", label: "Empresa" }),
      field({ id: "q-b", label: "Empresa" }),
    ];
    const [header] = buildParticipantSheet([], form);
    expect(header.slice(11)).toEqual(["Telefone (2)", "Empresa", "Empresa (2)"]);
  });

  it("keeps a legacy interest-area answer even when the event form lost that question", () => {
    const [header, row] = buildParticipantSheet(
      [
        participant({
          registrationAnswers: [
            { fieldId: "interest-area", label: "Área de interesse", value: "Pesquisa" },
          ],
        }),
      ],
      [],
    );
    expect([header.slice(11), row.slice(11)]).toEqual([
      ["Área de interesse (removida)"],
      ["Pesquisa"],
    ]);
  });
});
