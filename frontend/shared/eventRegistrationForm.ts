/**
 * Per-event registration form (ADR-016). The definition lives in
 * events.registration_form; each order keeps a snapshot of the answers in
 * orders.registration_answers. Locked questions (document, address) are
 * computed from the event's modality and price, never stored here.
 */

import { NOT_APPLICABLE_PROFILE_VALUE } from "./schema";

export type RegistrationFieldType = "text" | "select" | "radio";

export interface RegistrationField {
  /** Stable id; answers point at it, so it never changes once saved. */
  id: string;
  type: RegistrationFieldType;
  label: string;
  /** Choices for select/radio; empty for text. */
  options: string[];
  required: boolean;
  /** Removed by the admin after it had answers; kept so exports still show them. */
  archived: boolean;
}

export interface RegistrationAnswer {
  fieldId: string;
  /** Label at answer time, so a later rename does not rewrite history. */
  label: string;
  value: string;
}

/** Questions the code asks on top of the event's own form. */
export type SystemField = "document" | "address";

export const REGISTRATION_FORM_MAX_ACTIVE_FIELDS = 20;
export const REGISTRATION_FIELD_LABEL_MAX = 120;
export const REGISTRATION_FIELD_MIN_OPTIONS = 2;
export const REGISTRATION_FIELD_MAX_OPTIONS = 50;
export const REGISTRATION_OPTION_MAX = 80;
export const REGISTRATION_TEXT_ANSWER_MAX = 500;

export const REGISTRATION_FORM_INVALID = "registration_form deve ser um array JSON de perguntas.";
export const REGISTRATION_FORM_TOO_MANY = "No máximo 20 perguntas no formulário de inscrição.";
export const REGISTRATION_FIELD_LABEL_INVALID = "Cada pergunta precisa de um texto de 1 a 120 caracteres.";
export const REGISTRATION_FIELD_OPTIONS_INVALID =
  "Listas e múltipla escolha precisam de 2 a 50 opções diferentes, com até 80 caracteres cada.";
export const REGISTRATION_FIELD_TYPE_CHANGED =
  "O tipo de uma pergunta já salva não pode mudar. Remova-a e crie outra.";
export const REGISTRATION_ANSWER_REQUIRED = "Responda a pergunta obrigatória";
export const REGISTRATION_ANSWER_INVALID_OPTION = "Escolha uma das opções da pergunta";
export const REGISTRATION_ANSWER_TOO_LONG = "Resposta com mais de 500 caracteres na pergunta";
export const REGISTRATION_ANSWER_UNKNOWN_FIELD = "Resposta para uma pergunta que não existe neste evento.";

const FIELD_TYPES: readonly RegistrationFieldType[] = ["text", "select", "radio"];

export type ParseRegistrationFormResult =
  | { ok: true; value: RegistrationField[] }
  | { ok: false; error: string };

export type ResolveRegistrationAnswersResult =
  | { ok: true; answers: RegistrationAnswer[] }
  | { ok: false; message: string };

/** What the admin forms send per question: a new one has no id; `archived` is the server's. */
export type RegistrationFieldInput = Omit<RegistrationField, "id" | "archived"> & { id?: string };

/** Multipart field value sent by the admin create/edit forms. */
export function registrationFormMultipartValue(fields: readonly RegistrationFieldInput[]): string {
  return JSON.stringify(fields);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < REGISTRATION_FIELD_MIN_OPTIONS || raw.length > REGISTRATION_FIELD_MAX_OPTIONS) return null;
  const options: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const option = item.trim();
    const key = option.toLocaleLowerCase("pt-BR");
    if (!option || option.length > REGISTRATION_OPTION_MAX || seen.has(key)) return null;
    seen.add(key);
    options.push(option);
  }
  return options;
}

/**
 * Admin create/edit: the full list of active questions as a JSON string.
 * Ids are the server's: a new question (or an id this event never had) gets
 * `newId()`. A saved question missing from the list is kept as archived, so
 * answers already given still have their column in the export.
 */
export function parseRegistrationFormField(
  raw: unknown,
  previous: readonly RegistrationField[],
  newId: () => string = () => globalThis.crypto.randomUUID(),
): ParseRegistrationFormResult {
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    return { ok: false, error: REGISTRATION_FORM_INVALID };
  }
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed === "[]") {
    return { ok: true, value: previous.map((field) => ({ ...field, archived: true })) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: REGISTRATION_FORM_INVALID };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: REGISTRATION_FORM_INVALID };
  if (parsed.length > REGISTRATION_FORM_MAX_ACTIVE_FIELDS) return { ok: false, error: REGISTRATION_FORM_TOO_MANY };

  const previousById = new Map(previous.map((field) => [field.id, field]));
  const active: RegistrationField[] = [];
  for (const item of parsed) {
    if (!isPlainObject(item)) return { ok: false, error: REGISTRATION_FORM_INVALID };
    const type = item.type as RegistrationFieldType;
    if (!FIELD_TYPES.includes(type)) return { ok: false, error: REGISTRATION_FORM_INVALID };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label || label.length > REGISTRATION_FIELD_LABEL_MAX) {
      return { ok: false, error: REGISTRATION_FIELD_LABEL_INVALID };
    }
    const saved = typeof item.id === "string" ? previousById.get(item.id) : undefined;
    if (saved && saved.type !== type) return { ok: false, error: REGISTRATION_FIELD_TYPE_CHANGED };
    if (saved && active.some((field) => field.id === saved.id)) {
      return { ok: false, error: REGISTRATION_FORM_INVALID };
    }

    let options: string[] = [];
    if (type !== "text") {
      const parsedOptions = parseOptions(item.options);
      if (!parsedOptions) return { ok: false, error: REGISTRATION_FIELD_OPTIONS_INVALID };
      options = parsedOptions;
    }
    active.push({
      id: saved ? saved.id : newId(),
      type,
      label,
      options,
      required: item.required === true,
      archived: false,
    });
  }

  const activeIds = new Set(active.map((field) => field.id));
  const archived = previous
    .filter((field) => !activeIds.has(field.id))
    .map((field) => ({ ...field, archived: true }));
  return { ok: true, value: [...active, ...archived] };
}

/**
 * Locked questions, computed from the event and never stored on it:
 * in-person needs a document and an address on the badge/list; a paid online
 * event needs a document because Asaas requires `cpfCnpj`.
 */
export function systemFieldsFor(event: { modality: string | null; isFree: boolean | null }): SystemField[] {
  if (event.modality === "presencial") return ["document", "address"];
  return event.isFree === true ? [] : ["document"];
}

/**
 * Inscription gate for POST /api/orders, POST /api/events/:id/subscribe and
 * POST /api/courtesy/redeem. Reads `body.answers` ({ [fieldId]: string }) and
 * returns the snapshot stored on the order, in form order.
 */
export function resolveRegistrationAnswers(input: {
  fields: readonly RegistrationField[] | null | undefined;
  body: object;
}): ResolveRegistrationAnswersResult {
  const raw = (input.body as { answers?: unknown }).answers;
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
    return { ok: false, message: REGISTRATION_ANSWER_UNKNOWN_FIELD };
  }
  const given: Record<string, unknown> = raw ?? {};
  const active = (input.fields ?? []).filter((field) => !field.archived);
  const activeIds = new Set(active.map((field) => field.id));
  if (Object.keys(given).some((fieldId) => !activeIds.has(fieldId))) {
    return { ok: false, message: REGISTRATION_ANSWER_UNKNOWN_FIELD };
  }

  const answers: RegistrationAnswer[] = [];
  for (const field of active) {
    const value = typeof given[field.id] === "string" ? (given[field.id] as string).trim() : "";
    if (!value) {
      if (field.required) return { ok: false, message: `${REGISTRATION_ANSWER_REQUIRED}: ${field.label}` };
      continue;
    }
    if (field.type === "text" && value.length > REGISTRATION_TEXT_ANSWER_MAX) {
      return { ok: false, message: `${REGISTRATION_ANSWER_TOO_LONG}: ${field.label}` };
    }
    if (field.type !== "text" && !field.options.includes(value)) {
      return { ok: false, message: `${REGISTRATION_ANSWER_INVALID_OPTION}: ${field.label}` };
    }
    answers.push({ fieldId: field.id, label: field.label, value });
  }
  return { ok: true, answers };
}

/** Buyer order payloads (Meus Ingressos, create responses) never carry the answers. */
export function withoutBuyerAnswers<T extends object>(
  order: T,
): Omit<T, "interestArea" | "registrationAnswers"> {
  const copy = { ...order } as T & { interestArea?: unknown; registrationAnswers?: unknown };
  delete copy.interestArea;
  delete copy.registrationAnswers;
  return copy;
}

/** Field id the Phase 2 backfill gave the old "Área de interesse" dropdown. */
export const LEGACY_INTEREST_AREA_FIELD_ID = "interest-area";

/**
 * Participants list / Excel: an order's answers. Orders from before ADR-016
 * only have orders.interest_area; show it as the backfilled question's answer.
 */
export function participantAnswers(
  answers: readonly RegistrationAnswer[] | null | undefined,
  legacyInterestArea: string | null | undefined,
): RegistrationAnswer[] {
  if (answers && answers.length > 0) return [...answers];
  if (!legacyInterestArea) return [];
  return [{ fieldId: LEGACY_INTEREST_AREA_FIELD_ID, label: "Área de interesse", value: legacyInterestArea }];
}

/** Profile columns the three legacy questions stand in for. */
export type LegacyProfileKey = "occupation" | "partnerCompany" | "areaOfActivity";

export interface LegacyQuestion {
  id: string;
  profileKey: LegacyProfileKey;
  label: string;
}

/**
 * Questions attached to the live events so they keep collecting what the old
 * full signup collected. Their ids are fixed: the backfill SQL, the prefill,
 * the server fallback and the participants export all key on them.
 */
export const LEGACY_QUESTIONS: readonly LegacyQuestion[] = [
  { id: "legacy-occupation", profileKey: "occupation", label: "Cargo que ocupa" },
  { id: "legacy-partner-company", profileKey: "partnerCompany", label: "Empresa que trabalha" },
  { id: "legacy-area-of-activity", profileKey: "areaOfActivity", label: "Área de atuação" },
];

export type LegacyProfile = Partial<Record<LegacyProfileKey, string | null | undefined>>;

export function isLegacyFieldId(fieldId: string): boolean {
  return LEGACY_QUESTIONS.some((question) => question.id === fieldId);
}

function realProfileValue(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value && value !== NOT_APPLICABLE_PROFILE_VALUE ? value : null;
}

/** The profile's real value for a legacy question; null for null, blank, "Nao aplicavel" or a non-legacy id. */
export function legacyProfileValue(fieldId: string, profile: LegacyProfile | null | undefined): string | null {
  const question = LEGACY_QUESTIONS.find((q) => q.id === fieldId);
  return question ? realProfileValue(profile?.[question.profileKey]) : null;
}

/**
 * Mixed-version safety: a body without answers for an active legacy question
 * gets the profile's real value (also a blank one, when the question is required).
 * Anything else the client sent, including a blank optional answer, stays as sent.
 * Returns a copy; a malformed `answers` is left for resolveRegistrationAnswers to reject.
 */
export function withLegacyProfileAnswers<B extends object>(
  fields: readonly RegistrationField[] | null | undefined,
  body: B,
  profile: LegacyProfile | null | undefined,
): B {
  const raw = (body as { answers?: unknown }).answers;
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) return body;
  const given: Record<string, unknown> = { ...(raw ?? {}) };
  let changed = false;
  for (const field of fields ?? []) {
    if (field.archived || !isLegacyFieldId(field.id)) continue;
    // Explicit answers win: fall back only when the key is absent, or blank on a required question.
    const sent = given[field.id];
    if (sent !== undefined && sent !== null && !(field.required && (typeof sent !== "string" || sent.trim() === ""))) continue;
    const fallback = legacyProfileValue(field.id, profile);
    if (fallback === null) continue;
    given[field.id] = fallback;
    changed = true;
  }
  return changed ? { ...body, answers: given } : body;
}

/**
 * Participants list: the legacy questions feed the existing profile columns
 * (the order's answer first, else `profile`) instead of getting columns of
 * their own. Returns the merged values and the remaining answers.
 */
export function mergeLegacyIntoProfile(
  answers: readonly RegistrationAnswer[],
  profile: LegacyProfile | null | undefined,
): Record<LegacyProfileKey, string | null> & { answers: RegistrationAnswer[] } {
  const merged = { occupation: null, partnerCompany: null, areaOfActivity: null } as Record<
    LegacyProfileKey,
    string | null
  >;
  for (const question of LEGACY_QUESTIONS) {
    const answered = answers.find((a) => a.fieldId === question.id)?.value.trim();
    merged[question.profileKey] = answered || realProfileValue(profile?.[question.profileKey]);
  }
  return { ...merged, answers: answers.filter((a) => !isLegacyFieldId(a.fieldId)) };
}

/**
 * Courtesy redeem: the form already asks the attendee's own cargo and company
 * (server-side they fill these two legacy answers), so those two questions are
 * not shown again. The area has no courtesy field and stays a normal question.
 */
export const COURTESY_FILLED_LEGACY_IDS: readonly string[] = ["legacy-occupation", "legacy-partner-company"];
