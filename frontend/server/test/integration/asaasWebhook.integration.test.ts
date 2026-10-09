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
vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn(async (to: string) => {
      ticketEmails.push(to);
      return true;
    }),
    sendOnlineEventEmail: vi.fn(async () => true),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async () => true),
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
  return { eventId, orderId, email };
}

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
});
