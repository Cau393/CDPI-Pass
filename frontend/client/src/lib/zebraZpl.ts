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
const NAME_FONT_H = 130;
const NAME_FONT_W = 130;

export function escapeZplFieldData(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\^/g, "\\^")
    .replace(/~/g, "\\~")
    .replace(/\r/g, "")
    .replace(/\n/g, " ");
}

export function buildNameLabelZpl(displayName: string): Uint8Array {
  const safe = escapeZplFieldData(displayName.trim() || "Participante").slice(0, 120);
  // Vertical center for the first line of text (typical one-line name). Long wrapped names
  // add a second line below; tune LABEL_LENGTH_DOTS if two-line names look too low.
  const y = Math.max(0, Math.floor((LABEL_LENGTH_DOTS - NAME_FONT_H) / 2));
  // ^PW/^LL: fixed canvas; ^LH0,0: label home; ^FO0: full-width field; ^FB..C: horizontal center per line
  const zpl = `^XA^CI28^PW${PRINT_WIDTH_DOTS}^LL${LABEL_LENGTH_DOTS}^LH0,0^FO0,${y}^FB${PRINT_WIDTH_DOTS},${MAX_NAME_LINES},${NAME_LINE_GAP},C,0^A0N,${NAME_FONT_H},${NAME_FONT_W}^FD${safe}^FS^XZ\n`;
  return new TextEncoder().encode(zpl);
}
