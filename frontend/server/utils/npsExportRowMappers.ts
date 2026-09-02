import type {
  NpsCdpiApoiandoResponse,
  NpsCdpiEventResponse,
} from "@shared/schema";

export function cdpiEventResponseToExportRow(r: NpsCdpiEventResponse): Record<string, string> {
  const created =
    r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? "");
  return {
    "Nome completo": r.name,
    "E-mail": r.email,
    WhatsApp: r.phone,
    "Como você se sentiu participando do nosso Workshop?": r.workshopFeeling,
    "Os temas apresentados foram relevantes para a sua área de atuação?": r.themesRelevant,
    "Como você avalia a didática dos ministrantes?": r.instructorsDidactics,
    "Teve algum painel ou ministrante que te marcou? Conta pra gente quem e por quê:": r.highlight,
    "Você sente que o workshop agregou algo novo para sua carreira?": r.careerValue,
    "Depois dessa experiência, você tem interesse em participar de outros eventos do CDPI?":
      r.wouldAttendAgain,
    "Como você avalia o suporte da equipe CDPI durante o evento?": r.supportRating,
    "Descreva (se Outro)": r.supportOtherText ?? "",
    "Quer deixar um recado pra equipe CDPI?": r.messageToTeam ?? "",
    "Aceitou política de privacidade": r.privacyConsent ? "Sim" : "Não",
    "Respondido em": created,
  };
}

export function cdpiApoiandoResponseToExportRow(r: NpsCdpiApoiandoResponse): Record<string, string> {
  const created =
    r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? "");
  return {
    "Nome completo": r.name,
    "E-mail": r.email,
    WhatsApp: r.phone,
    "De 0 a 10, como você avalia sua experiência geral no Workshop?": String(r.overallScore),
    "Dos temas abordados, quais você gostaria de aprofundar por meio de cursos, programas ou mentorias especializadas?":
      r.futureTopics,
    "Como foi sua experiência com a equipe organizadora (acolhimento, informações, suporte)?":
      r.organizationExperience,
    "Descreva (se Outro)": r.organizationOtherText ?? "",
    "Caso tenha algum feedback ou sugestão sobre o evento, ficaremos muito gratos em receber:":
      r.feedback ?? "",
    "Aceitou política de privacidade": r.privacyConsent ? "Sim" : "Não",
    "Respondido em": created,
  };
}
