import type { CancelOrderResult } from "../storage";
import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { asaasService } from "../services/asaasService";
import { buildCancellationEmailHtml } from "./cancellationEmailTemplate";
import { ownerCanSeeOrder } from "./orderVisibility";
import { AsaasApiError } from "./asaasErrors";

export const ASAAS_CANCEL_UNAVAILABLE_MESSAGE =
  "Não foi possível cancelar agora; tente novamente em alguns minutos.";

export function buildOrderCancelSuccessMessage(handled: "pending" | "paid"): string {
  if (handled === "pending") {
    return "Pedido pendente removido com sucesso.";
  }
  return "Inscrição cancelada com sucesso. O QR Code foi invalidado e um e-mail foi enfileirado.";
}

export type ExecuteOrderCancelFailureCode =
  | "not_found"
  | "already_cancelled"
  | "invalid_status"
  | "forbidden"
  | "asaas_unavailable";

export type ExecuteOrderCancelResult =
  | { ok: true; message: string }
  | {
      ok: false;
      code: ExecuteOrderCancelFailureCode;
      status?: string;
    };

function mapCancelFailure(
  result: Exclude<CancelOrderResult, { ok: true }>,
): ExecuteOrderCancelResult {
  if (result.code === "already_cancelled") {
    return { ok: false, code: "already_cancelled" };
  }
  if (result.code === "invalid_status") {
    return { ok: false, code: "invalid_status", status: result.status };
  }
  return { ok: false, code: "not_found" };
}

function gateUserCancel(
  order: Order,
  options: { actor: "admin" | "user"; userId?: string; userEmailVerified?: boolean },
): ExecuteOrderCancelResult | null {
  if (options.actor !== "user") {
    return null;
  }
  if (!options.userId || order.userId !== options.userId) {
    return { ok: false, code: "forbidden" };
  }
  // ADR-017: a guest order is hidden from its account until the e-mail is verified. Same
  // answer as a missing order, so existence does not leak.
  if (!ownerCanSeeOrder(order, { id: options.userId, emailVerified: options.userEmailVerified === true })) {
    return { ok: false, code: "not_found" };
  }
  if (order.status === "paid") {
    return { ok: false, code: "invalid_status", status: order.status };
  }
  return null;
}

async function cancelPendingViaStorage(orderId: string): Promise<ExecuteOrderCancelResult> {
  const result = await storage.discardPendingOrder(orderId);
  if (!result.ok) {
    return mapCancelFailure(result);
  }
  return { ok: true, message: buildOrderCancelSuccessMessage("pending") };
}

/**
 * A direct `pay_` charge (card, PIX, boleto) may still be confirmed by Asaas, so the order is
 * discarded locally only when Asaas confirms the removal or says the charge is already gone
 * (404, or the payment reads deleted). Any other answer keeps the order pending: a charge
 * Asaas refuses to delete may still be paid. A payment-link id or no id keeps the old
 * best-effort behaviour. Never logs the Asaas body.
 */
async function cancelAsaasChargeIfNeeded(asaasPaymentId: string | null, orderId: string): Promise<boolean> {
  if (!asaasPaymentId) {
    return true;
  }
  const direct = asaasPaymentId.startsWith("pay_");
  try {
    const answer = await asaasService.cancelPayment(asaasPaymentId);
    if (direct && answer?.deleted === false) {
      console.error(`ASAAS_CANCEL_REFUSED payment=${asaasPaymentId}: delete answered deleted=false`);
      return false;
    }
    return true;
  } catch (e) {
    if (!direct) {
      console.error("Erro ao cancelar cobrança Asaas:", e);
      return true;
    }
    if (e instanceof AsaasApiError && e.status === 404) {
      return true;
    }
    try {
      const payment = await asaasService.getPayment(asaasPaymentId, orderId);
      if (payment?.deleted === true) {
        return true;
      }
    } catch {
      // Asaas unreachable: treated as not deleted.
    }
    const status = e instanceof AsaasApiError ? e.status : "network";
    console.error(`ASAAS_CANCEL_FAILED payment=${asaasPaymentId} status=${status}: order kept pending`);
    return false;
  }
}

async function enqueuePaidCancellationEmail(order: Order): Promise<void> {
  const buyer = await storage.getUser(order.userId);
  const event = await storage.getEvent(order.eventId);
  if (!buyer?.email) {
    return;
  }
  const html = buildCancellationEmailHtml(
    buyer.name ?? "Participante",
    event?.title ?? "Evento",
  );
  const text = [
    `Olá, ${buyer.name ?? "Participante"},`,
    "",
    `Sua inscrição no evento ${event?.title ?? "Evento"} foi cancelada pela organização.`,
    "O QR Code do ingresso foi invalidado.",
    "",
    "Equipe CDPI Pass",
  ].join("\n");
  await storage.addEmailToQueue({
    to: buyer.email,
    subject: "Cancelamento de inscrição — CDPI Pass",
    html,
    text,
    attachments: null,
  });
}

export async function executeOrderCancel(
  orderId: string,
  options: { actor: "admin" | "user"; userId?: string; userEmailVerified?: boolean },
): Promise<ExecuteOrderCancelResult> {
  const order = await storage.getOrder(orderId);
  if (!order) {
    return { ok: false, code: "not_found" };
  }

  if (order.status === "cancelled") {
    return { ok: false, code: "already_cancelled" };
  }

  const userGate = gateUserCancel(order, options);
  if (userGate) {
    return userGate;
  }

  if (order.status !== "pending" && order.status !== "paid") {
    return { ok: false, code: "invalid_status", status: order.status };
  }

  if (order.status === "pending") {
    if (!(await cancelAsaasChargeIfNeeded(order.asaasPaymentId ?? null, order.id))) {
      return { ok: false, code: "asaas_unavailable" };
    }
    return cancelPendingViaStorage(orderId);
  }

  const result = await storage.cancelPaidOrderAndInvalidateQr(orderId);
  if (!result.ok) {
    return mapCancelFailure(result);
  }

  await enqueuePaidCancellationEmail(result.order);

  return { ok: true, message: buildOrderCancelSuccessMessage("paid") };
}
