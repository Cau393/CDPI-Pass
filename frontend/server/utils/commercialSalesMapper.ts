export interface CommercialSaleRow {
  id: string;
  status: string;
  paymentMethod: string;
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
  orderDbStatus: "pending" | "paid" | "cancelled";
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  paymentMethod: string;
}

/**
 * Maps commercial sales DB rows 1:1 to the flat API output contract.
 * Each order (pending or paid) is an independent sale, so no dedup
 * by CPF is applied — the same buyer may legitimately have multiple
 * orders for the same event (separate checkouts, separate attempts).
 */
export function mapCommercialSales(
  rows: CommercialSaleRow[],
): CommercialSaleOutput[] {
  return rows.map((row) => {
    const hasLink = !!row.courtesyLinkId;
    const isCourtesyAttendee = !!row.courtesyAttendeeId;
    const isPaidLike = row.status === "paid";

    return {
      id: row.id,
      vendedor: hasLink
        ? (row.sellerName ?? "Usuário Removido")
        : "N/A",
      status: isPaidLike ? ("pago" as const) : ("pendente" as const),
      orderDbStatus: row.status as "pending" | "paid" | "cancelled",
      paymentMethod: row.paymentMethod,
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
