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
/** Max wrapped lines for long names; gap between lines in dots. */
const MAX_NAME_LINES = 2;
const NAME_LINE_GAP = 12;
const NAME_FONT_H = 110;
const NAME_FONT_W = 110;
/** When a second line (company) is present, use slightly smaller name font to fit. */
const NAME_WITH_COMPANY_FONT_H = 100;
const NAME_WITH_COMPANY_FONT_W = 100;
const COMPANY_FONT_H = 70;
const COMPANY_FONT_W = 70;
/** Dots between wrapped lines inside ^FB (name/company). */
const FB_LINE_GAP_NAME = 8;
const FB_LINE_GAP_COMPANY = 6;
/** Dots from name block origin to company block: one-line name + small buffer + gap. */
const NAME_TO_COMPANY_GAP = 12;
/**
 * Approx. vertical space for one line of the “name” font in dots (field origin → next field).
 * (Two-line names may sit close to company; tune fonts/gap if that happens often.)
 */
const NAME_BLOCK_ONE_LINE = NAME_WITH_COMPANY_FONT_H + 4;
/** One-line company line footprint for vertical centering the stack. */
const COMPANY_BLOCK_ONE_LINE = COMPANY_FONT_H + 4;
/**
 * Vertically center name + company as a group (typical 1 + 1 lines), keeping
 * `NAME_TO_COMPANY_GAP` between the two `^FO` blocks. Long wrapped lines on both
 * fields can get tight; reduce fonts or `^LL` if that happens in production.
 */
const STACK_NAME_COMPANY_TYPICAL =
  NAME_BLOCK_ONE_LINE + NAME_TO_COMPANY_GAP + COMPANY_BLOCK_ONE_LINE;
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

/**
 * Template: name only, slightly above true vertical center of the label.
 */
function buildNameOnlyLabelZpl(nameSafe: string): string {
  const y = Math.max(
    0,
    Math.floor((LABEL_LENGTH_DOTS - NAME_FONT_H) / 2) - NAME_ONLY_NUDGE_UP_DOTS,
  );
  return `${ZPL_PREAMBLE}^FO0,${y}^FB${PRINT_WIDTH_DOTS},${MAX_NAME_LINES},${NAME_LINE_GAP},C,0^A0N,${NAME_FONT_H},${NAME_FONT_W}^FD${nameSafe}^FS${ZPL_POST}`;
}

/**
 * Template: name + company (stack layout, unchanged from previous behavior).
 */
function buildNameAndCompanyLabelZpl(
  nameSafe: string,
  compSafe: string,
): string {
  const yName = Math.max(
    0,
    Math.floor((LABEL_LENGTH_DOTS - STACK_NAME_COMPANY_TYPICAL) / 2) +
      VERTICAL_NUDGE_DOWN_DOTS,
  );
  const yCompany = yName + NAME_BLOCK_ONE_LINE + NAME_TO_COMPANY_GAP;
  return `${ZPL_PREAMBLE}^FO0,${yName}^FB${PRINT_WIDTH_DOTS},2,${FB_LINE_GAP_NAME},C,0^A0N,${NAME_WITH_COMPANY_FONT_H},${NAME_WITH_COMPANY_FONT_W}^FD${nameSafe}^FS^FO0,${yCompany}^FB${PRINT_WIDTH_DOTS},2,${FB_LINE_GAP_COMPANY},C,0^A0N,${COMPANY_FONT_H},${COMPANY_FONT_W}^FD${compSafe}^FS${ZPL_POST}`;
}

/**
 * @param companyLine - When set (courtesy), prints a second line below the name. Paid flow: omit.
 */
export function buildNameLabelZpl(
  displayName: string,
  companyLine?: string | null,
): Uint8Array {
  const nameSafe = escapeZplFieldData(
    displayName.trim() || "Participante",
  ).slice(0, 120);
  const compTrim = companyLine?.trim();
  if (!compTrim) {
    return new TextEncoder().encode(buildNameOnlyLabelZpl(nameSafe));
  }
  const compSafe = escapeZplFieldData(compTrim).slice(0, 120);
  return new TextEncoder().encode(
    buildNameAndCompanyLabelZpl(nameSafe, compSafe),
  );
}
