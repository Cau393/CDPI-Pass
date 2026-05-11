/** Stored subject template max length (RFC 5322 line length / practical cap). */
export const MAX_EMAIL_SUBJECT_TEMPLATE_CHARS = 998;

export type EmailSubjectTemplateValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validates plain-text email subject template input (no HTML).
 * Returns trimmed value (may be empty string).
 */
export function validateEmailSubjectTemplateInput(
  raw: unknown,
): EmailSubjectTemplateValidation {
  if (typeof raw !== "string") {
    return { ok: false, error: "subject must be a string" };
  }
  const trimmed = raw.trim();
  if (raw.includes("<")) {
    return { ok: false, error: "subject must be plain text (no HTML)" };
  }
  if (/[\r\n]/.test(trimmed)) {
    return { ok: false, error: "subject must be a single line" };
  }
  if (trimmed.length > MAX_EMAIL_SUBJECT_TEMPLATE_CHARS) {
    return { ok: false, error: "subject exceeds maximum length" };
  }
  return { ok: true, value: trimmed };
}
