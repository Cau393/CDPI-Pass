import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cfg, legacyQuestionsAttached, prodEventIds, seedProdIdEvents, sql } from "./db";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_SQL = path.resolve(HERE, "../../sql/adr016_attach_legacy_questions.sql");

/**
 * Runs after the webServers are up (schema pushed). Seeds the three events under their real prod ids
 * and attaches the legacy questions with the repo's own backfill SQL, exactly as it will run in prod.
 * Local: seeds and attaches. Staging: only verifies the events exist (throws otherwise) and never writes.
 */
export default async function globalSetup() {
  if (cfg.mode === "staging") {
    // Staging already holds the 3 prod-id events (seeded by the lead). Never insert, modify or delete them.
    const ids = prodEventIds();
    const found = await sql<{ id: string }>(`SELECT id FROM events WHERE id = ANY($1)`, [ids]);
    const missing = ids.filter((id) => !found.some((r) => r.id === id));
    if (missing.length > 0) {
      throw new Error(`staging is missing ${missing.length} prod-id event(s): ${missing.join(", ")}. Seed them first; this suite does not insert into staging.`);
    }
  } else {
    const inserted = await seedProdIdEvents();
    if (inserted.length === 3) await sql(readFileSync(LEGACY_SQL, "utf8"));
    else console.log(`[e2e] local: ${3 - inserted.length} prod-id event(s) already existed; legacy SQL not applied`);
  }
  console.log(`[e2e] ${cfg.mode}: legacy questions attached to all 3 prod-id events: ${await legacyQuestionsAttached()}`);
}
