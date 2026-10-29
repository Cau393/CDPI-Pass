import { confirmationKindForPaymentMethod } from "./ticketEmailTemplate";
import type { Order } from "@shared/schema";
import { storage, type DuplicatePaidPolicy } from "../storage";
import { asaasService, type ReceivedAsaasPayment } from "../services/asaasService";
import { s3Service } from "../services/s3Service";
import { myTicketsUrlFor } from "./myTicketsUrl";
import { sendPurchaseConfirmationEmail } from "./sendPurchaseConfirmationEmail";
import { refundAndNotify } from "./refundReceivedPayment";

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
 * the ticket e-mail for a paid order (and its card link switched off), the refund for a
 * discarded duplicate.
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

  const claim = await storage.claimPaidOrder(order.id, options.duplicatePolicy ?? "refund_then_discard", paymentMeta.paymentId);
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
      // Decided from the row the claim committed, not the snapshot. A card payment link keeps its own
      // id (not pay_), so only a differing pay_ id is a real mismatch.
      if (paymentMeta.paymentId && claim.order.asaasPaymentId?.startsWith("pay_") && claim.order.asaasPaymentId !== paymentMeta.paymentId) {
        console.warn(`PAYMENT_ID_MISMATCH order=${claim.order.id}: paid by another Asaas payment than the one stored; kept the stored id`);
      }
      await deactivatePaidLink(claim.order);
      try {
        await afterPaid(claim.order, paymentMeta);
      } catch (error) {
        // Committed: a 500 here would make Asaas retry into already_paid, sending nothing.
        console.error(`TICKET_EMAIL_FAILED order=${claim.order.id}:`, error);
      }
      return { ok: true };
  }
}

/**
 * Asaas lets the same card payment link be bought again after it was paid (sandbox 2026-10-12),
 * and it refuses to DELETE a link that has charges. So the paid order switches its link off;
 * the installments already bought are not touched. A second purchase completed in the seconds
 * before this runs is a known residual (owner decision 2026-10-12).
 */
async function deactivatePaidLink(order: Order): Promise<void> {
  const linkId = order.asaasPaymentId;
  if (order.paymentMethod !== "credit_card" || !linkId || linkId.startsWith("pay_")) return;
  try {
    await asaasService.deactivatePaymentLink(linkId);
  } catch (error) {
    console.error(`PAYMENT_LINK_STILL_ACTIVE order=${order.id} link=${linkId}:`, error);
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
    try {
      await sendPurchaseConfirmationEmail({
        to: user.email,
        userName: user.name,
        event,
        orderId: order.id,
        qrCodeData: order.qrCodeData || "",
        qrCodeS3Url: order.qr_code_s3_url || "",
        confirmationKind: confirmationKindForPaymentMethod(order.paymentMethod),
        myTicketsUrl: myTicketsUrlFor(order),
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
