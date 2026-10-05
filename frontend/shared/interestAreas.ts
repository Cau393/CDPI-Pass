/**
 * Event "Área de Interesse" labels and the snapshot stored on an order.
 * This is not users.area_of_activity (Área de Atuação on the profile).
 *
 * events.interest_areas is an ordered list. orders.interest_area is a text
 * copy taken when the order is created. It is not a foreign key.
 */

export const SELECT_INTEREST_AREA = "Selecione uma área de interesse";

export const INTEREST_AREA_BLANK =
  "A área de interesse não pode ficar em branco.";
export const INTEREST_AREA_TOO_LONG =
  "Cada área de interesse pode ter no máximo 80 caracteres.";
export const INTEREST_AREA_DUPLICATE =
  "Essa área de interesse já foi adicionada.";
export const INTEREST_AREA_TOO_MANY = "No máximo 20 áreas de interesse.";
export const INTEREST_AREA_INVALID = "interest_areas deve ser um array JSON.";

export const INTEREST_AREA_MAX_LABELS = 20;
export const INTEREST_AREA_MAX_LENGTH = 80;

export type ParseInterestAreasResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

export type ResolveInterestAreaResult =
  | { ok: true; interestArea: string | null }
  | { ok: false; message: string };

/** Multipart field value. An empty list is the JSON array "[]". */
export function interestAreasMultipartValue(
  labels: readonly string[] | null | undefined,
): string {
  return JSON.stringify([...(labels ?? [])]);
}

/**
 * Admin create/edit: one JSON array string on the multipart body.
 * Missing, blank, or "[]" stores an empty list. Invalid JSON rejects the save.
 */
export function parseInterestAreasField(raw: unknown): ParseInterestAreasResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [] };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: INTEREST_AREA_INVALID };
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "[]") {
    return { ok: true, value: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: INTEREST_AREA_INVALID };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: INTEREST_AREA_INVALID };
  }
  if (parsed.length > INTEREST_AREA_MAX_LABELS) {
    return { ok: false, error: INTEREST_AREA_TOO_MANY };
  }

  const value: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string") {
      return { ok: false, error: INTEREST_AREA_INVALID };
    }
    const label = item.trim();
    if (!label) {
      return { ok: false, error: INTEREST_AREA_BLANK };
    }
    if (label.length > INTEREST_AREA_MAX_LENGTH) {
      return { ok: false, error: INTEREST_AREA_TOO_LONG };
    }
    const key = label.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) {
      return { ok: false, error: INTEREST_AREA_DUPLICATE };
    }
    seen.add(key);
    value.push(label);
  }
  return { ok: true, value };
}

/**
 * Append one trimmed label. Rejects the same cases as the server and does
 * not return a partial list.
 */
export function tryAddInterestArea(
  current: readonly string[],
  raw: string,
): ParseInterestAreasResult {
  return parseInterestAreasField(
    interestAreasMultipartValue([...current, raw]),
  );
}

/**
 * Inscription gate for POST /api/orders, POST /api/events/:id/subscribe,
 * and POST /api/courtesy/redeem.
 *
 * Empty list: the field must be omitted. A present value, including null
 * or "", is rejected and no order is created.
 * Non-empty list: trim, then exact case-sensitive match. The returned
 * string is the stored label, copied so a later edit of the event list
 * cannot change this order.
 */
export function resolveOrderInterestArea(input: {
  labels: readonly string[] | null | undefined;
  body: object;
}): ResolveInterestAreaResult {
  const labels = [...(input.labels ?? [])];
  const present = Object.prototype.hasOwnProperty.call(input.body, "interestArea");
  if (labels.length === 0) {
    if (present) {
      return { ok: false, message: SELECT_INTEREST_AREA };
    }
    return { ok: true, interestArea: null };
  }
  if (!present) {
    return { ok: false, message: SELECT_INTEREST_AREA };
  }
  const raw = (input.body as { interestArea?: unknown }).interestArea;
  if (typeof raw !== "string") {
    return { ok: false, message: SELECT_INTEREST_AREA };
  }
  const trimmed = raw.trim();
  const canonical = labels.find((label) => label === trimmed);
  if (!canonical) {
    return { ok: false, message: SELECT_INTEREST_AREA };
  }
  return { ok: true, interestArea: canonical };
}

export function sameInterestAreas(
  left: readonly string[] | null | undefined,
  right: readonly string[],
): boolean {
  const current = left ?? [];
  return (
    current.length === right.length &&
    current.every((label, index) => label === right[index])
  );
}

/** Participants JSON: null when the order never stored a label. */
export function storedParticipantInterestArea(
  value: string | null | undefined,
): string | null {
  return value ?? null;
}

/** Buyer order payloads (Meus Ingressos, profile, create responses) omit the answer. */
export function withoutBuyerInterestArea<T extends object>(
  order: T,
): Omit<T, "interestArea"> {
  const copy = { ...order } as T & { interestArea?: unknown };
  delete copy.interestArea;
  return copy;
}
