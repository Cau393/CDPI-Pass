/**
 * Prepares the database and runs the app server for the e2e suite
 * (Playwright webServer entry). Local mode: fresh throwaway Postgres database,
 * db:push, then the server. Staging mode: the database is used as it is (no
 * schema push, no drops); the suite only inserts and deletes its own rows.
 *
 * The server runs with dummy secrets, the Neon driver swapped for node-postgres,
 * and a guard that blocks every non-localhost host (see register.mjs).
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore pg ships no types (@types/pg is not a dependency); only Pool/Client are used here
import pg from "pg";
import { loadConfig, mayChangeSchema } from "./config";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const cfg = loadConfig();

if (existsSync(path.join(appRoot, ".env"))) {
  console.error(`[e2e] refusing to start: ${appRoot} has a .env file.`);
  process.exit(1);
}

async function prepareLocalDatabase() {
  if (!mayChangeSchema(cfg.mode)) throw new Error("refusing DDL (create/drop database, db:push) outside local mode");
  const admin = new pg.Client({ connectionString: cfg.databaseUrl.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${cfg.dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${cfg.dbName}`);
  } finally {
    await admin.end();
  }
  const push = spawnSync("pnpm", ["run", "db:push"], {
    cwd: appRoot,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: cfg.databaseUrl },
    encoding: "utf8",
  });
  if (push.status !== 0) {
    console.error(`[e2e] db:push failed\n${push.stdout}\n${push.stderr}`);
    process.exit(1);
  }
  console.log(`[e2e] local database ${cfg.dbName} created and schema pushed`);
}

async function main() {
  if (cfg.mode === "local") await prepareLocalDatabase();
  else console.log("[e2e] staging mode: using E2E_DATABASE_URL as is (not printed)");
  startServer();
}

function startServer() {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    APP_ROOT: appRoot,
    E2E_PARENT_PID: String(process.pid),
    NODE_ENV: "development",
    PORT: String(cfg.port),
    BASE_URL: cfg.baseUrl,
    DATABASE_URL: cfg.databaseUrl,
    JWT_SECRET: "e2e-jwt-secret",
    QR_CODE_SECRET: "e2e-qr",
    ASAAS_API_KEY: "e2e-dummy-not-a-key",
    ASAAS_WEBHOOK_TOKEN: "e2e-dummy",
    ASAAS_API_URL: `${cfg.asaasUrl}/v3`,
    AWS_ACCESS_KEY_ID: "e2e-dummy",
    AWS_SECRET_ACCESS_KEY: "e2e-dummy",
    AWS_REGION: "us-east-1",
    AWS_S3_BUCKET_NAME: "e2e-dummy",
    // fake S3 PUT lives in fake-asaas.ts
    AWS_ENDPOINT_URL: `http://127.0.0.1:${cfg.asaasPort}`,
  };
  let shuttingDown = false;
  let respawns = 0;
  // Server output goes to the console and to e2e/.state/server-<run>.log (specs assert on it).
  const stateDir = path.join(appRoot, "e2e/.state");
  mkdirSync(stateDir, { recursive: true });
  const logFile = path.join(stateDir, `server-${cfg.run}.log`);
  const tee = (stream: NodeJS.WriteStream) => (chunk: Buffer) => {
    stream.write(chunk);
    appendFileSync(logFile, chunk);
  };
  let child = launch();

  /** SIGKILL the whole group (pnpm -> tsx -> node) so no grandchild keeps the port. */
  function killGroup(c: ReturnType<typeof spawn>, sig: NodeJS.Signals) {
    if (!c.pid) return;
    try {
      process.kill(-c.pid, sig);
    } catch {
      /* already gone */
    }
  }

  function launch() {
    // detached: the child leads its own process group, so the group can be killed as one.
    const c = spawn("pnpm", ["exec", "tsx", "--import", path.join(here, "register.mjs"), "server/index.ts"], {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env,
    });
    c.stdout?.on("data", tee(process.stdout));
    c.stderr?.on("data", tee(process.stderr));
    c.on("exit", (code, signal) => {
      console.error(`[e2e] app server exited (code=${code}, signal=${signal}) at ${new Date().toISOString()}`);
      killGroup(c, "SIGKILL"); // leftovers of the group
      // Killed from outside (e.g. a stray pkill on a busy shared machine): the database is untouched, so start again.
      if (!shuttingDown && signal && respawns < 3) {
        respawns++;
        console.error(`[e2e] restarting the app server (${respawns}/3)`);
        child = launch();
        return;
      }
      process.exit(code ?? 1);
    });
    return c;
  }

  const shutdown = (sig: NodeJS.Signals) => {
    shuttingDown = true;
    killGroup(child, sig);
    setTimeout(() => {
      killGroup(child, "SIGKILL");
      process.exit(0);
    }, 3000).unref();
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => shutdown(sig));
  process.on("exit", () => killGroup(child, "SIGKILL"));
}

main().catch((e) => {
  console.error(`[e2e] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
