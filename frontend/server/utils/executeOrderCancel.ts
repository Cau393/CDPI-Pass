import type { CancelOrderResult } from "../storage";
import type { Order } from "@shared/schema";
import { storage } from "../storage";
import { asaasService } from "../services/asaasService";
import { buildCancellationEmailHtml } from "./cancellationEmailTemplate";

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
  | "forbidden";

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
  options: { actor: "admin" | "user"; userId?: string },
): ExecuteOrderCancelResult | null {
  if (options.actor !== "user") {
    return null;
  }
  if (!options.userId || order.userId !== options.userId) {
    return { ok: false, code: "forbidden" };
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

async function cancelAsaasChargeIfNeeded(asaasPaymentId: string | null): Promise<void> {
  if (!asaasPaymentId) {
    return;
  }
  try {
    await asaasService.cancelPayment(asaasPaymentId);
  } catch (e) {
    console.error("Erro ao cancelar cobrança Asaas:", e);
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
  options: { actor: "admin" | "user"; userId?: string },
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
    await cancelAsaasChargeIfNeeded(order.asaasPaymentId ?? null);
    return cancelPendingViaStorage(orderId);
  }

  const result = await storage.cancelPaidOrderAndInvalidateQr(orderId);
  if (!result.ok) {
    return mapCancelFailure(result);
  }

  await enqueuePaidCancellationEmail(result.order);

  return { ok: true, message: buildOrderCancelSuccessMessage("paid") };
}
