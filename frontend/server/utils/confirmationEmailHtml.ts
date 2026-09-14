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

/** HTML block injected after the greeting; empty string when there is no copy. */
export function confirmationEmailCustomBlockHtml(
  customHtml?: string | null,
): string {
  const normalized = normalizeConfirmationEmailHtml(customHtml);
  if (!normalized) return "";
  return `<div class="custom-message" style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left;">${normalized}</div>`;
}

/** Plain-text equivalent of the custom block. */
export function confirmationEmailCustomBlockText(
  customHtml?: string | null,
): string {
  const normalized = normalizeConfirmationEmailHtml(customHtml);
  if (!normalized) return "";
  return `\n      ${confirmationEmailPlainText(normalized)}\n`;
}
