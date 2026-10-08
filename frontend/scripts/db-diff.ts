/**
 * Dry run of `drizzle-kit push`: prints the SQL push would execute against
 * DATABASE_URL, without executing it. drizzle-kit 0.30 has no non-interactive
 * dry run (`--strict` needs a TTY), so this is the review step before a push.
 *
 * Exits 0 when shared/schema.ts and the database match, 1 when push would
 * change something.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";

// drizzle-kit 0.30's ESM build (api.mjs) throws "Dynamic require of fs is not
// supported"; its CommonJS build works.
const { pushSchema } = createRequire(import.meta.url)("drizzle-kit/api") as typeof import("drizzle-kit/api");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    console.error("DATABASE_URL is not set. Add it to frontend/.env (or export it) and retry.");
    process.exit(1);
  }

  // Endpoint id only, never the URL (it carries the password).
  console.log(`Target: ${new URL(url).hostname.split(".")[0]}`);

  const pool = new pg.Pool({ connectionString: url });
  try {
    const { statementsToExecute, warnings, hasDataLoss } = await pushSchema(schema, drizzle(pool));
    for (const warning of warnings) console.log(`WARNING ${warning}`);
    if (hasDataLoss) console.log("DATA LOSS: push would ask for confirmation.");
    for (const statement of statementsToExecute) console.log(statement.trim());
    console.log(`${statementsToExecute.length} statements`);
    process.exitCode = statementsToExecute.length === 0 ? 0 : 1;
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
