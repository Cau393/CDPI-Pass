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

/** sanitize-html normalises every break to this exact form, so no pattern matching is needed. */
const BREAK_TAG = "<br />";
const INLINE_CLOSERS = ["</strong>", "</b>", "</em>", "</i>", "</u>"];
const PARAGRAPH_RE = /<p>([\s\S]*?)<\/p>/g;

/**
 * Splits a paragraph's inner HTML into the content to keep and the number of hard
 * breaks that sit at its very end. Closing inline tags are stepped over and then
 * re-appended, so a break the editor wrapped in bold still counts as trailing.
 * The scan walks backwards one tag at a time and never backtracks.
 */
function splitTrailingBreaks(inner: string): { body: string; blankLines: number } {
  const closers: string[] = [];
  let end = inner.length;
  let blankLines = 0;

  for (;;) {
    const closer = INLINE_CLOSERS.find((tag) => inner.endsWith(tag, end));
    if (closer) {
      closers.unshift(closer);
      end -= closer.length;
      continue;
    }
    if (inner.endsWith(BREAK_TAG, end)) {
      blankLines += 1;
      end -= BREAK_TAG.length;
      continue;
    }
    break;
  }

  return { body: inner.slice(0, end) + closers.join(""), blankLines };
}

/**
 * TipTap shows a hard break at the end of a paragraph as a visible blank line
 * (ProseMirror appends a trailing <br>), but browsers render `<p>text<br></p>`
 * as a single line. Each trailing break becomes an empty paragraph so the public
 * page shows the same blank lines the admin sees in the editor. A paragraph that
 * is nothing but a break is already one blank line and is not doubled.
 */
export function prepareDescriptionHtmlForDisplay(html: string): string {
  const safe = sanitizeEventDescriptionHtml(html);
  return safe.replace(PARAGRAPH_RE, (paragraph, inner: string) => {
    const { body, blankLines } = splitTrailingBreaks(inner);
    if (blankLines === 0) return paragraph;
    const blanks = "<p></p>".repeat(blankLines);
    return body.trim() === "" ? blanks : `<p>${body}</p>${blanks}`;
  });
}
