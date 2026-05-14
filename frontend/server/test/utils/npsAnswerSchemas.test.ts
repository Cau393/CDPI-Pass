import { describe, it, expect } from "vitest";
import {
  cdpiApoiandoNpsAnswersSchema,
  cdpiEventNpsAnswersSchema,
} from "@shared/npsAnswerSchemas";

const baseEvent = {
  name: "Maria Silva",
  email: "m@example.com",
  phone: "5511987654321",
  overallRating: "Boa" as const,
  themesRelevance: "Relevantes" as const,
  speakersRating: "Boa" as const,
  applicability: "Parcialmente aplicável" as const,
  highlight: "ok",
  organizationRating: "Boa" as const,
  wouldAttendAgain: "Talvez, dependendo do tema" as const,
  improvements: "nada",
  interestInTopics: "Não" as const,
  interestTopicText: "",
  recommendationScore: 7,
};

const baseApoiando = {
  name: "Maria Silva",
  email: "m@example.com",
  phone: "5511987654321",
  overallScore: 8,
  themesRelevance: "Relevantes" as const,
  applicability: "Totalmente aplicável" as const,
  futureTopics: "mais",
  organizationExperience: "Excelente" as const,
  improvements: "ok",
  wantsUpdates: "Sim" as const,
};

describe("cdpiEventNpsAnswersSchema", () => {
  it("accepts valid payload with Sim + topic text", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      interestInTopics: "Sim",
      interestTopicText: "Farmacovigilância",
    });
    expect(r.success).toBe(true);
  });

  it("rejects Sim without topic text", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      interestInTopics: "Sim",
      interestTopicText: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects Não with leftover topic text", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      interestInTopics: "Não",
      interestTopicText: "oops",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid enum", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      overallRating: "Ótimo",
    });
    expect(r.success).toBe(false);
  });

  it("rejects recommendation out of range", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      recommendationScore: 11,
    });
    expect(r.success).toBe(false);
  });

  it("rejects text over 2000 chars", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      highlight: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});

describe("cdpiApoiandoNpsAnswersSchema", () => {
  it("accepts valid payload", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse(baseApoiando);
    expect(r.success).toBe(true);
  });

  it("rejects overallScore out of range", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse({
      ...baseApoiando,
      overallScore: 11,
    });
    expect(r.success).toBe(false);
  });
});
