import type { Order } from "@shared/schema";
import { signEmailVerificationToken } from "../middleware/auth";

/** Public site address used in every link we e-mail. */
export const APP_BASE_URL = "https://cdpipass.com.br";

/**
 * ADR-017: the "Ver em Meus Ingressos" link in a guest buyer's ticket e-mail. Opening it
 * verifies the e-mail (which unhides the guest orders) and lands on the tickets page.
 * Null for an order placed while logged in.
 */
export function myTicketsUrlFor(order: Pick<Order, "placedAsGuest" | "userId">): string | null {
  if (!order.placedAsGuest) return null;
  return `${APP_BASE_URL}/verify-email?token=${signEmailVerificationToken(order.userId)}`;
}
