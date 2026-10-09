import type { Order } from "@shared/schema";
import { asaasService, type ReceivedAsaasPayment } from "../services/asaasService";
import { emailService } from "../services/emailService";
import { storage } from "../storage";
import { escapeHtml } from "./onlineEventEmailTemplate";

/** duplicate: the holder already has a paid ticket. late: the order had expired (cancelled). */
export type RefundReason = "duplicate" | "late";

/**
 * Gives back money received for an order that cannot keep it, then tells the buyer.
 * Never throws: a failure logs REFUND_FAILED (refund it by hand in Asaas) and the webhook
 * still answers 200. The e-mail goes out only when Asaas accepted the refund; Asaas refuses
 * to refund the same payment twice, so a redelivery sends no second e-mail.
 */
export async function refundAndNotify(
  order: Order,
  payment: ReceivedAsaasPayment | null | undefined,
  reason: RefundReason,
): Promise<void> {
  if (!payment?.id) {
    console.error(`REFUND_FAILED order=${order.id} payment=none reason=${reason}: no received payment id`);
    return;
  }
  let requestUrl: string | null;
  try {
    ({ requestUrl } = await asaasService.refundReceivedPayment(payment));
  } catch (error) {
    // A redelivery, or the CONFIRMED→RECEIVED pair, asks again: Asaas refuses, nothing is owed.
    if (await asaasService.isRefunded(payment.id).catch(() => false)) {
      console.log(`REFUND_ALREADY_DONE order=${order.id} payment=${payment.id} reason=${reason}`);
      return;
    }
    console.error(`REFUND_FAILED order=${order.id} payment=${payment.id} reason=${reason}:`, error);
    return;
  }
  console.log(`REFUND_REQUESTED order=${order.id} payment=${payment.id} reason=${reason}`);

  try {
    const [user, event] = await Promise.all([storage.getUser(order.userId), storage.getEvent(order.eventId)]);
    if (!user?.email) return;
    const { subject, html, text } = refundEmail({
      userName: user.name,
      eventTitle: event?.title ?? "o evento",
      reason,
      requestUrl,
    });
    await emailService.sendEmail(user.email, subject, html, text);
  } catch (error) {
    console.error(`Refund e-mail failed (order ${order.id}, payment ${payment.id}):`, error);
  }
}

export function refundEmail(p: {
  userName: string;
  eventTitle: string;
  reason: RefundReason;
  requestUrl: string | null;
}): { subject: string; html: string; text: string } {
  const why =
    p.reason === "duplicate"
      ? `Recebemos um segundo pagamento para a sua inscrição em ${p.eventTitle}. Você já tem um ingresso confirmado, então estornamos este pagamento.`
      : `O pagamento para ${p.eventTitle} chegou depois que o pedido já tinha expirado, então ele não gerou ingresso. Estornamos o valor. Se ainda quiser participar, faça uma nova inscrição em cdpipass.com.br.`;
  const how = p.requestUrl
    ? "Como o pagamento foi por boleto, a devolução precisa dos seus dados bancários. Preencha o formulário do Asaas neste link:"
    : "O valor volta pelo mesmo meio de pagamento. No cartão de crédito, o estorno pode aparecer em até duas faturas.";
  const subject = `Pagamento estornado - ${p.eventTitle}`;
  const text = [`Olá, ${p.userName}.`, why, how, p.requestUrl ?? "", "Equipe CDPI Pass"].filter(Boolean).join("\n\n");
  const link = p.requestUrl
    ? `<p><a href="${escapeHtml(p.requestUrl)}">${escapeHtml(p.requestUrl)}</a></p>`
    : "";
  const html = `<p>Olá, ${escapeHtml(p.userName)}.</p><p>${escapeHtml(why)}</p><p>${escapeHtml(how)}</p>${link}<p>Equipe CDPI Pass</p>`;
  return { subject, html, text };
}
