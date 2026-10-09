/**
 * ADR-016 Phase 3 against the REAL Express routes and a REAL PostgreSQL:
 * the identity gate (document/address by modality), PUT /api/profile/identity,
 * per-event answers, online courtesy without a document, admin form saves and
 * the participants payload. Skipped unless VERIFY_DATABASE_URL is set.
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
import { readFileSync } from "fs";
import { join } from "path";
import { LEGACY_QUESTIONS, type RegistrationField } from "@shared/eventRegistrationForm";

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
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, modality, meeting_url, registration_form, current_attendees)
     VALUES ($1,$2,'<p>Teste</p>',$3,'Local de teste',$4,true,'cdpi_event',$5,$6,$7,$8::jsonb,0)`,
    [
      id,
      `[TEST] Formulário ${id.slice(0, 8)}`,
      new Date(Date.now() + 7 * 86400_000),
      opts.isFree ? "0.00" : "100.00",
      opts.isFree,
      opts.modality,
      opts.modality === "online" ? "https://meet.test/sala" : null,
      JSON.stringify(opts.registrationForm ?? []),
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

/** An existing ADR-014 foreign account: passport and address already on file. */
async function createFullForeigner(passport: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `forms-pyfull-${id.slice(0, 8)}@example.test`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, is_foreigner, foreign_document, phone, birth_date, address)
     VALUES ($1,$2,true,'x','Visitante Completa',NULL,true,$3,'595981123456',$4,'Av. España 1000, Asunción')`,
    [id, email, passport, new Date("1988-08-11")],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email };
}

/** Valid, unique CPF (correct check digits) for each call. */
let cpfSeed = 100_000_000 + Math.floor(Math.random() * 800_000_000);
function nextCpf(): string {
  const base = String(cpfSeed++).padStart(9, "0").split("").map(Number);
  const digit = (len: number) => {
    const sum = base.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  base.push(digit(9));
  base.push(digit(10));
  const d = base.join("");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function nextPassport(): string {
  return `PY${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function orderFor(userId: string, eventId: string) {
  const { rows } = await pool.query(
    `SELECT cpf, foreign_document, registration_answers, interest_area FROM orders WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId],
  );
  return rows[0];
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

describe.skipIf(!enabled)("ADR-016 Phase 3 registration forms (real routes + real DB)", () => {
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
    await pool.query(`DELETE FROM courtesy_attendees WHERE email LIKE 'forms-courtesy-%'`);
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("POST /api/auth/register with four fields (ADR-016 Phase 4)", () => {
    async function register(body: Record<string, unknown>) {
      const res = await api("POST", "/api/auth/register", { body });
      const { rows } = await pool.query(
        `SELECT id, cpf, is_foreigner, foreign_document, birth_date, address, phone, occupation FROM users WHERE email = $1`,
        [body.email],
      );
      if (rows[0]) createdUserIds.push(rows[0].id);
      return { res, row: rows[0] };
    }

    it("creates a Brazilian account with no document, birth date or address", async () => {
      const email = `forms-signup-${randomUUID().slice(0, 8)}@example.test`;

      const { res, row } = await register({ name: "maria silva", email, phone: "5561987654321", password: "secret1" });

      expect(res.status).toBe(201);
      expect(row).toMatchObject({
        cpf: null,
        is_foreigner: false,
        foreign_document: null,
        birth_date: null,
        address: null,
        phone: "5561987654321",
        occupation: "Nao aplicavel",
      });
    });

    it("creates a foreign visitor's account with a Paraguay phone, then lets it join a free online event", async () => {
      const email = `forms-signup-py-${randomUUID().slice(0, 8)}@example.test`;
      const eventId = await createEvent({ modality: "online", isFree: true });

      const { res, row } = await register({ name: "Pedro Gómez", email, phone: "595981123456", password: "secret1" });
      await pool.query(`UPDATE users SET email_verified = true WHERE id = $1`, [row.id]);
      const loginRes = await api("POST", "/api/auth/login", { body: { email, password: "secret1" } });
      const subscribe = await api("POST", `/api/events/${eventId}/subscribe`, { token: loginRes.body.token, body: {} });

      expect(res.status).toBe(201);
      expect(row).toMatchObject({ phone: "595981123456", cpf: null, foreign_document: null });
      expect(loginRes.status).toBe(200);
      expect(subscribe.status).toBe(201);
    });

    it("answers 409 and creates no account for an old full-signup body (cpf or birthDate key)", async () => {
      const email = `forms-signup-old-${randomUUID().slice(0, 8)}@example.test`;
      const base = { name: "Cliente Antigo", email, phone: "5511987654321", password: "secret1" };

      const withCpf = await register({ ...base, cpf: nextCpf(), birthDate: "11/08/1988", address: ADDRESS });
      const emptyCpf = await register({ ...base, cpf: "" });
      const foreigner = await register({ ...base, phone: "595981123456", isForeigner: true, foreignDocument: "PY123", birthDate: "11/08/1988" });

      for (const r of [withCpf, emptyCpf, foreigner]) {
        expect(r.res).toMatchObject({ status: 409, body: { message: "Atualize a página para concluir o cadastro" } });
        expect(r.row).toBeUndefined();
      }
    });

    it("still rejects a missing or invalid phone and a duplicate e-mail with 400", async () => {
      const email = `forms-signup-dup-${randomUUID().slice(0, 8)}@example.test`;
      await register({ name: "Primeira Conta", email, phone: "5511987654321", password: "secret1" });

      const noPhone = await api("POST", "/api/auth/register", {
        body: { name: "Sem Telefone", email: `x-${email}`, password: "secret1" },
      });
      const badPhone = await api("POST", "/api/auth/register", {
        body: { name: "Telefone Ruim", email: `y-${email}`, phone: "55119999", password: "secret1" },
      });
      const duplicate = await api("POST", "/api/auth/register", {
        body: { name: "Segunda Conta", email: email.toUpperCase(), phone: "5511987654321", password: "secret1" },
      });

      expect(noPhone.status).toBe(400);
      expect(badPhone).toMatchObject({ status: 400, body: { message: "Telefone inválido" } });
      expect(duplicate).toMatchObject({ status: 400, body: { message: "Email já cadastrado" } });
    });
  });

  describe("free online event", () => {
    it("subscribes a bare account with no document, and the order has no document", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const user = await createBareUser();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });

      expect(res.status).toBe(201);
      expect(await orderFor(user.id, eventId)).toMatchObject({ cpf: null, foreign_document: null });
    });

    it("subscribes a bare foreign visitor with a Paraguay phone", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const visitor = await createBareUser({ phone: "595981123456" });

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: visitor.token, body: {} });

      expect(res.status).toBe(201);
    });

    it("refuses a second inscription of the same account by user id when it has no document", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const user = await createBareUser();
      await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });

      const again = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });

      expect(again.status).toBe(409);
    });
  });

  describe("free in-person event: identity gate + PUT /api/profile/identity", () => {
    it("asks a bare account for document and address, then accepts it once they are saved", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const user = await createBareUser();
      const cpf = nextCpf();

      const first = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });
      const identity = await api("PUT", "/api/profile/identity", {
        token: user.token,
        body: { cpf, address: ADDRESS },
      });
      const second = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });

      expect(first).toMatchObject({
        status: 400,
        body: { code: "identity_required", missing: ["document", "address"] },
      });
      expect(identity).toMatchObject({ status: 200, body: { cpf, address: ADDRESS } });
      expect(identity.body.password).toBeUndefined();
      expect(second.status).toBe(201);
      expect(await orderFor(user.id, eventId)).toMatchObject({ cpf, foreign_document: null });
    });

    it("takes a passport and an address abroad from a foreign visitor and snapshots the passport", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const visitor = await createBareUser({ phone: "595981123456" });
      const passport = nextPassport();

      const first = await api("POST", `/api/events/${eventId}/subscribe`, { token: visitor.token, body: {} });
      const identity = await api("PUT", "/api/profile/identity", {
        token: visitor.token,
        body: { isForeigner: true, foreignDocument: passport.toLowerCase(), address: "Av. España 1000, Asunción" },
      });
      const second = await api("POST", `/api/events/${eventId}/subscribe`, { token: visitor.token, body: {} });

      expect(first.body.code).toBe("identity_required");
      expect(identity).toMatchObject({ status: 200, body: { isForeigner: true, foreignDocument: passport, cpf: null } });
      expect(second.status).toBe(201);
      expect(await orderFor(visitor.id, eventId)).toMatchObject({ cpf: null, foreign_document: passport });
    });

    it("never asks an existing full foreign profile again", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const visitor = await createFullForeigner(nextPassport());

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: visitor.token, body: {} });

      expect(res.status).toBe(201);
    });
  });

  describe("PUT /api/profile/identity rules", () => {
    it("rejects a CPF already used by another account with 409", async () => {
      const cpf = nextCpf();
      const owner = await createBareUser();
      const other = await createBareUser();
      await api("PUT", "/api/profile/identity", { token: owner.token, body: { cpf } });

      const res = await api("PUT", "/api/profile/identity", { token: other.token, body: { cpf } });

      expect(res).toMatchObject({ status: 409, body: { message: "Este documento já está cadastrado em outra conta." } });
    });

    it("rejects a passport already used by another account with 409", async () => {
      const passport = nextPassport();
      const owner = await createBareUser({ phone: "595981123456" });
      const other = await createBareUser({ phone: "595981654321" });
      await api("PUT", "/api/profile/identity", { token: owner.token, body: { isForeigner: true, foreignDocument: passport } });

      const res = await api("PUT", "/api/profile/identity", {
        token: other.token,
        body: { isForeigner: true, foreignDocument: passport },
      });

      expect(res.status).toBe(409);
    });

    it("keeps the document write-once: a different one is 409, the same one is 200", async () => {
      const cpf = nextCpf();
      const user = await createBareUser();
      await api("PUT", "/api/profile/identity", { token: user.token, body: { cpf } });

      const different = await api("PUT", "/api/profile/identity", { token: user.token, body: { cpf: nextCpf() } });
      const toPassport = await api("PUT", "/api/profile/identity", {
        token: user.token,
        body: { isForeigner: true, foreignDocument: nextPassport() },
      });
      const same = await api("PUT", "/api/profile/identity", { token: user.token, body: { cpf, address: ADDRESS } });

      expect(different).toMatchObject({
        status: 409,
        body: { message: "Documento já informado; fale com o suporte para alterar." },
      });
      expect(toPassport.status).toBe(409);
      expect(same).toMatchObject({ status: 200, body: { cpf, address: ADDRESS } });
    });

    it("lets only one of two concurrent different documents win, and accepts the same one twice", async () => {
      const raced = await createBareUser();
      const same = await createBareUser();
      const cpf = nextCpf();

      const different = await Promise.all([
        api("PUT", "/api/profile/identity", { token: raced.token, body: { cpf: nextCpf() } }),
        api("PUT", "/api/profile/identity", { token: raced.token, body: { cpf: nextCpf() } }),
      ]);
      const identical = await Promise.all([
        api("PUT", "/api/profile/identity", { token: same.token, body: { cpf } }),
        api("PUT", "/api/profile/identity", { token: same.token, body: { cpf } }),
      ]);

      expect(different.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(identical.map((r) => r.status)).toEqual([200, 200]);
    });

    it("rejects an invalid CPF and a short address with 400", async () => {
      const user = await createBareUser();

      const badCpf = await api("PUT", "/api/profile/identity", { token: user.token, body: { cpf: "123.456.789-00" } });
      const shortAddress = await api("PUT", "/api/profile/identity", { token: user.token, body: { address: "Rua 1" } });
      const empty = await api("PUT", "/api/profile/identity", { token: user.token, body: {} });

      expect(badCpf.status).toBe(400);
      expect(shortAddress.status).toBe(400);
      expect(empty.status).toBe(400);
    });

    it("cannot set isAdmin or any field outside the identity", async () => {
      const user = await createBareUser();

      await api("PUT", "/api/profile/identity", {
        token: user.token,
        body: { address: ADDRESS, isAdmin: true, email: "takeover@example.test" },
      });
      const { rows } = await pool.query(`SELECT is_admin, email FROM users WHERE id = $1`, [user.id]);

      expect(rows[0]).toEqual({ is_admin: false, email: user.email });
    });
  });

  describe("paid online event", () => {
    it("asks a bare account for its document only", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const user = await createBareUser();

      const res = await api("POST", "/api/orders", { token: user.token, body: { eventId, paymentMethod: "pix" } });

      expect(res).toMatchObject({ status: 400, body: { code: "identity_required", missing: ["document"] } });
    });

    it("keeps foreigners on card only, and their card order reaches the foreign card payment", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const visitor = await createBareUser({ phone: "595981123456" });
      const passport = nextPassport();
      await api("PUT", "/api/profile/identity", { token: visitor.token, body: { isForeigner: true, foreignDocument: passport } });

      const pix = await api("POST", "/api/orders", { token: visitor.token, body: { eventId, paymentMethod: "pix" } });
      const card = await api("POST", "/api/orders", {
        token: visitor.token,
        body: { eventId, paymentMethod: "credit_card" },
      });

      expect(pix.status).toBe(400);
      expect(card.status).toBe(201);
      expect(foreignCardCalls).toContainEqual(expect.objectContaining({ cpfCnpj: passport }));
      expect(card.body.order.registrationAnswers).toBeUndefined();
    });
  });

  describe("buyer payloads", () => {
    it("never show the answers or the legacy interest area on Meus ingressos", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo] });
      const user = await createBareUser();
      await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: { answers: { "f-cargo": "Gerente" } } });
      await pool.query(`UPDATE orders SET interest_area = 'Farmácia' WHERE user_id = $1`, [user.id]);

      const res = await api("GET", "/api/orders", { token: user.token });

      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(1);
      expect(res.body.orders[0]).not.toHaveProperty("registrationAnswers");
      expect(res.body.orders[0]).not.toHaveProperty("interestArea");
    });
  });

  describe("admin form saves", () => {
    it("creates an event with a form and replaces client-made ids with server UUIDs", async () => {
      const admin = await createBareUser({ isAdmin: true });
      const form = new FormData();
      form.append("title", `[TEST] Criado com formulário ${randomUUID().slice(0, 8)}`);
      form.append("description", "<p>Teste</p>");
      form.append("date", "2027-03-10T10:00");
      form.append("location", "Online");
      form.append("price", "0");
      form.append("is_free", "true");
      form.append("modality", "online");
      form.append("meeting_url", "https://meet.test/sala");
      form.append("registration_form", JSON.stringify([{ id: "client-made", type: "text", label: "Cargo", required: true }]));
      form.append("coverImage", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "cover.png");

      const res = await api("POST", "/api/admin/events", { token: admin.token, form });
      if (res.body?.id) createdEventIds.push(res.body.id);

      expect(res.status).toBe(201);
      expect(res.body.registrationForm).toHaveLength(1);
      expect(res.body.registrationForm[0]).toMatchObject({ type: "text", label: "Cargo", required: true, archived: false });
      expect(res.body.registrationForm[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("gives a question added on edit a server UUID even when the client sends an id", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo] });
      const admin = await createBareUser({ isAdmin: true });
      const form = new FormData();
      form.append("registration_form", JSON.stringify([cargo, { id: "client-made", type: "text", label: "Empresa" }]));

      await api("PATCH", `/api/admin/events/${eventId}`, { token: admin.token, form });
      const { rows } = await pool.query(`SELECT registration_form FROM events WHERE id = $1`, [eventId]);

      expect(rows[0].registration_form[0]).toEqual(cargo);
      expect(rows[0].registration_form[1].id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("shows a pre-ADR-016 order's interest area as an answer in the participants list", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const user = await createBareUser();
      await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });
      await pool.query(`UPDATE orders SET interest_area = 'Farmácia' WHERE user_id = $1`, [user.id]);

      const res = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

      expect(res.body.data[0].registrationAnswers).toEqual([
        { fieldId: "interest-area", label: "Área de interesse", value: "Farmácia" },
      ]);
    });
  });

  describe("answers", () => {
    it("rejects a missing required answer and stores a snapshot of valid ones", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo, turno] });
      const user = await createBareUser();

      const missing = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: { answers: { "f-turno": "Tarde" } },
      });
      const ok = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: { answers: { "f-cargo": "Farmacêutica", "f-turno": "Tarde" } },
      });

      expect(missing).toMatchObject({ status: 400, body: { message: "Responda a pergunta obrigatória: Cargo" } });
      expect(ok.status).toBe(201);
      expect(ok.body.order.registrationAnswers).toBeUndefined();
      expect(await orderFor(user.id, eventId)).toMatchObject({
        interest_area: null,
        registration_answers: [
          { fieldId: "f-cargo", label: "Cargo", value: "Farmacêutica" },
          { fieldId: "f-turno", label: "Turno", value: "Tarde" },
        ],
      });
    });

    it("keeps an answer after the admin removes the question, and the participants list still shows it", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo, turno] });
      const admin = await createBareUser({ isAdmin: true });
      const user = await createBareUser();
      await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: { answers: { "f-cargo": "Gerente" } },
      });

      const form = new FormData();
      form.append("registration_form", JSON.stringify([{ ...turno, label: "Turno preferido" }]));
      const edit = await api("PATCH", `/api/admin/events/${eventId}`, { token: admin.token, form });
      const participants = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

      expect(edit.status).toBe(200);
      expect(participants.status).toBe(200);
      expect(participants.body.registrationForm).toEqual([
        { ...turno, label: "Turno preferido" },
        { ...cargo, archived: true },
      ]);
      expect(participants.body.data).toEqual([
        expect.objectContaining({
          userId: user.id,
          address: null,
          isForeigner: false,
          registrationAnswers: [{ fieldId: "f-cargo", label: "Cargo", value: "Gerente" }],
        }),
      ]);
    });

    it("leaves the form alone when an admin edit does not send it", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo] });
      const admin = await createBareUser({ isAdmin: true });

      const form = new FormData();
      form.append("sales_closed", "true");
      await api("PATCH", `/api/admin/events/${eventId}`, { token: admin.token, form });
      const { rows } = await pool.query(`SELECT registration_form FROM events WHERE id = $1`, [eventId]);

      expect(rows[0].registration_form).toEqual([cargo]);
    });

    it("rejects a type change on a saved question with 400", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo] });
      const admin = await createBareUser({ isAdmin: true });

      const form = new FormData();
      form.append("registration_form", JSON.stringify([{ ...cargo, type: "select", options: ["A", "B"] }]));
      const res = await api("PATCH", `/api/admin/events/${eventId}`, { token: admin.token, form });

      expect(res.status).toBe(400);
    });
  });

  describe("courtesy", () => {
    async function courtesyCode(eventId: string, createdBy: string): Promise<string> {
      const code = `FORMS${randomUUID().slice(0, 6).toUpperCase()}`;
      await pool.query(
        `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by)
         VALUES ($1,$2,$3,5,0,true,$4)`,
        [randomUUID(), eventId, code, createdBy],
      );
      return code;
    }

    it("redeems an online courtesy with no CPF, birth date or address, with answers, for a +595 phone", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false, registrationForm: [cargo] });
      const admin = await createBareUser({ isAdmin: true });
      const guest = await createBareUser({ phone: "595981123456" });
      const email = `forms-courtesy-${guest.id.slice(0, 8)}@example.test`;

      const res = await api("POST", "/api/courtesy/redeem", {
        token: guest.token,
        body: {
          code: await courtesyCode(eventId, admin.id),
          name: "Convidada Online",
          email,
          emailConfirm: email,
          partnerCompany: "Empresa",
          occupation: "Analista",
          phone: "595981123456",
          answers: { "f-cargo": "Coordenadora" },
        },
      });
      const { rows } = await pool.query(
        `SELECT cpf, foreign_document, birth_date, address FROM courtesy_attendees WHERE email = $1`,
        [email],
      );

      expect(res.status).toBe(201);
      expect(rows[0]).toEqual({ cpf: null, foreign_document: null, birth_date: null, address: null });
      expect(await orderFor(guest.id, eventId)).toMatchObject({
        cpf: null,
        registration_answers: [{ fieldId: "f-cargo", label: "Cargo", value: "Coordenadora" }],
      });
    });

    function inPersonCourtesy(code: string, email: string, cpf: string) {
      return {
        code,
        name: "Convidado Presencial",
        email,
        emailConfirm: email,
        cpf,
        partnerCompany: "Empresa",
        occupation: "Analista",
        phone: "5511988887777",
        birthDate: "1990-05-10",
        address: ADDRESS,
      };
    }

    it("keeps in-person courtesy as before: one account may redeem for two attendees with different CPFs", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const admin = await createBareUser({ isAdmin: true });
      const organizer = await createBareUser();
      const tag = organizer.id.slice(0, 8);

      const first = await api("POST", "/api/courtesy/redeem", {
        token: organizer.token,
        body: inPersonCourtesy(await courtesyCode(eventId, admin.id), `forms-courtesy-a-${tag}@example.test`, nextCpf()),
      });
      const second = await api("POST", "/api/courtesy/redeem", {
        token: organizer.token,
        body: inPersonCourtesy(await courtesyCode(eventId, admin.id), `forms-courtesy-b-${tag}@example.test`, nextCpf()),
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    it("rejects a second online courtesy from the same account", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const admin = await createBareUser({ isAdmin: true });
      const guest = await createBareUser();
      const email = `forms-courtesy-${guest.id.slice(0, 8)}@example.test`;
      const body = async () => ({
        code: await courtesyCode(eventId, admin.id),
        name: "Convidada Online",
        email,
        emailConfirm: email,
        partnerCompany: "Empresa",
        occupation: "Analista",
        phone: "5511988887777",
      });

      const first = await api("POST", "/api/courtesy/redeem", { token: guest.token, body: await body() });
      const second = await api("POST", "/api/courtesy/redeem", { token: guest.token, body: await body() });

      expect(first.status).toBe(201);
      expect(second.status).toBe(400);
    });

    function onlineCourtesy(code: string, email: string) {
      return {
        code,
        name: "Convidada Online",
        email,
        emailConfirm: email,
        partnerCompany: "Empresa",
        occupation: "Analista",
        phone: "595981123456",
      };
    }

    it("lets one account redeem an online courtesy for two attendees with different e-mails", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false });
      const admin = await createBareUser({ isAdmin: true });
      const sponsor = await createBareUser();
      const code = await courtesyCode(eventId, admin.id);
      const tag = sponsor.id.slice(0, 8);

      const first = await api("POST", "/api/courtesy/redeem", {
        token: sponsor.token,
        body: onlineCourtesy(code, `forms-team-a-${tag}@example.test`),
      });
      const second = await api("POST", "/api/courtesy/redeem", {
        token: sponsor.token,
        body: onlineCourtesy(code, `forms-team-b-${tag}@example.test`),
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    it("rejects an online courtesy for an e-mail whose account already subscribed itself", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const member = await createBareUser();
      const sponsor = await createBareUser();
      expect((await api("POST", `/api/events/${eventId}/subscribe`, { token: member.token, body: {} })).status).toBe(201);

      const res = await api("POST", "/api/courtesy/redeem", {
        token: sponsor.token,
        body: onlineCourtesy(await courtesyCode(eventId, admin.id), member.email.toUpperCase()),
      });

      expect(res.status).toBe(400);
    });

    it("lets an account that redeemed an online courtesy for someone else subscribe itself", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const sponsor = await createBareUser();
      const redeemed = await api("POST", "/api/courtesy/redeem", {
        token: sponsor.token,
        body: onlineCourtesy(await courtesyCode(eventId, admin.id), `forms-guest-${sponsor.id.slice(0, 8)}@example.test`),
      });

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: sponsor.token, body: {} });

      expect(redeemed.status).toBe(201);
      expect(res.status).toBe(201);
    });

    it("rejects a free subscribe from an account whose own e-mail already holds an online courtesy", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const guest = await createBareUser();
      const redeemed = await api("POST", "/api/courtesy/redeem", {
        token: guest.token,
        body: onlineCourtesy(await courtesyCode(eventId, admin.id), guest.email),
      });

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: guest.token, body: {} });

      expect(redeemed.status).toBe(201);
      expect(res.status).toBe(409);
    });

    it("lets an account that redeemed an in-person courtesy for someone else subscribe itself", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: true });
      const admin = await createBareUser({ isAdmin: true });
      const sponsor = await createBareUser();
      const redeemed = await api("POST", "/api/courtesy/redeem", {
        token: sponsor.token,
        body: inPersonCourtesy(
          await courtesyCode(eventId, admin.id),
          `forms-guest-${sponsor.id.slice(0, 8)}@example.test`,
          nextCpf(),
        ),
      });
      const identity = await api("PUT", "/api/profile/identity", {
        token: sponsor.token,
        body: { isForeigner: false, cpf: nextCpf(), address: ADDRESS },
      });

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: sponsor.token, body: {} });

      expect(redeemed.status).toBe(201);
      expect(identity.status).toBe(200);
      expect(res.status).toBe(201);
    });

    it("lists a courtesy row with the attendee's CPF when the redeeming account has no document", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const admin = await createBareUser({ isAdmin: true });
      const sponsor = await createBareUser();
      const attendeeCpf = nextCpf();
      await api("POST", "/api/courtesy/redeem", {
        token: sponsor.token,
        body: inPersonCourtesy(
          await courtesyCode(eventId, admin.id),
          `forms-guest-${sponsor.id.slice(0, 8)}@example.test`,
          attendeeCpf,
        ),
      });

      const res = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([expect.objectContaining({ cpf: attendeeCpf, orderStatus: "courtesy" })]);
    });

    it("still requires the CPF on an in-person courtesy", async () => {
      const eventId = await createEvent({ modality: "presencial", isFree: false });
      const admin = await createBareUser({ isAdmin: true });
      const guest = await createBareUser();
      const email = `forms-courtesy-${guest.id.slice(0, 8)}@example.test`;

      const res = await api("POST", "/api/courtesy/redeem", {
        token: guest.token,
        body: {
          code: await courtesyCode(eventId, admin.id),
          name: "Convidado Presencial",
          email,
          emailConfirm: email,
          partnerCompany: "Empresa",
          occupation: "Analista",
          phone: "5511988887777",
          birthDate: "1990-05-10",
          address: ADDRESS,
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("legacy profile questions (old-bundle fallback, courtesy, participants)", () => {
    const legacyForm: RegistrationField[] = LEGACY_QUESTIONS.map((q) => ({
      id: q.id,
      type: "text",
      label: q.label,
      options: [],
      required: true,
      archived: false,
    }));
    const PROFILE = { occupation: "Médica", company: "Clínica Aurora", area: "Pesquisa clínica" };

    /** An account from before ADR-016: work fields filled in, optionally a passport and a +595 phone. */
    async function createLegacyUser(opts: { foreigner?: boolean; isAdmin?: boolean } = {}): Promise<TestUser> {
      const id = randomUUID();
      const email = `forms-legacy-${id.slice(0, 8)}@example.test`;
      await pool.query(
        `INSERT INTO users (id, email, email_verified, password, name, cpf, is_foreigner, foreign_document, phone, address, occupation, partner_company, area_of_activity, is_admin)
         VALUES ($1,$2,true,'x','Conta Antiga',$3,$4,$5,$6,'Rua Antiga, 1, Sao Paulo',$7,$8,$9,$10)`,
        [
          id,
          email,
          opts.foreigner ? null : nextCpf(),
          opts.foreigner === true,
          opts.foreigner ? nextPassport() : null,
          opts.foreigner ? "595981123456" : "5511999999999",
          PROFILE.occupation,
          PROFILE.company,
          PROFILE.area,
          opts.isAdmin ?? false,
        ],
      );
      createdUserIds.push(id);
      return { id, token: jwt.sign({ userId: id }, JWT_SECRET), email };
    }

    const snapshot = (...values: string[]) =>
      LEGACY_QUESTIONS.map((q, i) => ({ fieldId: q.id, label: q.label, value: values[i] }));

    it("old bundle: a free subscribe WITHOUT answers snapshots the profile values", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
      const user = await createLegacyUser();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });

      expect(res.status).toBe(201);
      expect((await orderFor(user.id, eventId)).registration_answers).toEqual(
        snapshot(PROFILE.occupation, PROFILE.company, PROFILE.area),
      );
    });

    it("explicit answers win over the profile", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
      const user = await createLegacyUser();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: { answers: { "legacy-occupation": "Diretora", "legacy-area-of-activity": " " } },
      });

      expect(res.status).toBe(201);
      expect((await orderFor(user.id, eventId)).registration_answers).toEqual(
        snapshot("Diretora", PROFILE.company, PROFILE.area),
      );
    });

    it("a 4-field account with no profile value still gets 400 without answers, 201 with them", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
      const user = await createBareUser();

      const missing = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });
      const ok = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
        body: {
          answers: {
            "legacy-occupation": "Analista",
            "legacy-partner-company": "Acme",
            "legacy-area-of-activity": "Regulatório",
          },
        },
      });

      // No `answers` key = old bundle: reload (409); the 400 with a key is covered below.
      expect(missing.status).toBe(409);
      expect(ok.status).toBe(201);
    });

    it("foreigner (passport, +595 phone): the fallback fills the answers too", async () => {
      const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
      const visitor = await createLegacyUser({ foreigner: true });

      const res = await api("POST", `/api/events/${eventId}/subscribe`, { token: visitor.token, body: {} });

      expect(res.status).toBe(201);
      expect((await orderFor(visitor.id, eventId)).registration_answers).toEqual(
        snapshot(PROFILE.occupation, PROFILE.company, PROFILE.area),
      );
    });

    it("old bundle: a paid card order WITHOUT answers snapshots the profile (foreigner, Asaas mocked)", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false, registrationForm: legacyForm });
      const visitor = await createLegacyUser({ foreigner: true });

      const res = await api("POST", "/api/orders", {
        token: visitor.token,
        body: { eventId, paymentMethod: "credit_card" },
      });

      expect(res.status).toBe(201);
      expect((await orderFor(visitor.id, eventId)).registration_answers).toEqual(
        snapshot(PROFILE.occupation, PROFILE.company, PROFILE.area),
      );
    });

    it("old bundle: a paid PIX order by a Brazilian WITHOUT answers snapshots the profile; 4-field gets 400", async () => {
      const eventId = await createEvent({ modality: "online", isFree: false, registrationForm: legacyForm });
      const user = await createLegacyUser();
      const bare = await createBareUser();
      await api("PUT", "/api/profile/identity", { token: bare.token, body: { cpf: nextCpf() } });

      const ok = await api("POST", "/api/orders", { token: user.token, body: { eventId, paymentMethod: "pix" } });
      const refused = await api("POST", "/api/orders", { token: bare.token, body: { eventId, paymentMethod: "pix" } });

      expect(ok.status).toBe(201);
      expect((await orderFor(user.id, eventId)).registration_answers).toEqual(
        snapshot(PROFILE.occupation, PROFILE.company, PROFILE.area),
      );
      expect(refused.status).toBe(409);
    });

    describe("courtesy redeem", () => {
      async function code(eventId: string, createdBy: string): Promise<string> {
        const c = `LEGCY${randomUUID().slice(0, 6).toUpperCase()}`;
        await pool.query(
          `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by)
           VALUES ($1,$2,$3,5,0,true,$4)`,
          [randomUUID(), eventId, c, createdBy],
        );
        return c;
      }

      it("online: occupation and company come from the attendee, never the redeeming account; area is asked", async () => {
        const eventId = await createEvent({ modality: "online", isFree: false, registrationForm: legacyForm });
        const admin = await createBareUser({ isAdmin: true });
        const sponsor = await createLegacyUser();
        const email = `forms-courtesy-${sponsor.id.slice(0, 8)}@example.test`;
        const body = (extra: object) => ({
          code: "",
          name: "Convidada Online",
          email,
          emailConfirm: email,
          partnerCompany: "Empresa do Convidado",
          occupation: "Analista Convidada",
          phone: "595981123456",
          ...extra,
        });
        const link = await code(eventId, admin.id);

        const noArea = await api("POST", "/api/courtesy/redeem", { token: sponsor.token, body: { ...body({ answers: {} }), code: link } });
        const ok = await api("POST", "/api/courtesy/redeem", {
          token: sponsor.token,
          body: { ...body({ answers: { "legacy-area-of-activity": "Farmácia" } }), code: link },
        });

        expect(noArea.status).toBe(400);
        expect(noArea.body.message).toContain("Área de atuação");
        expect(ok.status).toBe(201);
        expect((await orderFor(sponsor.id, eventId)).registration_answers).toEqual(
          snapshot("Analista Convidada", "Empresa do Convidado", "Farmácia"),
        );
      });

      it("in-person: same rule with the attendee's CPF, and the participants list shows the attendee", async () => {
        const eventId = await createEvent({ modality: "presencial", isFree: false, registrationForm: legacyForm });
        const admin = await createBareUser({ isAdmin: true });
        const sponsor = await createLegacyUser();
        const email = `forms-courtesy-${sponsor.id.slice(0, 8)}@example.test`;

        const res = await api("POST", "/api/courtesy/redeem", {
          token: sponsor.token,
          body: {
            code: await code(eventId, admin.id),
            name: "Convidado Presencial",
            email,
            emailConfirm: email,
            cpf: nextCpf(),
            partnerCompany: "Empresa do Convidado",
            occupation: "Analista Convidado",
            phone: "5511988887777",
            birthDate: "1990-05-10",
            address: ADDRESS,
            answers: { "legacy-area-of-activity": "Farmácia" },
          },
        });
        const list = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

        expect(res.status).toBe(201);
        expect(list.body.data).toEqual([
          expect.objectContaining({
            orderStatus: "courtesy",
            name: "Convidado Presencial",
            email,
            phone: "5511988887777",
            occupation: "Analista Convidado",
            partnerCompany: "Empresa do Convidado",
            areaOfActivity: "Farmácia",
            registrationAnswers: [],
          }),
        ]);
      });
    });

    describe("participants list", () => {
      it("merges legacy answers into the profile columns, falling back to the profile, and keeps admin questions", async () => {
        const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo, ...legacyForm] });
        const admin = await createBareUser({ isAdmin: true });
        const answered = await createLegacyUser();
        const oldBundle = await createLegacyUser();
        await api("POST", `/api/events/${eventId}/subscribe`, {
          token: answered.token,
          body: { answers: { "f-cargo": "Gerente", "legacy-occupation": "Diretora", "legacy-partner-company": "Outra", "legacy-area-of-activity": "Vendas" } },
        });
        await api("POST", `/api/events/${eventId}/subscribe`, { token: oldBundle.token, body: { answers: { "f-cargo": "Gerente" } } });
        // An order from before the legacy questions existed: no answers, profile only.
        await pool.query(
          `UPDATE orders SET registration_answers = '[{"fieldId":"f-cargo","label":"Cargo","value":"Gerente"}]'::jsonb WHERE user_id = $1`,
          [oldBundle.id],
        );

        const res = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });
        const byId = new Map<string, any>(res.body.data.map((r: any) => [r.userId, r]));

        expect(byId.get(answered.id)).toMatchObject({
          occupation: "Diretora",
          partnerCompany: "Outra",
          areaOfActivity: "Vendas",
          registrationAnswers: [{ fieldId: "f-cargo", label: "Cargo", value: "Gerente" }],
        });
        expect(byId.get(oldBundle.id)).toMatchObject({
          occupation: PROFILE.occupation,
          partnerCompany: PROFILE.company,
          areaOfActivity: PROFILE.area,
        });
      });

      it("leaves the columns empty for a 4-field account with no answer (placeholder is not data)", async () => {
        const eventId = await createEvent({ modality: "online", isFree: true });
        const admin = await createBareUser({ isAdmin: true });
        const user = await createBareUser();
        await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });

        const res = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

        expect(res.body.data[0]).toMatchObject({ occupation: null, partnerCompany: null, areaOfActivity: null });
      });

      it("an archived legacy question still feeds the same merged column", async () => {
        const archivedForm = legacyForm.map((f) => ({ ...f, archived: true }));
        const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
        const admin = await createBareUser({ isAdmin: true });
        const user = await createLegacyUser();
        await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token, body: {} });
        await pool.query(`UPDATE events SET registration_form = $2::jsonb WHERE id = $1`, [eventId, JSON.stringify(archivedForm)]);
        await pool.query(`UPDATE users SET occupation = 'Mudou Depois' WHERE id = $1`, [user.id]);

        const res = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

        expect(res.body.data[0]).toMatchObject({ occupation: PROFILE.occupation, registrationAnswers: [] });
      });
    });

    describe("old bundle (no `answers` key) that cannot be completed", () => {
      const RELOAD = { message: "Atualize a página para concluir a inscrição", code: "reload_required" };

      it("/subscribe: 4-field account, no answers key -> 409 reload; with answers key -> 400; full profile -> 201", async () => {
        const eventId = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
        const bare = await createBareUser();
        const full = await createLegacyUser();
        const foreigner = await createLegacyUser({ foreigner: true });

        const old = await api("POST", `/api/events/${eventId}/subscribe`, { token: bare.token, body: {} });
        const fresh = await api("POST", `/api/events/${eventId}/subscribe`, { token: bare.token, body: { answers: {} } });
        const okFull = await api("POST", `/api/events/${eventId}/subscribe`, { token: full.token, body: {} });
        const okForeign = await api("POST", `/api/events/${eventId}/subscribe`, { token: foreigner.token, body: {} });

        expect(old).toMatchObject({ status: 409, body: RELOAD });
        expect(fresh.status).toBe(400);
        expect(okFull.status).toBe(201);
        expect(okForeign.status).toBe(201);
      });

      it("/api/orders: 4-field foreigner, no answers key -> 409 reload; with answers key -> 400", async () => {
        const eventId = await createEvent({ modality: "online", isFree: false, registrationForm: legacyForm });
        const visitor = await createBareUser({ phone: "595981123456" });
        await api("PUT", "/api/profile/identity", { token: visitor.token, body: { isForeigner: true, foreignDocument: nextPassport() } });

        const old = await api("POST", "/api/orders", { token: visitor.token, body: { eventId, paymentMethod: "credit_card" } });
        const fresh = await api("POST", "/api/orders", {
          token: visitor.token,
          body: { eventId, paymentMethod: "credit_card", answers: {} },
        });

        expect(old).toMatchObject({ status: 409, body: RELOAD });
        expect(fresh.status).toBe(400);
      });

      it("/courtesy/redeem: old body (no answers key) on an event with the area question -> 409; with the key -> 400", async () => {
        const eventId = await createEvent({ modality: "online", isFree: false, registrationForm: legacyForm });
        const admin = await createBareUser({ isAdmin: true });
        const sponsor = await createLegacyUser({ foreigner: true });
        const email = `forms-courtesy-${sponsor.id.slice(0, 8)}@example.test`;
        const c = `LEGCY${randomUUID().slice(0, 6).toUpperCase()}`;
        await pool.query(
          `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by) VALUES ($1,$2,$3,5,0,true,$4)`,
          [randomUUID(), eventId, c, admin.id],
        );
        const body = {
          code: c,
          name: "Convidada",
          email,
          emailConfirm: email,
          partnerCompany: "Empresa",
          occupation: "Analista",
          phone: "595981123456",
        };

        const old = await api("POST", "/api/courtesy/redeem", { token: sponsor.token, body });
        const fresh = await api("POST", "/api/courtesy/redeem", { token: sponsor.token, body: { ...body, answers: {} } });

        expect(old).toMatchObject({ status: 409, body: RELOAD });
        expect(fresh.status).toBe(400);
      });
    });

    describe("courtesy rows never show the redeeming account's PII", () => {
      it("online courtesy redeemed by a full-profile account (BR and foreigner): blank document, address, not foreigner", async () => {
        const eventId = await createEvent({ modality: "online", isFree: false });
        const admin = await createBareUser({ isAdmin: true });
        const c = `LEGCY${randomUUID().slice(0, 6).toUpperCase()}`;
        await pool.query(
          `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by) VALUES ($1,$2,$3,5,0,true,$4)`,
          [randomUUID(), eventId, c, admin.id],
        );
        for (const sponsor of [await createLegacyUser(), await createLegacyUser({ foreigner: true })]) {
          const email = `forms-courtesy-${sponsor.id.slice(0, 8)}@example.test`;
          const res = await api("POST", "/api/courtesy/redeem", {
            token: sponsor.token,
            body: { code: c, name: "Convidada", email, emailConfirm: email, partnerCompany: "Empresa", occupation: "Analista", phone: "595981123456" },
          });
          expect(res.status).toBe(201);
        }

        const list = await api("GET", `/api/admin/events/${eventId}/participants`, { token: admin.token });

        expect(list.body.data).toHaveLength(2);
        for (const row of list.body.data) {
          expect(row).toMatchObject({ orderStatus: "courtesy", cpf: "", address: null, isForeigner: false });
        }
      });
    });

    describe("sql/phone_parenthesized_br_fix.sql", () => {
      it("fixes only parenthesized 10-11 digit phones, leaves foreign E.164 alone, and is re-runnable", async () => {
        const SQL = readFileSync(join(__dirname, "../../../sql/phone_parenthesized_br_fix.sql"), "utf8");
        const phones = ["(11) 98765-4321", "12025550123", "34612345678", "595981123456", "5511999990000"];
        const users: TestUser[] = [];
        for (const phone of phones) users.push(await createBareUser({ phone }));
        const attendeeId = randomUUID();
        await pool.query(
          `INSERT INTO courtesy_attendees (id, name, email, phone, event_title) VALUES ($1,'Conv','forms-courtesy-phone-${attendeeId.slice(0, 8)}@example.test','(21) 3456-7890','t')`,
          [attendeeId],
        );
        const read = async () =>
          (await pool.query(`SELECT phone FROM users WHERE id = ANY($1) ORDER BY array_position($1::varchar[], id)`, [users.map((u) => u.id)])).rows.map((r) => r.phone);

        await pool.query(SQL);
        const once = await read();
        await pool.query(SQL);

        expect(once).toEqual(["5511987654321", "12025550123", "34612345678", "595981123456", "5511999990000"]);
        expect(await read()).toEqual(once);
        expect((await pool.query(`SELECT phone FROM courtesy_attendees WHERE id = $1`, [attendeeId])).rows[0].phone).toBe("552134567890");
      });
    });

    describe("sql/adr016_attach_legacy_questions.sql", () => {
      it("appends the three questions after admin questions, once: second run updates 0 rows", async () => {
        const SQL = readFileSync(join(__dirname, "../../../sql/adr016_attach_legacy_questions.sql"), "utf8");
        const withAdmin = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo] });
        const empty = await createEvent({ modality: "presencial", isFree: false });
        const already = await createEvent({ modality: "online", isFree: true, registrationForm: legacyForm });
        const untouched = await createEvent({ modality: "online", isFree: true, registrationForm: [cargo] });
        const sql = SQL.replaceAll("'13e253d6-14a2-496d-be4d-8a3ca4b0f8df'", `'${withAdmin}'`)
          .replaceAll("'168193f7-1aa2-45d6-b6e8-ba0ea355efaa'", `'${empty}'`)
          .replaceAll("'f2ded6cd-1d45-4cb1-ba6a-7bf8616fda60'", `'${already}'`);
        expect(sql).not.toMatch(/13e253d6|168193f7|f2ded6cd/);

        const first = await pool.query(sql);
        const second = await pool.query(sql);
        const forms = async (id: string) =>
          (await pool.query(`SELECT registration_form AS f FROM events WHERE id = $1`, [id])).rows[0].f as RegistrationField[];

        expect(first.rowCount).toBe(2);
        expect(second.rowCount).toBe(0);
        expect((await forms(withAdmin)).map((f) => f.id)).toEqual(["f-cargo", ...LEGACY_QUESTIONS.map((q) => q.id)]);
        expect((await forms(withAdmin))[1]).toEqual(legacyForm[0]);
        expect((await forms(empty)).map((f) => f.id)).toEqual(LEGACY_QUESTIONS.map((q) => q.id));
        expect(await forms(already)).toEqual(legacyForm);
        expect((await forms(untouched)).map((f) => f.id)).toEqual(["f-cargo"]);
      });
    });
  });
});
