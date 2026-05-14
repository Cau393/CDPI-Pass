/** Shared option lists for NPS certificate forms — keep in sync with `@shared/npsAnswerSchemas` enums. */

export const EXPERIENCE_RADIO_OPTIONS = [
  "Excelente",
  "Muito boa",
  "Boa",
  "Regular",
  "Ruim",
] as const;

export const THEMES_RELEVANCE_OPTIONS = [
  "Muito relevantes",
  "Relevantes",
  "Pouco relevantes",
  "Não foram relevantes",
] as const;

export const APPLICABILITY_OPTIONS = [
  "Totalmente aplicável",
  "Parcialmente aplicável",
  "Pouco aplicável",
  "Não aplicável",
] as const;

export const ATTEND_AGAIN_OPTIONS = [
  "Sim, com certeza",
  "Talvez, dependendo do tema",
  "Não",
] as const;

export const SIM_NAO_OPTIONS = ["Sim", "Não"] as const;

export const NPS_SCORE_OPTIONS = Array.from({ length: 11 }, (_, i) => i) as readonly number[];

export const CDPI_EVENT_FIELD_LABELS = {
  name: "Nome completo",
  email: "E-mail",
  phone: "WhatsApp",
  overallRating: "Como você avalia sua experiência geral no evento?",
  themesRelevance: "Os temas abordados foram relevantes para você?",
  speakersRating: "Como você avalia os palestrantes no geral?",
  applicability: "O conteúdo apresentado é aplicável à sua realidade profissional?",
  highlight:
    "Teve algum momento, painel ou palestrante que se destacou? Qual e por quê?",
  organizationRating:
    "Como você avalia a organização do evento (estrutura, suporte, logística)?",
  wouldAttendAgain: "Você participaria de outros eventos do CDPI?",
  improvements: "O que poderíamos melhorar para os próximos eventos?",
  interestInTopics: "Você teria interesse em se aprofundar em algum dos temas abordados?",
  interestTopicText: "Descreva o tema abordado que gostaria de se aprofundar",
  recommendationScore: "De 0 a 10, o quanto você recomendaria esse evento para um colega?",
} as const;

export const CDPI_APOIANDO_FIELD_LABELS = {
  name: "Nome completo",
  email: "E-mail",
  phone: "WhatsApp",
  overallScore: "De 0 a 10, como você avalia sua experiência geral no evento?",
  themesRelevance: "O quão relevantes os temas abordados foram para você?",
  applicability:
    "O quão aplicável à sua realidade profissional o conteúdo do evento foi para você?",
  futureTopics:
    "Quais temas você gostaria de aprofundar em futuros conteúdos, cursos ou programas?",
  organizationExperience:
    "Como foi sua experiência com a organização do evento (acolhimento, informações, suporte)?",
  improvements: "O que poderia ser melhorado em próximas edições do evento?",
  wantsUpdates:
    "Você gostaria de receber conteúdos ou novidades sobre os temas abordados neste evento?",
} as const;
