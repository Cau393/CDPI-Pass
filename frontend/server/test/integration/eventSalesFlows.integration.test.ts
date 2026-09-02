/**
 * End-to-end integration test for the free-event and sales-closed flows.
 *
 * Unlike the rest of `server/test/`, this boots the REAL Express app from
 * `registerRoutes` and drives it over real HTTP against a real PostgreSQL
 * database, so it exercises the actual route handlers, the actual Drizzle
 * queries and the actual `events.is_free` / `events.sales_closed` columns.
 *
 * It is skipped unless VERIFY_DATABASE_URL points at a throwaway database,
 * so a normal `pnpm test` (and CI) is unaffected:
 *
 *   docker run -d --name cdpi-verify -e POSTGRES_PASSWORD=verify \
 *     -e POSTGRES_DB=cdpi -p 55433:5432 postgres:16-alpine
 *   VERIFY_DATABASE_URL=postgresql://postgres:verify@localhost:55433/cdpi \
 *     npx vitest run --config vitest.server.config.ts server/test/integration
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

// Guard: this suite mutates data, so refuse to run against a managed host.
if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error(
    "VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.",
  );
}

const JWT_SECRET = "integration-test-secret";
process.env.JWT_SECRET = JWT_SECRET;
process.env.DATABASE_URL = VERIFY_URL ?? "postgresql://unused";
process.env.ASAAS_API_KEY = "test-key-not-used";

// Swap the Neon websocket driver for plain `pg` so the app can talk to a local
// PostgreSQL. Only the transport changes; the schema and queries are the real ones.
vi.mock("../../db", async () => {
  const { Pool: PgPool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@shared/schema");
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
});

// Outbound side effects: assert on them instead of hitting the network.
const sentTicketEmails: Array<{ to: string; eventTitle: string }> = [];
vi.mock("../../services/emailService", () => ({
  emailService: {
    sendTicketEmail: vi.fn(async (to: string, data: any) => {
      sentTicketEmails.push({ to, eventTitle: data.eventTitle });
      return true;
    }),
    sendCardPaymentLinkEmail: vi.fn(async () => true),
    sendEmail: vi.fn(async () => true),
  },
}));

const asaasCalls: unknown[] = [];
vi.mock("../../services/asaasService", () => ({
  asaasService: {
    // If a free event ever reaches Asaas, this records it and the test fails.
    createPayment: vi.fn(async (payload: unknown) => {
      asaasCalls.push(payload);
      return {
        id: `pay_${randomUUID()}`,
        paymentLink: "https://asaas.test/pay",
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

/** Rows created by this suite, removed in afterAll. */
const createdEventIds: string[] = [];
const createdUserIds: string[] = [];

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

async function createEvent(overrides: {
  isFree?: boolean;
  salesClosed?: boolean;
  price?: string;
  maxAttendees?: number | null;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, is_free, sales_closed, max_attendees, current_attendees)
     VALUES ($1,$2,$3,$4,$5,$6,true,'cdpi_event',$7,$8,$9,0)`,
    [
      id,
      `[TEST] Evento ${id.slice(0, 8)}`,
      "<p>Evento de teste automatizado</p>",
      new Date(Date.now() + 7 * 86400_000),
      "Local de teste",
      overrides.price ?? "100.00",
      overrides.isFree ?? false,
      overrides.salesClosed ?? false,
      overrides.maxAttendees ?? null,
    ],
  );
  createdEventIds.push(id);
  return id;
}

async function createUser(): Promise<{ id: string; token: string; cpf: string }> {
  const id = randomUUID();
  // Unique, syntactically valid CPF-shaped value per user.
  const n = createdUserIds.length + 1;
  const cpf = `999.${String(n).padStart(3, "0")}.${String(n).padStart(3, "0")}-99`;
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, phone, birth_date, address, is_admin)
     VALUES ($1,$2,true,'x',$3,$4,'5511999999999',$5,'Rua de teste, 123',false)`,
    [id, `test-${id.slice(0, 8)}@example.test`, "Participante Teste", cpf, new Date("1990-01-01")],
  );
  createdUserIds.push(id);
  return { id, token: jwt.sign({ userId: id }, JWT_SECRET), cpf };
}

describe.skipIf(!enabled)("free events and sales-closed (real routes + real DB)", () => {
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
    // Clean up every row this suite created.
    if (createdEventIds.length) {
      await pool.query(`DELETE FROM orders WHERE event_id = ANY($1)`, [createdEventIds]);
      await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [createdEventIds]);
    }
    if (createdUserIds.length) {
      await pool.query(`DELETE FROM orders WHERE user_id = ANY($1)`, [createdUserIds]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    }
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("GET /api/events still works with the new columns", () => {
    it("serves the public list (regression guard for the migration)", async () => {
      await createEvent({});
      const res = await api("GET", "/api/events");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("exposes isFree and salesClosed to the client", async () => {
      const eventId = await createEvent({ isFree: true, price: "0.00", salesClosed: true });
      const res = await api("GET", `/api/events/${eventId}`);
      expect(res.status).toBe(200);
      expect(res.body.isFree).toBe(true);
      expect(res.body.salesClosed).toBe(true);
    });
  });

  describe("Evento Grátis — POST /api/events/:id/subscribe", () => {
    it("confirms a free inscription with NO Asaas call and sends the QR e-mail", async () => {
      const before = asaasCalls.length;
      const eventId = await createEvent({ isFree: true, price: "0.00" });
      const user = await createUser();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
      });

      expect(res.status).toBe(201);
      expect(res.body.order.status).toBe("paid");
      expect(res.body.order.amount).toBe("0.00");
      expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);

      // The whole point: no payment gateway involvement.
      expect(asaasCalls.length).toBe(before);

      // And the attendee actually receives their ticket.
      expect(
        sentTicketEmails.some((e) => e.to.startsWith(`test-${user.id.slice(0, 8)}`)),
      ).toBe(true);
    });

    it("increments the attendee count", async () => {
      const eventId = await createEvent({ isFree: true, price: "0.00" });
      const user = await createUser();
      await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token });

      const r = await pool.query(`SELECT current_attendees FROM events WHERE id=$1`, [eventId]);
      expect(r.rows[0].current_attendees).toBe(1);
    });

    it("REJECTS a free subscription on a PAID event (no free tickets)", async () => {
      const eventId = await createEvent({ isFree: false, price: "250.00" });
      const user = await createUser();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/não é gratuito/i);

      const r = await pool.query(`SELECT count(*)::int n FROM orders WHERE event_id=$1`, [eventId]);
      expect(r.rows[0].n).toBe(0);
    });

    it("requires authentication", async () => {
      const eventId = await createEvent({ isFree: true, price: "0.00" });
      const res = await api("POST", `/api/events/${eventId}/subscribe`);
      expect(res.status).toBe(401);
    });

    it("refuses a duplicate inscription for the same user", async () => {
      const eventId = await createEvent({ isFree: true, price: "0.00" });
      const user = await createUser();

      const first = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token });
      expect(first.status).toBe(201);

      const second = await api("POST", `/api/events/${eventId}/subscribe`, { token: user.token });
      expect(second.status).toBe(409);

      const r = await pool.query(`SELECT count(*)::int n FROM orders WHERE event_id=$1`, [eventId]);
      expect(r.rows[0].n).toBe(1);
    });

    it("refuses when the event is full", async () => {
      const eventId = await createEvent({ isFree: true, price: "0.00", maxAttendees: 1 });
      const a = await createUser();
      const b = await createUser();

      expect((await api("POST", `/api/events/${eventId}/subscribe`, { token: a.token })).status).toBe(201);
      const full = await api("POST", `/api/events/${eventId}/subscribe`, { token: b.token });
      expect(full.status).toBe(400);
      expect(full.body.message).toMatch(/lotado/i);
    });
  });

  describe("Evento Grátis — POST /api/orders is refused", () => {
    it("does not create an Asaas charge for a free event", async () => {
      const before = asaasCalls.length;
      const eventId = await createEvent({ isFree: true, price: "0.00" });
      const user = await createUser();

      const res = await api("POST", "/api/orders", {
        token: user.token,
        body: { eventId, paymentMethod: "pix" },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/gratuito/i);
      expect(asaasCalls.length).toBe(before);
    });
  });

  describe("Encerrar Vendas", () => {
    it("blocks a paid purchase with 409", async () => {
      const before = asaasCalls.length;
      const eventId = await createEvent({ salesClosed: true, price: "100.00" });
      const user = await createUser();

      const res = await api("POST", "/api/orders", {
        token: user.token,
        body: { eventId, paymentMethod: "pix" },
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/vendas.*encerradas/i);
      expect(asaasCalls.length).toBe(before);
    });

    it("blocks a free subscription with 409", async () => {
      const eventId = await createEvent({ isFree: true, price: "0.00", salesClosed: true });
      const user = await createUser();

      const res = await api("POST", `/api/events/${eventId}/subscribe`, {
        token: user.token,
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/vendas.*encerradas/i);
    });

    it("does NOT deactivate the event — it stays listed and readable", async () => {
      const eventId = await createEvent({ salesClosed: true });

      const detail = await api("GET", `/api/events/${eventId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.isActive).toBe(true);

      const list = await api("GET", "/api/events");
      expect(list.body.some((e: any) => e.id === eventId)).toBe(true);
    });

    it("still allows COURTESY redemption after sales are closed", async () => {
      const eventId = await createEvent({ salesClosed: true, price: "100.00" });
      const admin = await createUser();
      const redeemer = await createUser();

      const linkId = randomUUID();
      const code = `TEST${randomUUID().slice(0, 6).toUpperCase()}`;
      await pool.query(
        `INSERT INTO courtesy_links (id, event_id, code, ticket_count, used_count, is_active, created_by)
         VALUES ($1,$2,$3,5,0,true,$4)`,
        [linkId, eventId, code, admin.id],
      );

      const res = await api("POST", "/api/courtesy/redeem", {
        token: redeemer.token,
        body: {
          code,
          name: "Convidado Cortesia",
          email: "convidado@example.test",
          emailConfirm: "convidado@example.test",
          cpf: "123.456.789-09",
          partnerCompany: "Empresa Parceira",
          occupation: "Analista",
          birthDate: "1990-05-10",
          address: "Rua das Cortesias, 456, São Paulo",
          phone: "5511988887777",
        },
      });

      // The whole reason sales_closed is separate from is_active.
      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/resgatada com sucesso/i);

      await pool.query(`DELETE FROM orders WHERE courtesy_link_id = $1`, [linkId]);
      await pool.query(`DELETE FROM courtesy_links WHERE id = $1`, [linkId]);
      await pool.query(`DELETE FROM courtesy_attendees WHERE email = 'convidado@example.test'`);
    });
  });

  describe("paid events are unaffected", () => {
    it("still creates a charge with the R$5 convenience fee", async () => {
      const eventId = await createEvent({ price: "100.00" });
      const user = await createUser();

      const res = await api("POST", "/api/orders", {
        token: user.token,
        body: { eventId, paymentMethod: "pix" },
      });

      expect(res.status).toBe(201);
      // 100.00 event + 5.00 fee
      expect(res.body.order.amount).toBe("105.00");
    });
  });
});
