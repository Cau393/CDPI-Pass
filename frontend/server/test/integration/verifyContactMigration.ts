/**
 * Verify that DB-stored email templates no longer contain retired contact info.
 * Run: npx tsx server/test/integration/verifyContactMigration.ts
 * Uses DATABASE_URL from .env (staging Neon).
 */
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const OLD_PATTERNS = [
  "99860-6833",
  "contato@cdpipharma.com.br",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  let hasStale = false;

  try {
    // 1. events.courtesy_template
    const courtesy = await pool.query(
      `SELECT id, title, courtesy_template, courtesy_email_subject FROM events
       WHERE courtesy_template LIKE '%99860-6833%'
          OR courtesy_template ILIKE '%contato@cdpipharma.com.br%'
          OR courtesy_email_subject LIKE '%99860-6833%'`,
    );
    if (courtesy.rows.length > 0) {
      hasStale = true;
      console.error(`FAIL: events.courtesy_template — ${courtesy.rows.length} row(s) still have old contact info:`);
      for (const row of courtesy.rows) {
        console.error(`  event ${row.id} (${row.title})`);
      }
    } else {
      console.log("OK: events.courtesy_template — no old contact info");
    }

    // 2. reminder_templates.body
    const reminders = await pool.query(
      `SELECT event_id, body FROM reminder_templates
       WHERE body LIKE '%99860-6833%'
          OR body ILIKE '%contato@cdpipharma.com.br%'`,
    );
    if (reminders.rows.length > 0) {
      hasStale = true;
      console.error(`FAIL: reminder_templates.body — ${reminders.rows.length} row(s) still have old contact info`);
      for (const row of reminders.rows) {
        console.error(`  event_id ${row.event_id}`);
      }
    } else {
      console.log("OK: reminder_templates.body — no old contact info");
    }

    // 3. communicate_templates.body
    const communicates = await pool.query(
      `SELECT event_id, body FROM communicate_templates
       WHERE body LIKE '%99860-6833%'
          OR body ILIKE '%contato@cdpipharma.com.br%'`,
    );
    if (communicates.rows.length > 0) {
      hasStale = true;
      console.error(`FAIL: communicate_templates.body — ${communicates.rows.length} row(s) still have old contact info`);
      for (const row of communicates.rows) {
        console.error(`  event_id ${row.event_id}`);
      }
    } else {
      console.log("OK: communicate_templates.body — no old contact info");
    }

    // 4. Spot-check: show any templates that DO have the new number (confirms migration ran)
    const newCheck = await pool.query(
      `SELECT
         (SELECT count(*) FROM events WHERE courtesy_template LIKE '%99865-5500%') AS courtesy_count,
         (SELECT count(*) FROM reminder_templates WHERE body LIKE '%99865-5500%') AS reminder_count,
         (SELECT count(*) FROM communicate_templates WHERE body LIKE '%99865-5500%') AS communicate_count`,
    );
    const counts = newCheck.rows[0];
    console.log(`\nTemplates with canonical number (99865-5500):`);
    console.log(`  courtesy_template:    ${counts.courtesy_count}`);
    console.log(`  reminder_templates:   ${counts.reminder_count}`);
    console.log(`  communicate_templates: ${counts.communicate_count}`);

  } finally {
    await pool.end();
  }

  if (hasStale) {
    console.error("\nFAILED: stale contact info found. Re-run sql/update_contact_info_in_templates.sql on Neon.");
    process.exit(1);
  }
  console.log("\nAll clear: no retired contact info in DB-stored templates.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
