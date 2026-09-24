export const COURTESY_LIMIT_INVALID =
  "O limite deve ser um número inteiro maior ou igual a 1.";

export const COURTESY_LIMIT_REACHED = "Limite de cortesias do evento atingido";

export type ParseCourtesyLimitResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** Blank or missing means no cap. Otherwise a positive integer. */
export function parseCourtesyLimit(raw: unknown): ParseCourtesyLimitResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: COURTESY_LIMIT_INVALID };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return { ok: false, error: COURTESY_LIMIT_INVALID };
  }
  return { ok: true, value: Number(trimmed) };
}

export function isCourtesyLimitReached(
  redeemed: number,
  limit: number | null | undefined,
): boolean {
  if (limit == null) return false;
  return redeemed >= limit;
}

export function courtesyActivationBlocked(
  redeemed: number,
  limit: number | null | undefined,
): boolean {
  return isCourtesyLimitReached(redeemed, limit);
}
