import * as XLSX from "xlsx";

export type ParticipantExportRow = {
  name: string;
  cpf: string;
  email: string;
  phone: string;
  orderStatus: "paid" | "courtesy" | "cancelled";
};

const HEADERS = ["Nome", "CPF", "E-mail", "Telefone", "Status"] as const;

/** Rótulos de Status para Excel: apenas pagamento e cortesia (demais ficam em branco). */
export function statusLabelForExcel(
  orderStatus: ParticipantExportRow["orderStatus"],
): string {
  if (orderStatus === "paid") return "Pago";
  if (orderStatus === "courtesy") return "Cortesia";
  return "";
}

/** Linhas prontas para `json_to_sheet` (mesmas chaves dos cabeçalhos PT-BR). */
export function buildParticipantSheetRows(
  participants: ParticipantExportRow[],
): Record<(typeof HEADERS)[number], string>[] {
  return participants.map((p) => ({
    Nome: p.name,
    CPF: p.cpf,
    "E-mail": p.email,
    Telefone: p.phone,
    Status: statusLabelForExcel(p.orderStatus),
  }));
}

export function participantExcelHeaders(): readonly string[] {
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
export function exportParticipantsToXlsx(
  participants: ParticipantExportRow[],
  eventTitle?: string | null,
): void {
  const wb = XLSX.utils.book_new();
  let ws: XLSX.WorkSheet;
  if (participants.length === 0) {
    ws = XLSX.utils.aoa_to_sheet([[...HEADERS]]);
  } else {
    const rows = buildParticipantSheetRows(participants);
    ws = XLSX.utils.json_to_sheet(rows);
  }
  XLSX.utils.book_append_sheet(wb, ws, "Participantes");
  const date = new Date().toISOString().slice(0, 10);
  const base = sanitizeFilenameSegment(eventTitle ?? "participantes");
  const filename = `participantes-${base}-${date}.xlsx`;
  XLSX.writeFile(wb, filename);
}
