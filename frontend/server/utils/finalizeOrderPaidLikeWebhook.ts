import axios from "axios";
import { confirmationKindForPaymentMethod } from "./ticketEmailTemplate";
import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { emailService } from "../services/emailService";
import { asaasService } from "../services/asaasService";

const MAKE_WEBHOOK_URL =
  "https://hook.us2.make.com/wrlqnqumlmgvfjicglpdrc3gv8lkbqce";

export type FinalizeOrderPaidResult =
  | { ok: true }
  | {
      ok: false;
      code: "already_paid" | "not_pending" | "duplicate_other_paid";
    };

export type PaymentMetaForFinalize = {
  /** Asaas `billingType` (e.g. CREDIT_CARD) or manual label. */
  billingType: string;
  /** Optional override; defaults to `order.amount` (numeric from DB). */
  value?: number | null;
};

export type FinalizeOrderOptions = {
  /**
   * When another paid order exists for the same CPF+event:
   * - refund_then_discard: cancel Asaas charge (best-effort) and discard this pending order
   * - reject_only: return duplicate_other_paid without side effects (admin mark-paid-external)
   */
  duplicatePolicy?: "refund_then_discard" | "reject_only";
};

async function handleDuplicatePaidInscription(
  order: Order,
  policy: "refund_then_discard" | "reject_only",
): Promise<FinalizeOrderPaidResult> {
  if (policy === "reject_only") {
    return { ok: false, code: "duplicate_other_paid" };
  }

  if (order.asaasPaymentId) {
    try {
      await asaasService.cancelPayment(order.asaasPaymentId);
    } catch (e) {
      console.error(
        `Erro ao estornar/cancelar cobrança Asaas (order ${order.id}):`,
        e,
      );
    }
  }

  const discard = await storage.discardPendingOrder(order.id);
  if (!discard.ok && discard.code !== "already_cancelled") {
    console.error(
      `Falha ao descartar pedido duplicado ${order.id}:`,
      discard,
    );
  }

  return { ok: false, code: "duplicate_other_paid" };
}

/**
 * Same business effects as a successful `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` Asaas webhook:
 * set `paid`, optional courtesy link usage, +1 attendees, Make.com, ticket e-mail.
 * Cortesia is expressed only via `orders.paymentMethod` (and optional courtesy fields), never via status.
 */
export async function finalizeOrderPaidLikeWebhook(
  order: Order,
  paymentMeta: PaymentMetaForFinalize,
  options: FinalizeOrderOptions = {},
): Promise<FinalizeOrderPaidResult> {
  const duplicatePolicy = options.duplicatePolicy ?? "refund_then_discard";

  if (order.status === "paid") {
    return { ok: false, code: "already_paid" };
  }
  if (order.status !== "pending") {
    return { ok: false, code: "not_pending" };
  }

  const hasOtherPaid = await storage.existsOtherPaidOrderForCpfAndEvent(
    order.id,
    order.cpf,
    order.eventId,
  );
  if (hasOtherPaid) {
    return handleDuplicatePaidInscription(order, duplicatePolicy);
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
      confirmationKind: confirmationKindForPaymentMethod(order.paymentMethod),
    });
  }

  return { ok: true };
}
