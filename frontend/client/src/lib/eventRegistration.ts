import {
  legacyProfileValue,
  resolveRegistrationAnswers,
  type LegacyProfile,
  systemFieldsFor,
  type RegistrationField,
  type SystemField,
} from "@shared/eventRegistrationForm";
import type { Event, User } from "@shared/schema";

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
