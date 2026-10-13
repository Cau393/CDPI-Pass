/**
 * Hardening batch 2 (security backlog #14, #15, #16 and the courtesy race) against the
 * REAL Express routes and a REAL PostgreSQL. Skipped unless VERIFY_DATABASE_URL is set.
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production): this test
 * writes and deletes rows.
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
// Still set on the EC2 .env until the owner removes it: the redeem must ignore it (#14).
const COURTESY_HOOK = "https://hook.example.test/courtesy";
process.env.COURTESY_WEBHOOK_URL = COURTESY_HOOK;

vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn(async () => true),
    sendOnlineEventEmail: vi.fn(async () => true),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async () => true),
    sendVerificationEmail: vi.fn(async () => true),
  },
}));

const asaasCalls: unknown[] = [];
vi.mock("../../services/asaasService", () => ({
  asaasService: {
    createPayment: vi.fn(async (payload: unknown) => {
      asaasCalls.push(payload);
      return { id: `pay_${randomUUID()}`, paymentLink: "https://asaas.test/pay", status: "PENDING", value: 0 };
    }),
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

let server: Server;
let baseUrl: string;
let pool: Pool;

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; forwardedFor?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.forwardedFor) headers["X-Forwarded-For"] = opts.forwardedFor;
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

async function createEvent(opts: { modality: "presencial" | "online"; isFree: boolean }): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, meeting_url, registration_form, current_attendees)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste',$4,true,'cdpi_event',$5,$6,$7,'[]'::jsonb,0)`,
    [
      id,
      `[TEST] Segurança ${id.slice(0, 8)}`,
      new Date(Date.now() + 7 * 86400_000),
      opts.isFree ? "0.00" : "100.00",
      opts.isFree,
      opts.modality,
      opts.modality === "online" ? "https://meet.test/sala" : null,
    ],
  );
  createdEventIds.push(id);
  return id;
}

type TestUser = { id: string; token: string; email: string };

const VERIFICATION_CODE = "123456";

/** A complete account (document, birth date, address), verified or still waiting for its code. */
async function createUser(opts: { verified: boolean; isAdmin?: boolean }): Promise<TestUser> {
  const id = randomUUID();
  const email = `sec-${id.slice(0, 8)}@example.test`;
  const n = createdUserIds.length + 1;
  // 777: other integration files use 888/999 and run in parallel on the same database.
  const cpf = `777.${String(n).padStart(3, "0")}.${String(n).padStart(3, "0")}-88`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, email_verification_code, email_verification_code_expires_at, password, name, cpf, phone, birth_date, address, occupation, partner_company, area_of_activity, is_admin)
     VALUES ($1,$2,$3,$4,$5,'x','Participante Teste',$6,'5511999999999',$7,'Rua de teste, 123','Nao aplicavel','Nao aplicavel','Nao aplicavel',$8)`,
    [
      id,
      email,
      opts.verified,
      opts.verified ? null : VERIFICATION_CODE,
      // UTC wall time, as Drizzle writes it: a Date here would be stored in the local zone
      // and read back hours off on a machine that is not on UTC.
      opts.verified ? null : new Date(Date.now() + 3600_000).toISOString(),
      cpf,
      new Date("1990-01-01"),
      opts.isAdmin ?? false,
    ],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email };
}

/** The code typed on /verify-email, through the real route. */
async function verify(user: TestUser): Promise<void> {
  const res = await api("POST", "/api/auth/verify-code", { body: { email: user.email, code: VERIFICATION_CODE } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function courtesyCode(eventId: string, createdBy: string, ticketCount = 5): Promise<string> {
  const code = `SEC${randomUUID().slice(0, 6).toUpperCase()}`;
  await pool.query(
    `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by)
     VALUES ($1,$2,$3,$4,0,true,$5)`,
    [randomUUID(), eventId, code, ticketCount, createdBy],
  );
  return code;
}

function onlineCourtesy(code: string, email: string) {
  return {
    code,
    name: "Convidada Online",
    email,
    emailConfirm: email,
    partnerCompany: "Empresa",
    occupation: "Analista",
    phone: "5511988887777",
  };
}

async function orderCount(eventId: string): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM orders WHERE event_id = $1`, [eventId]);
  return rows[0].n;
}

describe.skipIf(!enabled)("hardening batch 2 (real routes + real DB)", () => {
  beforeAll(async () => {
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

  afterAll(async () => {
    await pool.query(`DELETE FROM orders WHERE event_id = ANY($1) OR user_id = ANY($2)`, [
      createdEventIds,
      createdUserIds,
    ]);
    await pool.query(`DELETE FROM courtesy_links WHERE event_id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("courtesy redeem posts to no third party (#14)", () => {
    it("ignores COURTESY_WEBHOOK_URL", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const admin = await createUser({ verified: true, isAdmin: true });
      const guest = await createUser({ verified: true });
      const code = await courtesyCode(eventId, admin.id);
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      try {
        const res = await api("POST", "/api/courtesy/redeem", { token: guest.token, body: onlineCourtesy(code, guest.email) });
        // The old post was fire-and-forget: let it start before asserting.
        await new Promise((resolve) => setImmediate(resolve));

        expect(res.status).toBe(201);
        const outbound = fetchSpy.mock.calls.map(([url]) => String(url)).filter((url) => !url.startsWith(baseUrl));
        expect(outbound).toEqual([]);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("a verified e-mail is required to sign up for an event (#16)", () => {
    it("free subscribe: 403 EMAIL_NOT_VERIFIED and no order, then 201 after the code", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const user = await createUser({ verified: false });

      const blocked = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: { answers: {} } });
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(await orderCount(eventId)).toBe(0);

      await verify(user);
      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: { answers: {} } });
      expect(res.status).toBe(201);
    });

    it("paid order: 403 before any Asaas call, then 201 after the code", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const user = await createUser({ verified: false });
      const before = asaasCalls.length;

      const blocked = await api("POST", "/api/orders", { token: user.token, body: { eventId, paymentMethod: "pix" } });
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(asaasCalls.length).toBe(before);
      expect(await orderCount(eventId)).toBe(0);

      await verify(user);
      const res = await api("POST", "/api/orders", { token: user.token, body: { eventId, paymentMethod: "pix" } });
      expect(res.status).toBe(201);
    });

    it("courtesy redeem: 403 and the link keeps its ticket, then 201 after the code", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const admin = await createUser({ verified: true, isAdmin: true });
      const guest = await createUser({ verified: false });
      const code = await courtesyCode(eventId, admin.id);

      const blocked = await api("POST", "/api/courtesy/redeem", { token: guest.token, body: onlineCourtesy(code, guest.email) });
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(await orderCount(eventId)).toBe(0);

      await verify(guest);
      const res = await api("POST", "/api/courtesy/redeem", { token: guest.token, body: onlineCourtesy(code, guest.email) });
      expect(res.status).toBe(201);
    });
  });

  describe("concurrent courtesy redeems (C5)", () => {
    it("creates exactly one order for 8 concurrent redeems of the same attendee", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const admin = await createUser({ verified: true, isAdmin: true });
      const guest = await createUser({ verified: true });
      const code = await courtesyCode(eventId, admin.id, 10);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          api("POST", "/api/courtesy/redeem", { token: guest.token, body: onlineCourtesy(code, guest.email) }),
        ),
      );

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400).map((r) => r.body.message)).toEqual(
        Array(7).fill("E-mail já inscrito neste evento."),
      );
      expect(await orderCount(eventId)).toBe(1);
      const { rows } = await pool.query(`SELECT used_count FROM courtesy_links WHERE code = $1`, [code]);
      expect(rows[0].used_count).toBe(1);
    });
  });

  // Last: it uses up the limiter's budget for one client address.
  describe("auth rate limit keys on the address nginx saw (#15)", () => {
    it("answers 429 on the 101st login even when the client rotates X-Forwarded-For", async () => {
      // nginx forwards "<whatever the client sent>, <peer address>"; trust proxy 1 takes the last.
      const attempt = (i: number, peer = "203.0.113.9") =>
        api("POST", "/api/auth/login", {
          forwardedFor: `10.${i % 250}.${Math.floor(i / 250)}.1, ${peer}`,
          body: { email: `nobody-${i}@example.test`, password: "wrong-password" },
        });

      const results = await Promise.all(Array.from({ length: 101 }, (_, i) => attempt(i)));
      expect(results.filter((r) => r.status === 429)).toHaveLength(1);

      // Another client is not throttled by the first one's attempts.
      expect((await attempt(101, "203.0.113.10")).status).not.toBe(429);
    });
  });
});
