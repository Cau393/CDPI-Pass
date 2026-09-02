import type { CdpiApoiandoNpsAnswers, CdpiEventNpsAnswers } from "@shared/npsAnswerSchemas";
import { normalizePhoneE164 } from "./normalizePhoneE164";
import { toTitleCaseName } from "./toTitleCaseName";

export type NpsTableTag = "cdpi_event" | "cdpi_apoiando";

export type NpsCdpiEventInsert = {
  userId: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  workshopFeeling: string;
  themesRelevant: string;
  instructorsDidactics: string;
  highlight: string;
  careerValue: string;
  wouldAttendAgain: string;
  supportRating: string;
  supportOtherText: string | null;
  messageToTeam: string | null;
  privacyConsent: boolean;
};

export type NpsCdpiApoiandoInsert = {
  userId: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  overallScore: number;
  futureTopics: string;
  organizationExperience: string;
  organizationOtherText: string | null;
  feedback: string | null;
  privacyConsent: boolean;
};

function optionalTrimmed(value: string | undefined): string | null {
  const t = value?.trim() ?? "";
  return t.length > 0 ? t : null;
}

export function buildNpsInsertPayload(
  userId: string,
  eventId: string,
  npsType: NpsTableTag,
  answers: CdpiEventNpsAnswers | CdpiApoiandoNpsAnswers,
):
  | { table: "cdpi_event"; row: NpsCdpiEventInsert }
  | { table: "cdpi_apoiando"; row: NpsCdpiApoiandoInsert } {
  const name = toTitleCaseName(answers.name);
  const email = answers.email.trim().toLowerCase();
  const phone = normalizePhoneE164(answers.phone, "BR");

  if (npsType === "cdpi_event") {
    const a = answers as CdpiEventNpsAnswers;
    return {
      table: "cdpi_event",
      row: {
        userId,
        eventId,
        name,
        email,
        phone,
        workshopFeeling: a.workshopFeeling,
        themesRelevant: a.themesRelevant,
        instructorsDidactics: a.instructorsDidactics,
        highlight: a.highlight.trim(),
        careerValue: a.careerValue,
        wouldAttendAgain: a.wouldAttendAgain,
        supportRating: a.supportRating,
        supportOtherText:
          a.supportRating === "Outro" ? optionalTrimmed(a.supportOtherText) : null,
        messageToTeam: optionalTrimmed(a.messageToTeam),
        privacyConsent: a.privacyConsent,
      },
    };
  }

  const a = answers as CdpiApoiandoNpsAnswers;
  return {
    table: "cdpi_apoiando",
    row: {
      userId,
      eventId,
      name,
      email,
      phone,
      overallScore: a.overallScore,
      futureTopics: a.futureTopics.trim(),
      organizationExperience: a.organizationExperience,
      organizationOtherText:
        a.organizationExperience === "Outro" ? optionalTrimmed(a.organizationOtherText) : null,
      feedback: optionalTrimmed(a.feedback),
      privacyConsent: a.privacyConsent,
    },
  };
}
