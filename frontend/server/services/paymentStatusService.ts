import { storage } from "../storage";
import { asaasService } from "./asaasService";
import { finalizeOrderPaidLikeWebhook } from "../utils/finalizeOrderPaidLikeWebhook";

class PaymentStatusService {
  async checkAndUpdatePaymentStatus(orderId: string): Promise<void> {
    try {
      const order = await storage.getOrder(orderId);

      if (!order || !order.asaasPaymentId || order.status === "paid") {
        return;
      }

      const payment = await asaasService.getPayment(
        order.asaasPaymentId,
        order.id,
      );

      console.log(`Checking payment status for order ${orderId}:`, payment.status);

      if (payment.status === "CONFIRMED" || payment.status === "RECEIVED") {
        const result = await finalizeOrderPaidLikeWebhook(order, {
          billingType: payment.billingType || "unknown",
          value: payment.value ?? null,
        });
        if (result.ok) {
          console.log(`Payment confirmed for order ${orderId}`);
        } else if (result.code === "duplicate_other_paid") {
          console.warn(
            `Duplicate paid inscription for order ${orderId}; payment discarded/refunded`,
          );
        }
      } else if (payment.status === "OVERDUE" || payment.status === "CANCELED") {
        await storage.updateOrder(orderId, { status: "cancelled" });
        console.log(`Payment cancelled for order ${orderId}`);
      }
    } catch (error) {
      console.error(`Error checking payment status for order ${orderId}:`, error);
    }
  }

  async checkAllPendingPayments(): Promise<void> {
    try {
      const pendingOrders = await storage.getPendingOrders();

      console.log(`Checking ${pendingOrders.length} pending orders`);

      for (const order of pendingOrders) {
        await this.checkAndUpdatePaymentStatus(order.id);
      }
    } catch (error) {
      console.error("Error checking pending payments:", error);
    }
  }
}

export const paymentStatusService = new PaymentStatusService();
