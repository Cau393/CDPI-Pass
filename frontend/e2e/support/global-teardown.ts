import { cleanupTracked, cfg, closePool, dropTrackFile, trackFile } from "./db";

/** Staging only: delete the rows this run created (the local database is throwaway). */
export default async function globalTeardown() {
  if (cfg.mode !== "staging") return;
  const problems = await cleanupTracked();
  await closePool();
  if (problems.length === 0) {
    dropTrackFile();
    console.log("[e2e] staging cleanup done (only rows created by this run)");
  } else {
    console.error(`[e2e] staging cleanup INCOMPLETE, kept ${trackFile()} so it can be finished:\n  ${problems.join("\n  ")}`);
  }
}
