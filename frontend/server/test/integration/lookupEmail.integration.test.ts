/**
 * "Esqueci meu e-mail": POST /api/auth/lookup-email against the REAL Express routes and a REAL
 * PostgreSQL. Skipped unless VERIFY_DATABASE_URL is set.
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production): this test
 * writes and deletes rows.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error("VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.");
}

process.env.JWT_SECRET = "integration-test-secret";
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
    sendEmail: vi.fn(async () => true),
    sendVerificationEmail: vi.fn(async () => true),
    sendPasswordResetEmail: vi.fn(async () => true),
  },
}));

vi.mock("../../services/s3Service", () => ({
  s3Service: { uploadBuffer: vi.fn(async () => "https://s3.test/o.png"), uploadQRCode: vi.fn(async () => "https://s3.test/q.png") },
}));

vi.mock("../../services/asaasService", () => ({
  asaasService: { createPayment: vi.fn(), cancelPayment: vi.fn(), getPayment: vi.fn() },
}));

let server: Server;
let baseUrl: string;
let pool: Pool;
const createdUserIds: string[] = [];

async function lookup(body: unknown, forwardedFor?: string): Promise<{ status: number; body: any; raw: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  const res = await fetch(`${baseUrl}/api/auth/lookup-email`, { method: "POST", headers, body: JSON.stringify(body) });
  const raw = await res.text();
  return { status: res.status, body: raw ? JSON.parse(raw) : null, raw };
}

async function insertUser(opts: { email: string; cpf?: string | null; foreignDocument?: string | null }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, email_verified, password, name, cpf, is_foreigner, foreign_document, phone)
     VALUES ($1,$2,true,'x','Participante Teste',$3,$4,$5,'5511999999999')`,
    [id, opts.email, opts.cpf ?? null, Boolean(opts.foreignDocument), opts.foreignDocument ?? null],
  );
  createdUserIds.push(id);
  return id;
}

// Valid CPFs (checksum) that no other integration file uses.
const CPF_FOUND = "529.982.247-25";
const CPF_FOUND_DIGITS = "52998224725";
const CPF_MISSING = "111.444.777-35";
const PASSPORT = "ZZ1234567";

describe.skipIf(!enabled)("POST /api/auth/lookup-email (real routes + real DB)", () => {
  const brEmail = `regina.lasmar.${randomUUID().slice(0, 6)}@ephar.com.br`;
  const foreignEmail = `visitor.${randomUUID().slice(0, 6)}@abroad.example`;

  beforeAll(async () => {
    process.env.LOOKUP_EMAIL_RATE_LIMIT_MAX = "1000";
    pool = new Pool({ connectionString: VERIFY_URL });
    await pool.query(`DELETE FROM users WHERE cpf = ANY($1) OR foreign_document = $2`, [[CPF_FOUND], PASSPORT]);
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
    await insertUser({ email: brEmail, cpf: CPF_FOUND });
    await insertUser({ email: foreignEmail, foreignDocument: PASSPORT });
    // Brazilian account with no CPF yet (ADR-016): must never match.
    await insertUser({ email: `nocpf.${randomUUID().slice(0, 6)}@example.test`, cpf: null });
  }, 60_000);

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [createdUserIds]);
    await pool.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns only the masked e-mail for a CPF with an account", async () => {
    const res = await lookup({ isForeigner: false, cpf: CPF_FOUND });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["found", "maskedEmail"]);
    expect(res.body.found).toBe(true);
    expect(res.body.maskedEmail).toMatch(/^re•••••@ep•••\.com\.br$/);
    expect(res.raw).not.toContain(brEmail);
    expect(res.raw).not.toContain("Participante");
  });

  it("accepts the CPF typed without punctuation", async () => {
    const res = await lookup({ cpf: CPF_FOUND_DIGITS });
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
  });

  it("answers found:false for a valid CPF with no account", async () => {
    const res = await lookup({ isForeigner: false, cpf: CPF_MISSING });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("finds a foreign account by passport, normalized", async () => {
    const res = await lookup({ isForeigner: true, foreignDocument: "zz-123 4567" });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["found", "maskedEmail"]);
    expect(res.body.maskedEmail).toMatch(/^vi•••••@ab•••\.example$/);
    expect(res.raw).not.toContain(foreignEmail);
  });

  it("answers found:false for an unknown passport", async () => {
    const res = await lookup({ isForeigner: true, foreignDocument: "NOPE99999" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("does not match a passport when the request is Brazilian, nor a CPF when foreign", async () => {
    expect((await lookup({ isForeigner: false, foreignDocument: PASSPORT })).status).toBe(400);
    expect((await lookup({ isForeigner: true, cpf: CPF_FOUND })).status).toBe(400);
  });

  it("rejects malformed documents with 400", async () => {
    for (const body of [
      {},
      { cpf: "123.456.789-00" },
      { cpf: "abc" },
      { cpf: 12345678909 },
      { isForeigner: true, foreignDocument: "AB1" },
      { isForeigner: "yes", cpf: CPF_FOUND },
    ]) {
      const res = await lookup(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("never matches a Brazilian account that has no CPF", async () => {
    const empty = await lookup({ cpf: "" });
    expect(empty.status).toBe(400);
    const nul = await lookup({ cpf: null });
    expect(nul.status).toBe(400);
  });

  it("has its own stricter per-IP limit (429 after the cap)", async () => {
    const { lookupEmailRateLimitMax } = await import("../../utils/authRateLimitMax");
    expect(lookupEmailRateLimitMax({ NODE_ENV: "production" })).toBe(10);
    // The server above runs with the raised test cap; a second app with the real default of 10.
    delete process.env.LOOKUP_EMAIL_RATE_LIMIT_MAX;
    vi.resetModules();
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    const strict = await registerRoutes(app);
    await new Promise<void>((resolve) => strict.listen(0, "127.0.0.1", () => resolve()));
    const addr = strict.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const url = `http://127.0.0.1:${addr.port}/api/auth/lookup-email`;
    const call = (ip: string) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
        body: JSON.stringify({ cpf: CPF_MISSING }),
      }).then((r) => r.status);
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) statuses.push(await call("198.51.100.7"));
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
      // Another address is not affected.
      expect(await call("198.51.100.8")).toBe(200);
    } finally {
      await new Promise<void>((resolve) => strict.close(() => resolve()));
    }
  }, 30_000);
});
