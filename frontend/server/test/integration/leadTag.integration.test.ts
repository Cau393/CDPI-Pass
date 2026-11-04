/**
 * ADR-018 lead tags: the order carries the tag of the link it was bought through. Real Express
 * routes + REAL PostgreSQL. Skipped unless VERIFY_DATABASE_URL points at a throwaway database:
 *
 *   VERIFY_DATABASE_URL=postgresql://postgres@localhost:55434/cdpi \
 *     pnpm exec vitest run --config vitest.server.config.ts server/test/integration/leadTag
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production): this test
 * writes and deletes rows.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { randomUUID, randomInt } from "crypto";

const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error(
    "VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.",
  );
}

const JWT_SECRET = "integration-test-secret";
const WEBHOOK_TOKEN = "integration-webhook-token-0123456789abcdef";
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATABASE_URL = VERIFY_URL ?? "postgresql://unused";
process.env.ASAAS_API_KEY = "test-key-not-used";
process.env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
// Read when the guest limiter is built: small, so the limiter test needs few requests.
process.env.GUEST_CHECKOUT_RATE_LIMIT_MAX = "5";

vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

const mocks = vi.hoisted(() => ({
  verifyTurnstile: vi.fn(async (..._args: unknown[]) => true),
  sendPasswordResetEmail: vi.fn(async (..._args: unknown[]) => true),
  sendTicketEmail: vi.fn(async (..._args: unknown[]) => true),
  sendOnlineEventEmail: vi.fn(async (..._args: unknown[]) => true),
  createPayment: vi.fn(),
  createCardPayment: vi.fn(),
  getPayment: vi.fn(),
  /** What the mocked Asaas answers to getPayment. */
  paymentStatus: { value: "PENDING" },
  /** Stand-in for the compile-time FOREIGN_PAID_CHECKOUT_ENABLED flag; off, like production. */
  foreignPaidEnabled: { value: false },
}));

vi.mock("@shared/foreignCheckout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/foreignCheckout")>()),
  foreignPaidCheckoutBlocked: (account: { isForeigner?: boolean | null } | null | undefined) =>
    !mocks.foreignPaidEnabled.value && account?.isForeigner === true,
}));

vi.mock("../../utils/verifyTurnstile", () => ({
  verifyTurnstile: (...args: unknown[]) => mocks.verifyTurnstile(...args),
}));

vi.mock("../../services/emailService", () => ({
  emailService: {
    sendPasswordResetEmail: (...args: unknown[]) => mocks.sendPasswordResetEmail(...args),
    sendTicketEmail: (...args: unknown[]) => mocks.sendTicketEmail(...args),
    sendOnlineEventEmail: (...args: unknown[]) => mocks.sendOnlineEventEmail(...args),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async () => true),
    sendVerificationEmail: vi.fn(async () => true),
  },
}));

vi.mock("../../services/asaasService", () => ({
  asaasService: {
    createPayment: (...args: unknown[]) => mocks.createPayment(...args),
    createCardPayment: (...args: unknown[]) => mocks.createCardPayment(...args),
    getPayment: (...args: unknown[]) => mocks.getPayment(...args),
    createForeignCardPayment: vi.fn(async () => {
      throw new Error("a foreign guest must never reach Asaas");
    }),
    cancelPayment: vi.fn(async () => ({})),
    // The webhook route checks the shared token with the real rule's shape.
    validateWebhookSignature: (token: string | undefined) => token === WEBHOOK_TOKEN,
  },
}));

vi.mock("../../services/s3Service", () => ({
  s3Service: {
    uploadBuffer: vi.fn(async () => "https://s3.test/object.png"),
    uploadQRCode: vi.fn(async () => "https://s3.test/qr.png"),
  },
}));

const AWS_ENV_NAMES = ["AWS_LAMBDA_ARN", "AWS_S3_BUCKET_NAME"] as const;
const savedAwsEnv: Partial<Record<(typeof AWS_ENV_NAMES)[number], string | undefined>> = {};

let server: Server;
let baseUrl: string;
let pool: Pool;

/** Rows created by this suite, removed in afterAll. */
const createdEventIds: string[] = [];
const createdUserIds: string[] = [];
const createdEmails: string[] = [];
const createdAttendeeEmails: string[] = [];

/** A fresh client address per request, so every test has its own guest-limiter bucket. */
function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; forwardedFor?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "X-Forwarded-For": opts.forwardedFor ?? randomIp(), ...opts.headers };
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

async function deliverWebhook(body: unknown): Promise<number> {
  const res = await fetch(`${baseUrl}/api/webhooks/asaas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": WEBHOOK_TOKEN },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function createEvent(opts: {
  modality: "presencial" | "online";
  isFree: boolean;
  price?: string;
  certificateTemplateUrl?: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, meeting_url, registration_form, current_attendees, certificate_template_url)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste',$4,true,'cdpi_event',$5,$6,$7,'[]'::jsonb,0,$8)`,
    [
      id,
      `[TEST] Convidado ${id.slice(0, 8)}`,
      new Date(Date.now() + 7 * 86400_000),
      opts.isFree ? "0.00" : (opts.price ?? "100.00"),
      opts.isFree,
      opts.modality,
      opts.modality === "online" ? "https://meet.test/sala" : null,
      opts.certificateTemplateUrl ?? null,
    ],
  );
  createdEventIds.push(id);
  return id;
}

/** A CPF with valid check digits, formatted like the app stores it. Unique per call. */
function makeCpf(): string {
  const base = Array.from({ length: 9 }, () => randomInt(0, 10));
  if (new Set(base).size === 1) base[0] = (base[0] + 1) % 10;
  const check = (digits: number[]) => {
    const factor = digits.length + 1;
    const sum = digits.reduce((acc, digit, i) => acc + digit * (factor - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(base);
  const d2 = check([...base, d1]);
  const all = [...base, d1, d2].join("");
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`;
}

const digitsOf = (value: string) => value.replace(/\D/g, "");
const makePassport = () => `PY${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
const ADDRESS = "Rua de teste, 123, Brasília";

function guestEmail(): string {
  const email = `guest-${randomUUID().slice(0, 8)}@example.test`;
  createdEmails.push(email);
  return email;
}

type Buyer = Record<string, unknown> & { email: string };

function buyer(overrides: Record<string, unknown> = {}): Buyer {
  return {
    name: "comprador convidado",
    email: guestEmail(),
    phone: "(11) 98765-4321",
    ...overrides,
  } as Buyer;
}

type TestUser = { id: string; token: string; email: string; cpf: string | null };

/** An account with a password. `complete` fills document and address. */
async function createPasswordUser(
  opts: { complete?: boolean; verified?: boolean; cpf?: string | null } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const email = `acct-${id.slice(0, 8)}@example.test`;
  const cpf = opts.cpf !== undefined ? opts.cpf : opts.complete ? makeCpf() : null;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, address)
     VALUES ($1,$2,$3,'x','Conta Existente',$4,'5511999999999',$5)`,
    [id, email, opts.verified ?? true, cpf, opts.complete ? ADDRESS : null],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email, cpf };
}

async function userRows(email: string) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows;
}

async function ordersOf(userId: string, eventId?: string) {
  const { rows } = eventId
    ? await pool.query(`SELECT * FROM orders WHERE user_id = $1 AND event_id = $2 ORDER BY created_at`, [userId, eventId])
    : await pool.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at`, [userId]);
  return rows;
}

async function orderCount(eventId: string): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM orders WHERE event_id = $1`, [eventId]);
  return rows[0].n;
}

/** Calls of the ticket / online-event e-mail spies addressed to `to`. */
function confirmationsTo(to: string): Array<{ to: string; data: any }> {
  return [...mocks.sendTicketEmail.mock.calls, ...mocks.sendOnlineEventEmail.mock.calls]
    .filter((call) => call[0] === to)
    .map((call) => ({ to: call[0] as string, data: call[1] as any }));
}

/** POST /api/orders as a guest on a paid in-person event; the caller checks the outcome. */
async function postGuestPixOrder(eventId: string, over: Record<string, unknown> = {}) {
  const typed = buyer({ cpf: makeCpf(), address: ADDRESS, ...over });
  const res = await api("POST", "/api/orders", {
    body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok" },
  });
  return { res, buyer: typed };
}

/** A guest PIX order that must succeed, with its access token. */
async function placeGuestPixOrder(eventId: string, over: Record<string, unknown> = {}) {
  const placed = await postGuestPixOrder(eventId, over);
  // Every caller relies on the order and its token: fail here, not later, if they are missing.
  expect(placed.res.status, JSON.stringify(placed.res.body)).toBe(201);
  expect(typeof placed.res.body.orderAccessToken).toBe("string");
  return placed;
}

async function freeGuestSubscribe(eventId: string, typed: Buyer) {
  return api("POST", `/api/events/${eventId}/subscribe`, { body: { buyer: typed, turnstileToken: "ok" } });
}

describe.skipIf(!enabled)("lead tag (real routes + real DB)", () => {
  beforeAll(async () => {
    // Never reach real AWS: with these unset the certificate route stops before the Lambda call.
    for (const name of AWS_ENV_NAMES) {
      savedAwsEnv[name] = process.env[name];
      delete process.env[name];
    }
    pool = new Pool({ connectionString: VERIFY_URL });
    const { registerRoutes } = await import("../../routes");
    const app = express();
    // As in server/index.ts: one proxy hop (nginx), which appends the peer address.
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  beforeEach(() => {
    mocks.verifyTurnstile.mockReset();
    mocks.verifyTurnstile.mockImplementation(async () => true);
    mocks.sendPasswordResetEmail.mockClear();
    mocks.sendTicketEmail.mockClear();
    mocks.sendOnlineEventEmail.mockClear();
    mocks.paymentStatus.value = "PENDING";
    mocks.createCardPayment.mockReset();
    mocks.createPayment.mockReset();
    mocks.createPayment.mockImplementation(async (payload: any) => ({
      id: `pay_${randomUUID()}`,
      paymentLink: "https://asaas.test/pay",
      status: "PENDING",
      value: payload.value,
      pixTransaction: {
        qrCode: { encodedImage: "AAAA", payload: "00020126pixpayload" },
        expirationDate: "2030-01-01 00:00:00",
      },
    }));
    mocks.getPayment.mockReset();
    mocks.getPayment.mockImplementation(async (id: string) => ({ id, status: mocks.paymentStatus.value, value: 105 }));
  });

  afterAll(async () => {
    for (const name of AWS_ENV_NAMES) {
      if (savedAwsEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedAwsEnv[name];
    }
    const { rows: byEmail } = await pool.query(`SELECT id FROM users WHERE email = ANY($1)`, [createdEmails]);
    const userIds = [...createdUserIds, ...byEmail.map((r) => r.id)];
    await pool.query(`DELETE FROM orders WHERE event_id = ANY($1) OR user_id = ANY($2)`, [createdEventIds, userIds]);
    await pool.query(`DELETE FROM courtesy_links WHERE event_id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM courtesy_attendees WHERE email = ANY($1)`, [createdAttendeeEmails]);
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function leadTagOf(orderId: string): Promise<string | null> {
    const { rows } = await pool.query(`SELECT lead_tag FROM orders WHERE id = $1`, [orderId]);
    expect(rows).toHaveLength(1);
    return rows[0].lead_tag;
  }

  async function createAdmin(): Promise<TestUser> {
    const admin = await createPasswordUser({ verified: true });
    await pool.query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);
    return admin;
  }

  async function redeem(eventId: string, redeemer: TestUser, extra: Record<string, unknown>) {
    const admin = await createAdmin();
    const code = `LT${randomUUID().slice(0, 8).toUpperCase()}`;
    await pool.query(
      `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by)
       VALUES ($1,$2,$3,5,0,true,$4)`,
      [randomUUID(), eventId, code, admin.id],
    );
    const attendeeEmail = `cortesia-${randomUUID().slice(0, 8)}@example.test`;
    createdAttendeeEmails.push(attendeeEmail);
    const res = await api("POST", "/api/courtesy/redeem", {
      token: redeemer.token,
      body: {
        code,
        name: "Convidado Cortesia",
        email: attendeeEmail,
        emailConfirm: attendeeEmail,
        cpf: makeCpf(),
        partnerCompany: "Empresa Parceira",
        occupation: "Analista",
        birthDate: "1990-05-10",
        address: "Rua das Cortesias, 456, São Paulo",
        phone: "5511988887777",
        ...extra,
      },
    });
    return res;
  }


  /** Guest PIX order with a tag in the body (next to buyer). */
  async function placeTaggedPix(eventId: string, leadTag?: unknown) {
    const res = await api("POST", "/api/orders", {
      body: { eventId, paymentMethod: "pix", buyer: buyer({ cpf: makeCpf(), address: ADDRESS }), turnstileToken: "ok", leadTag },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.order.id as string;
  }

  describe("paid checkout", () => {
    it("a guest PIX order with leadTag 'email' stores 'email'", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      expect(await leadTagOf(await placeTaggedPix(eventId, "email"))).toBe("email");
    });

    it("a tag typed with other case and spaces is normalised", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const typed = buyer({ cpf: makeCpf(), address: ADDRESS });
      const res = await api("POST", "/api/orders", {
        body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok", leadTag: " Parceiros " },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(await leadTagOf(res.body.order.id)).toBe("parceiros");
    });

    it.each([["bogus"], ["__proto__"], [42], [{ a: 1 }], [["email"]]])(
      "leadTag %j is not an error: the order is created with a NULL tag",
      async (junk) => {
        const eventId = await createEvent({ modality: "presencial", isFree: false });
        const typed = buyer({ cpf: makeCpf(), address: ADDRESS });
        const res = await api("POST", "/api/orders", {
          body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok", leadTag: junk },
        });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        expect(await leadTagOf(res.body.order.id)).toBeNull();
      },
    );

    it("no leadTag at all stores NULL", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);
      expect(await leadTagOf(res.body.order.id)).toBeNull();
    });

    it("the webhook that pays the order keeps the stored tag", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const orderId = await placeTaggedPix(eventId, "patrocinado");
      const { rows } = await pool.query(`SELECT asaas_payment_id, amount FROM orders WHERE id = $1`, [orderId]);
      expect(
        await deliverWebhook({
          event: "PAYMENT_RECEIVED",
          payment: {
            id: rows[0].asaas_payment_id,
            billingType: "PIX",
            status: "RECEIVED",
            value: Number(rows[0].amount),
            externalReference: orderId,
          },
        }),
      ).toBe(200);
      const after = await pool.query(`SELECT status, lead_tag FROM orders WHERE id = $1`, [orderId]);
      expect(after.rows[0]).toEqual({ status: "paid", lead_tag: "patrocinado" });
    });
  });

  describe("free subscribe", () => {
    it("a logged-in subscriber stores the tag", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const user = await createPasswordUser({ complete: true });
      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: { leadTag: "consultores" },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect((await ordersOf(user.id, eventId))[0].lead_tag).toBe("consultores");
    });

    it("a guest subscriber stores the tag", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const typed = buyer();
      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        body: { buyer: typed, turnstileToken: "ok", leadTag: "email" },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const { rows } = await pool.query(
        `SELECT o.lead_tag FROM orders o JOIN users u ON u.id = o.user_id WHERE o.event_id = $1 AND u.email = $2`,
        [eventId, typed.email.toLowerCase()],
      );
      expect(rows).toEqual([{ lead_tag: "email" }]);
    });

    it("junk leadTag subscribes normally with a NULL tag", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const user = await createPasswordUser({ complete: true });
      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: { leadTag: "bogus" },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect((await ordersOf(user.id, eventId))[0].lead_tag).toBeNull();
    });

    it("the same user on two events carries two different tags", async () => {
      const first = await createEvent({ modality: "presencial", isFree: true });
      const second = await createEvent({ modality: "presencial", isFree: true });
      const user = await createPasswordUser({ complete: true });
      const a = await api("POST", `/api/events/${first}/subscribe`, { token: user.token, body: { leadTag: "email" } });
      const b = await api("POST", `/api/events/${second}/subscribe`, { token: user.token, body: { leadTag: "parceiros" } });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect((await ordersOf(user.id, first))[0].lead_tag).toBe("email");
      expect((await ordersOf(user.id, second))[0].lead_tag).toBe("parceiros");
    });
  });

  describe("courtesy redeem", () => {
    it("stores the tag on the courtesy order and never on the users row", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const redeemer = await createPasswordUser({ complete: true });
      const before = (await pool.query(`SELECT * FROM users WHERE id = $1`, [redeemer.id])).rows[0];
      const res = await redeem(eventId, redeemer, { leadTag: "parceiros" });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect((await ordersOf(redeemer.id, eventId))[0].lead_tag).toBe("parceiros");
      const after = (await pool.query(`SELECT * FROM users WHERE id = $1`, [redeemer.id])).rows[0];
      expect(Object.keys(after)).not.toContain("lead_tag");
      expect(after).toEqual(before);
    });

    it("junk leadTag redeems normally with a NULL tag", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const redeemer = await createPasswordUser({ complete: true });
      const res = await redeem(eventId, redeemer, { leadTag: "__proto__" });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect((await ordersOf(redeemer.id, eventId))[0].lead_tag).toBeNull();
    });
  });

  describe("database CHECK", () => {
    it("refuses a value outside the list on update, naming orders_lead_tag_chk", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);
      await expect(
        pool.query(`UPDATE orders SET lead_tag = 'bogus' WHERE id = $1`, [res.body.order.id]),
      ).rejects.toMatchObject({ constraint: "orders_lead_tag_chk" });
    });

    it("refuses a value outside the list on insert, naming orders_lead_tag_chk", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const user = await createPasswordUser({ complete: true });
      await expect(
        pool.query(
          `INSERT INTO orders (user_id, event_id, payment_method, amount, lead_tag) VALUES ($1,$2,'pix','10.00','bogus')`,
          [user.id, eventId],
        ),
      ).rejects.toMatchObject({ constraint: "orders_lead_tag_chk" });
    });
  });

  describe("admin participants", () => {
    it("returns the raw tag per row, null for an untagged order, courtesy rows included", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const admin = await createAdmin();
      const taggedId = await placeTaggedPix(eventId, "email");
      await placeTaggedPix(eventId);
      // The list shows paid tickets only; the webhook path is covered above.
      await pool.query(`UPDATE orders SET status = 'paid' WHERE event_id = $1`, [eventId]);
      const redeemer = await createPasswordUser({ complete: true });
      const courtesy = await redeem(eventId, redeemer, { leadTag: "consultores" });
      expect(courtesy.status, JSON.stringify(courtesy.body)).toBe(201);

      const res = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const byTicket = new Map<string, any>(res.body.data.map((r: any) => [r.ticketId, r]));
      expect(byTicket.get(taggedId).leadTag).toBe("email");
      const tags = res.body.data.map((r: any) => r.leadTag).sort((a: any, b: any) => String(a).localeCompare(String(b)));
      expect(tags).toEqual(["consultores", "email", null]);
      for (const row of res.body.data) expect(row).toHaveProperty("leadTag");
    });
  });
});
