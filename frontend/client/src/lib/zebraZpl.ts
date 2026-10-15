/**
 * ZPL for a name on Zebra ZD220-like printers (~203 dpi).
 * Uses ^PW/^LL for a known printable rectangle, then ^FB with C to center
 * in that area. Adjust the constants if your label stock size differs.
 */
/** Full print width in dots; ^PW and ^FB must match for true horizontal center. */
const PRINT_WIDTH_DOTS = 640;
/**
 * Label height in dots (^LL). Used so vertical Y is center of this region.
 * ~1.5" at 203 dpi; increase if your media is taller and text still looks high/low.
 */
const LABEL_LENGTH_DOTS = 360;
const NAME_FONT_DOTS = 110;
/** When a second line (company) is present, use slightly smaller name font to fit. */
const NAME_WITH_COMPANY_FONT_DOTS = 100;
const COMPANY_FONT_DOTS = 70;
/** Dots between the name block and the company block. */
const NAME_TO_COMPANY_GAP = 12;
/** Width the fitted text must stay within (small side margins inside ^PW). */
const FIT_WIDTH_DOTS = 600;
/**
 * Conservative ^A0 advance per character as a fraction of the font width. Measured ~0.46
 * for mixed-case and ~0.53 for upper-case text (names are often typed in caps). Over-estimating keeps each field
 * on one line: a ^FB that wraps prints its second line on top of the company line.
 */
const NAME_CHAR_WIDTH_RATIO = 0.58;
const COMPANY_CHAR_WIDTH_RATIO = 0.62;
/** Smallest font a long field shrinks to; text beyond what fits at this size is cut. */
const MIN_FONT_DOTS = 30;
/** A company that would print smaller than this on one line wraps to two lines instead. */
const COMPANY_MIN_ONE_LINE_DOTS = 40;
const COMPANY_LINE_GAP = 6;
/** Word wrapping splits unevenly: size two-line text for its longer line (~60% of it). */
const TWO_LINE_SHARE = 0.6;
/**
 * Shift content slightly below optical center (positive = lower on the label).
 * Tune in ~2–4 dot steps if needed.
 */
const VERTICAL_NUDGE_DOWN_DOTS = 14;
/**
 * Name-only: shift slightly above vertical center (positive = higher on the label in dots).
 * Tune in ~2–4 dot steps if needed.
 */
const NAME_ONLY_NUDGE_UP_DOTS = 10;

const ZPL_PREAMBLE = `^XA^CI28^PW${PRINT_WIDTH_DOTS}^LL${LABEL_LENGTH_DOTS}^LH0,0`;
const ZPL_POST = "^XZ\n";

export function escapeZplFieldData(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\^/g, "\\^")
    .replace(/~/g, "\\~")
    .replace(/\r/g, "")
    .replace(/\n/g, " ");
}

type FittedField = { safe: string; dots: number; lines: 1 | 2 };

/**
 * Largest square ^A0 font (up to `maxDots`) whose estimated width fits `lines` lines,
 * measured on the raw text (escaping adds characters that do not print).
 */
function fitField(
  raw: string,
  maxDots: number,
  charWidthRatio: number,
  lines: 1 | 2 = 1,
): FittedField {
  const share = lines === 1 ? 1 : TWO_LINE_SHARE;
  const maxChars = Math.floor(FIT_WIDTH_DOTS / (MIN_FONT_DOTS * charWidthRatio) / share);
  const text = raw.slice(0, maxChars);
  // A word never breaks across lines, so the longest word bounds a two-line fit too.
  const longestWord = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  const lineChars = Math.max(1, Math.ceil(text.length * share), lines === 1 ? 0 : longestWord);
  const fit = Math.floor(FIT_WIDTH_DOTS / (lineChars * charWidthRatio));
  return {
    safe: escapeZplFieldData(text),
    dots: Math.max(MIN_FONT_DOTS, Math.min(maxDots, fit)),
    lines,
  };
}

/** Company: one line when it stays readable, otherwise two smaller-than-max lines. */
function fitCompany(raw: string): FittedField {
  const one = fitField(raw, COMPANY_FONT_DOTS, COMPANY_CHAR_WIDTH_RATIO);
  return one.dots >= COMPANY_MIN_ONE_LINE_DOTS
    ? one
    : fitField(raw, COMPANY_FONT_DOTS, COMPANY_CHAR_WIDTH_RATIO, 2);
}

/** Printed height of a field in dots. */
function fieldHeight(f: FittedField): number {
  return f.lines * f.dots + (f.lines - 1) * COMPANY_LINE_GAP;
}

/** One centered field across the full print width. */
function fieldZpl(y: number, f: FittedField): string {
  return `^FO0,${y}^FB${PRINT_WIDTH_DOTS},${f.lines},${COMPANY_LINE_GAP},C,0^A0N,${f.dots},${f.dots}^FD${f.safe}^FS`;
}

/**
 * Template: name only, slightly above true vertical center of the label.
 */
function buildNameOnlyLabelZpl(name: FittedField): string {
  const y = Math.max(
    0,
    Math.floor((LABEL_LENGTH_DOTS - name.dots) / 2) - NAME_ONLY_NUDGE_UP_DOTS,
  );
  return `${ZPL_PREAMBLE}${fieldZpl(y, name)}${ZPL_POST}`;
}

/**
 * Template: name + company stacked and vertically centered as a group. The company
 * sits below the name's actual (fitted) height, so the two lines never overlap.
 */
function buildNameAndCompanyLabelZpl(
  name: FittedField,
  company: FittedField,
): string {
  const nameBlock = name.dots + 4;
  const stack = nameBlock + NAME_TO_COMPANY_GAP + fieldHeight(company) + 4;
  const yName = Math.max(
    0,
    Math.floor((LABEL_LENGTH_DOTS - stack) / 2) + VERTICAL_NUDGE_DOWN_DOTS,
  );
  const yCompany = yName + nameBlock + NAME_TO_COMPANY_GAP;
  return `${ZPL_PREAMBLE}${fieldZpl(yName, name)}${fieldZpl(yCompany, company)}${ZPL_POST}`;
}

/**
 * @param companyLine - When set (courtesy), prints a second line below the name. Paid flow: omit.
 */
export function buildNameLabelZpl(
  displayName: string,
  companyLine?: string | null,
): Uint8Array {
  const nameRaw = (displayName.trim() || "Participante").slice(0, 120);
  const compTrim = companyLine?.trim();
  if (!compTrim) {
    const name = fitField(nameRaw, NAME_FONT_DOTS, NAME_CHAR_WIDTH_RATIO);
    return new TextEncoder().encode(buildNameOnlyLabelZpl(name));
  }
  const name = fitField(nameRaw, NAME_WITH_COMPANY_FONT_DOTS, NAME_CHAR_WIDTH_RATIO);
  const company = fitCompany(compTrim.slice(0, 120));
  return new TextEncoder().encode(buildNameAndCompanyLabelZpl(name, company));
}
