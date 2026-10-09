/** Shared by playwright.config.ts, the server launcher and the tests. Never prints the database URL. */
export type E2EMode = "local" | "staging";

export const PROD_ENDPOINT = "ep-curly-star-ac4ugpbh";
export const STAGING_ENDPOINT = "ep-summer-sun-acft18c1";

const STAGING_HOST_RE = new RegExp(`^${STAGING_ENDPOINT}(-pooler)?\\.[a-z0-9.-]+\\.neon\\.tech$`, "i");
const FORBIDDEN_PARAMS = ["host", "hostaddr", "options"];
const FORBIDDEN_PG_ENV = ["PGHOST", "PGHOSTADDR", "PGDATABASE"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Throws unless `rawUrl` points at the staging Neon endpoint. The message never
 * contains the URL (it carries credentials). Checks, in order: prod endpoint anywhere
 * in the URL, URL parses, hostname anchored to the staging endpoint on neon.tech,
 * no `host` / `hostaddr` / `options` query override, no PGHOST / PGHOSTADDR / PGDATABASE in env.
 */
export function assertStagingDatabaseUrl(rawUrl: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (!rawUrl) throw new Error("E2E_MODE=staging needs E2E_DATABASE_URL.");
  if (rawUrl.toLowerCase().includes(PROD_ENDPOINT)) {
    throw new Error(`Refusing to run: E2E_DATABASE_URL mentions the PRODUCTION endpoint (${PROD_ENDPOINT}).`);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid URL; refusing to run.");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("Refusing to run: E2E_DATABASE_URL is not a postgres URL.");
  if (!STAGING_HOST_RE.test(url.hostname)) {
    throw new Error(`Refusing to run: E2E_DATABASE_URL host is not the staging endpoint (${STAGING_ENDPOINT}.*.neon.tech).`);
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (FORBIDDEN_PARAMS.includes(key.toLowerCase())) {
      throw new Error(`Refusing to run: E2E_DATABASE_URL has a "${key}" query parameter that can override the host.`);
    }
  }
  for (const name of FORBIDDEN_PG_ENV) {
    if (env[name]) throw new Error(`Refusing to run: ${name} is set in the environment and could redirect the connection.`);
  }
}

export interface E2EConfig {
  mode: E2EMode;
  /** Connection string of the database under test. */
  databaseUrl: string;
  /** Local mode only: the throwaway database name. */
  dbName: string;
  port: number;
  asaasPort: number;
  baseUrl: string;
  asaasUrl: string;
  /** Prefix for everything the suite creates (event titles, user names). */
  namePrefix: string;
  /** Identifies this run; part of every e-mail the suite creates. */
  run: string;
}

export function resolveMode(env: NodeJS.ProcessEnv = process.env): E2EMode {
  const raw = (env.E2E_MODE ?? "local").toLowerCase();
  if (raw !== "local" && raw !== "staging") throw new Error(`E2E_MODE must be "local" or "staging", got "${raw}".`);
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): E2EConfig {
  const mode = resolveMode(env);
  const port = Number(env.E2E_PORT ?? 5057);
  const asaasPort = Number(env.E2E_ASAAS_PORT ?? 5058);
  // Chromium refuses 5060 (unsafe port).
  if (port === 5060 || asaasPort === 5060) throw new Error("Port 5060 is blocked by Chromium; pick another.");
  const dbName = env.E2E_DB_NAME ?? "c3_e2e";
  let databaseUrl: string;
  if (mode === "staging") {
    assertStagingDatabaseUrl(env.E2E_DATABASE_URL, env);
    databaseUrl = env.E2E_DATABASE_URL!;
  } else {
    if (!/^c3_[a-z0-9_]+$/.test(dbName)) throw new Error("E2E_DB_NAME must match c3_[a-z0-9_]+ in local mode.");
    const host = (env.E2E_PG_HOST ?? "localhost").toLowerCase();
    if (!LOCAL_HOSTS.has(host)) throw new Error("E2E_PG_HOST must be exactly localhost, 127.0.0.1 or ::1 in local mode.");
    const pgPort = env.E2E_PG_PORT ?? "55434";
    databaseUrl = `postgresql://${env.E2E_PG_USER ?? "postgres"}@${host === "::1" ? "[::1]" : host}:${pgPort}/${dbName}`;
  }
  return {
    mode,
    databaseUrl,
    dbName,
    port,
    asaasPort,
    baseUrl: `http://localhost:${port}`,
    asaasUrl: `http://localhost:${asaasPort}`,
    namePrefix: mode === "staging" || env.E2E_FORCE_PREFIX === "1" ? "[REHEARSAL] " : "",
    run: env.E2E_RUN ?? "run",
  };
}

/**
 * Only local mode may create/drop databases or run `db:push` (DDL). Staging is used as it is.
 * serve.ts calls this before touching the database.
 */
export function mayChangeSchema(mode: E2EMode): boolean {
  return mode === "local";
}
