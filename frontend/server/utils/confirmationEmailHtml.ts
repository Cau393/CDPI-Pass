import { sanitizeCourtesyTemplateHtml } from "./courtesyTemplateSanitize";

function confirmationEmailPlainText(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * Sanitize optional confirmation-email HTML. Empty TipTap (`<p></p>`) becomes
 * null so callers keep the hardcoded default template.
 */
export function normalizeConfirmationEmailHtml(html: unknown): string | null {
  if (typeof html !== "string") return null;
  const sanitized = sanitizeCourtesyTemplateHtml(html).trim();
  if (!confirmationEmailPlainText(sanitized)) return null;
  return sanitized;
}
