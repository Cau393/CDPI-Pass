import axios from "axios";
import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { emailService } from "../services/emailService";

const MAKE_WEBHOOK_URL =
  "https://hook.us2.make.com/wrlqnqumlmgvfjicglpdrc3gv8lkbqce";

export type FinalizeOrderPaidResult =
  | { ok: true }
  | { ok: false; code: "already_paid" | "not_pending" };

export type PaymentMetaForFinalize = {
  /** Asaas `billingType` (e.g. CREDIT_CARD) or manual label. */
  billingType: string;
  /** Optional override; defaults to `order.amount` (numeric from DB). */
  value?: number | null;
};

/**
 * Same business effects as a successful `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` Asaas webhook:
 * set `paid`, optional courtesy link usage, +1 attendees, Make.com, ticket e-mail.
 * Cortesia is expressed only via `orders.paymentMethod` (and optional courtesy fields), never via status.
 */
export async function finalizeOrderPaidLikeWebhook(
  order: Order,
  paymentMeta: PaymentMetaForFinalize,
): Promise<FinalizeOrderPaidResult> {
  if (order.status === "paid") {
    return { ok: false, code: "already_paid" };
  }
  if (order.status !== "pending") {
    return { ok: false, code: "not_pending" };
  }

  await storage.updateOrder(order.id, { status: "paid" });

  if (order.courtesyLinkId) {
    await storage.incrementCourtesyLinkUsage(order.courtesyLinkId);
  }

  const event = await storage.getEvent(order.eventId);
  const user = await storage.getUser(order.userId);

  if (event && user) {
    await storage.updateEvent(event.id, {
      currentAttendees: (event.currentAttendees || 0) + 1,
    });

    const outboundPaymentLabel =
      order.paymentMethod === "courtesy"
        ? "courtesy"
        : paymentMeta.billingType || "unknown";

    (async () => {
      try {
        await axios.post(MAKE_WEBHOOK_URL, {
          user: {
            name: user.name,
            email: user.email,
          },
          event: {
            title: event.title,
            date: event.date,
            location: event.location,
          },
          order: {
            id: order.id,
            amount: order.amount || paymentMeta.value || null,
            status: "paid",
            paymentMethod: outboundPaymentLabel,
          },
        });
        console.log("✅ Forwarded structured data to Make.com successfully");
      } catch (err) {
        console.error("❌ Failed to forward data to Make.com:", err);
      }
    })();

    await emailService.sendTicketEmail(user.email, {
      userName: user.name,
      eventTitle: event.title,
      eventDate: event.date,
      eventLocation: event.location,
      qrCodeData: order.qrCodeData || "",
      orderId: order.id,
      qrCodeS3Url: order.qr_code_s3_url || "",
    });
  }

  return { ok: true };
}
