/**
 * Hardening batch 2 (security backlog #14, #15, the courtesy race; #16 reversed by ADR-017
 * Stage 1, plus the session checks that replace it) against the
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

/** A complete account (document, birth date, address), with or without a verified e-mail. */
async function createUser(opts: { verified: boolean; isAdmin?: boolean }): Promise<TestUser> {
  const id = randomUUID();
  const email = `sec-${id.slice(0, 8)}@example.test`;
  const n = createdUserIds.length + 1;
  // 777: other integration files use 888/999 and run in parallel on the same database.
  const cpf = `777.${String(n).padStart(3, "0")}.${String(n).padStart(3, "0")}-88`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, birth_date, address, occupation, partner_company, area_of_activity, is_admin)
     VALUES ($1,$2,$3,'x','Participante Teste',$4,'5511999999999',$5,'Rua de teste, 123','Nao aplicavel','Nao aplicavel','Nao aplicavel',$6)`,
    [id, email, opts.verified, cpf, new Date("1990-01-01"), opts.isAdmin ?? false],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email };
}

/** A password account created through the real signup route, then logged in. */
async function signUpAndLogIn(password = "senha-antiga"): Promise<TestUser & { password: string }> {
  const email = `sec-auth-${randomUUID().slice(0, 8)}@example.test`;
  const reg = await api("POST", "/api/auth/register", {
    body: { name: "Conta Sessao", email, phone: "5511987654321", password },
  });
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  createdUserIds.push(rows[0].id);
  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  return { id: rows[0].id, token: login.body.token, email, password };
}

/**
 * The link token e-mailed by forgot-password (emailService.sendPasswordResetEmail). It is bound
 * to the password hash of that moment (pv), so it is signed from the stored row; a token without
 * pv is rejected (ADR-017 Stage 2, ruling R2).
 */
async function resetToken(userId: string): Promise<string> {
  const { signPasswordResetToken } = await import("../../middleware/auth");
  const { rows } = await pool.query(`SELECT id, password, email FROM users WHERE id = $1`, [userId]);
  return signPasswordResetToken(rows[0]);
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

  describe("an account without an e-mail code can sign up for an event (#16 reversed, ADR-017)", () => {
    it("free subscribe: 201 for an unverified account", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const user = await createUser({ verified: false });

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: { answers: {} } });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(await orderCount(eventId)).toBe(1);
    });

    it("paid order: 201 and one Asaas call for an unverified account", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const user = await createUser({ verified: false });
      const before = asaasCalls.length;

      const res = await api("POST", "/api/orders", { token: user.token, body: { eventId, paymentMethod: "pix" } });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(asaasCalls.length).toBe(before + 1);
    });

    it("courtesy redeem and Meus Ingressos: 201 and 200 for an unverified account", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const admin = await createUser({ verified: true, isAdmin: true });
      const guest = await createUser({ verified: false });
      const code = await courtesyCode(eventId, admin.id);

      const res = await api("POST", "/api/courtesy/redeem", { token: guest.token, body: onlineCourtesy(code, guest.email) });
      const orders = await api("GET", "/api/orders", { token: guest.token });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(orders.status).toBe(200);
      expect(orders.body.orders.map((o: { eventId: string }) => o.eventId)).toContain(eventId);
    });
  });

  describe("sessions once signup has no e-mail code (ADR-017 Stage 1)", () => {
    it("the code endpoints are gone; the e-mail link endpoint stays", async () => {
      const user = await createUser({ verified: false });

      const verifyCode = await api("POST", "/api/auth/verify-code", { body: { email: user.email, code: "123456" } });
      const resendCode = await api("POST", "/api/auth/resend-code", { body: { email: user.email } });
      const resendLink = await api("POST", "/api/auth/resend-verification", { token: user.token });
      const link = await api("GET", "/api/auth/verify-email");

      expect([verifyCode.status, resendCode.status, resendLink.status]).toEqual([404, 404, 404]);
      expect(link.status).toBe(400);
    });

    it("a password reset ends the sessions issued before it; a token without pv still works", async () => {
      const user = await signUpAndLogIn();
      const legacy = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
      expect((await api("GET", "/api/auth/me", { token: user.token })).status).toBe(200);

      const reset = await api("POST", "/api/auth/reset-password", {
        body: { token: await resetToken(user.id), newPassword: "senha-nova" },
      });
      const oldSession = await api("GET", "/api/auth/me", { token: user.token });
      const relogin = await api("POST", "/api/auth/login", { body: { email: user.email, password: "senha-nova" } });

      expect(reset.status, JSON.stringify(reset.body)).toBe(200);
      expect(oldSession.status).toBe(401);
      expect(relogin.status).toBe(200);
      expect((await api("GET", "/api/auth/me", { token: relogin.body.token })).status).toBe(200);
      // Issued before the pv claim existed: accepted, so the deploy logs no one out.
      expect((await api("GET", "/api/auth/me", { token: legacy })).status).toBe(200);
    });

    it("a reset or e-mail link token used as a Bearer session is 401", async () => {
      const user = await createUser({ verified: true });
      const link = jwt.sign({ userId: user.id, type: "email-verification" }, JWT_SECRET, { expiresIn: "7d" });

      expect((await api("GET", "/api/auth/me", { token: await resetToken(user.id) })).status).toBe(401);
      expect((await api("GET", "/api/auth/me", { token: link })).status).toBe(401);
      expect((await api("GET", "/api/orders", { token: await resetToken(user.id) })).status).toBe(401);
    });

    it("reset-password rejects a password under 6 characters and keeps the old one", async () => {
      const user = await signUpAndLogIn();

      const short = await api("POST", "/api/auth/reset-password", {
        body: { token: await resetToken(user.id), newPassword: "12345" },
      });
      const notString = await api("POST", "/api/auth/reset-password", {
        body: { token: await resetToken(user.id), newPassword: 1234567 },
      });

      expect(short.status).toBe(400);
      expect(notString.status).toBe(400);
      expect((await api("POST", "/api/auth/login", { body: { email: user.email, password: user.password } })).status).toBe(200);
    });

    it("a reset link works once: the second use is 400", async () => {
      const user = await signUpAndLogIn();
      const token = await resetToken(user.id);

      const first = await api("POST", "/api/auth/reset-password", { body: { token, newPassword: "senha-nova" } });
      const second = await api("POST", "/api/auth/reset-password", { body: { token, newPassword: "outra-senha" } });

      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(second.status).toBe(400);
      expect((await api("POST", "/api/auth/login", { body: { email: user.email, password: "senha-nova" } })).status).toBe(200);
      expect((await api("POST", "/api/auth/login", { body: { email: user.email, password: "outra-senha" } })).status).toBe(401);
    });

    it("a reset token without pv is rejected", async () => {
      const user = await signUpAndLogIn();
      const legacy = jwt.sign({ userId: user.id, type: "password-reset" }, JWT_SECRET, { expiresIn: "30m" });

      const res = await api("POST", "/api/auth/reset-password", { body: { token: legacy, newPassword: "senha-nova" } });

      expect(res.status).toBe(400);
      expect((await api("POST", "/api/auth/login", { body: { email: user.email, password: user.password } })).status).toBe(200);
    });

    it("reset-password marks the e-mail verified (the owner opened the link)", async () => {
      const user = await signUpAndLogIn();
      const before = await pool.query(`SELECT email_verified FROM users WHERE id = $1`, [user.id]);

      const reset = await api("POST", "/api/auth/reset-password", {
        body: { token: await resetToken(user.id), newPassword: "senha-nova" },
      });
      const after = await pool.query(`SELECT email_verified FROM users WHERE id = $1`, [user.id]);

      expect(before.rows[0].email_verified).toBe(false);
      expect(reset.status).toBe(200);
      expect(after.rows[0].email_verified).toBe(true);
    });

    it("changing the password returns a new session and ends the old one", async () => {
      const user = await signUpAndLogIn();

      const change = await api("PUT", "/api/profile/password", {
        token: user.token,
        body: { currentPassword: user.password, newPassword: "senha-trocada" },
      });

      expect(change.status, JSON.stringify(change.body)).toBe(200);
      expect(typeof change.body.token).toBe("string");
      expect((await api("GET", "/api/auth/me", { token: change.body.token })).status).toBe(200);
      expect((await api("GET", "/api/auth/me", { token: user.token })).status).toBe(401);
    });

    it("changing the password answers 400, not 500, for a password that is not a string", async () => {
      const user = await signUpAndLogIn();

      const res = await api("PUT", "/api/profile/password", {
        token: user.token,
        body: { currentPassword: user.password, newPassword: ["a", "b", "c", "d", "e", "f"] },
      });

      expect(res.status).toBe(400);
      expect((await api("GET", "/api/auth/me", { token: user.token })).status).toBe(200);
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
