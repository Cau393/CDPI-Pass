import type { Order } from "@shared/schema";
import { storage } from "../storage";

type AsaasWebhookPayment = {
  id?: string | null;
  externalReference?: string | null;
  paymentLink?: string | null;
};

/**
 * The order a PAYMENT_CONFIRMED / PAYMENT_RECEIVED belongs to.
 * - PIX / boleto / foreign card: the payment carries our order id in `externalReference`.
 * - Card through a payment link: Asaas creates a NEW payment (one per installment) whose
 *   `paymentLink` is the link id we stored as `orders.asaas_payment_id`.
 * Already-paid orders are handled by the caller (finalize is a no-op for them).
 */
export async function findOrderForPaidAsaasPayment(payment: AsaasWebhookPayment | undefined): Promise<Order | undefined> {
  if (payment?.externalReference) {
    const byReference = await storage.getOrder(payment.externalReference);
    if (byReference) return byReference;
  }
  for (const asaasId of [payment?.id, payment?.paymentLink]) {
    if (!asaasId) continue;
    const byAsaasId = await storage.getOrderByAsaasPaymentId(asaasId);
    if (byAsaasId) return byAsaasId;
  }
  return undefined;
}
