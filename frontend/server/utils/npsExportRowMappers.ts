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
    "Como você avalia sua experiência geral no evento?": r.overallRating,
    "Os temas abordados foram relevantes para você?": r.themesRelevance,
    "Como você avalia os palestrantes no geral?": r.speakersRating,
    "O conteúdo apresentado é aplicável à sua realidade profissional?": r.applicability,
    "Teve algum momento, painel ou palestrante que se destacou? Qual e por quê?": r.highlight,
    "Como você avalia a organização do evento (estrutura, suporte, logística)?": r.organizationRating,
    "Você participaria de outros eventos do CDPI?": r.wouldAttendAgain,
    "O que poderíamos melhorar para os próximos eventos?": r.improvements,
    "Você teria interesse em se aprofundar em algum dos temas abordados?": r.interestInTopics,
    "Descreva o tema abordado que gostaria de se aprofundar": r.interestTopicText ?? "",
    "De 0 a 10, o quanto você recomendaria esse evento para um colega?": String(r.recommendationScore),
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
    "De 0 a 10, como você avalia sua experiência geral no evento?": String(r.overallScore),
    "O quão relevantes os temas abordados foram para você?": r.themesRelevance,
    "O quão aplicável à sua realidade profissional o conteúdo do evento foi para você?":
      r.applicability,
    "Quais temas você gostaria de aprofundar em futuros conteúdos, cursos ou programas?":
      r.futureTopics,
    "Como foi sua experiência com a organização do evento (acolhimento, informações, suporte)?":
      r.organizationExperience,
    "O que poderia ser melhorado em próximas edições do evento?": r.improvements,
    "Você gostaria de receber conteúdos ou novidades sobre os temas abordados neste evento?":
      r.wantsUpdates,
    "Respondido em": created,
  };
}
