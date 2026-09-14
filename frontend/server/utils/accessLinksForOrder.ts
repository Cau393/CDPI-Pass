import { isOnlineEvent } from "@shared/eventModality";

export function isPaidLikeOrderStatus(
  status: string | null | undefined,
): boolean {
  return status === "paid" || status === "courtesy";
}

export type OrderAccessLinks = {
  meetingUrl: string | null;
  whatsappGroupUrl: string | null;
};

/**
 * Meeting and WhatsApp URLs for confirmed online tickets only.
 * Returns null when the client must not see either secret.
 */
export function accessLinksForOrder(opts: {
  orderStatus: string | null | undefined;
  event:
    | {
        modality?: string | null;
        meetingUrl?: string | null;
        whatsappGroupUrl?: string | null;
      }
    | null
    | undefined;
}): OrderAccessLinks | null {
  if (!isPaidLikeOrderStatus(opts.orderStatus) || !opts.event) return null;
  if (!isOnlineEvent(opts.event)) return null;
  return {
    meetingUrl: opts.event.meetingUrl ?? null,
    whatsappGroupUrl: opts.event.whatsappGroupUrl ?? null,
  };
}

type EventSecrets = {
  meetingUrl?: string | null;
  whatsappGroupUrl?: string | null;
  confirmationEmailHtml?: string | null;
};

/** Strip secrets from a nested event, then re-attach access URLs when confirmed. */
export function withOrderAccessLinks<
  T extends {
    status?: string | null;
    event?: (EventSecrets & Record<string, unknown>) | null;
  },
>(order: T): T {
  if (!order.event) return order;
  const {
    meetingUrl: _meetingUrl,
    whatsappGroupUrl: _whatsappGroupUrl,
    confirmationEmailHtml: _confirmationEmailHtml,
    ...publicEvent
  } = order.event;
  const links = accessLinksForOrder({
    orderStatus: order.status,
    event: order.event,
  });
  if (!links) {
    return { ...order, event: publicEvent as T["event"] };
  }
  return {
    ...order,
    event: {
      ...publicEvent,
      meetingUrl: links.meetingUrl,
      whatsappGroupUrl: links.whatsappGroupUrl,
    } as T["event"],
  };
}
