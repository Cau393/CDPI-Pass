/**
 * Applies frontend/sql/nps_tables_and_event_type.sql then phone_e164_backfill.sql.
 * Requires DATABASE_URL (e.g. from frontend/.env via dotenv).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function apply(client: pg.Client, filename: string): Promise<void> {
  const path = join(__dirname, "..", "sql", filename);
  const sql = readFileSync(path, "utf8");
  await client.query(sql);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    console.error("DATABASE_URL is not set. Add it to frontend/.env (or export it) and retry.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await apply(client, "nps_tables_and_event_type.sql");
    console.log("OK: nps_tables_and_event_type.sql");
    await apply(client, "phone_e164_backfill.sql");
    console.log("OK: phone_e164_backfill.sql");
    await client.query("ALTER TABLE certificates ALTER COLUMN nps_responses DROP NOT NULL;");
    console.log("OK: certificates.nps_responses is now nullable");
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
