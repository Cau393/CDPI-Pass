/**
 * Public entry URL for a courtesy link.
 * Free codes open the event page; promo codes (override price set) keep checkout.
 */
export function courtesyEntryUrl(
  base: string,
  eventId: string,
  code: string,
  overridePrice?: string | number | null,
): string {
  const query = overridePrice ? `promo=${code}` : `cortesia=${code}`;
  return `${base}/event/${eventId}?${query}`;
}
