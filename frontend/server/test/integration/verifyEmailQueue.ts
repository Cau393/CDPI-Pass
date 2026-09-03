// @ts-nocheck
/**
 * Check email_queue for any rows still carrying old contact info.
 * Run: npx tsx server/test/integration/verifyEmailQueue.ts
 */
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });

  try {
    const summary = await pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE html LIKE '%99860-6833%')::int AS stale_html,
        count(*) FILTER (WHERE text LIKE '%99860-6833%')::int AS stale_text,
        count(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM email_queue
    `);
    console.log("email_queue summary:", summary.rows[0]);

    const stale = await pool.query(`
      SELECT id, subject, status, created_at
      FROM email_queue
      WHERE html LIKE '%99860-6833%' OR text LIKE '%99860-6833%'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (stale.rows.length > 0) {
      console.log(`\nStale emails in queue (${stale.rows.length}):`);
      for (const row of stale.rows) {
        console.log(`  ${row.id}  status=${row.status}  subject="${row.subject}"  created=${row.created_at}`);
      }
    } else {
      console.log("\nNo stale emails in queue.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
