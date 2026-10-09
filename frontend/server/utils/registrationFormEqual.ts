import { isDeepStrictEqual } from "node:util";
import type { RegistrationField } from "@shared/eventRegistrationForm";

/**
 * True when two registration forms hold the same questions in the same order.
 * Key order inside a question does not matter: Postgres jsonb hands keys back
 * sorted by length, while the admin parser builds them in its own order, so a
 * JSON.stringify compare saw every untouched form as changed.
 */
export function registrationFormsEqual(
  a: readonly RegistrationField[] | null | undefined,
  b: readonly RegistrationField[] | null | undefined,
): boolean {
  return isDeepStrictEqual(a ?? [], b ?? []);
}
