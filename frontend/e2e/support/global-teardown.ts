import { cleanupTracked, cfg, closePool } from "./db";

/** Staging only: delete the rows this run created (the local database is throwaway). */
export default async function globalTeardown() {
  if (cfg.mode !== "staging") return;
  await cleanupTracked();
  await closePool();
  console.log("[e2e] staging cleanup done (only rows created by this run)");
}
