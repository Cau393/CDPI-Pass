import * as XLSX from "xlsx";

export type MassSendExportRow = {
  recipientName: string;
  recipientEmail: string;
  code: string;
  ticketCount: number;
  usedCount: number;
  remaining: number;
  isActive: boolean;
};

const HEADERS = [
  "Nome",
  "E-mail",
  "Código",
  "Enviadas",
  "Utilizadas",
  "Restantes",
  "Status",
] as const;

export function massSendStatusLabel(isActive: boolean): "Ativo" | "Inativo" {
  return isActive ? "Ativo" : "Inativo";
}

/** Linhas prontas para `json_to_sheet` (mesmas chaves dos cabeçalhos PT-BR). */
export function buildMassSendSheetRows(
  recipients: MassSendExportRow[],
): Record<(typeof HEADERS)[number], string>[] {
  return recipients.map((r) => ({
    Nome: r.recipientName,
    "E-mail": r.recipientEmail,
    Código: r.code,
    Enviadas: String(r.ticketCount),
    Utilizadas: String(r.usedCount),
    Restantes: String(r.remaining),
    Status: massSendStatusLabel(r.isActive),
  }));
}

export function massSendExcelHeaders(): readonly string[] {
  return HEADERS;
}

function sanitizeFilenameSegment(title: string): string {
  const t = title
    .replaceAll(/[/\\?%*:|"<>]/g, "-")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return t.length > 0 ? t : "evento";
}

/**
 * Gera e baixa um `.xlsx` no navegador.
 * Lista vazia ainda inclui apenas a linha de cabeçalhos.
 */
export function exportMassSendToXlsx(
  recipients: MassSendExportRow[],
  eventTitle?: string | null,
): void {
  const wb = XLSX.utils.book_new();
  let ws: XLSX.WorkSheet;
  if (recipients.length === 0) {
    ws = XLSX.utils.aoa_to_sheet([[...HEADERS]]);
  } else {
    const rows = buildMassSendSheetRows(recipients);
    ws = XLSX.utils.json_to_sheet(rows);
  }
  XLSX.utils.book_append_sheet(wb, ws, "Destinatários");
  const date = new Date().toISOString().slice(0, 10);
  const base = sanitizeFilenameSegment(eventTitle ?? "envio-massa");
  const filename = `cortesias-massa-${base}-${date}.xlsx`;
  XLSX.writeFile(wb, filename);
}
