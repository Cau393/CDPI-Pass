import { z } from "zod";

const text2000 = z.string().min(1).max(2000);
const optionalText2000 = z.string().max(2000).optional().default("");
const emailField = z.string().min(1).email("E-mail inválido");

const workshopFeeling = z.enum([
  "Foi incrível!",
  "Gostei bastante",
  "Foi bom, mas esperava mais",
  "Não atendeu minhas expectativas",
]);
const simNao = z.enum(["Sim", "Não"]);
const experienceRadio = z.enum(["Excelente", "Muito boa", "Boa", "Regular", "Ruim"]);
const careerValue = z.enum(["Com certeza", "Em partes", "Ainda estou processando"]);
const attendAgain = z.enum(["Sim, com certeza", "Talvez, depende do tema", "Ainda não sei"]);
const supportRating = z.enum([
  "Excelente, sempre por perto",
  "Bom, mas pode melhorar",
  "Tive algumas dificuldades",
  "Outro",
]);

function refineOutroFollowUp(
  selected: string,
  followUp: string | undefined,
  followUpPath: string,
  ctx: z.RefinementCtx,
) {
  const t = followUp?.trim() ?? "";
  if (selected === "Outro") {
    if (!t) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Descreva quando selecionar Outro",
        path: [followUpPath],
      });
    }
  } else if (t.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Remova a descrição quando não selecionar Outro",
      path: [followUpPath],
    });
  }
}

/** Answers for "Evento CDPI" NPS. DB: nps_cdpi_event_responses */
export const cdpiEventNpsAnswersSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório").max(255),
    email: emailField,
    phone: z.string().min(1, "WhatsApp é obrigatório").max(20),
    workshopFeeling,
    themesRelevant: simNao,
    instructorsDidactics: experienceRadio,
    highlight: text2000,
    careerValue,
    wouldAttendAgain: attendAgain,
    supportRating,
    supportOtherText: z.string().max(2000).optional().default(""),
    messageToTeam: optionalText2000,
    privacyConsent: z.literal(true, {
      errorMap: () => ({ message: "É necessário concordar com a política de privacidade" }),
    }),
  })
  .superRefine((data, ctx) => {
    refineOutroFollowUp(data.supportRating, data.supportOtherText, "supportOtherText", ctx);
  });

export type CdpiEventNpsAnswers = z.infer<typeof cdpiEventNpsAnswersSchema>;

/** Answers for "Evento de Terceiros" NPS. DB: nps_cdpi_apoiando_responses */
export const cdpiApoiandoNpsAnswersSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório").max(255),
    email: emailField,
    phone: z.string().min(1, "WhatsApp é obrigatório").max(20),
    overallScore: z.number().int().min(0).max(10),
    futureTopics: text2000,
    organizationExperience: supportRating,
    organizationOtherText: z.string().max(2000).optional().default(""),
    feedback: optionalText2000,
    privacyConsent: z.literal(true, {
      errorMap: () => ({ message: "É necessário concordar com a política de privacidade" }),
    }),
  })
  .superRefine((data, ctx) => {
    refineOutroFollowUp(
      data.organizationExperience,
      data.organizationOtherText,
      "organizationOtherText",
      ctx,
    );
  });

export type CdpiApoiandoNpsAnswers = z.infer<typeof cdpiApoiandoNpsAnswersSchema>;
