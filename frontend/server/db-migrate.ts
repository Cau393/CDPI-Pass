// In server/db-migrate.ts

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import fs from "fs/promises";
import path from "path";

// Create a new, single-use connection for the migration
const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(migrationClient);

async function runMigrations() {
  console.log("--- Starting Migration Process ---");

  try {
    const migrationsFolder = "migrations";
    console.log(`Checking for migration files in: ./${migrationsFolder}`);

    // Log the files found
    const files = await fs.readdir(migrationsFolder);
    if (files.length === 0) {
      console.log("No migration files found. Nothing to run.");
      process.exit(0);
    }
    console.log("Found migration files:", files);

    // Run the actual migration
    console.log("Applying migrations to the database...");
    await migrate(db, { migrationsFolder });
    console.log("✅ Migrations applied successfully!");

  } catch (error) {
    console.error("❌ Error running migrations:", error);
    process.exit(1);
  } finally {
    // Ensure the connection is always closed
    console.log("Closing database connection...");
    await migrationClient.end();
    console.log("--- Migration Process Finished ---");
  }
}

runMigrations();