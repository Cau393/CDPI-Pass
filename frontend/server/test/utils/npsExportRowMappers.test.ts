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
      overallRating: "Boa",
      themesRelevance: "Relevantes",
      speakersRating: "Boa",
      applicability: "Não aplicável",
      highlight: "h",
      organizationRating: "Boa",
      wouldAttendAgain: "Não",
      improvements: "i",
      interestInTopics: "Não",
      interestTopicText: null,
      recommendationScore: 5,
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
      themesRelevance: "Relevantes",
      applicability: "Totalmente aplicável",
      futureTopics: "f",
      organizationExperience: "Excelente",
      improvements: "i",
      wantsUpdates: "Sim",
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
    });
    expect(Object.keys(row)).toEqual([...cdpiApoiandoExcelHeaders()]);
  });
});
