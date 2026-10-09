import {
  legacyProfileValue,
  REGISTRATION_ANSWER_INVALID_OPTION,
  REGISTRATION_ANSWER_REQUIRED,
  REGISTRATION_ANSWER_UNKNOWN_FIELD,
  resolveRegistrationAnswers,
  type LegacyProfile,
  systemFieldsFor,
  type RegistrationField,
  type SystemField,
} from "@shared/eventRegistrationForm";
import type { Event, User } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

type RegistrationEvent = Pick<Event, "modality" | "isFree" | "registrationForm">;
type RegistrationAccount = Pick<User, "cpf" | "foreignDocument" | "address">;

export type RegistrationQuestions = {
  document: boolean;
  address: boolean;
  /** Active custom questions, in form order. */
  fields: RegistrationField[];
};

/**
 * What the inscription dialog asks (ADR-016): the locked document/address
 * questions only when the event needs them and the account lacks them, plus
 * the event's active questions. `missing` comes from a 400 identity_required
 * and wins over a possibly stale cached account.
 */
export function registrationQuestionsFor(
  event: RegistrationEvent,
  user: RegistrationAccount | null | undefined,
  missing: readonly SystemField[] = [],
): RegistrationQuestions {
  const system = systemFieldsFor(event);
  const hasDocument = Boolean(user?.cpf || user?.foreignDocument);
  const hasAddress = Boolean(user?.address?.trim());
  return {
    document: missing.includes("document") || (system.includes("document") && !hasDocument),
    address: missing.includes("address") || (system.includes("address") && !hasAddress),
    fields: (event.registrationForm ?? []).filter((field) => !field.archived),
  };
}

export function needsRegistrationDialog(
  event: RegistrationEvent,
  user: RegistrationAccount | null | undefined,
): boolean {
  const questions = registrationQuestionsFor(event, user);
  return questions.document || questions.address || questions.fields.length > 0;
}

/** `missing` from a 400 `{ code: "identity_required" }`, or null for any other error. */
export function identityRequiredMissing(err: unknown): SystemField[] | null {
  if (!(err instanceof Error)) return null;
  const match = /^400:\s*([\s\S]*)$/.exec(err.message);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]) as { code?: unknown; missing?: unknown };
    if (body.code !== "identity_required") return null;
    const missing = Array.isArray(body.missing) ? body.missing : [];
    return missing.filter((item): item is SystemField => item === "document" || item === "address");
  } catch {
    return null;
  }
}

/**
 * Why an inscription 400 says the client's copy of the event or account is
 * stale (an admin edited the form after it was cached with staleTime
 * Infinity): "identity" for identity_required, "form" for an answer the
 * current form rejects (unknown/archived, newly required, changed options).
 */
export function staleRegistrationError(err: unknown): "identity" | "form" | null {
  if (identityRequiredMissing(err)) return "identity";
  if (!(err instanceof Error)) return null;
  const match = /^400:\s*([\s\S]*)$/.exec(err.message);
  if (!match) return null;
  try {
    const { message } = JSON.parse(match[1]) as { message?: unknown };
    if (typeof message !== "string") return null;
    const staleMessages = [
      REGISTRATION_ANSWER_UNKNOWN_FIELD,
      REGISTRATION_ANSWER_REQUIRED,
      REGISTRATION_ANSWER_INVALID_OPTION,
    ];
    return staleMessages.some((known) => message.startsWith(known)) ? "form" : null;
  } catch {
    return null;
  }
}

/** Drops the cached event (and the account, for identity_required) so a retry uses the fresh form. */
export function refreshAfterStaleRegistration(err: unknown, eventId: string): void {
  const stale = staleRegistrationError(err);
  if (!stale) return;
  void queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}`] });
  if (stale === "identity") void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
}

/** Inline error per question, using the same rules (and messages) as the server. */
export function registrationAnswerErrors(
  fields: readonly RegistrationField[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const answer = values[field.id];
    const result = resolveRegistrationAnswers({
      fields: [field],
      body: { answers: answer === undefined ? {} : { [field.id]: answer } },
    });
    if (!result.ok) errors[field.id] = result.message;
  }
  return errors;
}

/** Body `answers` for inscriptions: active questions only, blanks omitted. */
export function registrationAnswersPayload(
  fields: readonly RegistrationField[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const field of fields) {
    if (field.archived) continue;
    const value = values[field.id]?.trim();
    if (value) answers[field.id] = value;
  }
  return answers;
}

/**
 * Answers to prefill from the account for the active legacy questions
 * (Cargo, Empresa, Área de atuação): only real profile values, never the
 * "Nao aplicavel" placeholder of 4-field accounts. The attendee can edit them.
 */
export function legacyPrefill(
  fields: readonly RegistrationField[],
  profile: LegacyProfile | null | undefined,
): Record<string, string> {
  const prefill: Record<string, string> = {};
  for (const field of fields) {
    if (field.archived) continue;
    const value = legacyProfileValue(field.id, profile);
    if (value !== null) prefill[field.id] = value;
  }
  return prefill;
}
