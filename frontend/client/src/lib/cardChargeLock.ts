/**
 * Card-charge lock per event (R37, amended): once a card charge may have gone through, no new card
 * charge for that event until the page reloads, or until polling reports the order paid or cancelled.
 *
 * In memory only, so it survives the payment modal closing, reopening or unmounting, and a reload
 * is the escape hatch. It never holds card data and never reaches localStorage or sessionStorage.
 */
export interface CardChargeLock {
  /** The pending order, once the server named it (202 or 201 pending); null while unknown. */
  readonly orderId: string | null;
  /** Guest: the order's `orderAccessToken` (X-Order-Access) to poll with. Logged-in: null. */
  readonly accessToken: string | null;
}

const locks = new Map<string, CardChargeLock>();

export function cardChargeLockFor(eventId: string): CardChargeLock | null {
  return locks.get(eventId) ?? null;
}

/** Sets or updates the lock: with no order yet when the card POST is sent, with the order once known. */
export function lockCardCharge(eventId: string, lock: CardChargeLock = { orderId: null, accessToken: null }): void {
  locks.set(eventId, lock);
}

export function releaseCardCharge(eventId: string): void {
  locks.delete(eventId);
}

/** Tests only: module state outlives a render. */
export function resetCardChargeLocks(): void {
  locks.clear();
}
