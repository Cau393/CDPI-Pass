/**
 * ADR-017 Stage 3: inline card charge on POST /api/orders against the REAL Express routes, a REAL
 * PostgreSQL and the REAL asaasService. Only the network is faked: a global `fetch` stub answers the
 * Asaas base URL (customers, payments, installments) and records each request body in memory, so the
 * real request builder, the real error handling and their logging are all inside the PCI proofs.
 * Skipped unless VERIFY_DATABASE_URL points at a throwaway database:
 *
 *   VERIFY_DATABASE_URL=postgresql://postgres@localhost:55434/cdpi \
 *     pnpm exec vitest run --config vitest.server.config.ts server/test/integration/cardCheckout
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production): this test
 * writes and deletes rows. The card numbers below are test constants, never real cards.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { randomUUID, randomInt } from "crypto";

import { requestErrorHandler } from "../../utils/requestErrorHandler";

const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error(
    "VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.",
  );
}

const JWT_SECRET = "integration-test-secret";
const WEBHOOK_TOKEN = "integration-webhook-token-0123456789abcdef";
const ASAAS_BASE = "https://asaas.test/v3";
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATABASE_URL = VERIFY_URL ?? "postgresql://unused";
// The asaasService singleton reads these when it is first imported (inside beforeAll).
process.env.ASAAS_API_KEY = "test-key-not-used";
process.env.ASAAS_API_URL = ASAAS_BASE;
process.env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
// The card limiters (5 per e-mail, 10 per IP per hour) and the guest limiter keep their defaults here.

// Test cards, all Luhn-valid. The approved one is distinctive so a leak is unambiguous.
const PAN_OK = "4539578763621486";
const PAN_RISK = "4000000000009995";
const PAN_DECLINE = "4000000000000002";
const CCV = "6024";
const EXPIRY_MONTH = "09";
const EXPIRY_YEAR = String(new Date().getUTCFullYear() + 5);
/** What the fake Asaas returns as `creditCard.creditCardToken`: a reusable charge token. */
const ASAAS_CARD_TOKEN = "tok_leakcheck_9f3a7c21e4";

vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

const mocks = vi.hoisted(() => ({
  /** A real Turnstile would reject a missing token: only "ok" passes. */
  verifyTurnstile: vi.fn(async (..._args: unknown[]) => true),
  sendPasswordResetEmail: vi.fn(async (..._args: unknown[]) => true),
  sendTicketEmail: vi.fn(async (..._args: unknown[]) => true),
  sendOnlineEventEmail: vi.fn(async (..._args: unknown[]) => true),
  sendCardPaymentLinkEmail: vi.fn(async (..._args: unknown[]) => true),
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
    sendCardPaymentLinkEmail: (...args: unknown[]) => mocks.sendCardPaymentLinkEmail(...args),
    sendEmail: vi.fn(async () => true),
    sendVerificationEmail: vi.fn(async () => true),
  },
}));

// asaasService is deliberately NOT mocked (Ruling R17).

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
const realFetch = globalThis.fetch;

/** Rows created by this suite, removed in afterAll. */
const createdEventIds: string[] = [];
const createdUserIds: string[] = [];
const createdEmails: string[] = [];

// ---------------------------------------------------------------------------------------------
// Fake Asaas (in memory only)
// ---------------------------------------------------------------------------------------------

interface AsaasRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
}

/** Every request the app sent to the fake Asaas; cleared before each test. Never written to disk. */
const asaasRequests: AsaasRequest[] = [];
/** installment id -> plan, so GET /payments?installment= answers like Asaas. */
const installmentPlans = new Map<string, { count: number; each: number }>();
const asaasPayments = new Map<string, { id: string; status: string; value: number }>();
let asaasSeq = 0;

function asaasJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeAsaas(method: string, path: string, query: Record<string, string>, body: any): Response {
  asaasRequests.push({ method, path, query, body });

  if (path === "/customers" && method === "GET") return asaasJson(200, { data: [] });
  if (path === "/customers" && method === "POST") return asaasJson(200, { id: `cus_card_${++asaasSeq}` });

  if (path === "/payments" && method === "POST") {
    const id = `pay_card_${++asaasSeq}`;
    const card = body?.creditCard;
    if (!card) {
      // PIX, boleto and the foreign hosted invoice.
      return asaasJson(200, { id, status: "PENDING", value: body.value, invoiceUrl: `https://asaas.test/i/${id}`, bankSlipUrl: `https://asaas.test/b/${id}` });
    }
    if (card.number === PAN_DECLINE) {
      return asaasJson(400, { errors: [{ code: "invalid_creditCard", description: "Transação não autorizada." }] });
    }
    const count = Number(body.installmentCount ?? 1);
    const total = count > 1 ? Number(body.totalValue) : Number(body.value);
    const each = total / count;
    const installment = count > 1 ? `ins_card_${++asaasSeq}` : null;
    if (installment) installmentPlans.set(installment, { count, each });
    const status = card.number === PAN_RISK ? "AWAITING_RISK_ANALYSIS" : "CONFIRMED";
    asaasPayments.set(id, { id, status, value: each });
    return asaasJson(200, {
      id,
      status,
      value: each,
      installment,
      billingType: "CREDIT_CARD",
      creditCard: { creditCardNumber: card.number.slice(-4), creditCardBrand: "VISA", creditCardToken: ASAAS_CARD_TOKEN },
    });
  }

  const pix = /^\/payments\/([^/]+)\/pixQrCode$/.exec(path);
  if (pix && method === "GET") {
    return asaasJson(200, { encodedImage: "AAAA", payload: "00020126pixpayload", expirationDate: "2030-01-01 00:00:00" });
  }
  if (path === "/payments" && method === "GET" && query.installment) {
    const plan = installmentPlans.get(query.installment);
    return asaasJson(200, { data: Array.from({ length: plan?.count ?? 0 }, () => ({ value: plan?.each })) });
  }
  const one = /^\/payments\/([^/]+)$/.exec(path);
  if (one && method === "GET") {
    const known = asaasPayments.get(one[1]);
    return known ? asaasJson(200, known) : asaasJson(404, { errors: [] });
  }
  throw new Error(`fake Asaas: unexpected request ${method} ${path}`);
}

/** Test hooks on POST /payments with a card: a failure to simulate, or code to run before Asaas answers. */
const cardHooks: {
  failure: "network" | "503" | null;
  /** Answer POST /customers with a 503. */
  customerFailure: boolean;
  beforeAnswer: ((body: any, answer: any) => Promise<void>) | null;
} = { failure: null, customerFailure: false, beforeAnswer: null };

/** Answers the Asaas base URL, passes the test's own calls to the local server, throws on anything else. */
const stubbedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === "127.0.0.1") return realFetch(input, init);
  if (`${url.origin}${url.pathname}`.startsWith(ASAAS_BASE)) {
    const path = url.pathname.slice(new URL(ASAAS_BASE).pathname.length);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (cardHooks.customerFailure && (init?.method ?? "GET") === "POST" && path === "/customers") {
      asaasRequests.push({ method: "POST", path, query: {}, body });
      return asaasJson(503, {});
    }
    const isCardCharge = (init?.method ?? "GET") === "POST" && path === "/payments" && Boolean(body?.creditCard);
    if (isCardCharge && cardHooks.failure === "network") {
      asaasRequests.push({ method: "POST", path, query: {}, body });
      throw new TypeError("fetch failed");
    }
    if (isCardCharge && cardHooks.failure === "503") {
      asaasRequests.push({ method: "POST", path, query: {}, body });
      return asaasJson(503, {});
    }
    const answer = fakeAsaas(init?.method ?? "GET", path, Object.fromEntries(url.searchParams), body);
    if (isCardCharge && cardHooks.beforeAnswer && answer.ok) await cardHooks.beforeAnswer(body, await answer.clone().json());
    return answer;
  }
  throw new Error(`unexpected outbound fetch to ${url.origin}`);
}) as typeof fetch;

const asaasCalls = (method: string, path: string) => asaasRequests.filter((r) => r.method === method && r.path === path);
const asaasCharges = () => asaasCalls("POST", "/payments");

// ---------------------------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------------------------

/** A fresh client address per request, so every test has its own limiter buckets. */
function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** Every response body (stringified) the server sent during the test, for the echo checks. */
const responseTexts: string[] = [];

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
  responseTexts.push(text);
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
  responseTexts.push(await res.text());
  return res.status;
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

async function createEvent(opts: { modality?: "presencial" | "online"; price?: string } = {}): Promise<string> {
  const id = randomUUID();
  const modality = opts.modality ?? "presencial";
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, meeting_url, registration_form, current_attendees)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste',$4,true,'cdpi_event',false,$5,$6,'[]'::jsonb,0)`,
    [
      id,
      `[TEST] Cartao ${id.slice(0, 8)}`,
      new Date(Date.now() + 7 * 86400_000),
      opts.price ?? "100.00",
      modality,
      modality === "online" ? "https://meet.test/sala" : null,
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
  const email = `card-${randomUUID().slice(0, 8)}@example.test`;
  createdEmails.push(email);
  return email;
}

type Buyer = Record<string, unknown> & { email: string; cpf?: string };

function buyer(overrides: Record<string, unknown> = {}): Buyer {
  return {
    name: "comprador convidado",
    email: guestEmail(),
    phone: "(11) 98765-4321",
    cpf: makeCpf(),
    address: ADDRESS,
    ...overrides,
  } as Buyer;
}

type TestUser = { id: string; token: string; email: string; cpf: string };

/** An account with a password, a CPF and an address (so a session order needs nothing else). */
async function createPasswordUser(emailFor: (id: string) => string = (id) => `acct-${id.slice(0, 8)}@example.test`): Promise<TestUser> {
  const id = randomUUID();
  const email = emailFor(id);
  const cpf = makeCpf();
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, address)
     VALUES ($1,$2,true,'x','Conta Existente',$3,'5511999999999',$4)`,
    [id, email, cpf, ADDRESS],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email, cpf };
}

async function userRows(email: string) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows;
}

async function orderRow(orderId: string) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  return rows[0];
}

async function orderCount(eventId: string): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM orders WHERE event_id = $1`, [eventId]);
  return rows[0].n;
}

/** Calls of the ticket / online-event e-mail spies addressed to `to`. */
function confirmationsTo(to: string): unknown[] {
  return [...mocks.sendTicketEmail.mock.calls, ...mocks.sendOnlineEventEmail.mock.calls].filter((call) => call[0] === to);
}

interface CardOptions {
  /** A guest buyer; omit for a session request. */
  typed?: Buyer;
  token?: string;
  turnstileToken?: string | null;
  number?: string;
  installmentCount?: unknown;
  card?: Record<string, unknown> | null;
  cardHolder?: Record<string, unknown> | null;
  paymentMethod?: string;
  forwardedFor?: string;
  holderCpf?: string;
}

/** POST /api/orders as a card order. `card: null` / `cardHolder: null` drop the whole object. */
async function submitCard(eventId: string, opts: CardOptions = {}) {
  const body: Record<string, unknown> = {
    eventId,
    paymentMethod: opts.paymentMethod ?? "credit_card",
    ...(opts.turnstileToken === null ? {} : { turnstileToken: opts.turnstileToken ?? "ok" }),
  };
  if (opts.typed) body.buyer = opts.typed;
  if (opts.card !== null) {
    body.card = {
      holderName: "COMPRADOR CONVIDADO",
      number: opts.number ?? PAN_OK,
      expiryMonth: EXPIRY_MONTH,
      expiryYear: EXPIRY_YEAR,
      ccv: CCV,
      ...opts.card,
    };
  }
  if (opts.cardHolder !== null) {
    body.cardHolder = {
      name: "Comprador Convidado",
      cpf: opts.holderCpf ?? opts.typed?.cpf ?? makeCpf(),
      postalCode: "01310-100",
      addressNumber: "100",
      ...opts.cardHolder,
    };
  }
  if (opts.installmentCount !== undefined) body.installmentCount = opts.installmentCount;
  return api("POST", "/api/orders", { token: opts.token, body, forwardedFor: opts.forwardedFor });
}

/** A guest card order that must succeed; fails here, not later, if it does not. */
async function placeGuestCardOrder(eventId: string, opts: CardOptions = {}) {
  const typed = opts.typed ?? buyer();
  const res = await submitCard(eventId, { ...opts, typed });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { res, typed };
}

async function postGuestPix(eventId: string, typed: Buyer, forwardedFor?: string) {
  return api("POST", "/api/orders", {
    body: { eventId, paymentMethod: "pix", buyer: typed, turnstileToken: "ok" },
    forwardedFor,
  });
}

function cardWebhook(event: string, orderId: string, paymentId: string, value: number, installment: string | null = null) {
  return {
    event,
    payment: {
      id: paymentId,
      billingType: "CREDIT_CARD",
      status: event === "PAYMENT_RECEIVED" ? "RECEIVED" : "CONFIRMED",
      value,
      installment,
      externalReference: orderId,
      paymentLink: null,
      creditCard: { creditCardNumber: PAN_OK.slice(-4), creditCardBrand: "VISA", creditCardToken: ASAAS_CARD_TOKEN },
    },
  };
}

/** A card webhook with any event name and payment status. */
function cardEvent(event: string, status: string, orderId: string, paymentId: string, value: number) {
  const base = cardWebhook("PAYMENT_CONFIRMED", orderId, paymentId, value);
  return { event, payment: { ...base.payment, status } };
}

/** UUIDs and the like are hex, so a 4-digit CVV can occur inside one by chance: look at it without them. */
function stripIds(text: string): string {
  return text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
}

/** Which card secrets appear in `text`: the PAN, the CVV (as a standalone number), the Asaas token. */
function leaksIn(text: string): string[] {
  const clean = stripIds(text);
  const found: string[] = [];
  if (clean.includes(PAN_OK) || clean.includes(PAN_RISK) || clean.includes(PAN_DECLINE)) found.push("pan");
  if (new RegExp(`(?<!\\d)${CCV}(?!\\d)`).test(clean)) found.push("ccv");
  if (clean.includes(ASAAS_CARD_TOKEN)) found.push("token");
  return found;
}

describe.skipIf(!enabled)("inline card checkout (real routes + real asaasService + real DB, fake Asaas fetch)", () => {
  beforeAll(async () => {
    for (const name of AWS_ENV_NAMES) {
      savedAwsEnv[name] = process.env[name];
      delete process.env[name];
    }
    vi.stubGlobal("fetch", stubbedFetch);
    pool = new Pool({ connectionString: VERIFY_URL });
    const { registerRoutes } = await import("../../routes");
    const app = express();
    // As in server/index.ts: one proxy hop (nginx), which appends the peer address.
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    // As in server/index.ts, after the routes.
    app.use(requestErrorHandler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  beforeEach(() => {
    mocks.verifyTurnstile.mockReset();
    mocks.verifyTurnstile.mockImplementation(async (token: unknown) => token === "ok");
    mocks.sendPasswordResetEmail.mockClear();
    mocks.sendTicketEmail.mockClear();
    mocks.sendOnlineEventEmail.mockClear();
    mocks.sendCardPaymentLinkEmail.mockClear();
    mocks.foreignPaidEnabled.value = false;
    mocks.sendTicketEmail.mockImplementation(async () => true);
    cardHooks.failure = null;
    cardHooks.customerFailure = false;
    cardHooks.beforeAnswer = null;
    asaasRequests.length = 0;
    responseTexts.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
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

  describe("approved card", () => {
    it("guest CONFIRMED: 201 with the order already paid, one ticket e-mail, and later webhooks change nothing", async () => {
      const eventId = await createEvent();

      const { res, typed } = await placeGuestCardOrder(eventId);

      expect(Object.keys(res.body).slice(0, 2)).toEqual(["order", "orderAccessToken"]);
      expect(res.body.order.status).toBe("paid");
      expect(res.body.payment).toMatchObject({ status: "CONFIRMED", installmentCount: 1 });
      expect(res.body.payment.id).toMatch(/^pay_card_/);
      expect(Object.keys(res.body.payment).sort()).toEqual(["id", "installmentCount", "status", "value"]);
      expect(res.body.link).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/paymentLink/);
      const row = await orderRow(res.body.order.id);
      expect(row.status).toBe("paid");
      expect(row.asaas_payment_id).toBe(res.body.payment.id);
      expect(row.payment_method).toBe("credit_card");
      expect(row.placed_as_guest).toBe(true);
      expect(confirmationsTo(typed.email)).toHaveLength(1);
      expect(mocks.sendCardPaymentLinkEmail).not.toHaveBeenCalled();

      const value = Number(row.amount);
      expect(await deliverWebhook(cardWebhook("PAYMENT_CONFIRMED", row.id, row.asaas_payment_id, value))).toBe(200);
      expect(await deliverWebhook(cardWebhook("PAYMENT_RECEIVED", row.id, row.asaas_payment_id, value))).toBe(200);

      expect((await orderRow(row.id)).status).toBe("paid");
      expect(confirmationsTo(typed.email)).toHaveLength(1);
      const { rows } = await pool.query(`SELECT current_attendees FROM events WHERE id = $1`, [eventId]);
      expect(rows[0].current_attendees).toBe(1);
    });

    it("session CONFIRMED (password account, Turnstile passed): 201 paid, no orderAccessToken", async () => {
      const eventId = await createEvent();
      const user = await createPasswordUser();

      const res = await submitCard(eventId, { token: user.token, holderCpf: user.cpf });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.order.status).toBe("paid");
      expect(res.body.orderAccessToken).toBeUndefined();
      expect(res.body.payment).toMatchObject({ status: "CONFIRMED", installmentCount: 1 });
      expect(confirmationsTo(user.email)).toHaveLength(1);
      expect(mocks.verifyTurnstile).toHaveBeenCalled();
      // The session customer is looked up by CPF (reused), unlike a guest's.
      expect(asaasCalls("GET", "/customers")).toHaveLength(1);
    });

    it("3 installments CONFIRMED: paid, and Asaas gets installmentCount 3 with totalValue and no value", async () => {
      const eventId = await createEvent();

      const { res } = await placeGuestCardOrder(eventId, { installmentCount: 3 });

      const row = await orderRow(res.body.order.id);
      expect(res.body.order.status).toBe("paid");
      expect(res.body.payment.installmentCount).toBe(3);
      const [charge] = asaasCharges();
      expect(charge.body).toMatchObject({ billingType: "CREDIT_CARD", installmentCount: 3, totalValue: Number(row.amount) });
      expect(charge.body).not.toHaveProperty("value");
      // The paid check sums the plan through GET /payments?installment=.
      expect(asaasRequests.some((r) => r.method === "GET" && r.path === "/payments" && r.query.installment)).toBe(true);
    });

    it("the Asaas request carries the forwarded IP, the typed e-mail, and a guest customer made from the typed contact", async () => {
      const eventId = await createEvent();
      const ip = "10.77.66.55";
      const typed = buyer();

      await placeGuestCardOrder(eventId, { typed, forwardedFor: ip, cardHolder: { postalCode: "01310-100", addressNumber: "42" } });

      const [charge] = asaasCharges();
      expect(charge.body.remoteIp).toBe(ip);
      expect(charge.body.creditCardHolderInfo).toMatchObject({
        name: "Comprador Convidado",
        email: typed.email,
        cpfCnpj: digitsOf(typed.cpf!),
        postalCode: "01310100",
        addressNumber: "42",
      });
      expect(charge.body.creditCardHolderInfo.phone).toMatch(/^\d+$/);
      expect(charge.body.creditCard).toMatchObject({ number: PAN_OK, ccv: CCV, expiryMonth: EXPIRY_MONTH, expiryYear: EXPIRY_YEAR });
      expect(charge.body.externalReference).toEqual(expect.any(String));
      // A guest customer is created from the typed contact and never looked up by CPF.
      expect(asaasCalls("GET", "/customers")).toHaveLength(0);
      const [customer] = asaasCalls("POST", "/customers");
      expect(customer.body).toMatchObject({ email: typed.email, cpfCnpj: digitsOf(typed.cpf!) });
      expect(customer.body.phone).toMatch(/^\d+$/);
    });
  });

  describe("risk analysis", () => {
    it("AWAITING_RISK_ANALYSIS: 201 with the order still pending and no e-mail; the webhook then pays it, with one e-mail", async () => {
      const eventId = await createEvent();

      const { res, typed } = await placeGuestCardOrder(eventId, { number: PAN_RISK });

      expect(res.body.order.status).toBe("pending");
      expect(res.body.payment.status).toBe("AWAITING_RISK_ANALYSIS");
      expect(typeof res.body.orderAccessToken).toBe("string");
      expect(confirmationsTo(typed.email)).toHaveLength(0);
      const row = await orderRow(res.body.order.id);
      expect(row.status).toBe("pending");
      expect(row.asaas_payment_id).toBe(res.body.payment.id);

      expect(await deliverWebhook(cardWebhook("PAYMENT_CONFIRMED", row.id, row.asaas_payment_id, Number(row.amount)))).toBe(200);

      expect((await orderRow(row.id)).status).toBe("paid");
      expect(confirmationsTo(typed.email)).toHaveLength(1);
    });
  });

  describe("declined card", () => {
    it("Asaas 400: 402 card_declined, the order row is gone, and a retry with the approved card is a fresh paid order", async () => {
      const eventId = await createEvent();
      const typed = buyer();

      const declined = await submitCard(eventId, { typed, number: PAN_DECLINE });

      expect(declined.status).toBe(402);
      expect(declined.body).toEqual({
        code: "card_declined",
        message: "Pagamento não aprovado. Confira os dados do cartão ou use outro cartão.",
      });
      expect(await orderCount(eventId)).toBe(0);
      expect(confirmationsTo(typed.email)).toHaveLength(0);

      const retry = await submitCard(eventId, { typed, number: PAN_OK });

      expect(retry.status, JSON.stringify(retry.body)).toBe(201);
      expect(retry.body.order.status).toBe("paid");
      expect(await orderCount(eventId)).toBe(1);
      expect(confirmationsTo(typed.email)).toHaveLength(1);
    });
  });

  describe("limits", () => {
    it("the 6th card submit for one e-mail within the hour (5 declines from different IPs) → 429 rate_limited", async () => {
      const eventId = await createEvent();
      const typed = buyer();

      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await submitCard(eventId, { typed, number: PAN_DECLINE })).status);
      }
      const sixth = await submitCard(eventId, { typed, number: PAN_OK });

      expect(statuses).toEqual([402, 402, 402, 402, 402]);
      expect(sixth.status).toBe(429);
      expect(sixth.body).toEqual({ code: "rate_limited", message: "Muitas tentativas. Tente novamente em alguns minutos." });
      expect(asaasCharges()).toHaveLength(5);
      expect(await orderCount(eventId)).toBe(0);
    });

    it("the e-mail bucket ignores the case of a session e-mail: the lower-case guest form shares it", async () => {
      const eventId = await createEvent();
      const user = await createPasswordUser((id) => `Acct-${id.slice(0, 8)}@Example.Test`);
      for (let i = 0; i < 5; i++) {
        expect((await submitCard(eventId, { token: user.token, number: PAN_DECLINE, cardHolder: { cpf: user.cpf } })).status).toBe(402);
      }

      const guest = await submitCard(eventId, { typed: buyer({ email: user.email.toLowerCase() }) });

      expect(guest.status).toBe(429);
      expect(guest.body.code).toBe("rate_limited");
    });

    it("the 11th card submit from one IP (different e-mails) → 429 rate_limited", async () => {
      const eventId = await createEvent();
      const ip = `10.${randomInt(0, 256)}.${randomInt(0, 256)}.250`;

      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        statuses.push((await submitCard(eventId, { typed: buyer(), number: PAN_DECLINE, forwardedFor: ip })).status);
      }
      const eleventh = await submitCard(eventId, { typed: buyer(), number: PAN_DECLINE, forwardedFor: ip });

      expect(statuses.every((s) => s === 402)).toBe(true);
      expect(eleventh.status).toBe(429);
      expect(eleventh.body.code).toBe("rate_limited");
    });

    it("PIX requests are not counted by either card limiter", async () => {
      const ip = `10.${randomInt(0, 256)}.${randomInt(0, 256)}.249`;
      const repeated = buyer();
      // Six PIX orders for one e-mail (over the 5 per e-mail) on six events, then more e-mails from the
      // same IP, 12 PIX requests in total (over the 10 per IP).
      for (let i = 0; i < 6; i++) {
        const res = await postGuestPix(await createEvent(), repeated, ip);
        expect(res.status, JSON.stringify(res.body)).toBe(201);
      }
      const eventId = await createEvent();
      for (let i = 0; i < 6; i++) {
        const res = await postGuestPix(eventId, buyer(), ip);
        expect(res.status, JSON.stringify(res.body)).toBe(201);
      }

      const card = await submitCard(eventId, { typed: repeated, forwardedFor: ip });

      expect(card.status, JSON.stringify(card.body)).toBe(201);
    });
  });

  describe("Turnstile", () => {
    it("a card submit without a valid Turnstile token → 403 turnstile_failed for a guest and for a session; nothing is written", async () => {
      const eventId = await createEvent();
      const typed = buyer();
      const user = await createPasswordUser();

      const guest = await submitCard(eventId, { typed, turnstileToken: null });
      const guestBad = await submitCard(eventId, { typed, turnstileToken: "not-ok" });
      const session = await submitCard(eventId, { token: user.token, holderCpf: user.cpf, turnstileToken: null });

      for (const res of [guest, guestBad, session]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("turnstile_failed");
      }
      expect(await orderCount(eventId)).toBe(0);
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(asaasRequests).toHaveLength(0);
    });

    it("a session PIX order still needs no Turnstile", async () => {
      const eventId = await createEvent();
      const user = await createPasswordUser();

      const res = await api("POST", "/api/orders", { token: user.token, body: { eventId, paymentMethod: "pix" } });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    });
  });

  describe("invalid card data", () => {
    it.each([
      ["4 installments", { installmentCount: 4 }],
      ["a number that fails Luhn", { number: "4539578763621487" }],
      ["a missing cardHolder", { cardHolder: null }],
      ["a missing card", { card: null }],
      ["a 2 digit CVV", { card: { ccv: "12" } }],
      ["an expired card", { card: { expiryMonth: "01", expiryYear: "2020" } }],
      ["an invalid holder CPF", { cardHolder: { cpf: "111.111.111-11" } }],
    ] as Array<[string, Partial<CardOptions>]>)("%s → 400 invalid_card, with no user row, no order and no Asaas call", async (_label, over) => {
      const eventId = await createEvent();
      const typed = buyer();

      const res = await submitCard(eventId, { typed, ...over });

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body).toEqual({ code: "invalid_card", message: "Confira os dados do cartão e do titular." });
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(await orderCount(eventId)).toBe(0);
      expect(asaasRequests).toHaveLength(0);
    });

    it("a session card order with invalid data is 400 invalid_card and writes no order", async () => {
      const eventId = await createEvent();
      const user = await createPasswordUser();

      const res = await submitCard(eventId, { token: user.token, holderCpf: user.cpf, installmentCount: 4 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("invalid_card");
      expect(await orderCount(eventId)).toBe(0);
      expect(asaasRequests).toHaveLength(0);
    });
  });

  describe("Asaas docs amendments (A1 to A5)", () => {
    it("A1: the card charge's dueDate is the +7 day date of PIX/boleto, not today", async () => {
      const eventId = await createEvent();

      await placeGuestCardOrder(eventId);

      const [charge] = asaasCharges();
      const days = (Date.parse(charge.body.dueDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400_000;
      expect(charge.body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(days).toBeGreaterThanOrEqual(6);
      expect(days).toBeLessThanOrEqual(8);
    });

    it("A2: PAYMENT_CONFIRMED arriving before Asaas answers the charge → 201 paid, one ticket e-mail, and the QR already stored", async () => {
      const eventId = await createEvent();
      const typed = buyer();
      const qrWhenEmailed: Array<string | null> = [];
      let racedOrderId = "";
      mocks.sendTicketEmail.mockImplementation(async () => {
        qrWhenEmailed.push((await orderRow(racedOrderId)).qr_code_data);
        return true;
      });
      cardHooks.beforeAnswer = async (body, answer) => {
        racedOrderId = body.externalReference;
        const raced = await orderRow(racedOrderId);
        const status = await deliverWebhook({
          event: "PAYMENT_CONFIRMED",
          payment: { ...cardWebhook("PAYMENT_CONFIRMED", racedOrderId, answer.id, Number(raced.amount)).payment, installment: null },
        });
        expect(status).toBe(200);
      };

      const { res } = await placeGuestCardOrder(eventId, { typed });

      expect(res.body.order.status).toBe("paid");
      expect(confirmationsTo(typed.email)).toHaveLength(1);
      expect(qrWhenEmailed).toHaveLength(1);
      expect(qrWhenEmailed[0]).toEqual(expect.any(String));
      expect(qrWhenEmailed[0]).not.toBe("");
      expect((await orderRow(res.body.order.id)).status).toBe("paid");
    });

    it.each([["network error", "network"], ["503", "503"]] as const)(
      "A3: a %s on POST /payments → 5xx, the order is kept pending with no e-mail; a later PAYMENT_CONFIRMED by externalReference pays it",
      async (_label, failure) => {
        const eventId = await createEvent();
        const typed = buyer();
        cardHooks.failure = failure;

        const res = await submitCard(eventId, { typed });

        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(res.status).toBeLessThan(600);
        expect(JSON.stringify(res.body)).not.toContain("fetch failed");
        expect(await orderCount(eventId)).toBe(1);
        const { rows } = await pool.query(`SELECT * FROM orders WHERE event_id = $1`, [eventId]);
        expect(rows[0].status).toBe("pending");
        expect(rows[0].asaas_payment_id).toBeNull();
        expect(confirmationsTo(typed.email)).toHaveLength(0);

        cardHooks.failure = null;
        const status = await deliverWebhook(
          cardEvent("PAYMENT_CONFIRMED", "CONFIRMED", rows[0].id, "pay_late_charge_1", Number(rows[0].amount)),
        );

        expect(status).toBe(200);
        expect((await orderRow(rows[0].id)).status).toBe("paid");
        expect(confirmationsTo(typed.email)).toHaveLength(1);
      },
    );

    it("a customer creation failure (nothing charged) deletes the order, unlike an unknown charge outcome", async () => {
      const eventId = await createEvent();
      cardHooks.customerFailure = true;

      const res = await submitCard(eventId, { typed: buyer() });

      expect(res.status).toBe(502);
      expect(asaasCharges()).toHaveLength(0);
      expect(await orderCount(eventId)).toBe(0);
    });

    it("an error after the charge (asaasPaymentId write) keeps the order; the webhook then pays it, with one e-mail", async () => {
      const logged: string[] = [];
      for (const method of ["log", "info", "warn", "error", "debug"] as const) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
      }
      const { storage } = await import("../../storage");
      const original = storage.updateOrder.bind(storage);
      let failed = false;
      vi.spyOn(storage, "updateOrder").mockImplementation(async (id: string, data: any) => {
        if (!failed && data && "asaasPaymentId" in data) {
          failed = true;
          throw new Error("db hiccup after charge");
        }
        return original(id, data);
      });
      const eventId = await createEvent();
      const typed = buyer();

      const res = await submitCard(eventId, { typed });

      expect(failed).toBe(true);
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(asaasCharges()).toHaveLength(1);
      expect(await orderCount(eventId)).toBe(1);
      const { rows } = await pool.query(`SELECT * FROM orders WHERE event_id = $1`, [eventId]);
      expect(rows[0].status).toBe("pending");
      expect(leaksIn(logged.join("\n"))).toEqual([]);

      const status = await deliverWebhook(
        cardEvent("PAYMENT_CONFIRMED", "CONFIRMED", rows[0].id, "pay_after_charge_1", Number(rows[0].amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(rows[0].id)).status).toBe("paid");
      expect(confirmationsTo(typed.email)).toHaveLength(1);
    });

    it("sends an E.164 guest phone to Asaas in the national form", async () => {
      const eventId = await createEvent();

      await placeGuestCardOrder(eventId, { typed: buyer({ phone: "+55 11 98765-4321" }) });

      expect(asaasCalls("POST", "/customers")[0].body.phone).toBe("11987654321");
      expect(asaasCharges()[0].body.creditCardHolderInfo.phone).toBe("11987654321");
    });

    it("A5: PAYMENT_APPROVED_BY_RISK_ANALYSIS (CONFIRMED) on an already cancelled order logs REFUND_NEEDED and does not pay it", async () => {
      const logged: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
      const eventId = await createEvent();
      const { res, typed } = await placeGuestCardOrder(eventId, { number: PAN_RISK });
      const row = await orderRow(res.body.order.id);
      await deliverWebhook(
        cardEvent("PAYMENT_REPROVED_BY_RISK_ANALYSIS", "REFUSED", row.id, row.asaas_payment_id, Number(row.amount)),
      );
      expect((await orderRow(row.id)).status).toBe("cancelled");

      const status = await deliverWebhook(
        cardEvent("PAYMENT_APPROVED_BY_RISK_ANALYSIS", "CONFIRMED", row.id, row.asaas_payment_id, Number(row.amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(row.id)).status).toBe("cancelled");
      expect(confirmationsTo(typed.email)).toHaveLength(0);
      expect(logged.some((line) => line.includes(`REFUND_NEEDED order=${row.id}`))).toBe(true);
    });

    it("A4: AWAITING_RISK_ANALYSIS then PAYMENT_REPROVED_BY_RISK_ANALYSIS → cancelled, no e-mail, and the pending cap no longer counts it", async () => {
      const eventId = await createEvent();
      const typed = buyer();
      const placed = [];
      for (let i = 0; i < 3; i++) placed.push((await placeGuestCardOrder(eventId, { typed, number: PAN_RISK })).res.body);
      const capped = await submitCard(eventId, { typed, number: PAN_RISK });
      expect(capped.status).toBe(429);
      expect(capped.body.code).toBe("too_many_pending_orders");
      const row = await orderRow(placed[0].order.id);

      const status = await deliverWebhook(
        cardEvent("PAYMENT_REPROVED_BY_RISK_ANALYSIS", "REFUSED", row.id, row.asaas_payment_id, Number(row.amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(row.id)).status).toBe("cancelled");
      expect(confirmationsTo(typed.email)).toHaveLength(0);
      const again = await submitCard(eventId, { typed, number: PAN_RISK });
      expect(again.status, JSON.stringify(again.body)).toBe(201);
    });

    it("A4: PAYMENT_CREDIT_CARD_CAPTURE_REFUSED cancels the pending order, with no e-mail", async () => {
      const eventId = await createEvent();
      const { res, typed } = await placeGuestCardOrder(eventId, { number: PAN_RISK });
      const row = await orderRow(res.body.order.id);

      const status = await deliverWebhook(
        cardEvent("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "REFUSED", row.id, row.asaas_payment_id, Number(row.amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(row.id)).status).toBe("cancelled");
      expect(confirmationsTo(typed.email)).toHaveLength(0);
    });

    it("A4: a reproval is matched by the stored payment id only: another payment id with this externalReference does not cancel", async () => {
      const eventId = await createEvent();
      const { res } = await placeGuestCardOrder(eventId, { number: PAN_RISK });
      const row = await orderRow(res.body.order.id);

      const status = await deliverWebhook(
        cardEvent("PAYMENT_REPROVED_BY_RISK_ANALYSIS", "REFUSED", row.id, "pay_some_other_attempt", Number(row.amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(row.id)).status).toBe("pending");
    });

    it("A5: PAYMENT_APPROVED_BY_RISK_ANALYSIS with status CONFIRMED pays the order, with one e-mail", async () => {
      const eventId = await createEvent();
      const { res, typed } = await placeGuestCardOrder(eventId, { number: PAN_RISK });
      const row = await orderRow(res.body.order.id);

      const status = await deliverWebhook(
        cardEvent("PAYMENT_APPROVED_BY_RISK_ANALYSIS", "CONFIRMED", row.id, row.asaas_payment_id, Number(row.amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(row.id)).status).toBe("paid");
      expect(confirmationsTo(typed.email)).toHaveLength(1);
    });

    it("A5: PAYMENT_APPROVED_BY_RISK_ANALYSIS with status AWAITING_RISK_ANALYSIS leaves the order pending, with no e-mail", async () => {
      const eventId = await createEvent();
      const { res, typed } = await placeGuestCardOrder(eventId, { number: PAN_RISK });
      const row = await orderRow(res.body.order.id);

      const status = await deliverWebhook(
        cardEvent("PAYMENT_APPROVED_BY_RISK_ANALYSIS", "AWAITING_RISK_ANALYSIS", row.id, row.asaas_payment_id, Number(row.amount)),
      );

      expect(status).toBe(200);
      expect((await orderRow(row.id)).status).toBe("pending");
      expect(confirmationsTo(typed.email)).toHaveLength(0);
    });
  });

  describe("foreigners", () => {
    it("a guest with passport + credit_card and no card fields → 403 foreign_paid_unavailable (flag off), not 400 invalid_card", async () => {
      const eventId = await createEvent();
      const typed = buyer({ isForeigner: true, foreignDocument: makePassport(), cpf: undefined });

      const res = await submitCard(eventId, { typed, card: null, cardHolder: null });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("foreign_paid_unavailable");
      expect(await userRows(typed.email)).toHaveLength(0);
      expect(await orderCount(eventId)).toBe(0);
      expect(asaasRequests).toHaveLength(0);
    });

    it("with the flag on, a passport guest with credit_card and no card fields stays on the hosted invoice (no inline charge)", async () => {
      mocks.foreignPaidEnabled.value = true;
      const eventId = await createEvent();
      const typed = buyer({ isForeigner: true, foreignDocument: makePassport(), cpf: undefined });

      const res = await submitCard(eventId, { typed, card: null, cardHolder: null });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.order.status).toBe("pending");
      expect(res.body.payment.paymentLink).toMatch(/^https:\/\/asaas\.test\/i\//);
      const [charge] = asaasCharges();
      expect(charge.body).not.toHaveProperty("creditCard");
      expect(charge.body).not.toHaveProperty("creditCardHolderInfo");
      expect(mocks.sendCardPaymentLinkEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendCardPaymentLinkEmail.mock.calls[0][0]).toBe(typed.email);
    });
  });

  describe("PCI: card data is never logged or echoed", () => {
    it("a malformed JSON body holding the PAN gets a fixed 400 with no fragment in the response or the console", async () => {
      const logged = spyOnConsole();
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": randomIp() },
        body: `{"paymentMethod":"credit_card","card":{"number":"${PAN_OK}","ccv":"${CCV}",`,
      });
      const text = await res.text();

      expect(res.status).toBe(400);
      expect(JSON.parse(text)).toEqual({ message: "Requisição inválida." });
      expect(leaksIn(text)).toEqual([]);
      expect(text).not.toContain(PAN_OK.slice(0, 8));
      const consoleText = logged.join("\n");
      expect(leaksIn(consoleText)).toEqual([]);
      expect(consoleText).not.toContain(PAN_OK.slice(0, 8));
    });

    it("no orders, users or email_queue row holds the PAN or CVV after approved, declined and risk cases", async () => {
      const eventId = await createEvent();
      await placeGuestCardOrder(eventId);
      await submitCard(eventId, { typed: buyer(), number: PAN_DECLINE });
      await placeGuestCardOrder(eventId, { number: PAN_RISK });

      for (const table of ["orders", "users", "email_queue"]) {
        const { rows } = await pool.query(`SELECT t::text AS row FROM ${table} t`);
        const text = rows.map((r) => r.row).join("\n");
        expect(leaksIn(text), table).toEqual([]);
      }
    });

    const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

    function spyOnConsole(): string[] {
      const lines: string[] = [];
      for (const method of CONSOLE_METHODS) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          lines.push(
            args
              .map((a) => {
                if (a instanceof Error) return `${a.name} ${a.message} ${a.stack ?? ""} ${JSON.stringify(a)}`;
                if (typeof a === "string") return a;
                try {
                  return JSON.stringify(a) ?? String(a);
                } catch {
                  return String(a);
                }
              })
              .join(" "),
          );
        });
      }
      return lines;
    }

    it("across approved, declined, risk, invalid and webhook requests no console call and no response body holds the PAN, CVV, expiry or token", async () => {
      const logged = spyOnConsole();
      const eventId = await createEvent();

      const approved = await placeGuestCardOrder(eventId);
      const declined = await submitCard(eventId, { typed: buyer(), number: PAN_DECLINE });
      const risk = await placeGuestCardOrder(eventId, { number: PAN_RISK });
      const invalid = await submitCard(eventId, { typed: buyer(), installmentCount: 4 });
      const invalidNumber = await submitCard(eventId, { typed: buyer(), number: "4539578763621487" });
      const row = await orderRow(approved.res.body.order.id);
      const hooks = [
        await deliverWebhook(cardWebhook("PAYMENT_CONFIRMED", row.id, row.asaas_payment_id, Number(row.amount))),
        await deliverWebhook(cardWebhook("PAYMENT_RECEIVED", row.id, row.asaas_payment_id, Number(row.amount))),
      ];

      // The scenarios really ran (a leak check over nothing proves nothing).
      expect([declined.status, invalid.status, invalidNumber.status, hooks]).toEqual([402, 400, 400, [200, 200]]);
      expect(risk.res.body.payment.status).toBe("AWAITING_RISK_ANALYSIS");
      expect(asaasCharges().length).toBeGreaterThanOrEqual(3);
      expect(logged.length).toBeGreaterThan(0);

      const consoleText = logged.join("\n");
      expect(leaksIn(consoleText)).toEqual([]);
      const bodies = responseTexts.join("\n");
      expect(leaksIn(bodies)).toEqual([]);
      const cleanBodies = stripIds(bodies);
      expect(cleanBodies).not.toContain(EXPIRY_YEAR);
      expect(cleanBodies).not.toMatch(/expiry|"ccv"|holderName|creditCard/i);
      // The webhook handler's payload log keeps neither the token nor the PAN.
      expect(consoleText).not.toContain(ASAAS_CARD_TOKEN);
    });
  });
});
