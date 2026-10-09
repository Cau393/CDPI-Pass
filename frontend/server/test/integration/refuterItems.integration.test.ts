/**
 * Refuter follow-ups (ADR-016 C2) against the REAL Express routes and a REAL
 * PostgreSQL: concurrent admin saves, structural form compare, user and
 * courtesy-link response shapes, and the duplicate-inscription race. Skipped
 * unless VERIFY_DATABASE_URL is set.
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
import type { RegistrationField } from "@shared/eventRegistrationForm";

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

vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn(async () => true),
    sendOnlineEventEmail: vi.fn(async () => true),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async () => true),
    sendVerificationEmail: vi.fn(async () => true),
  },
}));

const foreignCardCalls: unknown[] = [];
vi.mock("../../services/asaasService", () => ({
  asaasService: {
    createPayment: vi.fn(async () => ({
      id: `pay_${randomUUID()}`,
      paymentLink: "https://asaas.test/pay",
      status: "PENDING",
      value: 0,
    })),
    createForeignCardPayment: vi.fn(async (payload: unknown) => {
      foreignCardCalls.push(payload);
      return {
        id: `pay_${randomUUID()}`,
        invoiceUrl: "https://asaas.test/invoice",
        status: "PENDING",
        value: 0,
      };
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
  opts: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
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

async function createEvent(opts: {
  modality: "presencial" | "online";
  isFree: boolean;
  registrationForm?: RegistrationField[];
  meetingPassword?: string;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, meeting_url, meeting_password, registration_form, current_attendees)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste',$4,true,'cdpi_event',$5,$6,$7,$9,$8::jsonb,0)`,
    [
      id,
      `[TEST] Formulário ${id.slice(0, 8)}`,
      new Date(Date.now() + 7 * 86400_000),
      opts.isFree ? "0.00" : "100.00",
      opts.isFree,
      opts.modality,
      opts.modality === "online" ? "https://meet.test/sala" : null,
      JSON.stringify(opts.registrationForm ?? []),
      opts.meetingPassword ?? null,
    ],
  );
  createdEventIds.push(id);
  return id;
}

type TestUser = { id: string; token: string; email: string };

/** An account as Phase 4 signup creates it: no document, birth date or address. */
async function createBareUser(opts: { phone?: string; isAdmin?: boolean } = {}): Promise<TestUser> {
  const id = randomUUID();
  const email = `forms-${id.slice(0, 8)}@example.test`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, birth_date, address, is_admin)
     VALUES ($1,$2,true,'x','Participante Sem Documento',NULL,$3,NULL,NULL,$4)`,
    [id, email, opts.phone ?? "5511999999999", opts.isAdmin ?? false],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email };
}

const ADDRESS = "Rua das Inscrições, 100, São Paulo";

const cargo: RegistrationField = {
  id: "f-cargo",
  type: "text",
  label: "Cargo",
  options: [],
  required: true,
  archived: false,
};
const turno: RegistrationField = {
  id: "f-turno",
  type: "radio",
  label: "Turno",
  options: ["Manhã", "Tarde"],
  required: false,
  archived: false,
};

const SECRET_USER_KEYS = ["password", "emailVerificationCode", "emailVerificationCodeExpiresAt"];

async function updatedAtOf(eventId: string): Promise<number> {
  const { rows } = await pool.query(`SELECT updated_at FROM events WHERE id = $1`, [eventId]);
  return new Date(rows[0].updated_at).getTime();
}

/** The updatedAt the admin page loads: straight from the admin GET, as the client sends it back. */
async function loadedUpdatedAt(admin: TestUser, eventId: string): Promise<string> {
  const res = await api("GET", `/api/admin/events/${eventId}`, { token: admin.token });
  return res.body.updatedAt;
}

function patchForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe.skipIf(!enabled)("ADR-016 refuter follow-ups (real routes + real DB)", () => {
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

  describe("admin event PATCH: structural form compare (#9)", () => {
    it("treats a form saved back with the same questions as unchanged and writes nothing", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo, turno] });
      const admin = await createBareUser({ isAdmin: true });
      const before = await updatedAtOf(eventId);
      // Same questions, keys in the order the admin client builds them (not jsonb's).
      const sameForm = JSON.stringify([
        { required: true, label: "Cargo", options: [], type: "text", id: "f-cargo" },
        { required: false, options: ["Manhã", "Tarde"], label: "Turno", type: "radio", id: "f-turno" },
      ]);

      const res = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ registration_form: sameForm }),
      });

      expect(res.status).toBe(200);
      expect(await updatedAtOf(eventId)).toBe(before);
    });

    it("still saves a form whose question order changed", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo, turno] });
      const admin = await createBareUser({ isAdmin: true });
      const before = await updatedAtOf(eventId);

      const res = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({
          registration_form: JSON.stringify([
            { id: "f-turno", type: "radio", label: "Turno", options: ["Manhã", "Tarde"], required: false },
            { id: "f-cargo", type: "text", label: "Cargo", options: [], required: true },
          ]),
        }),
      });

      expect(res.status).toBe(200);
      expect(res.body.registrationForm.map((f: RegistrationField) => f.id)).toEqual(["f-turno", "f-cargo"]);
      expect(await updatedAtOf(eventId)).toBeGreaterThan(before);
    });
  });

  describe("admin event PATCH: optimistic concurrency (#7)", () => {
    const CONFLICT = "Este evento foi alterado por outra pessoa. Recarregue a página.";

    it("answers 409 and changes nothing when the admin saved over a newer version", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const loaded = await loadedUpdatedAt(admin, eventId);
      // Another admin saves first.
      const first = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ title: "[TEST] Primeira edição", updated_at: loaded }),
      });
      expect(first.status).toBe(200);

      const stale = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ title: "[TEST] Edição antiga", updated_at: loaded }),
      });

      expect(stale).toMatchObject({ status: 409, body: { message: CONFLICT } });
      const { rows } = await pool.query(`SELECT title FROM events WHERE id = $1`, [eventId]);
      expect(rows[0].title).toBe("[TEST] Primeira edição");
    });

    it("saves when the sent updatedAt is the current one, and hands back the new value", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const loaded = await loadedUpdatedAt(admin, eventId);

      const res = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ title: "[TEST] Editado", updated_at: loaded }),
      });
      const next = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ title: "[TEST] Editado de novo", updated_at: res.body.updatedAt }),
      });

      expect(res.status).toBe(200);
      expect(res.body.updatedAt).not.toBe(loaded);
      expect(next.status).toBe(200);
    });

    it("skips the check when an old admin bundle sends no updatedAt", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });

      const res = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ title: "[TEST] Sem updatedAt" }),
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("[TEST] Sem updatedAt");
    });

    it("does not count a sale as an edit: a new subscription keeps the loaded updatedAt valid", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const buyer = await createBareUser({ phone: "595981123456" });
      const loaded = await loadedUpdatedAt(admin, eventId);

      const sub = await api("POST", `/api/events/${eventId}/subscribe`, { token: buyer.token, body: {} });
      const res = await api("PATCH", `/api/admin/events/${eventId}`, {
        token: admin.token,
        form: patchForm({ title: "[TEST] Depois de uma venda", updated_at: loaded }),
      });

      expect(sub.status).toBe(201);
      expect(res.status).toBe(200);
    });
  });

  describe("user responses carry no secrets (S1)", () => {
    async function userWithPendingCode(): Promise<TestUser> {
      const user = await createBareUser();
      await pool.query(
        `UPDATE users SET email_verification_code = '123456', email_verification_code_expires_at = now() + interval '1 hour' WHERE id = $1`,
        [user.id],
      );
      return user;
    }

    function leakedKeys(body: Record<string, unknown>): string[] {
      return SECRET_USER_KEYS.filter((key) => key in body);
    }

    it("GET /api/auth/me", async () => {
      const user = await userWithPendingCode();
      const res = await api("GET", "/api/auth/me", { token: user.token });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: user.id, email: user.email });
      expect(leakedKeys(res.body)).toEqual([]);
    });

    it("PUT /api/profile", async () => {
      const user = await userWithPendingCode();
      const res = await api("PUT", "/api/profile", { token: user.token, body: { occupation: "Analista" } });

      expect(res.status).toBe(200);
      expect(res.body.occupation).toBe("Analista");
      expect(leakedKeys(res.body)).toEqual([]);
    });

    it("PUT /api/profile/identity, for a Brazilian and a foreign visitor", async () => {
      const brazilian = await userWithPendingCode();
      const visitor = await userWithPendingCode();
      await pool.query(`UPDATE users SET phone = '595981123456' WHERE id = $1`, [visitor.id]);

      const br = await api("PUT", "/api/profile/identity", { token: brazilian.token, body: { address: ADDRESS } });
      const py = await api("PUT", "/api/profile/identity", {
        token: visitor.token,
        body: { isForeigner: true, foreignDocument: `PY${randomUUID().slice(0, 8).toUpperCase()}`, address: ADDRESS },
      });

      expect(br.status).toBe(200);
      expect(py.status).toBe(200);
      expect(leakedKeys(br.body)).toEqual([]);
      expect(leakedKeys(py.body)).toEqual([]);
    });
  });

  describe("public courtesy link (S2)", () => {
    it("does not expose the meeting link or password before redemption", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false, meetingPassword: "senha-secreta" });
      const admin = await createBareUser({ isAdmin: true });
      const code = `REFUT${randomUUID().slice(0, 6).toUpperCase()}`;
      await pool.query(
        `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by)
         VALUES ($1,$2,$3,5,0,true,$4)`,
        [randomUUID(), eventId, code, admin.id],
      );

      const res = await api("GET", `/api/courtesy-links/${code}`);

      expect(res.status).toBe(200);
      expect(res.body.event).toMatchObject({ id: eventId, modality: "online" });
      expect(res.body.event).not.toHaveProperty("meetingUrl");
      expect(res.body.event).not.toHaveProperty("meetingPassword");
      expect(res.body.event).not.toHaveProperty("whatsappGroupUrl");
      expect(res.body.event).not.toHaveProperty("confirmationEmailHtml");
    });
  });

  describe("duplicate free inscription race", () => {
    const CONCURRENT = 8;

    async function ordersFor(userId: string, eventId: string): Promise<number> {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM orders WHERE user_id = $1 AND event_id = $2`,
        [userId, eventId],
      );
      return rows[0].n;
    }

    it("creates exactly one order for concurrent subscribes of the same account (Brazilian phone)", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const user = await createBareUser();

      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} }),
        ),
      );

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(CONCURRENT - 1);
      expect(await ordersFor(user.id, eventId)).toBe(1);
    });

    it("creates exactly one order for concurrent subscribes of a foreign visitor (+595 phone, passport)", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const visitor = await createBareUser({ phone: "595981123456" });
      const identity = await api("PUT", "/api/profile/identity", {
        token: visitor.token,
        body: { isForeigner: true, foreignDocument: `PY${randomUUID().slice(0, 8).toUpperCase()}`, address: ADDRESS },
      });
      expect(identity.status).toBe(200);

      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          api("POST", `/api/events/${eventId}/subscribe`, { token: visitor.token, body: {} }),
        ),
      );

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await ordersFor(visitor.id, eventId)).toBe(1);
    });
  });
});
