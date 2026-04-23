/** Shape compatible with `courtesy_links` selection for List A (mass-send) filtering. */
export type CourtesyLinkMassSendLike = {
  id: string;
  eventId: string;
  code: string;
  recipientEmail: string | null;
  recipientName: string | null;
  ticketCount: number;
  usedCount: number | null;
  isActive: boolean | null;
  createdAt: Date | null;
};

export function isMassSendCourtesyLinkRow(link: CourtesyLinkMassSendLike): boolean {
  const email = link.recipientEmail;
  const name = link.recipientName;
  if (email == null || name == null) return false;
  if (String(email).trim() === "" || String(name).trim() === "") return false;
  return true;
}

export function filterMassSendLinksByEvent(
  links: CourtesyLinkMassSendLike[],
  eventId: string,
): CourtesyLinkMassSendLike[] {
  return links.filter(
    (l) => l.eventId === eventId && isMassSendCourtesyLinkRow(l),
  );
}

export function mapMassSendRecipientFromLink(link: CourtesyLinkMassSendLike) {
  const used = link.usedCount ?? 0;
  const ticket = link.ticketCount;
  return {
    id: link.id,
    code: link.code,
    recipientName: link.recipientName!,
    recipientEmail: link.recipientEmail!,
    ticketCount: ticket,
    usedCount: used,
    remaining: Math.max(0, ticket - used),
    isActive: link.isActive ?? true,
    createdAt: (() => {
      if (!link.createdAt) return new Date(0).toISOString();
      if (link.createdAt instanceof Date) return link.createdAt.toISOString();
      return new Date(link.createdAt as string | number).toISOString();
    })(),
  };
}

export type RedemptionOrderJoin = {
  orderId: string;
  orderStatus: string;
  amntUsed: number | null;
  maxUses: number | null;
  qrCodeUsedAt: Date | null;
  orderCreatedAt: Date | null;
  attName: string | null;
  attEmail: string | null;
  attCpf: string | null;
  attPhone: string | null;
  uName: string;
  uEmail: string;
  uCpf: string;
  uPhone: string;
};

/**
 * List B: primary attendee fields, fallback to buyer user (EC-09).
 */
export function mapRedemptionRowFromOrder(row: RedemptionOrderJoin) {
  const name = row.attName?.trim() ? row.attName : row.uName;
  const email = row.attEmail?.trim() ? row.attEmail : row.uEmail;
  const cpf = row.attCpf?.trim() ? row.attCpf : row.uCpf;
  const phone = row.attPhone?.trim() ? row.attPhone : row.uPhone;
  const used = row.amntUsed ?? 0;
  return {
    orderId: row.orderId,
    orderStatus: row.orderStatus,
    amntUsed: used,
    maxUses: row.maxUses ?? 1,
    attendeeName: name,
    attendeeEmail: email,
    attendeeCpf: cpf,
    attendeePhone: phone,
    checkedIn: used > 0,
    checkedInAt: row.qrCodeUsedAt
      ? row.qrCodeUsedAt instanceof Date
        ? row.qrCodeUsedAt.toISOString()
        : new Date(row.qrCodeUsedAt as string).toISOString()
      : null,
    createdAt: row.orderCreatedAt
      ? row.orderCreatedAt instanceof Date
        ? row.orderCreatedAt.toISOString()
        : new Date(row.orderCreatedAt as string).toISOString()
      : new Date(0).toISOString(),
  };
}

/**
 * @param search — trimmed, max 120 chars; caller enforces
 */
export function buildMassSendRecipientIlikePattern(search: string): string | null {
  const t = search.trim().slice(0, 120);
  if (t.length === 0) return null;
  return `%${t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}
