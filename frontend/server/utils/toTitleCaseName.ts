/**
 * Title-case a full name for display / storage.
 * Portuguese particles in the middle stay lowercase; first word is always capitalized.
 */
const PARTICLES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "di",
  "du",
  "e",
  "van",
  "von",
  "del",
]);

function titleCaseWord(word: string, isFirstWord: boolean): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (!isFirstWord && PARTICLES.has(lower)) {
    return lower;
  }
  // Preserve apostrophe interior capitalization pattern: d'avila -> D'Avila
  if (lower.includes("'")) {
    return lower
      .split("'")
      .map((part, i) => {
        if (!part) return "";
        if (i === 0) {
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("'");
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function processSegment(segment: string, isFirstSegment: boolean): string {
  if (!segment) return segment;
  const hyphenParts = segment.split("-");
  return hyphenParts
    .map((h, hi) => titleCaseWord(h, isFirstSegment && hi === 0))
    .join("-");
}

export function toTitleCaseName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const words = trimmed.split(/\s+/);
  return words
    .map((w, i) => processSegment(w, i === 0))
    .join(" ");
}
