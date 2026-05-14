import * as XLSX from "xlsx";

export type NpsExportType = "cdpi_event" | "cdpi_apoiando";

const CDPI_EVENT_HEADERS = [
  "Nome completo",
  "E-mail",
  "WhatsApp",
  "Como você avalia sua experiência geral no evento?",
  "Os temas abordados foram relevantes para você?",
  "Como você avalia os palestrantes no geral?",
  "O conteúdo apresentado é aplicável à sua realidade profissional?",
  "Teve algum momento, painel ou palestrante que se destacou? Qual e por quê?",
  "Como você avalia a organização do evento (estrutura, suporte, logística)?",
  "Você participaria de outros eventos do CDPI?",
  "O que poderíamos melhorar para os próximos eventos?",
  "Você teria interesse em se aprofundar em algum dos temas abordados?",
  "Descreva o tema abordado que gostaria de se aprofundar",
  "De 0 a 10, o quanto você recomendaria esse evento para um colega?",
  "Respondido em",
] as const;

const CDPI_APOIANDO_HEADERS = [
  "Nome completo",
  "E-mail",
  "WhatsApp",
  "De 0 a 10, como você avalia sua experiência geral no evento?",
  "O quão relevantes os temas abordados foram para você?",
  "O quão aplicável à sua realidade profissional o conteúdo do evento foi para você?",
  "Quais temas você gostaria de aprofundar em futuros conteúdos, cursos ou programas?",
  "Como foi sua experiência com a organização do evento (acolhimento, informações, suporte)?",
  "O que poderia ser melhorado em próximas edições do evento?",
  "Você gostaria de receber conteúdos ou novidades sobre os temas abordados neste evento?",
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
