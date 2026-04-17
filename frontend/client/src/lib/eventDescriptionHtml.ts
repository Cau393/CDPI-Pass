import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u"],
  allowedAttributes: {},
  allowedSchemes: [],
};

/** Strips unsafe markup for storage display and XSS safety. */
export function sanitizeEventDescriptionHtml(html: string): string {
  return sanitizeHtml(html?.trim() ?? "", SANITIZE_OPTIONS).trim();
}

/** Plain text for search / validation (works without DOM in Node). */
export function eventDescriptionPlainText(html: string): string {
  const raw = html ?? "";
  if (typeof document === "undefined") {
    return raw
      .replaceAll(/<[^>]+>/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim();
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  return (doc.body.textContent ?? "").replaceAll(/\s+/g, " ").trim();
}

export function hasMeaningfulEventDescription(html: string): boolean {
  return eventDescriptionPlainText(html).length > 0;
}

function escapePlainLine(line: string): string {
  return line
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Legacy descriptions are plain text / newlines; editor and API use a small HTML subset.
 */
export function normalizeDescriptionForEditor(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "<p></p>";
  if (/<\s*(p|br|strong|b|em|i|u)\b/i.test(t)) {
    return sanitizeEventDescriptionHtml(t) || "<p></p>";
  }
  const lines = t.split(/\n+/);
  const parts = lines.map((line) => {
    const esc = escapePlainLine(line);
    return esc ? `<p>${esc}</p>` : "<p><br></p>";
  });
  return parts.join("") || "<p></p>";
}
