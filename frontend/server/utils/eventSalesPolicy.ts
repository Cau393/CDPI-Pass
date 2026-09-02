/**
 * Server-side rules for whether an event can still be bought / subscribed to,
 * and for what a buyer actually owes.
 *
 * These flags exist because "free" and "sales closed" are NOT the same thing as
 * `is_active`:
 *
 * - `isFree` events have no Asaas charge at all, so they must never reach
 *   POST /api/orders. They go through POST /api/events/:id/subscribe.
 * - `salesClosed` events stay active and visible, and courtesy redemption keeps
 *   working. Only new purchases and free subscriptions are blocked.
 *
 * The client is never trusted: the price, the fee and the free/paid decision are
 * all recomputed here from the stored event row.
 */

/** Fixed convenience fee, in BRL, charged on paid inscriptions only. */
export const CONVENIENCE_FEE = 5.0;

/** The subset of an event row these rules need. */
export interface EventSalesFacts {
  price: string | number;
  isFree?: boolean | null;
  salesClosed?: boolean | null;
  maxAttendees?: number | null;
  currentAttendees?: number | null;
}

export type SalesBlockedReason =
  | "sales_closed"
  | "event_full"
  /** Paid checkout was attempted on a free event. */
  | "event_is_free"
  /** Free subscription was attempted on a paid event. */
  | "event_is_paid";

export type SalesCheck = { ok: true } | { ok: false; reason: SalesBlockedReason };

export function isFreeEvent(event: EventSalesFacts): boolean {
  return event.isFree === true;
}

export function isSalesClosed(event: EventSalesFacts): boolean {
  return event.salesClosed === true;
}

export function isEventFull(event: EventSalesFacts): boolean {
  const max = event.maxAttendees ?? null;
  if (max === null) return false;
  return (event.currentAttendees ?? 0) >= max;
}

/**
 * Gate for POST /api/orders (paid checkout, creates an Asaas charge).
 * A free event is rejected here on purpose: charging for it would be a bug.
 */
export function checkPaidPurchaseAllowed(event: EventSalesFacts): SalesCheck {
  if (isSalesClosed(event)) return { ok: false, reason: "sales_closed" };
  if (isFreeEvent(event)) return { ok: false, reason: "event_is_free" };
  if (isEventFull(event)) return { ok: false, reason: "event_full" };
  return { ok: true };
}

/**
 * Gate for POST /api/events/:id/subscribe (free inscription, no payment).
 * A paid event is rejected here on purpose: it would hand out free tickets.
 */
export function checkFreeSubscriptionAllowed(event: EventSalesFacts): SalesCheck {
  if (!isFreeEvent(event)) return { ok: false, reason: "event_is_paid" };
  if (isSalesClosed(event)) return { ok: false, reason: "sales_closed" };
  if (isEventFull(event)) return { ok: false, reason: "event_full" };
  return { ok: true };
}

/** User-facing pt-BR message for a blocked sale. */
export function salesBlockedMessage(reason: SalesBlockedReason): string {
  switch (reason) {
    case "sales_closed":
      return "As vendas para este evento foram encerradas.";
    case "event_full":
      return "Evento lotado";
    case "event_is_free":
      return "Este é um evento gratuito. Use a inscrição gratuita, não o pagamento.";
    case "event_is_paid":
      return "Este evento não é gratuito. Conclua o pagamento para se inscrever.";
  }
}

/** HTTP status for a blocked sale. 409 = the event's state forbids it, not the request. */
export function salesBlockedStatus(reason: SalesBlockedReason): 400 | 409 {
  return reason === "sales_closed" ? 409 : 400;
}

/**
 * Authoritative order total. A free event always costs 0 and is never charged
 * the convenience fee, regardless of what the stored price column says or what
 * the client sent.
 */
export function computeOrderTotal(
  event: EventSalesFacts,
  overridePrice?: string | number | null,
): number {
  if (isFreeEvent(event)) return 0;

  const base =
    overridePrice !== undefined && overridePrice !== null
      ? Number(overridePrice)
      : Number(event.price);

  const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
  return safeBase + CONVENIENCE_FEE;
}

/**
 * Price to persist on the event row. Free events are pinned to "0.00" so the
 * DB check constraint (events_free_price_zero_chk) can never be violated and
 * the public page cannot display a price for a free event.
 */
export function normalizeEventPrice(price: string, isFree: boolean): string {
  return isFree ? "0.00" : price;
}

/**
 * Parse a boolean sent through multipart/form-data, where every field arrives
 * as a string. Accepts "true"/"false", "1"/"0", "on"/"off" and real booleans.
 * Anything unrecognised is false, so a malformed field can never accidentally
 * make an event free or close its sales.
 */
export function parseBooleanField(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "on" || v === "yes";
  }
  return false;
}
