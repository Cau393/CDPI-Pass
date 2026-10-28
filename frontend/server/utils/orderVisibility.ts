import type { Order, User } from "@shared/schema";

/**
 * ADR-017: an order placed as a guest stays hidden from the account that owns the
 * e-mail until that e-mail is verified, or whoever typed it first could read the order.
 * Callers answer 404 when this is false, never 403, so existence does not leak.
 */
export function ownerCanSeeOrder(
  order: Pick<Order, "userId" | "placedAsGuest">,
  user: Pick<User, "id" | "emailVerified">,
): boolean {
  return order.userId === user.id && (!order.placedAsGuest || user.emailVerified === true);
}
