import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";
import { cfg, scalar, sql } from "./db";

/** The fake Asaas answers /__payments/... outside /v3. */
const FAKE_ROOT = cfg.asaasUrl.replace(/\/v3\/?$/, "");

export interface CardInput {
  number: string;
  holderName?: string;
  /** "12/35" or "1235". */
  expiry?: string;
  ccv?: string;
  postalCode?: string;
  addressNumber?: string;
  installments?: 1 | 2 | 3;
}

/**
 * Fills the inline card form (the "Cartão" tab must already be selected) but does not submit.
 * `scope` is the dialog or page that holds `card-payment-form`.
 */
export async function fillCardForm(scope: Page | Locator, card: CardInput) {
  const form = scope.getByTestId("card-payment-form");
  await form.getByTestId("input-card-number").fill(card.number);
  await form.getByTestId("input-card-holder-name").fill(card.holderName ?? "TESTE E2E");
  await form.getByTestId("input-card-expiry").fill(card.expiry ?? "12/35");
  await form.getByTestId("input-card-ccv").fill(card.ccv ?? "123");
  await form.getByTestId("input-card-postal-code").fill(card.postalCode ?? "70000000");
  await form.getByTestId("input-card-address-number").fill(card.addressNumber ?? "100");
  if (card.installments && card.installments > 1) {
    await form.getByTestId(`radio-installments-${card.installments}`).click();
  }
}

/** Fills the card form and clicks "Pagar com Cartão". */
export async function payWithCard(scope: Page | Locator, card: CardInput) {
  await fillCardForm(scope, card);
  await scope.getByTestId("button-confirm-payment").click();
}

/** Flips a payment stored by the fake Asaas (card, PIX or boleto). Throws for an unknown id. */
export async function setFakePaymentStatus(request: APIRequestContext, paymentId: string, status: string) {
  const res = await request.post(`${FAKE_ROOT}/__payments/${paymentId}/status`, { data: { status } });
  expect(res.status(), `fake asaas flip ${paymentId}`).toBe(200);
}

/** The Asaas payment id stored on the order of `email` for `eventId`. */
export async function paymentIdOf(email: string, eventId: string): Promise<string> {
  const rows = await sql(
    `SELECT o.asaas_payment_id AS id FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2 ORDER BY o.created_at DESC LIMIT 1`,
    [email, eventId],
  );
  const id = rows[0]?.id as string | undefined;
  if (!id) throw new Error("order has no asaas payment id");
  return id;
}

const WEBHOOK_EVENT: Record<string, string> = {
  CONFIRMED: "PAYMENT_CONFIRMED",
  RECEIVED: "PAYMENT_RECEIVED",
  OVERDUE: "PAYMENT_OVERDUE",
  CANCELED: "PAYMENT_DELETED",
};

/**
 * Flips the fake payment, then posts the same webhook Asaas would (CONFIRMED -> PAYMENT_CONFIRMED,
 * RECEIVED -> PAYMENT_RECEIVED, OVERDUE -> PAYMENT_OVERDUE, CANCELED -> PAYMENT_DELETED).
 * The order can also be reached by the client's check-status polling, which reads the flipped fake.
 */
export async function confirmFakePayment(
  request: APIRequestContext,
  opts: { paymentId: string; orderId: string; status?: string; billingType?: string; value?: number /* default: the order total */ },
) {
  const status = opts.status ?? "CONFIRMED";
  await setFakePaymentStatus(request, opts.paymentId, status);
  const res = await request.post("/api/webhooks/asaas", {
    headers: { "asaas-access-token": "e2e-dummy" },
    data: {
      event: WEBHOOK_EVENT[status] ?? "PAYMENT_CONFIRMED",
      payment: {
        id: opts.paymentId,
        status,
        externalReference: opts.orderId,
        billingType: opts.billingType ?? "PIX",
        value: opts.value ?? Number(await scalar(`SELECT amount FROM orders WHERE id=$1`, [opts.orderId])),
      },
    },
  });
  expect(res.status(), "app webhook").toBe(200);
}

/** The order id of `email` for `eventId` (newest). */
export async function orderIdOf(email: string, eventId: string): Promise<string> {
  const rows = await sql(
    `SELECT o.id FROM orders o JOIN users x ON x.id=o.user_id WHERE lower(x.email)=lower($1) AND o.event_id=$2 ORDER BY o.created_at DESC LIMIT 1`,
    [email, eventId],
  );
  if (!rows[0]) throw new Error("no order for this e-mail and event");
  return rows[0].id as string;
}

/**
 * Newest link in a queued e-mail to `email` whose URL path starts with `path`
 * (e.g. "/reset-password", "/verify-email"). Returns the full URL (it carries a token: never print
 * it), or null when no such e-mail was queued yet. Use inside expect.poll.
 */
export async function latestEmailLink(email: string, path: string): Promise<string | null> {
  const rows = await sql(
    `SELECT html, text FROM email_queue WHERE lower("to")=lower($1) ORDER BY created_at DESC, id DESC LIMIT 20`,
    [email],
  );
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`https?://[^\\s"'<>]*${escaped}[^\\s"'<>]*`);
  for (const row of rows) {
    for (const body of [row.html, row.text]) {
      const m = typeof body === "string" ? body.match(re) : null;
      if (m) return m[0].replace(/&amp;/g, "&");
    }
  }
  return null;
}
