import { buildNameLabelZpl } from "./zebraZpl";
import type { ZebraUsbSession } from "./webUsbZebra";

/**
 * How line 1 is printed. "first-last" is the queue (QR check-in) and reprint rule; the other
 * styles come from the manual form and print the company as typed.
 */
export type BadgeNameStyle = "first-last" | "as-typed" | "Dr." | "Dra.";

/** pt-BR name connectors skipped when picking the second name ("Ana de Souza" → "Ana Souza"). */
const NAME_CONNECTORS = new Set(["de", "da", "do", "dos", "das", "e"]);
/** A title already typed in front of the name ("Dr.", "dra", "Dr.José") is dropped so it never doubles. */
const LEADING_TITLE = /^dra?(?:\.|(?=\s)|$)/i;

function nameWords(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

/**
 * Badge line 1: first token + last token of the full name (Brazilian common case).
 * Single word stays as-is; empty falls back to "Participante".
 */
export function formatBadgeDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return "Participante";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0] ?? t;
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? first;
  return `${first} ${last}`;
}

/**
 * Manual "Nome com Dr./Dra.": title + first name + second name, skipping connectors.
 * Word casing is kept as typed; no name left falls back to "Participante".
 */
export function formatBadgeTitledName(name: string, title: "Dr." | "Dra."): string {
  const [first, ...rest] = nameWords(name.trim().replace(LEADING_TITLE, ""));
  if (!first) return "Participante";
  const second = rest.find((w) => !NAME_CONNECTORS.has(w.toLocaleLowerCase("pt-BR")));
  return second ? `${title} ${first} ${second}` : `${title} ${first}`;
}

/** Badge line 2: company in upper case (pt-BR, keeps accents); null when blank. */
export function formatBadgeCompanyLine(company?: string | null): string | null {
  const t = company?.trim();
  return t ? t.toLocaleUpperCase("pt-BR") : null;
}

/**
 * ZPL to USB: same path for fila/QR, reprint, and manual form. Manual styles print the name
 * as typed (or titled) and the company as typed, and may wrap a long name to 2 lines.
 */
export async function printBadgeLabel(
  session: ZebraUsbSession,
  params: { name: string; company?: string | null; style?: BadgeNameStyle },
): Promise<void> {
  const style = params.style ?? "first-last";
  const zpl =
    style === "first-last"
      ? buildNameLabelZpl(
          formatBadgeDisplayName(params.name),
          formatBadgeCompanyLine(params.company),
        )
      : buildNameLabelZpl(
          style === "as-typed"
            ? nameWords(params.name).join(" ")
            : formatBadgeTitledName(params.name, style),
          params.company?.trim() || null,
          { wrapName: true },
        );
  await session.printZpl(zpl);
}
