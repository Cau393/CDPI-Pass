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
  /** Set when the guest token was dropped on an auth change: the order can no longer be polled from here. */
  readonly guestTokenDropped?: boolean;
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

const dropListeners = new Set<() => void>();

/** A mounted modal hears the drop and stops polling with the token it holds in state. */
export function subscribeGuestTokenDrop(listener: () => void): () => void {
  dropListeners.add(listener);
  return () => {
    dropListeners.delete(listener);
  };
}

/**
 * Auth changed in this tab (login, logout, another account): no lock keeps the first buyer's guest
 * token, so nobody else polls that order. The locks stay: the card submit remains locked (R37).
 */
export function dropGuestAccessTokens(): void {
  for (const [eventId, lock] of Array.from(locks)) {
    if (lock.accessToken == null) continue;
    locks.set(eventId, { orderId: lock.orderId, accessToken: null, guestTokenDropped: true });
  }
  dropListeners.forEach((listener) => listener());
}
