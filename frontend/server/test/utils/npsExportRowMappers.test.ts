import { describe, it, expect } from "vitest";
import { cdpiApoiandoExcelHeaders, cdpiEventExcelHeaders } from "@shared/npsExcel";
import {
  cdpiApoiandoResponseToExportRow,
  cdpiEventResponseToExportRow,
} from "../../utils/npsExportRowMappers";

describe("npsExportRowMappers", () => {
  it("cdpi_event row keys match Excel header order", () => {
    const row = cdpiEventResponseToExportRow({
      id: "1",
      userId: "u",
      eventId: "e",
      name: "A",
      email: "a@b.c",
      phone: "55",
      workshopFeeling: "Gostei bastante",
      themesRelevant: "Sim",
      instructorsDidactics: "Boa",
      highlight: "h",
      careerValue: "Em partes",
      wouldAttendAgain: "Ainda não sei",
      supportRating: "Outro",
      supportOtherText: "detalhe",
      messageToTeam: null,
      privacyConsent: true,
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
    });
    expect(Object.keys(row)).toEqual([...cdpiEventExcelHeaders()]);
  });

  it("cdpi_apoiando row keys match Excel header order", () => {
    const row = cdpiApoiandoResponseToExportRow({
      id: "1",
      userId: "u",
      eventId: "e",
      name: "A",
      email: "a@b.c",
      phone: "55",
      overallScore: 8,
      futureTopics: "f",
      organizationExperience: "Excelente, sempre por perto",
      organizationOtherText: null,
      feedback: "i",
      privacyConsent: true,
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
    });
    expect(Object.keys(row)).toEqual([...cdpiApoiandoExcelHeaders()]);
  });
});
