export interface CommercialSaleRow {
  id: string;
  status: string;
  buyerName: string;
  cpf: string;
  buyerEmail: string;
  buyerPhone: string | null;
  courtesyAttendeeId: string | null;
  attendeeName: string | null;
  attendeeCpf: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  sellerName: string | null;
  courtesyLinkId: string | null;
  createdAt: Date | null;
}

export interface CommercialSaleOutput {
  id: string;
  vendedor: string;
  status: "pago" | "pendente";
  /** DB status for admin actions (e.g. cancel). */
  orderDbStatus: "pending" | "paid" | "courtesy";
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
}

function orderStatusRank(s: string): number {
  if (s === "paid") return 2;
  if (s === "courtesy") return 1;
  return 0;
}

/**
 * Deduplicates order rows by CPF keeping the most relevant entry
 * (paid takes precedence, then most recent) and maps DB rows to
 * the flat API output contract.
 */
export function mapCommercialSales(
  rows: CommercialSaleRow[],
): CommercialSaleOutput[] {
  const seen = new Map<string, CommercialSaleRow>();

  for (const row of rows) {
    const key = row.cpf;
    const existing = seen.get(key);
    if (!existing || orderStatusRank(row.status) > orderStatusRank(existing.status)) {
      seen.set(key, row);
    }
  }

  return Array.from(seen.values()).map((row) => {
    const hasLink = !!row.courtesyLinkId;
    const isCourtesyAttendee = !!row.courtesyAttendeeId;
    const isPaidLike = row.status === "paid" || row.status === "courtesy";

    return {
      id: row.id,
      vendedor: hasLink
        ? (row.sellerName ?? "Usuário Removido")
        : "N/A",
      status: isPaidLike ? ("pago" as const) : ("pendente" as const),
      orderDbStatus: row.status as "pending" | "paid" | "courtesy",
      nome: isCourtesyAttendee
        ? (row.attendeeName ?? row.buyerName)
        : row.buyerName,
      cpf: isCourtesyAttendee ? (row.attendeeCpf ?? row.cpf) : row.cpf,
      email: isCourtesyAttendee
        ? (row.attendeeEmail ?? row.buyerEmail)
        : row.buyerEmail,
      telefone: isCourtesyAttendee
        ? (row.attendeePhone ?? row.buyerPhone ?? "")
        : (row.buyerPhone ?? ""),
    };
  });
}
