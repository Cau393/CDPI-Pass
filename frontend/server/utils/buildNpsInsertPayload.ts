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
  overallRating: string;
  themesRelevance: string;
  speakersRating: string;
  applicability: string;
  highlight: string;
  organizationRating: string;
  wouldAttendAgain: string;
  improvements: string;
  interestInTopics: string;
  interestTopicText: string | null;
  recommendationScore: number;
};

export type NpsCdpiApoiandoInsert = {
  userId: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  overallScore: number;
  themesRelevance: string;
  applicability: string;
  futureTopics: string;
  organizationExperience: string;
  improvements: string;
  wantsUpdates: string;
};

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
    const interestText =
      a.interestInTopics === "Sim"
        ? (a.interestTopicText?.trim() ?? "")
        : null;
    return {
      table: "cdpi_event",
      row: {
        userId,
        eventId,
        name,
        email,
        phone,
        overallRating: a.overallRating,
        themesRelevance: a.themesRelevance,
        speakersRating: a.speakersRating,
        applicability: a.applicability,
        highlight: a.highlight.trim(),
        organizationRating: a.organizationRating,
        wouldAttendAgain: a.wouldAttendAgain,
        improvements: a.improvements.trim(),
        interestInTopics: a.interestInTopics,
        interestTopicText: interestText && interestText.length > 0 ? interestText : null,
        recommendationScore: a.recommendationScore,
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
      themesRelevance: a.themesRelevance,
      applicability: a.applicability,
      futureTopics: a.futureTopics.trim(),
      organizationExperience: a.organizationExperience,
      improvements: a.improvements.trim(),
      wantsUpdates: a.wantsUpdates,
    },
  };
}
