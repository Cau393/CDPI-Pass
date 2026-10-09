import axios from "axios";
import { confirmationKindForPaymentMethod } from "./ticketEmailTemplate";
import type { Order } from "@shared/schema";
import { storage, type DuplicatePaidPolicy } from "../storage";
import { asaasService, type ReceivedAsaasPayment } from "../services/asaasService";
import { s3Service } from "../services/s3Service";
import { sendPurchaseConfirmationEmail } from "./sendPurchaseConfirmationEmail";
import { refundAndNotify } from "./refundReceivedPayment";

const MAKE_WEBHOOK_URL =
  "https://hook.us2.make.com/wrlqnqumlmgvfjicglpdrc3gv8lkbqce";

export type FinalizeOrderPaidResult =
  | { ok: true }
  | { ok: false; code: "already_paid" | "duplicate_other_paid" }
  /** `status`: the order's status when known, e.g. "cancelled" for a payment that came late. */
  | { ok: false; code: "not_pending"; status: string | null };

export type PaymentMetaForFinalize = {
  /** Asaas `billingType` (e.g. CREDIT_CARD) or manual label. */
  billingType: string;
  /** Amount of the Asaas payment; null for a manual mark. */
  value?: number | null;
  /** The Asaas payment that came in. A refund always goes to it, never to the order's link id. */
  paymentId?: string | null;
  /** Card installment plan of that payment, when bought in installments. */
  installment?: string | null;
};

export type FinalizeOrderOptions = {
  /** Default refund_then_discard; admin "mark paid externally" uses reject_only. */
  duplicatePolicy?: DuplicatePaidPolicy;
};

function receivedPayment(meta: PaymentMetaForFinalize): ReceivedAsaasPayment | null {
  if (!meta.paymentId) return null;
  return { id: meta.paymentId, billingType: meta.billingType, value: meta.value, installment: meta.installment };
}

/**
 * Same business effects as a successful `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` Asaas webhook.
 * Callers hold a snapshot read earlier (webhook, check-status poll, paymentStatusService), and
 * concurrent deliveries can all see "pending": `storage.claimPaidOrder` decides in one locked
 * transaction (paid, duplicate discarded, or nothing). Only after it commits, best-effort:
 * the ticket e-mail for a paid order, the refund for a discarded duplicate.
 * Cortesia is expressed only via `orders.paymentMethod` (and optional courtesy fields), never via status.
 */
export async function finalizeOrderPaidLikeWebhook(
  order: Order,
  paymentMeta: PaymentMetaForFinalize,
  options: FinalizeOrderOptions = {},
): Promise<FinalizeOrderPaidResult> {
  if (order.status === "paid") {
    return { ok: false, code: "already_paid" };
  }
  if (order.status !== "pending") {
    return { ok: false, code: "not_pending", status: order.status };
  }

  const claim = await storage.claimPaidOrder(order.id, options.duplicatePolicy ?? "refund_then_discard");
  switch (claim.outcome) {
    case "already_paid":
      return { ok: false, code: "already_paid" };
    case "not_pending":
      return { ok: false, code: "not_pending", status: claim.status };
    case "duplicate_rejected":
      return { ok: false, code: "duplicate_other_paid" };
    case "duplicate_discarded":
      await deleteQrObject(claim.order);
      await refundAndNotify(claim.order, receivedPayment(paymentMeta), "duplicate");
      return { ok: false, code: "duplicate_other_paid" };
    case "paid":
      try {
        await afterPaid(claim.order, paymentMeta);
      } catch (error) {
        // Committed: a 500 here would make Asaas retry into already_paid, sending nothing.
        console.error(`TICKET_EMAIL_FAILED order=${claim.order.id}:`, error);
      }
      return { ok: true };
  }
}

async function deleteQrObject(order: Order): Promise<void> {
  if (!order.qr_code_s3_url) return;
  try {
    await s3Service.deleteFile(s3Service.extractKeyFromUrl(order.qr_code_s3_url));
  } catch (error) {
    console.error(`Erro ao deletar QR Code do S3 (Order ${order.id}):`, error);
  }
}

/** Logged, never blocking: the order is paid and committed whatever happens here. */
async function afterPaid(order: Order, paymentMeta: PaymentMetaForFinalize): Promise<void> {
  const event = await storage.getEvent(order.eventId);
  const user = await storage.getUser(order.userId);

  if (event && user) {
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
            modality: event.modality,
            meetingUrl: event.meetingUrl,
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

    try {
      await sendPurchaseConfirmationEmail({
        to: user.email,
        userName: user.name,
        event,
        orderId: order.id,
        qrCodeData: order.qrCodeData || "",
        qrCodeS3Url: order.qr_code_s3_url || "",
        confirmationKind: confirmationKindForPaymentMethod(order.paymentMethod),
      });
    } catch (error) {
      console.error(`TICKET_EMAIL_FAILED order=${order.id}:`, error);
    }
  }

  await logPaidTotalMismatch(order, paymentMeta);
}

/** A6: the money that came in should match `orders.amount` (card: all installments together). */
async function logPaidTotalMismatch(order: Order, paymentMeta: PaymentMetaForFinalize): Promise<void> {
  if (!paymentMeta.paymentId) return;
  try {
    const paid = paymentMeta.installment
      ? await asaasService.installmentTotal(paymentMeta.installment)
      : Number(paymentMeta.value);
    const expected = Number.parseFloat(String(order.amount));
    if (Number.isFinite(paid) && Number.isFinite(expected) && Math.abs(paid - expected) > 0.05) {
      console.warn(`PAID_TOTAL_MISMATCH order=${order.id} payment=${paymentMeta.paymentId} expected=${expected} paid=${paid}`);
    }
  } catch (error) {
    console.error(`Paid total check failed (order ${order.id}):`, error);
  }
}
