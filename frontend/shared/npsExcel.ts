import * as XLSX from "xlsx";

export type NpsExportType = "cdpi_event" | "cdpi_apoiando";

const CDPI_EVENT_HEADERS = [
  "Nome completo",
  "E-mail",
  "WhatsApp",
  "Como você se sentiu participando do nosso Workshop?",
  "Os temas apresentados foram relevantes para a sua área de atuação?",
  "Como você avalia a didática dos ministrantes?",
  "Teve algum painel ou ministrante que te marcou? Conta pra gente quem e por quê:",
  "Você sente que o workshop agregou algo novo para sua carreira?",
  "Depois dessa experiência, você tem interesse em participar de outros eventos do CDPI?",
  "Como você avalia o suporte da equipe CDPI durante o evento?",
  "Descreva (se Outro)",
  "Quer deixar um recado pra equipe CDPI?",
  "Aceitou política de privacidade",
  "Respondido em",
] as const;

const CDPI_APOIANDO_HEADERS = [
  "Nome completo",
  "E-mail",
  "WhatsApp",
  "De 0 a 10, como você avalia sua experiência geral no Workshop?",
  "Dos temas abordados, quais você gostaria de aprofundar por meio de cursos, programas ou mentorias especializadas?",
  "Como foi sua experiência com a equipe organizadora (acolhimento, informações, suporte)?",
  "Descreva (se Outro)",
  "Caso tenha algum feedback ou sugestão sobre o evento, ficaremos muito gratos em receber:",
  "Aceitou política de privacidade",
  "Respondido em",
] as const;

function sanitizeSheetName(title: string): string {
  const forbidden = /[/\\?*\[\]:]/g;
  let s = title.replace(forbidden, "-").replaceAll(/\s+/g, " ").trim();
  if (s.length === 0) s = "NPS";
  return s.slice(0, 31);
}

export type CdpiEventExportRow = Record<(typeof CDPI_EVENT_HEADERS)[number], string>;
export type CdpiApoiandoExportRow = Record<(typeof CDPI_APOIANDO_HEADERS)[number], string>;

export function cdpiEventExcelHeaders(): readonly string[] {
  return CDPI_EVENT_HEADERS;
}

export function cdpiApoiandoExcelHeaders(): readonly string[] {
  return CDPI_APOIANDO_HEADERS;
}

export function buildNpsExcelWorkbook(
  rows: Record<string, string | number | null | undefined>[],
  type: NpsExportType,
  eventTitle: string,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers =
    type === "cdpi_event" ? [...CDPI_EVENT_HEADERS] : [...CDPI_APOIANDO_HEADERS];
  const sheetName = sanitizeSheetName(eventTitle);

  const headerRow = [...headers];
  const dataRows = rows.map((r) =>
    headers.map((h) => {
      const v = r[h];
      return v === null || v === undefined ? "" : String(v);
    }),
  );
  const aoa = rows.length === 0 ? [headerRow] : [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

export function sanitizeNpsExportFilenameSegment(title: string): string {
  const t = title
    .replaceAll(/[/\\?%*:|"<>]/g, "-")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return t.length > 0 ? t : "evento";
}
