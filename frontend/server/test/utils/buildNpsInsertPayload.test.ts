import { describe, it, expect } from "vitest";
import { buildNpsInsertPayload } from "../../utils/buildNpsInsertPayload";

const uid = "user-1";
const eid = "00000000-0000-4000-8000-000000000001";

const eventAnswers = {
  name: "maria DA silva",
  email: "Test@Example.com",
  phone: "(11) 98765-4321",
  overallRating: "Boa" as const,
  themesRelevance: "Relevantes" as const,
  speakersRating: "Boa" as const,
  applicability: "Parcialmente aplicável" as const,
  highlight: "ok",
  organizationRating: "Boa" as const,
  wouldAttendAgain: "Talvez, dependendo do tema" as const,
  improvements: "nada",
  interestInTopics: "Sim" as const,
  interestTopicText: "  tema x ",
  recommendationScore: 7,
};

const apoiandoAnswers = {
  name: "joão costa",
  email: "j@ex.com",
  phone: "11987654321",
  overallScore: 9,
  themesRelevance: "Muito relevantes" as const,
  applicability: "Não aplicável" as const,
  futureTopics: "x",
  organizationExperience: "Regular" as const,
  improvements: "y",
  wantsUpdates: "Não" as const,
};

describe("buildNpsInsertPayload", () => {
  it("cdpi_event normalizes name email phone", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", eventAnswers);
    expect(r.table).toBe("cdpi_event");
    expect(r.row.name).toBe("Maria da Silva");
    expect(r.row.email).toBe("test@example.com");
    expect(r.row.phone).toMatch(/^55/);
    expect(r.row.interestTopicText).toBe("tema x");
  });

  it("clears interest text when Não", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_event", {
      ...eventAnswers,
      interestInTopics: "Não",
      interestTopicText: "",
    });
    expect(r.table).toBe("cdpi_event");
    expect(r.row.interestTopicText).toBeNull();
  });

  it("cdpi_apoiando returns correct table", () => {
    const r = buildNpsInsertPayload(uid, eid, "cdpi_apoiando", apoiandoAnswers);
    expect(r.table).toBe("cdpi_apoiando");
    expect(r.row.overallScore).toBe(9);
    expect(r.row.name).toBe("João Costa");
  });
});
