/**
 * Asaas has not enabled foreign payers on the CDPI account yet (owner, 2026-10-09:
 * "they will enable next week"). Until then a foreign visitor can only sign up for
 * free events and redeem courtesies; every paid checkout refuses them. The card-only
 * foreign checkout stays in the code: flip this to true once Asaas confirms, and the
 * tests guarded by it run again.
 */
export const FOREIGN_PAID_CHECKOUT_ENABLED = false;

export const FOREIGN_PAID_UNAVAILABLE_CODE = "foreign_paid_unavailable";

export const FOREIGN_PAID_UNAVAILABLE_MESSAGE =
  "Compras por estrangeiros ainda não estão disponíveis. Por enquanto, você pode se inscrever apenas em eventos gratuitos. / Purchases by foreign visitors are not available yet: for now you can only sign up for free events.";

/** True when this account (or the identity being typed) must not reach a paid checkout. */
export function foreignPaidCheckoutBlocked(account: { isForeigner?: boolean | null } | null | undefined): boolean {
  return !FOREIGN_PAID_CHECKOUT_ENABLED && account?.isForeigner === true;
}
