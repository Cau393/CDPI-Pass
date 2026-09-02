import { describe, it, expect } from "vitest";
import { buildNpsInsertPayload } from "../../utils/buildNpsInsertPayload";

const uid = "user-1";
const eid = "00000000-0000-4000-8000-000000000001";

const eventAnswers = {
  name: "maria DA silva",
  email: "Test@Example.com",
  phone: "(11) 98765-4321",
  workshopFeeling: "Gostei bastante" as const,
  themesRelevant: "Sim" as const,
  instructorsDidactics: "Boa" as const,
  highlight: "ok",
  careerValue: "Em partes" as const,
  wouldAttendAgain: "Talvez, depende do tema" as const,
  supportRating: "Outro" as const,
  supportOtherText: "  fila x ",
  messageToTeam: "  recado ",
  privacyConsent: true as const,
};

const apoiandoAnswers = {
  name: "joão costa",
  email: "j@ex.com",
  phone: "11987654321",
  overallScore: 9,
  futureTopics: "x",
  organizationExperience: "Excelente, sempre por perto" as const,
  organizationOtherText: "",
  feedback: "  y ",
  privacyConsent: true as const,
};

describe("buildNpsInsertPayload", () => {
  it("cdpi_event normalizes name email phone", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", eventAnswers);
    expect(r.table).toBe("cdpi_event");
    expect(r.row.name).toBe("Maria da Silva");
    expect(r.row.email).toBe("test@example.com");
    expect(r.row.phone).toMatch(/^55/);
  });

  it("trims Outro follow-up text", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", eventAnswers);
    expect(r.table).toBe("cdpi_event");
    expect(r.row.supportOtherText).toBe("fila x");
  });

  it("stores recado trimmed", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", eventAnswers);
    expect(r.table).toBe("cdpi_event");
    expect(r.row.messageToTeam).toBe("recado");
  });

  it("clears Outro text when not Outro", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", {
      ...eventAnswers,
      supportRating: "Bom, mas pode melhorar",
      supportOtherText: "",
    });
    expect(r.table).toBe("cdpi_event");
    expect(r.row.supportOtherText).toBeNull();
  });

  it("clears empty recado to null", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", {
      ...eventAnswers,
      supportRating: "Bom, mas pode melhorar",
      supportOtherText: "",
      messageToTeam: "  ",
    });
    expect(r.table).toBe("cdpi_event");
    expect(r.row.messageToTeam).toBeNull();
  });

  it("cdpi_apoiando returns correct table", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_apoiando", apoiandoAnswers);
    expect(r.table).toBe("cdpi_apoiando");
    expect(r.row.overallScore).toBe(9);
    expect(r.row.name).toBe("João Costa");
  });

  it("cdpi_apoiando stores feedback trimmed", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_apoiando", apoiandoAnswers);
    expect(r.table).toBe("cdpi_apoiando");
    expect(r.row.feedback).toBe("y");
  });

  it("cdpi_apoiando clears organization other when not Outro", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_apoiando", apoiandoAnswers);
    expect(r.table).toBe("cdpi_apoiando");
    expect(r.row.organizationOtherText).toBeNull();
  });
});
