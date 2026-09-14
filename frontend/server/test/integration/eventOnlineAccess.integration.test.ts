/**
 * HTTP integration for optional WhatsApp group URL + confirmation-email HTML
 * on online events.
 *
 * Boots the real Express app against a throwaway PostgreSQL. Skipped unless
 * VERIFY_DATABASE_URL is set (see `scripts/run-integration-tests.sh`).
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { randomUUID } from "crypto";
const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error(
    "VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.",
  );
}

const JWT_SECRET = "integration-test-secret";
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATABASE_URL = VERIFY_URL ?? "postgresql://unused";
process.env.ASAAS_API_KEY = "test-key-not-used";

vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

const sentOnlineEmails: Array<{ to: string; html: string }> = [];
vi.mock("../../services/emailService", async () => {
  const { buildOnlineEventEmailHtml } = await import(
    "../../utils/onlineEventEmailTemplate"
  );
  return {
    emailService: {
      sendTicketEmail: vi.fn(async () => true),
      sendOnlineEventEmail: vi.fn(async (to: string, data: unknown) => {
        sentOnlineEmails.push({
          to,
          html: buildOnlineEventEmailHtml(
            data as Parameters<typeof buildOnlineEventEmailHtml>[0],
          ),
        });
        return true;
      }),
      sendCardPaymentLinkEmail: vi.fn(async () => true),
      sendEmail: vi.fn(async () => true),
    },
  };
});

vi.mock("../../services/asaasService", () => ({
  asaasService: {
    createPayment: vi.fn(async () => ({
      id: `pay_${randomUUID()}`,
      paymentLink: "https://asaas.test/pay",
      status: "PENDING",
      value: 0,
    })),
    cancelPayment: vi.fn(async () => ({})),
    getPayment: vi.fn(async () => ({})),
  },
}));

vi.mock("../../services/s3Service", () => ({
  s3Service: {
    uploadBuffer: vi.fn(async () => "https://s3.test/object.png"),
    uploadQRCode: vi.fn(async () => "https://s3.test/qr.png"),
  },
}));

const MEETING_URL = "https://meet.example.test/room-online";
const WHATSAPP_URL = "https://chat.whatsapp.com/TestGroupXYZ";
const CUSTOM_HTML = "<p>Traga o material extra</p>";
const CUSTOM_SNIPPET = "Traga o material extra";

let server: Server;
let baseUrl: string;
let pool: Pool;

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function createOnlineEvent(opts: {
  whatsappGroupUrl?: string | null;
  confirmationEmailHtml?: string | null;
  isFree?: boolean;
  price?: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (
       id, title, description, date, location, price, is_active, nps_type,
       is_free, sales_closed, max_attendees, current_attendees,
       modality, meeting_url, whatsapp_group_url, confirmation_email_html
     ) VALUES ($1,$2,$3,$4,$5,$6,true,'cdpi_event',$7,false,null,0,
       'online',$8,$9,$10)`,
    [
      id,
      `[TEST] Online ${id.slice(0, 8)}`,
      "<p>Evento online de teste</p>",
      new Date(Date.now() + 7 * 86400_000),
      "Zoom",
      opts.price ?? "0.00",
      opts.isFree ?? true,
      MEETING_URL,
      opts.whatsappGroupUrl ?? null,
      opts.confirmationEmailHtml ?? null,
    ],
  );
  createdEventIds.push(id);
  return id;
}

async function createUser(): Promise<{ id: string; token: string; cpf: string; email: string }> {
  const id = randomUUID();
  const n = createdUserIds.length + 1;
  const cpf = `888.${String(n).padStart(3, "0")}.${String(n).padStart(3, "0")}-88`;
  const email = `online-${id.slice(0, 8)}@example.test`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, birth_date, address, is_admin)
     VALUES ($1,$2,true,'x',$3,$4,'5511988888888',$5,'Rua de teste, 123',false)`,
    [id, email, "Participante Online", cpf, new Date("1990-01-01")],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), cpf, email };
}

function lastEmailFor(email: string) {
  return [...sentOnlineEmails].reverse().find((e) => e.to === email);
}

function expectPublicEventOmitsSecrets(body: Record<string, unknown>) {
  expect(body).not.toHaveProperty("meetingUrl");
  expect(body).not.toHaveProperty("whatsappGroupUrl");
  expect(body).not.toHaveProperty("confirmationEmailHtml");
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain(MEETING_URL);
  expect(serialized).not.toContain("chat.whatsapp.com");
  expect(serialized).not.toContain(CUSTOM_SNIPPET);
}

async function confirmedOrderForEvent(token: string, eventId: string) {
  const res = await api("GET", "/api/orders", { token });
  expect(res.status).toBe(200);
  const order = res.body.orders.find((o: { eventId: string }) => o.eventId === eventId);
  expect(order).toBeTruthy();
  return order;
}

describe.skipIf(!enabled)("online access extras (real routes + real DB)", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: VERIFY_URL });

    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    server = await registerRoutes(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    if (createdEventIds.length) {
      await pool.query(`DELETE FROM orders WHERE event_id = ANY($1)`, [createdEventIds]);
      await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    }
    if (createdOrderIds.length) {
      await pool.query(`DELETE FROM orders WHERE id = ANY($1)`, [createdOrderIds]);
    }
    if (createdUserIds.length) {
      await pool.query(`DELETE FROM orders WHERE user_id = ANY($1)`, [createdUserIds]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    }
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("both fields: public omits secrets, subscribe returns WhatsApp, orders and email expose them", async () => {
    const eventId = await createOnlineEvent({
      whatsappGroupUrl: WHATSAPP_URL,
      confirmationEmailHtml: CUSTOM_HTML,
    });
    const user = await createUser();

    const publicRes = await api("GET", `/api/events/${eventId}`);
    expect(publicRes.status).toBe(200);
    expectPublicEventOmitsSecrets(publicRes.body);

    const sub = await api("POST", `/api/events/${eventId}/subscribe`, {
      token: user.token,
    });
    expect(sub.status).toBe(201);
    expect(sub.body.whatsappGroupUrl).toBe(WHATSAPP_URL);

    const order = await confirmedOrderForEvent(user.token, eventId);
    expect(order.status).toBe("paid");
    expect(order.event.meetingUrl).toBe(MEETING_URL);
    expect(order.event.whatsappGroupUrl).toBe(WHATSAPP_URL);
    expect(order.event).not.toHaveProperty("confirmationEmailHtml");

    const email = lastEmailFor(user.email);
    expect(email?.html).toContain(CUSTOM_SNIPPET);
    expect(email?.html).toContain("Acessar reunião");
  });

  it("WhatsApp only: subscribe and orders include the group URL; email stays the default template", async () => {
    const eventId = await createOnlineEvent({
      whatsappGroupUrl: WHATSAPP_URL,
      confirmationEmailHtml: null,
    });
    const user = await createUser();

    const sub = await api("POST", `/api/events/${eventId}/subscribe`, {
      token: user.token,
    });
    expect(sub.status).toBe(201);
    expect(sub.body.whatsappGroupUrl).toBe(WHATSAPP_URL);

    const order = await confirmedOrderForEvent(user.token, eventId);
    expect(order.event.meetingUrl).toBe(MEETING_URL);
    expect(order.event.whatsappGroupUrl).toBe(WHATSAPP_URL);

    const email = lastEmailFor(user.email);
    expect(email?.html).toContain("Acessar reunião");
    expect(email?.html).not.toContain(CUSTOM_SNIPPET);
  });

  it("HTML only: subscribe WhatsApp is null; orders keep meeting URL; email includes custom HTML", async () => {
    const eventId = await createOnlineEvent({
      whatsappGroupUrl: null,
      confirmationEmailHtml: CUSTOM_HTML,
    });
    const user = await createUser();

    const sub = await api("POST", `/api/events/${eventId}/subscribe`, {
      token: user.token,
    });
    expect(sub.status).toBe(201);
    expect(sub.body.whatsappGroupUrl).toBeNull();

    const order = await confirmedOrderForEvent(user.token, eventId);
    expect(order.event.meetingUrl).toBe(MEETING_URL);
    expect(order.event.whatsappGroupUrl).toBeNull();

    const email = lastEmailFor(user.email);
    expect(email?.html).toContain(CUSTOM_SNIPPET);
    expect(email?.html).toContain("Acessar reunião");
  });

  it("neither field: default online email, null WhatsApp, orders still expose the meeting URL", async () => {
    const eventId = await createOnlineEvent({
      whatsappGroupUrl: null,
      confirmationEmailHtml: null,
    });
    const user = await createUser();

    const publicRes = await api("GET", `/api/events/${eventId}`);
    expect(publicRes.status).toBe(200);
    expectPublicEventOmitsSecrets(publicRes.body);

    const sub = await api("POST", `/api/events/${eventId}/subscribe`, {
      token: user.token,
    });
    expect(sub.status).toBe(201);
    expect(sub.body.whatsappGroupUrl).toBeNull();

    const order = await confirmedOrderForEvent(user.token, eventId);
    expect(order.event.meetingUrl).toBe(MEETING_URL);
    expect(order.event.whatsappGroupUrl).toBeNull();

    const email = lastEmailFor(user.email);
    expect(email?.html).toContain("Acessar reunião");
    expect(email?.html).not.toContain(CUSTOM_SNIPPET);
  });

  it("hides meeting and WhatsApp URLs on pending paid orders, then reveals them after paid", async () => {
    const eventId = await createOnlineEvent({
      whatsappGroupUrl: WHATSAPP_URL,
      confirmationEmailHtml: CUSTOM_HTML,
      isFree: false,
      price: "150.00",
    });
    const user = await createUser();
    const orderId = randomUUID();
    createdOrderIds.push(orderId);

    await pool.query(
      `INSERT INTO orders (id, user_id, event_id, cpf, status, payment_method, amount, asaas_payment_id)
       VALUES ($1,$2,$3,$4,'pending','pix','150.00','pay_pending_online')`,
      [orderId, user.id, eventId, user.cpf],
    );

    const pending = await confirmedOrderForEvent(user.token, eventId);
    expect(pending.status).toBe("pending");
    expect(pending.event).not.toHaveProperty("meetingUrl");
    expect(pending.event).not.toHaveProperty("whatsappGroupUrl");
    expect(pending.event).not.toHaveProperty("confirmationEmailHtml");
    const pendingJson = JSON.stringify(pending.event);
    expect(pendingJson).not.toContain(MEETING_URL);
    expect(pendingJson).not.toContain(WHATSAPP_URL);

    await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);

    const paid = await confirmedOrderForEvent(user.token, eventId);
    expect(paid.status).toBe("paid");
    expect(paid.event.meetingUrl).toBe(MEETING_URL);
    expect(paid.event.whatsappGroupUrl).toBe(WHATSAPP_URL);
  });
});
