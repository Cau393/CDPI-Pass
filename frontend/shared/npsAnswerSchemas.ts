import { z } from "zod";

const text2000 = z.string().min(1).max(2000);
const emailField = z.string().min(1).email("E-mail inválido");

const experienceRadio = z.enum(["Excelente", "Muito boa", "Boa", "Regular", "Ruim"]);
const themesRelevance = z.enum([
  "Muito relevantes",
  "Relevantes",
  "Pouco relevantes",
  "Não foram relevantes",
]);
const applicability = z.enum([
  "Totalmente aplicável",
  "Parcialmente aplicável",
  "Pouco aplicável",
  "Não aplicável",
]);
const attendAgain = z.enum([
  "Sim, com certeza",
  "Talvez, dependendo do tema",
  "Não",
]);
const simNao = z.enum(["Sim", "Não"]);

/** Answers for "Evento do CDPI" NPS (11 questions). DB: nps_cdpi_event_responses */
export const cdpiEventNpsAnswersSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório").max(255),
    email: emailField,
    phone: z.string().min(1, "WhatsApp é obrigatório").max(20),
    overallRating: experienceRadio,
    themesRelevance,
    speakersRating: experienceRadio,
    applicability,
    highlight: text2000,
    organizationRating: experienceRadio,
    wouldAttendAgain: attendAgain,
    improvements: text2000,
    interestInTopics: simNao,
    interestTopicText: z.string().max(2000).optional().default(""),
    recommendationScore: z.number().int().min(0).max(10),
  })
  .superRefine((data, ctx) => {
    if (data.interestInTopics === "Sim") {
      const t = data.interestTopicText?.trim() ?? "";
      if (!t) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Descreva o tema quando selecionar Sim",
          path: ["interestTopicText"],
        });
      }
    } else if ((data.interestTopicText?.trim() ?? "").length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remova a descrição quando selecionar Não",
        path: ["interestTopicText"],
      });
    }
  });

export type CdpiEventNpsAnswers = z.infer<typeof cdpiEventNpsAnswersSchema>;

/** Answers for "CDPI Apoiando" NPS (8 questions). DB: nps_cdpi_apoiando_responses */
export const cdpiApoiandoNpsAnswersSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255),
  email: emailField,
  phone: z.string().min(1, "WhatsApp é obrigatório").max(20),
  overallScore: z.number().int().min(0).max(10),
  themesRelevance,
  applicability,
  futureTopics: text2000,
  organizationExperience: experienceRadio,
  improvements: text2000,
  wantsUpdates: simNao,
});

export type CdpiApoiandoNpsAnswers = z.infer<typeof cdpiApoiandoNpsAnswersSchema>;
