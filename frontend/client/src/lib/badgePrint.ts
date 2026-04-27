import { buildNameLabelZpl } from "./zebraZpl";
import type { ZebraUsbSession } from "./webUsbZebra";

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
 * ZPL to USB: same path for fila/QR, reprint, and manual form.
 */
export async function printBadgeLabel(
  session: ZebraUsbSession,
  params: { name: string; company?: string | null },
): Promise<void> {
  const zpl = buildNameLabelZpl(
    formatBadgeDisplayName(params.name),
    params.company,
  );
  await session.printZpl(zpl);
}
