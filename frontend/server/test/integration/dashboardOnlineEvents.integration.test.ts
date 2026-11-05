/**
 * ADR-018 lead tags: GET /api/integrations/dashboard/online-events, the token-protected feed of the
 * external Masterclass dashboard. Real Express routes + REAL PostgreSQL. Skipped unless
 * VERIFY_DATABASE_URL points at a throwaway database:
 *
 *   VERIFY_DATABASE_URL=postgresql://postgres@localhost:55434/cdpi_dash \
 *     pnpm exec vitest run --config vitest.server.config.ts server/test/integration/dashboardOnlineEvents
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production): this test
 * writes and deletes rows.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { Pool } from "pg";
import { randomUUID, randomInt } from "crypto";

const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error("VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.");
}

const JWT_SECRET = "integration-test-secret";
const DASHBOARD_TOKEN = "integration-dashboard-token-0123456789abcdef";
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATABASE_URL = VERIFY_URL ?? "postgresql://unused";
process.env.ASAAS_API_KEY = "test-key-not-used";
process.env.ASAAS_WEBHOOK_TOKEN = "integration-webhook-token-0123456789abcdef";

vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

vi.mock("../../services/emailService", () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn(async () => true),
    sendTicketEmail: vi.fn(async () => true),
    sendOnlineEventEmail: vi.fn(async () => true),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async () => true),
    sendVerificationEmail: vi.fn(async () => true),
  },
}));

vi.mock("../../services/asaasService", () => ({
  asaasService: {
    createPayment: vi.fn(),
    createCardPayment: vi.fn(),
    getPayment: vi.fn(),
    cancelPayment: vi.fn(async () => ({})),
    validateWebhookSignature: () => false,
  },
}));

vi.mock("../../services/s3Service", () => ({
  s3Service: { uploadBuffer: vi.fn(async () => "https://s3.test/o.png"), uploadQRCode: vi.fn(async () => "https://s3.test/qr.png") },
}));

const PATH = "/api/integrations/dashboard/online-events";
const DAY = 86400_000;

let server: Server;
let baseUrl: string;
let pool: Pool;
let savedToken: string | undefined;

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

async function get(opts: { auth?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "X-Forwarded-For": opts.ip ?? randomIp() };
  if (opts.auth !== undefined) headers.Authorization = opts.auth;
  const res = await fetch(`${baseUrl}${PATH}`, { headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text, headers: res.headers };
}

const bearer = (t = DASHBOARD_TOKEN) => `Bearer ${t}`;

async function createEvent(
  opts: { modality?: "presencial" | "online"; active?: boolean; date?: Date; title?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const modality = opts.modality ?? "online";
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, meeting_url, registration_form, current_attendees)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste','100.00',$4,'cdpi_event',false,$5,$6,'[]'::jsonb,0)`,
    [
      id,
      opts.title ?? `[TEST] Painel ${id.slice(0, 8)}`,
      opts.date ?? new Date(Date.now() + 7 * DAY),
      opts.active ?? true,
      modality,
      modality === "online" ? "https://meet.test/sala" : null,
    ],
  );
  createdEventIds.push(id);
  return id;
}

const SEEDED_NAME = "Fulana Sigilosa de Tal";
// Random per run: a fixed CPF here collided with lookupEmail.integration.test.ts (its "no account" CPF) when the files ran in parallel in CI.
const SEEDED_CPF = `${randomInt(100, 1000)}.${randomInt(100, 1000)}.${randomInt(100, 1000)}-${String(randomInt(0, 100)).padStart(2, "0")}`;
const SEEDED_EMAIL = `sigilosa-${randomUUID().slice(0, 8)}@example.test`;
let userId: string;

async function addOrder(
  eventId: string,
  status: string,
  leadTag: string | null,
  paymentMethod = "pix",
): Promise<void> {
  await pool.query(
    `INSERT INTO orders (id, user_id, event_id, status, payment_method, amount, lead_tag)
     VALUES ($1,$2,$3,$4,$5,'100.00',$6)`,
    [randomUUID(), userId, eventId, status, paymentMethod, leadTag],
  );
}

describe.skipIf(!enabled)("GET /api/integrations/dashboard/online-events (real Postgres)", () => {
  beforeAll(async () => {
    savedToken = process.env.DASHBOARD_API_TOKEN;
    pool = new Pool({ connectionString: VERIFY_URL });
    userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, email_verified, password, name, cpf, phone)
       VALUES ($1,$2,true,'x',$3,$4,'5511999999999')`,
      [userId, SEEDED_EMAIL, SEEDED_NAME, SEEDED_CPF],
    );
    createdUserIds.push(userId);
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  beforeEach(() => {
    process.env.DASHBOARD_API_TOKEN = DASHBOARD_TOKEN;
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.DASHBOARD_API_TOKEN;
    else process.env.DASHBOARD_API_TOKEN = savedToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM orders WHERE event_id = ANY($1) OR user_id = ANY($2)`, [createdEventIds, createdUserIds]);
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers 503 when the token is not configured, then 401 for a missing or wrong token", async () => {
    delete process.env.DASHBOARD_API_TOKEN;
    expect((await get({ auth: bearer() })).status).toBe(503);

    process.env.DASHBOARD_API_TOKEN = DASHBOARD_TOKEN;
    expect((await get()).status).toBe(401);
    expect((await get({ auth: `Basic ${DASHBOARD_TOKEN}` })).status).toBe(401);
    const wrong = await get({ auth: bearer("wrong-token") });
    expect(wrong.status).toBe(401);
    expect(wrong.text).not.toContain(DASHBOARD_TOKEN);
  });

  it("counts only paid orders, split by tag and none, one per paid order", async () => {
    const eventId = await createEvent();
    await addOrder(eventId, "paid", "email");
    await addOrder(eventId, "paid", "email");
    await addOrder(eventId, "paid", "parceiros");
    await addOrder(eventId, "paid", "patrocinado");
    await addOrder(eventId, "paid", "consultores");
    await addOrder(eventId, "paid", null);
    await addOrder(eventId, "paid", "email", "courtesy"); // courtesy, paid: counts
    await addOrder(eventId, "paid", null, "free"); // free subscription: counts
    await addOrder(eventId, "pending", "email");
    await addOrder(eventId, "cancelled", "parceiros");

    const res = await get({ auth: bearer() });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const ev = res.body.events.find((e: any) => e.id === eventId);
    expect(ev.counts).toEqual({ email: 3, parceiros: 1, patrocinado: 1, consultores: 1, none: 2 });
    expect(ev.total).toBe(8);
    expect(typeof ev.total).toBe("number");
    expect(typeof ev.counts.email).toBe("number");
    expect(Object.keys(ev).sort()).toEqual(["counts", "date", "id", "title", "total"]);
    expect(Number.isNaN(Date.parse(ev.date))).toBe(false);
  });

  it("matches the paid rows of the admin participants page", async () => {
    const eventId = await createEvent();
    await addOrder(eventId, "paid", "email");
    await addOrder(eventId, "paid", null, "courtesy");
    await addOrder(eventId, "pending", null);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM orders o JOIN users u ON u.id = o.user_id WHERE o.event_id = $1 AND o.status = 'paid'`,
      [eventId],
    );
    const ev = (await get({ auth: bearer() })).body.events.find((e: any) => e.id === eventId);
    expect(ev.total).toBe(rows[0].n);
  });

  it("lists an online event without orders with zeros", async () => {
    const eventId = await createEvent();
    const ev = (await get({ auth: bearer() })).body.events.find((e: any) => e.id === eventId);
    expect(ev.counts).toEqual({ email: 0, parceiros: 0, patrocinado: 0, consultores: 0, none: 0 });
    expect(ev.total).toBe(0);
  });

  it("leaves out presencial and inactive events, even with paid orders", async () => {
    const presencial = await createEvent({ modality: "presencial" });
    const inactive = await createEvent({ active: false });
    await addOrder(presencial, "paid", "email");
    await addOrder(inactive, "paid", "email");
    const ids = (await get({ auth: bearer() })).body.events.map((e: any) => e.id);
    expect(ids).not.toContain(presencial);
    expect(ids).not.toContain(inactive);
  });

  it("orders events newest first", async () => {
    const older = await createEvent({ date: new Date(Date.now() + 2 * DAY) });
    const newest = await createEvent({ date: new Date(Date.now() + 40 * DAY) });
    const middle = await createEvent({ date: new Date(Date.now() + 20 * DAY) });
    const ids: string[] = (await get({ auth: bearer() })).body.events.map((e: any) => e.id);
    const mine = ids.filter((id) => [older, newest, middle].includes(id));
    expect(mine).toEqual([newest, middle, older]);
  });

  it("exposes no personal data", async () => {
    const eventId = await createEvent();
    await addOrder(eventId, "paid", "email");
    const res = await get({ auth: bearer() });
    expect(res.text).not.toContain(SEEDED_NAME);
    expect(res.text).not.toContain(SEEDED_EMAIL);
    expect(res.text).not.toContain(SEEDED_CPF);
    expect(res.text).not.toContain(userId);
  });

  it("limits to 30 requests a minute per IP, before the token check", async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await get({ auth: "Bearer nope", ip })).status);
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
    // Another address is untouched.
    expect((await get({ auth: bearer() })).status).toBe(200);
  });
});
