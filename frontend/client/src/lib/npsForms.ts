/** Shared option lists for NPS certificate forms — keep in sync with `@shared/npsAnswerSchemas` enums. */

export const WORKSHOP_FEELING_OPTIONS = [
  "Foi incrível!",
  "Gostei bastante",
  "Foi bom, mas esperava mais",
  "Não atendeu minhas expectativas",
] as const;

export const EXPERIENCE_RADIO_OPTIONS = [
  "Excelente",
  "Muito boa",
  "Boa",
  "Regular",
  "Ruim",
] as const;

export const CAREER_VALUE_OPTIONS = [
  "Com certeza",
  "Em partes",
  "Ainda estou processando",
] as const;

export const ATTEND_AGAIN_OPTIONS = [
  "Sim, com certeza",
  "Talvez, depende do tema",
  "Ainda não sei",
] as const;

export const SUPPORT_RATING_OPTIONS = [
  "Excelente, sempre por perto",
  "Bom, mas pode melhorar",
  "Tive algumas dificuldades",
  "Outro",
] as const;

export const SIM_NAO_OPTIONS = ["Sim", "Não"] as const;

export const NPS_SCORE_OPTIONS = Array.from({ length: 11 }, (_, i) => i) as readonly number[];

export const CDPI_EVENT_FIELD_LABELS = {
  name: "Nome completo",
  email: "E-mail",
  phone: "WhatsApp",
  workshopFeeling: "Como você se sentiu participando do nosso Workshop?",
  themesRelevant: "Os temas apresentados foram relevantes para a sua área de atuação?",
  instructorsDidactics: "Como você avalia a didática dos ministrantes?",
  highlight: "Teve algum painel ou ministrante que te marcou? Conta pra gente quem e por quê:",
  careerValue: "Você sente que o workshop agregou algo novo para sua carreira?",
  wouldAttendAgain:
    "Depois dessa experiência, você tem interesse em participar de outros eventos do CDPI?",
  supportRating: "Como você avalia o suporte da equipe CDPI durante o evento?",
  supportOtherText: "Descreva",
  messageToTeam: "Quer deixar um recado pra equipe CDPI?",
  privacyConsent: "Li e concordo com a Política de Privacidade e Consentimento",
} as const;

export const CDPI_APOIANDO_FIELD_LABELS = {
  name: "Nome completo",
  email: "E-mail",
  phone: "WhatsApp",
  overallScore: "De 0 a 10, como você avalia sua experiência geral no Workshop?",
  futureTopics:
    "Dos temas abordados, quais você gostaria de aprofundar por meio de cursos, programas ou mentorias especializadas?",
  organizationExperience:
    "Como foi sua experiência com a equipe organizadora (acolhimento, informações, suporte)?",
  organizationOtherText: "Descreva",
  feedback: "Caso tenha algum feedback ou sugestão sobre o evento, ficaremos muito gratos em receber:",
  privacyConsent: "Li e concordo com a Política de Privacidade e Consentimento",
} as const;
