import * as XLSX from "xlsx";
import type { RegistrationAnswer, RegistrationField } from "@shared/eventRegistrationForm";

export type ParticipantExportRow = {
  name: string;
  /** CPF or passport: the API keeps one column for both. */
  cpf: string | null;
  isForeigner: boolean;
  email: string;
  phone: string;
  address: string | null;
  cargoQueOcupa: string;
  empresaQueTrabalha: string;
  presenca: string;
  orderStatus: "paid" | "courtesy" | "cancelled";
  registrationAnswers: RegistrationAnswer[];
};

const FIXED_HEADERS = [
  "Nome",
  "CPF / Passaporte",
  "Estrangeiro",
  "E-mail",
  "Telefone",
  "Endereço",
  "Cargo que ocupa",
  "Empresa que trabalha",
  "Presença",
  "Status",
] as const;

/** Rótulos de Status para Excel: apenas pagamento e cortesia (demais ficam em branco). */
export function statusLabelForExcel(
  orderStatus: ParticipantExportRow["orderStatus"],
): string {
  if (orderStatus === "paid") return "Pago";
  if (orderStatus === "courtesy") return "Cortesia";
  return "";
}

/**
 * Header row plus one row per participant, ready for `aoa_to_sheet`.
 * Question columns: active questions in form order, then removed questions
 * (archived, or no longer on the event at all) that still have answers, so an
 * edit to the form never hides answers already given.
 */
export function buildParticipantSheet(
  participants: readonly ParticipantExportRow[],
  registrationForm: readonly RegistrationField[],
): string[][] {
  const questions = questionColumns(participants, registrationForm);
  const taken = new Set<string>(FIXED_HEADERS);
  const questionHeaders = questions.map(({ label }) => {
    let header = label;
    for (let n = 2; taken.has(header); n++) header = `${label} (${n})`;
    taken.add(header);
    return header;
  });

  const rows = participants.map((p) => {
    const answers = new Map(p.registrationAnswers.map((a) => [a.fieldId, a.value]));
    return [
      p.name,
      p.cpf ?? "",
      p.isForeigner ? "Sim" : "Não",
      p.email,
      p.phone,
      p.address ?? "",
      p.cargoQueOcupa,
      p.empresaQueTrabalha,
      p.presenca,
      statusLabelForExcel(p.orderStatus),
      ...questions.map(({ fieldId }) => answers.get(fieldId) ?? ""),
    ];
  });

  return [[...FIXED_HEADERS, ...questionHeaders], ...rows];
}

function questionColumns(
  participants: readonly ParticipantExportRow[],
  registrationForm: readonly RegistrationField[],
): { fieldId: string; label: string }[] {
  const answeredLabels = new Map<string, string>();
  for (const p of participants) {
    for (const answer of p.registrationAnswers) {
      if (!answeredLabels.has(answer.fieldId)) answeredLabels.set(answer.fieldId, answer.label);
    }
  }

  const active = registrationForm
    .filter((field) => !field.archived)
    .map((field) => ({ fieldId: field.id, label: field.label }));
  const archived = registrationForm
    .filter((field) => field.archived && answeredLabels.has(field.id))
    .map((field) => ({ fieldId: field.id, label: `${field.label} (removida)` }));
  const known = new Set(registrationForm.map((field) => field.id));
  const orphaned = Array.from(answeredLabels)
    .filter(([fieldId]) => !known.has(fieldId))
    .map(([fieldId, label]) => ({ fieldId, label: `${label} (removida)` }));
  return [...active, ...archived, ...orphaned];
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
 * Lista vazia ainda inclui a linha de cabeçalhos.
 */
export function exportParticipantsToXlsx(
  participants: readonly ParticipantExportRow[],
  registrationForm: readonly RegistrationField[],
  eventTitle?: string | null,
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(buildParticipantSheet(participants, registrationForm));
  XLSX.utils.book_append_sheet(wb, ws, "Participantes");
  const date = new Date().toISOString().slice(0, 10);
  const base = sanitizeFilenameSegment(eventTitle ?? "participantes");
  const filename = `participantes-${base}-${date}.xlsx`;
  XLSX.writeFile(wb, filename);
}
