import { formatCurrency } from "@/lib/utils";

/** Authoritative client check: never infer free from price === 0. */
export function isFreeEvent(event: { isFree?: boolean | null }): boolean {
  return event.isFree === true;
}

export function isEventSoldOut(event: {
  maxAttendees?: number | null;
  currentAttendees?: number | null;
}): boolean {
  const max = event.maxAttendees ?? null;
  if (max === null) return false;
  return (event.currentAttendees ?? 0) >= max;
}

export function eventPriceLabel(
  event: { isFree?: boolean | null; price?: string | number | null },
  displayPrice?: number,
): string {
  if (isFreeEvent(event)) return "Grátis";
  const amount = displayPrice ?? event.price ?? 0;
  return formatCurrency(amount);
}

export type EventFeeLabelVariant = "short" | "detailed";

/** Paid events show a fee line. Free events omit it entirely. */
export function eventFeeLabel(
  event: { isFree?: boolean | null },
  variant: EventFeeLabelVariant = "short",
): string | null {
  if (isFreeEvent(event)) return null;
  return variant === "detailed"
    ? "+ taxa de conveniência de R$ 5,00"
    : "+ taxa de conveniência";
}

export type AcquisitionCtaState = {
  isFree: boolean;
  confirmed: boolean;
  soldOut: boolean;
  salesClosed: boolean;
  pending?: boolean;
};

export function eventAcquisitionCtaLabel(state: AcquisitionCtaState): string {
  if (state.confirmed) {
    return state.isFree ? "Inscrição confirmada" : "Ingresso já confirmado";
  }
  if (state.soldOut) return "Evento Esgotado";
  if (state.salesClosed) return "Vendas encerradas";
  if (state.pending) return "Confirmando...";
  return state.isFree ? "Confirmar inscrição" : "Comprar Ingresso";
}

export function loginRequiredDescription(isFree: boolean): string {
  return isFree
    ? "Faça login ou cadastre-se para se inscrever"
    : "Faça login ou cadastre-se para comprar ingressos";
}

export function isFreePaymentMethod(
  paymentMethod?: string | null,
): boolean {
  return paymentMethod === "free";
}
