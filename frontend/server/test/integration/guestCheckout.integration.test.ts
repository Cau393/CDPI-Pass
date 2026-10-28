/**
 * ADR-017 Stage 2: guest checkout (no account, no login) against the REAL Express routes and a
 * REAL PostgreSQL. Skipped unless VERIFY_DATABASE_URL points at a throwaway database:
 *
 *   VERIFY_DATABASE_URL=postgresql://postgres@localhost:55434/cdpi \
 *     pnpm exec vitest run --config vitest.server.config.ts server/test/integration/guestCheckout
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

describe.skipIf(!enabled)("guest checkout (real routes + real DB)", () => {
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
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function registerSquatter(email: string, password: string) {
    const reg = await api("POST", "/api/auth/register", {
      body: { name: "Squatter Person", email, phone: "5511988887777", password },
    });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    return reg.body as { token: string; user: { id: string } };
  }

  describe("free subscribe", () => {
    it("a free online guest → 201, a password-less lowercased row, a guest order, a confirmation e-mail", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const typed = buyer({ email: `Guest-${randomUUID().slice(0, 8)}@Example.TEST` });
      createdEmails.push(typed.email.toLowerCase());

      const res = await freeGuestSubscribe(eventId, typed);

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const rows = await userRows(typed.email.toLowerCase());
      expect(rows).toHaveLength(1);
      expect(rows[0].password).toBeNull();
      expect(rows[0].email_verified).toBe(false);
      const orders = await ordersOf(rows[0].id, eventId);
      expect(orders).toHaveLength(1);
      expect(orders[0].placed_as_guest).toBe(true);
      expect(confirmationsTo(typed.email.toLowerCase())).toHaveLength(1);
      expect(res.body.orderAccessToken).toBeUndefined();
    });

    it("a free online foreign guest (passport) → 201 with the passport stored and no CPF", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const passport = makePassport();
      const typed = buyer({ isForeigner: true, foreignDocument: passport });

      const res = await freeGuestSubscribe(eventId, typed);

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const [row] = await userRows(typed.email);
      expect(row.is_foreigner).toBe(true);
      expect(row.foreign_document).toBe(passport);
      expect(row.cpf).toBeNull();
      expect(row.password).toBeNull();
    });

    it("a free in-person guest without document or address → 400 identity_required and no row", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const typed = buyer();

      const res = await freeGuestSubscribe(eventId, typed);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("identity_required");
      expect(await userRows(typed.email)).toHaveLength(0);
    });
  });

  describe("paid PIX", () => {
    it("a guest PIX → 201, Asaas gets the typed CPF, and orderAccessToken comes right after order", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const cpf = makeCpf();

      const { res } = await placeGuestPixOrder(eventId, { cpf });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(mocks.createPayment).toHaveBeenCalledTimes(1);
      expect(mocks.createPayment.mock.calls[0][0].customer.cpfCnpj).toBe(digitsOf(cpf));
      expect(typeof res.body.orderAccessToken).toBe("string");
      expect(Object.keys(res.body).slice(0, 2)).toEqual(["order", "orderAccessToken"]);
      expect(res.body.payment.pixPayload).toBeTruthy();
    });
  });

  describe("existing accounts and repeat buyers", () => {
    it("the same e-mail on two free events → one row, name and phone of the first request kept", async () => {
      const first = await createEvent({ modality: "online", isFree: true });
      const second = await createEvent({ modality: "online", isFree: true });
      const email = guestEmail();

      const a = await freeGuestSubscribe(first, buyer({ email, name: "primeiro nome", phone: "(11) 98765-4321" }));
      const b = await freeGuestSubscribe(second, buyer({ email, name: "segundo nome", phone: "(21) 99999-0000" }));

      expect(a.status).toBe(201);
      expect(b.status, JSON.stringify(b.body)).toBe(201);
      const rows = await userRows(email);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Primeiro Nome");
      expect(rows[0].phone).toBe("5511987654321");
      expect(await ordersOf(rows[0].id)).toHaveLength(2);
    });

    it("a password account without CPF buys a paid in-person event as a guest: no profile write, order carries the CPF", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const account = await createPasswordUser();
      const cpf = makeCpf();

      const { res } = await placeGuestPixOrder(eventId, { email: account.email, cpf });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const [row] = await userRows(account.email);
      expect(row.cpf).toBeNull();
      expect(row.address).toBeNull();
      expect(row.password).toBe("x");
      const [order] = await ordersOf(account.id, eventId);
      expect(digitsOf(order.cpf)).toBe(digitsOf(cpf));
      expect(order.placed_as_guest).toBe(true);
    });

    it("a password account with CPF A and a guest typing CPF B → 409 identity_conflict", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const account = await createPasswordUser({ cpf: makeCpf() });

      const { res } = await postGuestPixOrder(eventId, { email: account.email, cpf: makeCpf() });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("identity_conflict");
      expect(mocks.createPayment).not.toHaveBeenCalled();
      expect(await ordersOf(account.id, eventId)).toHaveLength(0);
    });

    it("a new e-mail with a CPF owned by another user → 409 identity_conflict and no row", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const owner = await createPasswordUser({ complete: true });

      const { res, buyer: typed } = await postGuestPixOrder(eventId, { cpf: owner.cpf });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("identity_conflict");
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(await orderCount(eventId)).toBe(0);
    });

    it("a new e-mail with a passport owned by another user → 409 identity_conflict and no row", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const passport = makePassport();
      const id = randomUUID();
      await pool.query(
        `INSERT INTO users (id, email, email_verified, password, name, cpf, is_foreigner, foreign_document, phone)
         VALUES ($1,$2,true,'x','Dona do Passaporte',NULL,true,$3,'595981123456')`,
        [id, `owner-${id.slice(0, 8)}@example.test`, passport],
      );
      createdUserIds.push(id);
      const typed = buyer({ isForeigner: true, foreignDocument: passport });

      const res = await freeGuestSubscribe(eventId, typed);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("identity_conflict");
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(await orderCount(eventId)).toBe(0);
    });
  });

  describe("rejected before any write", () => {
    it("a foreign paid guest → 403 foreign_paid_unavailable: no row, no order, no Asaas call", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const typed = buyer({ isForeigner: true, foreignDocument: makePassport(), address: ADDRESS });

      const res = await api("POST", "/api/orders", {
        body: { eventId, paymentMethod: "credit_card", buyer: typed, turnstileToken: "ok" },
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("foreign_paid_unavailable");
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(await orderCount(eventId)).toBe(0);
      expect(mocks.createPayment).not.toHaveBeenCalled();
    });

    it("with foreign paid checkout on, a guest passport + pix → 400 foreign-card-only and no row is written", async () => {
      mocks.foreignPaidEnabled.value = true;
      try {
        const eventId = await createEvent({ modality: "presencial", isFree: false });
        const typed = buyer({ isForeigner: true, foreignDocument: makePassport(), address: ADDRESS });

        const res = await api("POST", "/api/orders", {
          body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok" },
        });

        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(res.body.message).toMatch(/Estrangeiros pagam apenas com cartão/);
        expect(await userRows(typed.email)).toHaveLength(0);
        expect(await orderCount(eventId)).toBe(0);
        expect(mocks.createPayment).not.toHaveBeenCalled();
      } finally {
        mocks.foreignPaidEnabled.value = false;
      }
    });

    it("an invalid promo code on a guest request → 400 and no row is written", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const typed = buyer({ cpf: makeCpf(), address: ADDRESS });

      const res = await api("POST", "/api/orders", {
        body: { eventId, paymentMethod: "pix", promoCode: "NAO-EXISTE", buyer: typed, turnstileToken: "ok" },
      });

      expect(res.status).toBe(400);
      expect(await userRows(typed.email)).toHaveLength(0);
    });

    it("a duplicate paid holder (another user's paid order already carries the CPF) → 409 and no Asaas call", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const cpf = makeCpf();
      // The earlier buyer's account has no CPF of its own: only orders.cpf holds it, so the
      // resolver lets the new e-mail through and the CPF branch of the duplicate check decides.
      const earlier = await createPasswordUser();
      await pool.query(
        `INSERT INTO orders (id, user_id, event_id, status, amount, payment_method, asaas_payment_id, cpf, qr_code_data)
         VALUES ($1,$2,$3,'paid','105.00','pix','pay_already',$4,'qr-data')`,
        [randomUUID(), earlier.id, eventId, cpf],
      );

      const { res, buyer: typed } = await postGuestPixOrder(eventId, { cpf });

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.message).toMatch(/já possui inscrição/i);
      expect(mocks.createPayment).not.toHaveBeenCalled();
      expect(await orderCount(eventId)).toBe(1);
      const guest = await userRows(typed.email);
      for (const row of guest) expect(await ordersOf(row.id, eventId)).toHaveLength(0);
    });
  });

  describe("session handling", () => {
    it("with a session, a buyer with another e-mail is ignored: the order is the session user's and there is no token", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const user = await createPasswordUser({ complete: true });
      const other = buyer({ cpf: makeCpf(), address: ADDRESS });

      const res = await api("POST", "/api/orders", {
        token: user.token,
        body: { eventId, paymentMethod: "pix", buyer: other },
      });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.orderAccessToken).toBeUndefined();
      expect(await userRows(other.email)).toHaveLength(0);
      const orders = await ordersOf(user.id, eventId);
      expect(orders).toHaveLength(1);
      expect(orders[0].placed_as_guest).toBe(false);
    });

    it("an invalid Bearer with a valid buyer → 401", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const typed = buyer();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: "not-a-valid-token",
        body: { buyer: typed, turnstileToken: "ok" },
      });

      expect(res.status).toBe(401);
      expect(await userRows(typed.email)).toHaveLength(0);
    });
  });

  describe("a typed, empty or stale Authorization header never degrades to a guest", () => {
    type Presented = { token?: string; headers?: Record<string, string> };
    const kinds: Array<[string, (user: TestUser) => Promise<Presented>]> = [
      [
        "a password-reset token",
        async (user) => {
          const { signPasswordResetToken } = await import("../../middleware/auth");
          return { token: signPasswordResetToken({ id: user.id, password: "x" }) };
        },
      ],
      [
        "an order-access token",
        async () => {
          const { signOrderAccessToken } = await import("../../middleware/auth");
          return { token: signOrderAccessToken(randomUUID()) };
        },
      ],
      [
        "an e-mail-verification token",
        async (user) => {
          const { signEmailVerificationToken } = await import("../../middleware/auth");
          return { token: signEmailVerificationToken(user.id) };
        },
      ],
      ["an empty Bearer", async () => ({ headers: { Authorization: "Bearer " } })],
      [
        "a session token with a stale pv",
        async (user) => ({ token: jwt.sign({ userId: user.id, pv: "stale0000000" }, JWT_SECRET) }),
      ],
    ];

    for (const [label, present] of kinds) {
      it(`${label} on POST /api/events/:id/subscribe → 401, no row, no order`, async () => {
        const eventId = await createEvent({ modality: "online", isFree: true });
        const user = await createPasswordUser();
        const typed = buyer();

        const res = await api("POST", `/api/events/${eventId}/subscribe`, {
          ...(await present(user)),
          body: { buyer: typed, turnstileToken: "ok" },
        });

        expect(res.status).toBe(401);
        expect(await userRows(typed.email)).toHaveLength(0);
        expect(await orderCount(eventId)).toBe(0);
      });

      it(`${label} on POST /api/orders → 401, no row, no order, no Asaas call`, async () => {
        const eventId = await createEvent({ modality: "presencial", isFree: false });
        const user = await createPasswordUser();
        const typed = buyer({ cpf: makeCpf(), address: ADDRESS });

        const res = await api("POST", "/api/orders", {
          ...(await present(user)),
          body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok" },
        });

        expect(res.status).toBe(401);
        expect(await userRows(typed.email)).toHaveLength(0);
        expect(await orderCount(eventId)).toBe(0);
        expect(mocks.createPayment).not.toHaveBeenCalled();
      });
    }
  });

  describe("concurrency and limits", () => {
    it("5 concurrent free online guest subscribes for one new e-mail → exactly one users row", async () => {
      const events = await Promise.all(Array.from({ length: 5 }, () => createEvent({ modality: "online", isFree: true })));
      const email = guestEmail();

      const results = await Promise.all(events.map((eventId) => freeGuestSubscribe(eventId, buyer({ email }))));

      expect(results.map((r) => r.status), JSON.stringify(results.map((r) => r.body))).toEqual([201, 201, 201, 201, 201]);
      const rows = await userRows(email);
      expect(rows).toHaveLength(1);
      expect(await ordersOf(rows[0].id)).toHaveLength(5);
    });

    it("the guest limiter: the 6th guest request from one address → 429 rate_limited; a session request is not limited", async () => {
      const ip = randomIp();
      const eventId = await createEvent({ modality: "online", isFree: true });
      const user = await createPasswordUser({ complete: true });

      const statuses: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        statuses.push((await api("POST", `/api/events/${eventId}/subscribe`, { forwardedFor: ip, body: {} })).status);
      }
      const sixth = await api("POST", `/api/events/${eventId}/subscribe`, { forwardedFor: ip, body: {} });
      const authenticated = await api("POST", `/api/events/${eventId}/subscribe`, { forwardedFor: ip, token: user.token });

      expect(statuses).not.toContain(429);
      expect(sixth.status).toBe(429);
      expect(sixth.body.code).toBe("rate_limited");
      expect(authenticated.status).not.toBe(429);
    });

    it("3 pending guest PIX orders for one buyer and event, the 4th → 429 too_many_pending_orders and Asaas is called 3 times", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const typed = buyer({ cpf: makeCpf(), address: ADDRESS });
      const place = () =>
        api("POST", "/api/orders", { body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok" } });

      const statuses: number[] = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await place()).status);
      const fourth = await place();

      expect(statuses).toEqual([201, 201, 201]);
      expect(fourth.status).toBe(429);
      expect(fourth.body.code).toBe("too_many_pending_orders");
      expect(mocks.createPayment).toHaveBeenCalledTimes(3);
    });

    it("Turnstile false → a guest request is 403 turnstile_failed with no row; the same request with a session is not 403 (R1)", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const otherEvent = await createEvent({ modality: "online", isFree: true });
      const user = await createPasswordUser({ complete: true });
      const typed = buyer();
      mocks.verifyTurnstile.mockImplementation(async () => false);

      const guest = await api("POST", `/api/events/${eventId}/subscribe`, {
        body: { buyer: typed, turnstileToken: "bad-token" },
      });
      const session = await api("POST", `/api/events/${otherEvent}/subscribe`, {
        token: user.token,
        body: { turnstileToken: "bad-token" },
      });

      expect(guest.status).toBe(403);
      expect(guest.body.code).toBe("turnstile_failed");
      // Only the guest request is checked; the session request never reaches Turnstile (R1).
      expect(mocks.verifyTurnstile).toHaveBeenCalledTimes(1);
      expect(mocks.verifyTurnstile.mock.calls[0][0]).toBe("bad-token");
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(session.status).not.toBe(403);
      expect(session.status).toBe(201);
    });
  });

  describe("order-token check-status", () => {
    it("X-Order-Access on a pending order → 200 with only status and paymentStatus", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);

      const check = await api("POST", `/api/orders/${res.body.order.id}/check-status`, {
        headers: { "X-Order-Access": res.body.orderAccessToken },
      });

      expect(check.status, JSON.stringify(check.body)).toBe(200);
      expect(Object.keys(check.body).sort()).toEqual(["paymentStatus", "status"]);
      expect(check.body.status).toBe("pending");
    });

    it("the token of order X used on order Y → 404", async () => {
      const eventA = await createEvent({ modality: "presencial", isFree: false });
      const eventB = await createEvent({ modality: "presencial", isFree: false });
      const x = await placeGuestPixOrder(eventA);
      const y = await placeGuestPixOrder(eventB);

      const check = await api("POST", `/api/orders/${y.res.body.order.id}/check-status`, {
        headers: { "X-Order-Access": x.res.body.orderAccessToken },
      });

      expect(check.status).toBe(404);
    });

    it("a valid token for an order that does not exist → 404", async () => {
      const { signOrderAccessToken } = await import("../../middleware/auth");
      const orderId = randomUUID();

      const check = await api("POST", `/api/orders/${orderId}/check-status`, {
        headers: { "X-Order-Access": signOrderAccessToken(orderId) },
      });

      expect(check.status).toBe(404);
    });

    it("no order token and no session → 401", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);

      const check = await api("POST", `/api/orders/${res.body.order.id}/check-status`);

      expect(check.status).toBe(401);
    });

    it("an order token as Authorization: Bearer on /api/auth/me → 401", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);

      const me = await api("GET", "/api/auth/me", { token: res.body.orderAccessToken });

      expect(me.status).toBe(401);
    });

    it("two token check-status calls in a row ask Asaas once (15 s throttle)", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);
      const headers = { "X-Order-Access": res.body.orderAccessToken };

      const first = await api("POST", `/api/orders/${res.body.order.id}/check-status`, { headers });
      const second = await api("POST", `/api/orders/${res.body.order.id}/check-status`, { headers });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("pending");
      expect(mocks.getPayment).toHaveBeenCalledTimes(1);
    });

    it("after a paid webhook the status is paid and Asaas is not asked", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);
      const { rows } = await pool.query(`SELECT asaas_payment_id, amount FROM orders WHERE id = $1`, [res.body.order.id]);
      expect(
        await deliverWebhook({
          event: "PAYMENT_RECEIVED",
          payment: {
            id: rows[0].asaas_payment_id,
            billingType: "PIX",
            status: "RECEIVED",
            value: Number(rows[0].amount),
            externalReference: res.body.order.id,
          },
        }),
      ).toBe(200);
      mocks.getPayment.mockClear();

      const check = await api("POST", `/api/orders/${res.body.order.id}/check-status`, {
        headers: { "X-Order-Access": res.body.orderAccessToken },
      });

      expect(check.status).toBe(200);
      expect(check.body.status).toBe("paid");
      expect(mocks.getPayment).not.toHaveBeenCalled();
    });
  });

  describe("Meus Ingressos visibility", () => {
    it("a guest order on an unverified password account stays hidden through the ticket-mail link; only a password reset from the mailbox shows it", async () => {
      const { signEmailVerificationToken, signPasswordResetToken } = await import("../../middleware/auth");
      const eventId = await createEvent({
        modality: "online",
        isFree: true,
        certificateTemplateUrl: "https://s3.test/template.pdf",
      });
      // The squatter: anyone can register any e-mail and hold a live session on it.
      const squatEmail = guestEmail();
      const squat = await registerSquatter(squatEmail, "squatpass1");
      const account = { id: squat.user.id, token: squat.token, email: squatEmail };
      const sub = await freeGuestSubscribe(eventId, buyer({ email: account.email }));
      expect(sub.status, JSON.stringify(sub.body)).toBe(201);
      const [order] = await ordersOf(account.id, eventId);
      expect(order.placed_as_guest).toBe(true);
      // Attended: the certificate routes derive from orders with qr_code_used.
      await pool.query(`UPDATE orders SET qr_code_used = true WHERE id = $1`, [order.id]);
      const certificateBody = {
        eventId,
        npsType: "cdpi_event",
        answers: {
          name: "Maria Silva",
          email: account.email,
          phone: "5511987654321",
          workshopFeeling: "Gostei bastante",
          themesRelevant: "Sim",
          instructorsDidactics: "Boa",
          highlight: "ok",
          careerValue: "Em partes",
          wouldAttendAgain: "Talvez, depende do tema",
          supportRating: "Bom, mas pode melhorar",
          supportOtherText: "",
          messageToTeam: "",
          privacyConsent: true,
        },
      };

      const list = await api("GET", "/api/orders", { token: account.token });
      const detail = await api("GET", `/api/orders/${order.id}`, { token: account.token });
      const check = await api("POST", `/api/orders/${order.id}/check-status`, { token: account.token });
      const cancel = await api("DELETE", `/api/orders/${order.id}/cancel`, { token: account.token });

      const certificates = await api("GET", "/api/users/me/certificates", { token: account.token });
      const generate = await api("POST", "/api/certificates/generate", { token: account.token, body: certificateBody });

      expect(list.status).toBe(200);
      expect(list.body.orders.map((o: any) => o.id)).not.toContain(order.id);
      expect(list.body.totalPages).toBe(0);
      expect(certificates.status).toBe(200);
      expect(certificates.body.data).toEqual([]);
      expect(certificates.body.pagination.total).toBe(0);
      expect(generate.status).toBe(400);
      expect(generate.body.message).toMatch(/elegível/i);
      expect(detail.status).toBe(404);
      expect(check.status).toBe(404);
      expect(cancel.status).toBe(404);
      const stillThere = await pool.query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
      expect(stillThere.rows[0].status).toBe("paid");

      // The victim clicks the link from their ticket e-mail: no verification, a reset is mailed.
      mocks.sendPasswordResetEmail.mockClear();
      const verify = await api("GET", `/api/auth/verify-email?token=${signEmailVerificationToken(account.id)}`);
      expect(verify.status).toBe(409);
      expect(verify.body).toEqual({
        code: "password_reset_required",
        message: "Para ver seus ingressos, crie uma nova senha pelo link que enviamos para o seu e-mail.",
      });
      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendPasswordResetEmail).toHaveBeenLastCalledWith(expect.objectContaining({ email: account.email }), { purpose: "reset" });
      expect((await userRows(account.email))[0].email_verified).toBe(false);
      const stillHidden = await api("GET", "/api/orders", { token: account.token });
      expect(stillHidden.body.orders.map((o: any) => o.id)).not.toContain(order.id);

      // The mailbox owner completes the reset with the mailed link.
      const mailedUser = mocks.sendPasswordResetEmail.mock.calls[0][0] as { id: string; password: string };
      const reset = await api("POST", "/api/auth/reset-password", {
        body: { token: signPasswordResetToken(mailedUser), newPassword: "mailboxpass1" },
      });
      expect(reset.status, JSON.stringify(reset.body)).toBe(200);
      const oldSession = await api("GET", "/api/orders", { token: account.token });
      expect(oldSession.status).toBe(401);
      const login = await api("POST", "/api/auth/login", { body: { email: account.email, password: "mailboxpass1" } });
      expect(login.status).toBe(200);
      const fresh = login.body.token as string;

      const listAfter = await api("GET", "/api/orders", { token: fresh });
      const detailAfter = await api("GET", `/api/orders/${order.id}`, { token: fresh });
      expect(listAfter.body.orders.map((o: any) => o.id)).toContain(order.id);
      expect(detailAfter.status).toBe(200);
      expect(listAfter.body.totalPages).toBe(1);
      const certificatesAfter = await api("GET", "/api/users/me/certificates", { token: fresh });
      const generateAfter = await api("POST", "/api/certificates/generate", { token: fresh, body: certificateBody });
      expect(certificatesAfter.body.data.map((c: any) => c.eventId)).toEqual([eventId]);
      // Past the eligibility gate (it may still fail later on the unconfigured certificate service).
      expect(generateAfter.status).not.toBe(400);
    });

    it("the ticket-mail link still verifies an unverified row that has no password", async () => {
      const { signEmailVerificationToken } = await import("../../middleware/auth");
      const eventId = await createEvent({ modality: "online", isFree: true });
      const typed = buyer();
      const sub = await freeGuestSubscribe(eventId, typed);
      expect(sub.status).toBe(201);
      const row = (await userRows(typed.email))[0];
      const verify = await api("GET", `/api/auth/verify-email?token=${signEmailVerificationToken(row.id)}`);
      expect(verify.status).toBe(200);
      expect((await userRows(typed.email))[0].email_verified).toBe(true);
    });
  });

  describe("final review: mailbox proof before guest orders show", () => {
    it("C2: an unverified account cannot move its row to another e-mail (400 email_not_verified)", async () => {
      const victimEmail = guestEmail();
      const squat = await registerSquatter(victimEmail, "squatpass1");
      const ownEmail = guestEmail();
      const change = await api("PUT", "/api/profile", {
        token: squat.token,
        body: { email: ownEmail, currentPassword: "squatpass1" },
      });
      expect(change.status).toBe(400);
      expect(change.body.code).toBe("email_not_verified");
      expect(change.body.message).toBe(
        "Confirme seu e-mail atual antes de alterá-lo: use “Esqueci minha senha” para receber o link.",
      );
      expect((await userRows(victimEmail))[0].id).toBe(squat.user.id);
      expect(await userRows(ownEmail)).toHaveLength(0);
    });

    it("C2: a verified account that changes its e-mail is unverified afterwards and does not see the new address's guest order", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const reg = await registerSquatter(guestEmail(), "attack123");
      await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [reg.user.id]);
      const victimEmail = guestEmail();
      const change = await api("PUT", "/api/profile", {
        token: reg.token,
        body: { email: victimEmail, currentPassword: "attack123" },
      });
      expect(change.status, JSON.stringify(change.body)).toBe(200);
      expect((await userRows(victimEmail))[0].email_verified).toBe(false);
      const sub = await freeGuestSubscribe(eventId, buyer({ email: victimEmail }));
      expect(sub.status).toBe(201);
      const list = await api("GET", "/api/orders", { token: reg.token });
      expect(list.body.orders.map((o: any) => o.id)).not.toContain(sub.body.order.id);
    });

    it("C3: an unverified account that owns a guest order is not deleted; its password is cleared and the order survives", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const victimEmail = guestEmail();
      const squat = await registerSquatter(victimEmail, "squatpass1");
      const { res } = await placeGuestPixOrder(eventId, { email: victimEmail });
      const orderId = res.body.order.id;
      await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);
      const del = await api("DELETE", "/api/profile", { token: squat.token, body: { password: "squatpass1" } });
      expect(del.status).toBe(200);
      expect(del.body).toEqual({ message: "Conta excluída com sucesso" });
      const { rows } = await pool.query(`SELECT id, status FROM orders WHERE id = $1`, [orderId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("paid");
      const [row] = await userRows(victimEmail);
      expect(row.id).toBe(squat.user.id);
      expect(row.password).toBeNull();
      const after = await api("GET", "/api/orders", { token: squat.token });
      expect(after.status).toBe(401);
    });

    it("C3: an unverified account with no guest order is deleted as before", async () => {
      const squat = await registerSquatter(guestEmail(), "squatpass1");
      const del = await api("DELETE", "/api/profile", { token: squat.token, body: { password: "squatpass1" } });
      expect(del.status).toBe(200);
      const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1`, [squat.user.id]);
      expect(rows).toHaveLength(0);
    });

    it("I1: the admin reset link is accepted once and refused the second time", async () => {
      const admin = await createPasswordUser({ verified: true });
      await pool.query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);
      const target = await createPasswordUser({ verified: true });
      const gen = await api("POST", "/api/admin/generate-reset-link", { token: admin.token, body: { email: target.email } });
      expect(gen.status, JSON.stringify(gen.body)).toBe(200);
      const token = new URL(gen.body.resetUrl).searchParams.get("token")!;
      const first = await api("POST", "/api/auth/reset-password", { body: { token, newPassword: "abcdef1" } });
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      const second = await api("POST", "/api/auth/reset-password", { body: { token, newPassword: "abcdef2" } });
      expect(second.status).toBe(400);
    });

    it("I2: a guest typing an existing account's e-mail sends the typed name and phone to Asaas, not the account's", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const account = await createPasswordUser({ verified: true });
      const typedCpf = makeCpf();
      const r = await api("POST", "/api/orders", {
        body: {
          eventId,
          paymentMethod: "boleto",
          buyer: buyer({ email: account.email, name: "Guest Real Name", phone: "(21) 97777-6666", cpf: typedCpf, address: ADDRESS }),
          turnstileToken: "ok",
        },
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const customer = mocks.createPayment.mock.calls.at(-1)![0].customer;
      expect(customer.name).not.toBe("Conta Existente");
      expect(customer.name.toLowerCase()).toBe("guest real name");
      expect(customer.phone).not.toBe("5511999999999");
      expect(customer.phone).toContain("977776666");
      expect(customer.email).toBe(account.email);
      expect(customer.cpfCnpj).toBe(digitsOf(typedCpf));
    });

    it("M1: the guest 201 order carries no userId (paid and free)", async () => {
      const paidEvent = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(paidEvent);
      expect(res.body.order).not.toHaveProperty("userId");
      const freeEvent = await createEvent({ modality: "online", isFree: true });
      const sub = await freeGuestSubscribe(freeEvent, buyer());
      expect(sub.status).toBe(201);
      expect(sub.body.order).not.toHaveProperty("userId");
    });

    it("check-status by token always carries both keys", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res } = await placeGuestPixOrder(eventId);
      await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [res.body.order.id]);
      const check = await api("POST", `/api/orders/${res.body.order.id}/check-status`, {
        headers: { "X-Order-Access": res.body.orderAccessToken },
      });
      expect(check.status).toBe(200);
      expect(Object.keys(check.body).sort()).toEqual(["paymentStatus", "status"]);
      expect(check.body.paymentStatus).toBeNull();
    });
  });

  describe("password-less rows", () => {
    async function guestRowAfterFreeOrder() {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const typed = buyer();
      const res = await freeGuestSubscribe(eventId, typed);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const [row] = await userRows(typed.email);
      return { row, email: typed.email, eventId, orderId: res.body.order.id as string };
    }

    it("login on a guest row, with any password → 401 (not 500)", async () => {
      const { email } = await guestRowAfterFreeOrder();

      const login = await api("POST", "/api/auth/login", { body: { email, password: "qualquer-senha" } });
      const other = await api("POST", "/api/auth/login", { body: { email, password: "x" } });

      expect(login.status).toBe(401);
      expect(other.status).toBe(401);
    });

    it("register on a guest e-mail → 409 guest_account_claim, a create-password e-mail, the password stays NULL", async () => {
      const { email } = await guestRowAfterFreeOrder();

      const res = await api("POST", "/api/auth/register", {
        body: { name: "Quem Digitou", email, phone: "5511987654321", password: "senha-escolhida" },
      });

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe("guest_account_claim");
      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ email }), { purpose: "create" });
      const [row] = await userRows(email);
      expect(row.password).toBeNull();
    });

    it("reset-password with a token for the guest row → 200, then login works, the order is listed, and the link works once", async () => {
      const { signPasswordResetToken } = await import("../../middleware/auth");
      const { row, email, orderId } = await guestRowAfterFreeOrder();
      const token = signPasswordResetToken(row);

      const reset = await api("POST", "/api/auth/reset-password", { body: { token, newPassword: "senha-nova-123" } });
      const login = await api("POST", "/api/auth/login", { body: { email, password: "senha-nova-123" } });
      const list = await api("GET", "/api/orders", { token: login.body?.token });
      const again = await api("POST", "/api/auth/reset-password", { body: { token, newPassword: "outra-senha-456" } });

      expect(reset.status, JSON.stringify(reset.body)).toBe(200);
      expect(login.status).toBe(200);
      expect(list.body.orders.map((o: any) => o.id)).toContain(orderId);
      expect(again.status).toBe(400);
    });

    it("a session token signed for a guest row on PUT /api/profile/password and DELETE /api/profile → 400 password_not_set", async () => {
      const { signSessionToken } = await import("../../middleware/auth");
      const { row } = await guestRowAfterFreeOrder();
      const token = signSessionToken(row);

      const change = await api("PUT", "/api/profile/password", {
        token,
        body: { currentPassword: "qualquer", newPassword: "senha-nova-123" },
      });
      const remove = await api("DELETE", "/api/profile", { token, body: { password: "qualquer" } });
      const profile = await api("PUT", "/api/profile", {
        token,
        body: { name: "Outro Nome Completo", currentPassword: "qualquer" },
      });

      expect(change.status).toBe(400);
      expect(change.body.code).toBe("password_not_set");
      expect(remove.status).toBe(400);
      expect(remove.body.code).toBe("password_not_set");
      expect(profile.status).toBe(400);
      expect(profile.body.code).toBe("password_not_set");
    });

    it("forgot-password on a guest e-mail sends a create-password link; on a password account, a reset link", async () => {
      const { email } = await guestRowAfterFreeOrder();
      const account = await createPasswordUser();

      const guest = await api("POST", "/api/auth/forgot-password", { body: { email } });
      expect(guest.status).toBe(200);
      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendPasswordResetEmail).toHaveBeenLastCalledWith(expect.objectContaining({ email }), { purpose: "create" });

      mocks.sendPasswordResetEmail.mockClear();
      const reset = await api("POST", "/api/auth/forgot-password", { body: { email: account.email } });
      expect(reset.status).toBe(200);
      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [target, options] = mocks.sendPasswordResetEmail.mock.calls[0] as [{ email: string }, { purpose?: string } | undefined];
      expect(target.email).toBe(account.email);
      expect(options?.purpose ?? "reset").toBe("reset");
    });
  });

  describe("webhook", () => {
    it("a paid webhook on a guest PIX order e-mails the guest a Meus Ingressos link that makes the order visible", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const { res, buyer: typed } = await placeGuestPixOrder(eventId);
      const orderId = res.body.order.id as string;
      const { rows } = await pool.query(`SELECT asaas_payment_id, amount, user_id FROM orders WHERE id = $1`, [orderId]);

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

      const sent = confirmationsTo(typed.email);
      expect(sent).toHaveLength(1);
      const link: string = sent[0].data.myTicketsUrl;
      expect(link).toContain("/verify-email?token=");
      const token = new URL(link).searchParams.get("token")!;

      const before = await api("GET", `/api/orders/${orderId}`, {
        token: jwt.sign({ userId: rows[0].user_id }, JWT_SECRET),
      });
      const verify = await api("GET", `/api/auth/verify-email?token=${token}`);
      const after = await api("GET", `/api/orders/${orderId}`, {
        token: jwt.sign({ userId: rows[0].user_id }, JWT_SECRET),
      });

      expect(before.status).toBe(404);
      expect(verify.status).toBe(200);
      expect(after.status).toBe(200);
    });
  });
});
