import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cfg, legacyQuestionsAttached, seedProdIdEvents, sql } from "./db";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_SQL = path.resolve(HERE, "../../sql/adr016_attach_legacy_questions.sql");

/**
 * Runs after the webServers are up (schema pushed). Seeds the three events under their real prod ids
 * and attaches the legacy questions with the repo's own backfill SQL, exactly as it will run in prod.
 * Existing rows are never modified: the SQL is only applied when this run inserted all three events.
 */
export default async function globalSetup() {
  const inserted = await seedProdIdEvents();
  if (inserted.length === 3) {
    await sql(readFileSync(LEGACY_SQL, "utf8"));
  } else {
    console.log(`[e2e] ${cfg.mode}: ${3 - inserted.length} prod-id event(s) already existed; legacy SQL not applied by this run`);
  }
  console.log(`[e2e] legacy questions attached: ${await legacyQuestionsAttached()}`);
}
