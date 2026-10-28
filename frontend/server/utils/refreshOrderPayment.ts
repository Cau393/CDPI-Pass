import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { asaasService } from "../services/asaasService";
import { finalizeOrderPaidLikeWebhook } from "./finalizeOrderPaidLikeWebhook";

/** An order is asked about in Asaas at most once per window, however many pollers it has. */
export const REFRESH_WINDOW_MS = 15_000;

const lastCheckMs = new Map<string, number>();

/** Drops entries whose window has passed, so the map only holds orders polled lately. */
function pruneChecks(now: number): void {
  Array.from(lastCheckMs.entries()).forEach(([orderId, at]) => {
    if (now - at >= REFRESH_WINDOW_MS) lastCheckMs.delete(orderId);
  });
}

export type RefreshOrderPaymentResult =
  /** Pending order that has no Asaas charge to ask about. */
  | { kind: "no_payment_id"; order: Order; paymentStatus: null }
  /** Nothing changed: not pending, asked lately, or Asaas still reports it open. */
  | { kind: "unchanged"; order: Order; paymentStatus: string | null }
  | {
      kind: "confirmed" | "already_paid" | "duplicate_other_paid" | "confirm_failed" | "cancelled";
      order: Order;
      paymentStatus: string;
    };

/**
 * The one place that turns Asaas's answer into an order transition, for both check-status
 * paths (the logged-in owner and the guest holding an order-access token).
 *
 * Only a pending order is asked about; anything else answers from the database. A pending
 * order is asked at most once per REFRESH_WINDOW_MS (the webhook is the main path, this is
 * the poller's safety net, and a token holder must not be able to hammer Asaas).
 */
export async function refreshOrderPayment(order: Order): Promise<RefreshOrderPaymentResult> {
  if (order.status !== "pending") {
    return { kind: "unchanged", order, paymentStatus: null };
  }
  if (!order.asaasPaymentId) {
    return { kind: "no_payment_id", order, paymentStatus: null };
  }

  const now = Date.now();
  pruneChecks(now);
  if (lastCheckMs.has(order.id)) {
    return { kind: "unchanged", order, paymentStatus: null };
  }
  lastCheckMs.set(order.id, now);

  let payment: Awaited<ReturnType<typeof asaasService.getPayment>>;
  try {
    payment = await asaasService.getPayment(order.asaasPaymentId, order.id);
  } catch (error) {
    // Nothing was learned: free the slot so the next poll can ask again.
    lastCheckMs.delete(order.id);
    throw error;
  }
  console.log(`Manual check - Payment status for order ${order.id}:`, payment.status);

  if (payment.status === "CONFIRMED" || payment.status === "RECEIVED") {
    const result = await finalizeOrderPaidLikeWebhook(order, {
      billingType: payment.billingType || "unknown",
      value: payment.value ?? null,
      paymentId: payment.id ?? null,
      installment: payment.installment ?? null,
    });
    const fresh = (await storage.getOrder(order.id)) ?? order;
    if (result.ok) {
      return { kind: "confirmed", order: fresh, paymentStatus: payment.status };
    }
    if (result.code === "duplicate_other_paid" || result.code === "already_paid") {
      return { kind: result.code, order: fresh, paymentStatus: payment.status };
    }
    return { kind: "confirm_failed", order, paymentStatus: payment.status };
  }

  if (payment.status === "OVERDUE" || payment.status === "CANCELED") {
    await storage.cancelPendingOrder(order.id);
    const fresh = (await storage.getOrder(order.id)) ?? order;
    return { kind: "cancelled", order: fresh, paymentStatus: payment.status };
  }

  return { kind: "unchanged", order, paymentStatus: payment.status };
}
