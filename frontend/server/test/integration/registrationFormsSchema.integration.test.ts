/**
 * ADR-016 Phase 2 (DB expand): column defaults, loosened identity CHECKs and
 * the interest-area backfill, against a throwaway PostgreSQL pushed from
 * shared/schema.ts. Skipped unless VERIFY_DATABASE_URL is set.
 *
 * NEVER point VERIFY_DATABASE_URL at Neon (staging or production).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const VERIFY_URL = process.env.VERIFY_DATABASE_URL;
const enabled = Boolean(VERIFY_URL);

if (enabled && /neon\.tech|amazonaws\.com/i.test(VERIFY_URL!)) {
  throw new Error(
    "VERIFY_DATABASE_URL points at a managed database. Use a throwaway local one.",
  );
}

const BACKFILL_SQL = readFileSync(
  join(__dirname, "../../../sql/backfill_interest_areas_into_registration_form.sql"),
  "utf8",
);
const LOOSEN_CHECKS_SQL = readFileSync(
  join(__dirname, "../../../sql/registration_forms_loosen_identity_checks.sql"),
  "utf8",
);

/**
 * The strict pre-ADR-016 checks that staging and prod had before Phase 2.
 * NOT VALID: rows inserted by the tests above already break them.
 */
const STRICT_CHECKS_SQL = ["users", "courtesy_attendees"]
  .map(
    (table) => `ALTER TABLE ${table} DROP CONSTRAINT ${table}_identity_document_chk;
ALTER TABLE ${table} ADD CONSTRAINT ${table}_identity_document_chk CHECK (
  (is_foreigner = false AND cpf IS NOT NULL AND foreign_document IS NULL)
  OR (is_foreigner = true AND cpf IS NULL AND foreign_document IS NOT NULL)) NOT VALID;`,
  )
  .concat(`ALTER TABLE orders DROP CONSTRAINT orders_identity_document_chk;
ALTER TABLE orders ADD CONSTRAINT orders_identity_document_chk CHECK (
  (cpf IS NOT NULL AND foreign_document IS NULL) OR (cpf IS NULL AND foreign_document IS NOT NULL)) NOT VALID;`)
  .join("\n");

const IDENTITY_CHECK_DEFS = `SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conname LIKE '%identity_document_chk' ORDER BY 1`;

let pool: Pool;
const userIds: string[] = [];
const eventIds: string[] = [];
const attendeeIds: string[] = [];

async function insertUser(fields: {
  isForeigner: boolean;
  cpf: string | null;
  foreignDocument: string | null;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password, name, cpf, is_foreigner, foreign_document, phone, birth_date, address)
     VALUES ($1, $2, 'x', 'Participante', $3, $4, $5, '5511999999999', NULL, NULL)`,
    [id, `schema-${id.slice(0, 8)}@example.test`, fields.cpf, fields.isForeigner, fields.foreignDocument],
  );
  userIds.push(id);
  return id;
}

async function insertEvent(interestAreas: string[] = []): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, title, description, date, location, price, is_active, nps_type, interest_areas)
     VALUES ($1, 'Evento', 'Descrição', now(), 'Online', 0, true, 'cdpi_event', $2)`,
    [id, interestAreas],
  );
  eventIds.push(id);
  return id;
}

async function insertOrder(userId: string, eventId: string, cpf: string | null, foreignDocument: string | null) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO orders (id, user_id, event_id, cpf, foreign_document, status, payment_method, amount)
     VALUES ($1, $2, $3, $4, $5, 'paid', 'free', 0)`,
    [id, userId, eventId, cpf, foreignDocument],
  );
  return id;
}

async function selectOne<T>(query: string, params: unknown[]): Promise<T> {
  const { rows } = await pool.query(query, params);
  return rows[0] as T;
}

describe.skipIf(!enabled)("ADR-016 Phase 2 schema (real DB)", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: VERIFY_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM orders WHERE event_id = ANY($1) OR user_id = ANY($2)`, [eventIds, userIds]);
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [eventIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM courtesy_attendees WHERE id = ANY($1)`, [attendeeIds]);
    await pool.end();
  });

  describe("new jsonb columns", () => {
    it("gives a new event an empty registration form", async () => {
      const eventId = await insertEvent();

      const row = await selectOne<{ registration_form: unknown }>(
        `SELECT registration_form FROM events WHERE id = $1`,
        [eventId],
      );

      expect(row.registration_form).toEqual([]);
    });

    it("gives a new order empty registration answers", async () => {
      const userId = await insertUser({ isForeigner: false, cpf: "111.222.333-96", foreignDocument: null });
      const orderId = await insertOrder(userId, await insertEvent(), "111.222.333-96", null);

      const row = await selectOne<{ registration_answers: unknown }>(
        `SELECT registration_answers FROM orders WHERE id = $1`,
        [orderId],
      );

      expect(row.registration_answers).toEqual([]);
    });
  });

  describe("users identity check", () => {
    it("accepts a Brazilian account with no CPF, birth date or address yet", async () => {
      await expect(insertUser({ isForeigner: false, cpf: null, foreignDocument: null })).resolves.toBeTypeOf("string");
    });

    it("still requires a passport on a foreign account", async () => {
      await expect(insertUser({ isForeigner: true, cpf: null, foreignDocument: null })).rejects.toMatchObject({
        code: "23514",
      });
    });

    it("still rejects a passport on a Brazilian account", async () => {
      await expect(insertUser({ isForeigner: false, cpf: null, foreignDocument: "PY1234567" })).rejects.toMatchObject({
        code: "23514",
      });
    });
  });

  describe("orders identity check", () => {
    it("accepts an online order with no document", async () => {
      const userId = await insertUser({ isForeigner: false, cpf: null, foreignDocument: null });

      await expect(insertOrder(userId, await insertEvent(), null, null)).resolves.toBeTypeOf("string");
    });

    it("still rejects an order carrying both a CPF and a passport", async () => {
      const userId = await insertUser({ isForeigner: false, cpf: "222.333.444-05", foreignDocument: null });

      await expect(
        insertOrder(userId, await insertEvent(), "222.333.444-05", "PY7654321"),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  describe("courtesy attendees identity check", () => {
    it("accepts an online courtesy attendee with no CPF, birth date or address", async () => {
      const id = randomUUID();
      attendeeIds.push(id);

      await expect(
        pool.query(
          `INSERT INTO courtesy_attendees (id, name, email, cpf, is_foreigner, foreign_document, phone, birth_date, address, event_title)
           VALUES ($1, 'Convidado', 'convidado@example.test', NULL, false, NULL, '5511988887777', NULL, NULL, 'Evento')`,
          [id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe("sql/registration_forms_loosen_identity_checks.sql", () => {
    // Staging and prod get the loosened checks from this file, not from push
    // (drizzle-kit 0.30 ignores a changed CHECK expression). Run inside a
    // rolled-back transaction so the other suites never see the strict checks.
    it("turns the old strict checks into exactly the ones schema.ts declares", async () => {
      const fromSchema = (await pool.query(IDENTITY_CHECK_DEFS)).rows;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(STRICT_CHECKS_SQL);
        await client.query(LOOSEN_CHECKS_SQL.replace(/^(BEGIN|COMMIT);$/gm, ""));
        const fromSqlFile = (await client.query(IDENTITY_CHECK_DEFS)).rows;

        expect(fromSqlFile).toEqual(fromSchema);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
  });

  describe("interest-area backfill", () => {
    it("turns an event's interest areas into a required dropdown question", async () => {
      const eventId = await insertEvent(["Farmácia", "Regulatório"]);

      await pool.query(BACKFILL_SQL);
      const row = await selectOne<{ registration_form: unknown }>(
        `SELECT registration_form FROM events WHERE id = $1`,
        [eventId],
      );

      expect(row.registration_form).toEqual([
        {
          id: "interest-area",
          type: "select",
          label: "Área de interesse",
          options: ["Farmácia", "Regulatório"],
          required: true,
          archived: false,
        },
      ]);
    });

    it("leaves an event without interest areas with an empty form", async () => {
      const eventId = await insertEvent();

      await pool.query(BACKFILL_SQL);
      const row = await selectOne<{ registration_form: unknown }>(
        `SELECT registration_form FROM events WHERE id = $1`,
        [eventId],
      );

      expect(row.registration_form).toEqual([]);
    });

    it("does not overwrite a form an admin already built when re-run", async () => {
      const eventId = await insertEvent(["Farmácia"]);
      const built = [{ id: "q1", type: "text", label: "Cargo", options: [], required: false, archived: false }];
      await pool.query(`UPDATE events SET registration_form = $2::jsonb WHERE id = $1`, [
        eventId,
        JSON.stringify(built),
      ]);

      await pool.query(BACKFILL_SQL);
      const row = await selectOne<{ registration_form: unknown }>(
        `SELECT registration_form FROM events WHERE id = $1`,
        [eventId],
      );

      expect(row.registration_form).toEqual(built);
    });
  });
});
