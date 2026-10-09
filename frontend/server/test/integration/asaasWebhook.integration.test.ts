/**
 * POST /api/webhooks/asaas against the REAL Express routes and a REAL PostgreSQL.
 * Payloads follow what the Asaas sandbox delivered on 2026-10-09: PIX / boleto
 * payments carry our order id in `externalReference`; a card bought through a
 * payment link is a NEW payment (`pay_…`) whose `paymentLink` is the link id we
 * stored on the order. Skipped unless VERIFY_DATABASE_URL is set.
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production): this test
 * writes and deletes rows.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error(
    "VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.",
  );
}

const WEBHOOK_TOKEN = "integration-webhook-token-0123456789abcdef";
process.env.JWT_SECRET = "integration-test-secret";
process.env.DATABASE_URL = VERIFY_URL ?? "postgresql://unused";
process.env.ASAAS_API_KEY = "test-key-not-used";
process.env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;

vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

const ticketEmails: string[] = [];
const sentEmails: { to: string; subject: string; html: string }[] = [];
vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn(async (to: string) => {
      ticketEmails.push(to);
      return true;
    }),
    sendOnlineEventEmail: vi.fn(async () => true),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async (to: string, subject: string, html: string) => {
      sentEmails.push({ to, subject, html });
      return true;
    }),
    sendVerificationEmail: vi.fn(async () => true),
  },
}));

vi.mock("../../services/s3Service", () => ({
  s3Service: {
    uploadBuffer: vi.fn(async () => "https://s3.test/object.png"),
    uploadQRCode: vi.fn(async () => "https://s3.test/qr.png"),
  },
}));

// Make.com forward: never leave the test process.
vi.mock("axios", () => ({ default: { post: vi.fn(async () => ({ status: 200 })) } }));

/** Every request the app would send to Asaas, as "METHOD /path". Nothing leaves the process. */
const asaasCalls: string[] = [];
/** The refunds Asaas accepted. */
const acceptedRefunds: string[] = [];

let server: Server;
let baseUrl: string;
let pool: Pool;
const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

async function deliver(body: unknown, token: string | null = WEBHOOK_TOKEN) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["asaas-access-token"] = token;
  const res = await fetch(`${baseUrl}/api/webhooks/asaas`, { method: "POST", headers, body: JSON.stringify(body) });
  return res.status;
}

/** A paid in-person event + a Brazilian buyer + one pending order holding `asaasId`. */
async function pendingOrder(paymentMethod: "pix" | "credit_card", asaasId: string) {
  const eventId = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, registration_form, current_attendees)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste','632.00',true,'cdpi_event',false,'presencial','[]'::jsonb,0)`,
    [eventId, `[TEST] Webhook ${eventId.slice(0, 8)}`, new Date(Date.now() + 7 * 86400_000)],
  );
  createdEventIds.push(eventId);
  const userId = randomUUID();
  const email = `webhook-${userId.slice(0, 8)}@example.test`;
  const cpf = `${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, address)
     VALUES ($1,$2,true,'x','Comprador Webhook',$3,'5511999999999','Rua Teste, 1')`,
    [userId, email, cpf],
  );
  createdUserIds.push(userId);
  const orderId = randomUUID();
  await pool.query(
    `INSERT INTO orders (id, user_id, event_id, status, amount, payment_method, asaas_payment_id, cpf, qr_code_data)
     VALUES ($1,$2,$3,'pending','632.00',$4,$5,$6,'qr-data')`,
    [orderId, userId, eventId, paymentMethod, asaasId, cpf],
  );
  return { eventId, orderId, email, userId, cpf };
}

/** Another pending order of the same buyer for the same event (a second checkout). */
async function anotherOrder(o: { eventId: string; userId: string; cpf: string }, asaasId: string, status = "pending") {
  const orderId = randomUUID();
  await pool.query(
    `INSERT INTO orders (id, user_id, event_id, status, amount, payment_method, asaas_payment_id, cpf, qr_code_data)
     VALUES ($1,$2,$3,$4,'632.00','pix',$5,$6,'qr-data')`,
    [orderId, o.userId, o.eventId, status, asaasId, o.cpf],
  );
  return orderId;
}

const refunds = (paymentId: string) =>
  acceptedRefunds.filter((c) => c === `POST /payments/${paymentId}/refund` || c === `POST /payments/${paymentId}/bankSlip/refund`);
const refundEmails = (to: string) => sentEmails.filter((e) => e.to === to && /estornado/i.test(e.subject));

async function state(orderId: string, eventId: string) {
  const o = await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
  const e = await pool.query(`SELECT current_attendees FROM events WHERE id = $1`, [eventId]);
  return { status: o.rows[0].status as string, attendees: Number(e.rows[0].current_attendees) };
}

describe.skipIf(!enabled)("Asaas webhook (real routes + real DB)", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: VERIFY_URL });
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    server = await registerRoutes(app);
    // Asaas sandbox behaviour: a payment refunds once; asking again is a 400.
    const { asaasService } = await import("../../services/asaasService");
    const { AsaasApiError } = await import("../../utils/asaasErrors");
    vi.spyOn(asaasService as any, "makeRequest").mockImplementation(async (...args: unknown[]) => {
      const [endpoint, method = "GET"] = args as [string, string?];
      const call = `${method} ${endpoint}`;
      const again = asaasCalls.includes(call);
      asaasCalls.push(call);
      if (call.endsWith("/refund")) {
        if (again) throw new AsaasApiError(400, { errors: [{ code: "invalid_action", description: "Cobrança já estornada" }] });
        acceptedRefunds.push(call);
        if (call.endsWith("/bankSlip/refund")) return { requestUrl: "https://sandbox.asaas.com/refund-request/abc", status: "PENDING" };
        return { id: endpoint.split("/")[2], status: "REFUNDED" };
      }
      const paymentRead = /^GET \/payments\/([^/?]+)$/.exec(call);
      if (paymentRead) {
        const refunded = acceptedRefunds.some((r) => r.startsWith(`POST /payments/${paymentRead[1]}/`));
        return { id: paymentRead[1], status: refunded ? "REFUNDED" : "RECEIVED" };
      }
      return {};
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    await pool.query(`DELETE FROM orders WHERE event_id = ANY($1) OR user_id = ANY($2)`, [createdEventIds, createdUserIds]);
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("PIX PAYMENT_RECEIVED with our order id in externalReference marks the order paid once", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_pix_1");
    const body = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_pix_1", billingType: "PIX", status: "RECEIVED", value: 637, externalReference: orderId, paymentLink: null },
    };
    expect(await deliver(body)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
    expect(ticketEmails).toContain(email);

    // Asaas redelivers: still one paid order, the counter does not double.
    expect(await deliver(body)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
  });

  it("card bought through the payment link: a new payment with only `paymentLink` finds the order", async () => {
    const linkId = `lnk${randomUUID().slice(0, 12)}`;
    const { eventId, orderId } = await pendingOrder("credit_card", linkId);
    const body = {
      event: "PAYMENT_CONFIRMED",
      payment: { id: `pay_${randomUUID().slice(0, 12)}`, billingType: "CREDIT_CARD", status: "CONFIRMED", value: 212.33, externalReference: null, paymentLink: linkId },
    };
    expect(await deliver(body)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });

    // The other installments of the same purchase confirm too: no extra seat.
    expect(await deliver({ ...body, payment: { ...body.payment, id: `pay_${randomUUID().slice(0, 12)}` } })).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
    // The legit installments of the paying purchase are never refunded.
    expect(asaasCalls.filter((c) => c.includes("/refund") && c.includes(linkId))).toEqual([]);
    expect(acceptedRefunds.filter((c) => c.includes(body.payment.id))).toEqual([]);
  });

  it("installments delivered at the same time count one seat and send one ticket", async () => {
    const linkId = `lnk${randomUUID().slice(0, 12)}`;
    const { eventId, orderId, email } = await pendingOrder("credit_card", linkId);
    const installment = () => ({
      event: "PAYMENT_CONFIRMED",
      payment: { id: `pay_${randomUUID().slice(0, 12)}`, billingType: "CREDIT_CARD", value: 212.33, externalReference: null, paymentLink: linkId },
    });

    const statuses = await Promise.all([deliver(installment()), deliver(installment()), deliver(installment())]);

    expect(statuses).toEqual([200, 200, 200]);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
    expect(ticketEmails.filter((to) => to === email)).toHaveLength(1);
  });

  it("two finalizers holding the same pending snapshot (webhook + check-status poll) count one seat", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_stale_snapshot");
    const { storage } = await import("../../storage");
    const { finalizeOrderPaidLikeWebhook } = await import("../../utils/finalizeOrderPaidLikeWebhook");
    const snapshot = (await storage.getOrder(orderId))!;
    const meta = { billingType: "PIX", value: 637 };

    const first = await finalizeOrderPaidLikeWebhook(snapshot, meta);
    const second = await finalizeOrderPaidLikeWebhook(snapshot, meta);

    expect([first, second]).toEqual([{ ok: true }, { ok: false, code: "already_paid" }]);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
    expect(ticketEmails.filter((to) => to === email)).toHaveLength(1);
  });

  it("externalReference wins over paymentLink when they point at different orders", async () => {
    const byReference = await pendingOrder("pix", "pay_ref_wins");
    const linkId = `lnk${randomUUID().slice(0, 12)}`;
    const byLink = await pendingOrder("credit_card", linkId);
    await deliver({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_ref_wins_other", billingType: "PIX", externalReference: byReference.orderId, paymentLink: linkId },
    });
    expect((await state(byReference.orderId, byReference.eventId)).status).toBe("paid");
    expect(await state(byLink.orderId, byLink.eventId)).toEqual({ status: "pending", attendees: 0 });
  });

  it("a late PAYMENT_CONFIRMED does not revive a cancelled order", async () => {
    const { eventId, orderId } = await pendingOrder("pix", "pay_late");
    await deliver({ event: "PAYMENT_OVERDUE", payment: { id: "pay_late", externalReference: orderId } });
    expect(await deliver({ event: "PAYMENT_RECEIVED", payment: { id: "pay_late", billingType: "PIX", externalReference: orderId } })).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "cancelled", attendees: 0 });
  });

  it("an externalReference that is not one of our orders falls back to the payment link", async () => {
    const linkId = `lnk${randomUUID().slice(0, 12)}`;
    const { eventId, orderId } = await pendingOrder("credit_card", linkId);
    const body = {
      event: "PAYMENT_CONFIRMED",
      payment: { id: `pay_${randomUUID().slice(0, 12)}`, billingType: "CREDIT_CARD", value: 637, externalReference: "not-our-order", paymentLink: linkId },
    };
    expect(await deliver(body)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
  });

  it("a payment that matches no order is acknowledged with 200 and changes nothing", async () => {
    const { eventId, orderId } = await pendingOrder("pix", "pay_pix_unrelated");
    const body = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_someone_else", billingType: "PIX", value: 10, externalReference: "another-system-ref", paymentLink: null },
    };
    expect(await deliver(body)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "pending", attendees: 0 });
  });

  it("rejects a wrong or missing asaas-access-token with 401 and changes nothing", async () => {
    const { eventId, orderId } = await pendingOrder("pix", "pay_pix_token");
    const body = { event: "PAYMENT_RECEIVED", payment: { id: "pay_pix_token", billingType: "PIX", externalReference: orderId } };
    expect(await deliver(body, "wrong-token")).toBe(401);
    expect(await deliver(body, null)).toBe(401);
    expect(await state(orderId, eventId)).toEqual({ status: "pending", attendees: 0 });
  });

  it("PAYMENT_OVERDUE / PAYMENT_DELETED cancel only the pending order that holds that payment id", async () => {
    const overdue = await pendingOrder("pix", "pay_overdue_1");
    const deleted = await pendingOrder("pix", "pay_deleted_1");
    expect(await deliver({ event: "PAYMENT_OVERDUE", payment: { id: "pay_overdue_1", externalReference: overdue.orderId } })).toBe(200);
    expect(await deliver({ event: "PAYMENT_DELETED", payment: { id: "pay_deleted_1", externalReference: deleted.orderId } })).toBe(200);
    expect((await state(overdue.orderId, overdue.eventId)).status).toBe("cancelled");
    expect((await state(deleted.orderId, deleted.eventId)).status).toBe("cancelled");

    // An old charge of an order that now holds another payment id must not cancel it.
    const moved = await pendingOrder("pix", "pay_current");
    expect(await deliver({ event: "PAYMENT_DELETED", payment: { id: "pay_old", externalReference: moved.orderId } })).toBe(200);
    expect((await state(moved.orderId, moved.eventId)).status).toBe("pending");
  });

  it("a paid order stays paid when its payment is later deleted", async () => {
    const { eventId, orderId } = await pendingOrder("pix", "pay_paid_then_deleted");
    await deliver({ event: "PAYMENT_RECEIVED", payment: { id: "pay_paid_then_deleted", billingType: "PIX", externalReference: orderId } });
    expect(await deliver({ event: "PAYMENT_DELETED", payment: { id: "pay_paid_then_deleted", externalReference: orderId } })).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
  });

  // --- Hardening batch 1 -------------------------------------------------------------

  it("A1: two orders of the same CPF finalized at once from stale snapshots end with one paid", async () => {
    const first = await pendingOrder("pix", "pay_a1_first");
    const secondId = await anotherOrder(first, "pay_a1_second");
    const { storage } = await import("../../storage");
    const { finalizeOrderPaidLikeWebhook } = await import("../../utils/finalizeOrderPaidLikeWebhook");
    const [snapA, snapB] = [(await storage.getOrder(first.orderId))!, (await storage.getOrder(secondId))!];

    await Promise.all([
      finalizeOrderPaidLikeWebhook(snapA, { billingType: "PIX", value: 637, paymentId: "pay_a1_first" }),
      finalizeOrderPaidLikeWebhook(snapB, { billingType: "PIX", value: 637, paymentId: "pay_a1_second" }),
    ]);

    const statuses = [(await state(first.orderId, first.eventId)).status, (await state(secondId, first.eventId)).status];
    expect(statuses.sort()).toEqual(["cancelled", "paid"]);
    expect((await state(first.orderId, first.eventId)).attendees).toBe(1);
    expect(ticketEmails.filter((to) => to === first.email)).toHaveLength(1);
    // The discarded order's received payment is the one refunded, once.
    const discardedPayment = (await state(first.orderId, first.eventId)).status === "cancelled" ? "pay_a1_first" : "pay_a1_second";
    expect(refunds(discardedPayment)).toHaveLength(1);
  });

  it("A1 reject_only: the admin path leaves the second order pending and refunds nothing", async () => {
    const first = await pendingOrder("pix", "pay_a1r_first");
    const secondId = await anotherOrder(first, "pay_a1r_second");
    const { storage } = await import("../../storage");
    const { finalizeOrderPaidLikeWebhook } = await import("../../utils/finalizeOrderPaidLikeWebhook");
    const [snapA, snapB] = [(await storage.getOrder(first.orderId))!, (await storage.getOrder(secondId))!];
    const meta = { billingType: "CREDIT_CARD", value: 637 };

    const results = await Promise.all([
      finalizeOrderPaidLikeWebhook(snapA, meta, { duplicatePolicy: "reject_only" }),
      finalizeOrderPaidLikeWebhook(snapB, meta, { duplicatePolicy: "reject_only" }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "duplicate_other_paid")).toHaveLength(1);
    const statuses = [(await state(first.orderId, first.eventId)).status, (await state(secondId, first.eventId)).status];
    expect(statuses.sort()).toEqual(["paid", "pending"]);
    expect(refunds("pay_a1r_first").concat(refunds("pay_a1r_second"))).toHaveLength(0);
  });

  it("A2: a failure after the claim rolls back, answers 500, and the redelivery finalizes once", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_a2");
    const { storage } = await import("../../storage");
    const spy = vi.spyOn(storage, "incrementEventAttendees").mockRejectedValueOnce(new Error("db hiccup"));
    const body = { event: "PAYMENT_RECEIVED", payment: { id: "pay_a2", billingType: "PIX", value: 637, externalReference: orderId } };

    expect(await deliver(body)).toBe(500);
    expect(await state(orderId, eventId)).toEqual({ status: "pending", attendees: 0 });
    expect(ticketEmails.filter((to) => to === email)).toHaveLength(0);

    spy.mockRestore();
    expect(await deliver(body)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
    expect(ticketEmails.filter((to) => to === email)).toHaveLength(1);
  });

  it("A3: a stale pending snapshot of an order that is already paid triggers no refund", async () => {
    const paid = await pendingOrder("pix", "pay_a3_paid");
    const { storage } = await import("../../storage");
    const snapshot = (await storage.getOrder(paid.orderId))!;
    await anotherOrder(paid, "pay_a3_other_paid", "paid");
    await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [paid.orderId]);
    const { finalizeOrderPaidLikeWebhook } = await import("../../utils/finalizeOrderPaidLikeWebhook");

    await finalizeOrderPaidLikeWebhook(snapshot, { billingType: "PIX", value: 637, paymentId: "pay_a3_paid" });

    expect((await state(paid.orderId, paid.eventId)).status).toBe("paid");
    expect(asaasCalls.filter((c) => c.includes("pay_a3_paid"))).toEqual([]);
  });

  it("A3: the same duplicate delivered twice at once is discarded and refunded once", async () => {
    const holder = await pendingOrder("pix", "pay_a3_dup_first");
    await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [holder.orderId]);
    const dupId = await anotherOrder(holder, "pay_a3_dup");
    const body = { event: "PAYMENT_RECEIVED", payment: { id: "pay_a3_dup", billingType: "PIX", value: 637, externalReference: dupId } };

    expect(await Promise.all([deliver(body), deliver(body)])).toEqual([200, 200]);

    expect((await state(dupId, holder.eventId)).status).toBe("cancelled");
    expect(refunds("pay_a3_dup")).toHaveLength(1);
    expect(asaasCalls.filter((c) => c.startsWith("DELETE"))).toEqual([]);
    expect(refundEmails(holder.email)).toHaveLength(1);
  });

  it("A4: PIX paid after the order was cancelled is refunded once and the buyer is told once", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_a4");
    await deliver({ event: "PAYMENT_OVERDUE", payment: { id: "pay_a4", externalReference: orderId } });
    const paidLate = { event: "PAYMENT_RECEIVED", payment: { id: "pay_a4", billingType: "PIX", value: 637, externalReference: orderId } };

    expect(await deliver(paidLate)).toBe(200);
    expect(await state(orderId, eventId)).toEqual({ status: "cancelled", attendees: 0 });
    expect(refunds("pay_a4")).toEqual(["POST /payments/pay_a4/refund"]);
    expect(refundEmails(email)).toHaveLength(1);

    // Redelivery: Asaas refuses a second refund, so no second e-mail.
    expect(await deliver(paidLate)).toBe(200);
    expect(refundEmails(email)).toHaveLength(1);
    expect(ticketEmails.filter((to) => to === email)).toHaveLength(0);
  });

  it("A4: a boleto paid late goes through bankSlip/refund and the e-mail carries the refund form link", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_a4_boleto");
    await deliver({ event: "PAYMENT_OVERDUE", payment: { id: "pay_a4_boleto", externalReference: orderId } });

    expect(await deliver({ event: "PAYMENT_RECEIVED", payment: { id: "pay_a4_boleto", billingType: "BOLETO", value: 637, externalReference: orderId } })).toBe(200);

    expect(await state(orderId, eventId)).toEqual({ status: "cancelled", attendees: 0 });
    expect(refunds("pay_a4_boleto")).toEqual(["POST /payments/pay_a4_boleto/bankSlip/refund"]);
    expect(refundEmails(email)).toHaveLength(1);
    expect(refundEmails(email)[0].html).toContain("https://sandbox.asaas.com/refund-request/abc");
  });

  it("B1: in production a missing ASAAS_WEBHOOK_TOKEN rejects every delivery with 401", async () => {
    const { eventId, orderId } = await pendingOrder("pix", "pay_b1");
    const body = { event: "PAYMENT_RECEIVED", payment: { id: "pay_b1", billingType: "PIX", externalReference: orderId } };
    const saved = { node: process.env.NODE_ENV, token: process.env.ASAAS_WEBHOOK_TOKEN };
    try {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      process.env.NODE_ENV = "production";
      expect(await deliver(body, null)).toBe(401);
      expect(await deliver(body, "anything")).toBe(401);
      expect(await state(orderId, eventId)).toEqual({ status: "pending", attendees: 0 });
    } finally {
      process.env.NODE_ENV = saved.node;
      process.env.ASAAS_WEBHOOK_TOKEN = saved.token;
    }
  });

  it("B2/B3: deliveries without a payment, or of events we do not handle, are acknowledged with 200", async () => {
    expect(await deliver({ event: "PAYMENT_OVERDUE" })).toBe(200);
    expect(await deliver({ event: "PAYMENT_DELETED", payment: null })).toBe(200);
    expect(await deliver({ event: "PAYMENT_RECEIVED" })).toBe(200);
    expect(await deliver({ event: "PAYMENT_REFUNDED", payment: { id: "pay_whatever" } })).toBe(200);
    expect(await deliver({})).toBe(200);
  });

  it("A5 PIX: a second charge paid for an order another charge already paid is refunded once", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_a5_current");
    await deliver({ event: "PAYMENT_RECEIVED", payment: { id: "pay_a5_current", billingType: "PIX", value: 637, externalReference: orderId } });
    const second = { event: "PAYMENT_RECEIVED", payment: { id: "pay_a5_old", billingType: "PIX", value: 637, externalReference: orderId } };

    expect(await deliver(second)).toBe(200);
    expect(await deliver(second)).toBe(200);

    expect(await state(orderId, eventId)).toEqual({ status: "paid", attendees: 1 });
    expect(refunds("pay_a5_old")).toHaveLength(1);
    expect(refunds("pay_a5_current")).toHaveLength(0);
    expect(refundEmails(email)).toHaveLength(1);
  });

  it("a card payment on a cancelled order is never refunded automatically", async () => {
    const { eventId, orderId, email } = await pendingOrder("pix", "pay_card_cancelled");
    await pool.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);

    expect(await deliver({ event: "PAYMENT_RECEIVED", payment: { id: "pay_card_cancelled", billingType: "CREDIT_CARD", value: 637, externalReference: orderId } })).toBe(200);

    expect(await state(orderId, eventId)).toEqual({ status: "cancelled", attendees: 0 });
    expect(asaasCalls.filter((c) => c.startsWith("POST") && c.includes("pay_card_cancelled"))).toEqual([]);
    expect(refundEmails(email)).toHaveLength(0);
  });
});
