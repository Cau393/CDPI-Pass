import { describe, it, expect } from "vitest";
import {
  cdpiApoiandoNpsAnswersSchema,
  cdpiEventNpsAnswersSchema,
} from "@shared/npsAnswerSchemas";

const baseEvent = {
  name: "Maria Silva",
  email: "m@example.com",
  phone: "5511987654321",
  workshopFeeling: "Gostei bastante" as const,
  themesRelevant: "Sim" as const,
  instructorsDidactics: "Boa" as const,
  highlight: "ok",
  careerValue: "Em partes" as const,
  wouldAttendAgain: "Talvez, depende do tema" as const,
  supportRating: "Bom, mas pode melhorar" as const,
  supportOtherText: "",
  messageToTeam: "",
  privacyConsent: true as const,
};

const baseApoiando = {
  name: "Maria Silva",
  email: "m@example.com",
  phone: "5511987654321",
  overallScore: 8,
  futureTopics: "mais",
  organizationExperience: "Excelente, sempre por perto" as const,
  organizationOtherText: "",
  feedback: "",
  privacyConsent: true as const,
};

describe("cdpiEventNpsAnswersSchema", () => {
  it("accepts a valid payload", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse(baseEvent);
    expect(r.success).toBe(true);
  });

  it("accepts Outro with follow-up text", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      supportRating: "Outro",
      supportOtherText: "Fila no credenciamento",
    });
    expect(r.success).toBe(true);
  });

  it("rejects Outro without follow-up text", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      supportRating: "Outro",
      supportOtherText: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects leftover follow-up text when not Outro", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      supportRating: "Bom, mas pode melhorar",
      supportOtherText: "oops",
    });
    expect(r.success).toBe(false);
  });

  it("rejects privacyConsent false", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      privacyConsent: false,
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional recado omitted", () => {
    const { messageToTeam: _ignored, ...rest } = baseEvent;
    const r = cdpiEventNpsAnswersSchema.safeParse(rest);
    expect(r.success).toBe(true);
  });

  it("rejects invalid workshopFeeling enum", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      workshopFeeling: "Ótimo",
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid themesRelevant", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      themesRelevant: "Talvez",
    });
    expect(r.success).toBe(false);
  });

  it("rejects highlight over 2000 chars", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      highlight: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty name", () => {
    const r = cdpiEventNpsAnswersSchema.safeParse({
      ...baseEvent,
      name: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("cdpiApoiandoNpsAnswersSchema", () => {
  it("accepts a valid payload", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse(baseApoiando);
    expect(r.success).toBe(true);
  });

  it("accepts Outro with follow-up text", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse({
      ...baseApoiando,
      organizationExperience: "Outro",
      organizationOtherText: "Sinalização",
    });
    expect(r.success).toBe(true);
  });

  it("rejects Outro without follow-up text", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse({
      ...baseApoiando,
      organizationExperience: "Outro",
      organizationOtherText: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects leftover follow-up text when not Outro", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse({
      ...baseApoiando,
      organizationOtherText: "oops",
    });
    expect(r.success).toBe(false);
  });

  it("rejects overallScore out of range", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse({
      ...baseApoiando,
      overallScore: 11,
    });
    expect(r.success).toBe(false);
  });

  it("rejects privacyConsent false", () => {
    const r = cdpiApoiandoNpsAnswersSchema.safeParse({
      ...baseApoiando,
      privacyConsent: false,
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional feedback omitted", () => {
    const { feedback: _ignored, ...rest } = baseApoiando;
    const r = cdpiApoiandoNpsAnswersSchema.safeParse(rest);
    expect(r.success).toBe(true);
  });
});
