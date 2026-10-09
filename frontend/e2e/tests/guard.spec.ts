import { test, expect } from "@playwright/test";
import { assertStagingDatabaseUrl, loadConfig, mayChangeSchema, PROD_ENDPOINT, STAGING_ENDPOINT } from "../harness/config";

const url = (endpoint: string) => `postgresql://u:secret-pass@${endpoint}.c-3.sa-east-1.aws.neon.tech/db?sslmode=require`;

test.describe("database guard (dry run, no connection made)", () => {
  test("accepts only the staging endpoint", () => {
    expect(() => assertStagingDatabaseUrl(url(STAGING_ENDPOINT))).not.toThrow();
    expect(() => assertStagingDatabaseUrl(url(`${STAGING_ENDPOINT}-pooler`))).not.toThrow();
  });
  test("refuses the production endpoint, pooled or not", () => {
    expect(() => assertStagingDatabaseUrl(url(PROD_ENDPOINT))).toThrow(/PRODUCTION/);
    expect(() => assertStagingDatabaseUrl(url(`${PROD_ENDPOINT}-pooler`))).toThrow(/PRODUCTION/);
  });
  test("refuses any other host, an empty or an invalid URL", () => {
    expect(() => assertStagingDatabaseUrl("postgresql://postgres@localhost:55434/c3_e2e")).toThrow(/not the staging/);
    expect(() => assertStagingDatabaseUrl(url("ep-other-thing-123"))).toThrow(/not the staging/);
    expect(() => assertStagingDatabaseUrl(undefined)).toThrow(/needs E2E_DATABASE_URL/);
    expect(() => assertStagingDatabaseUrl("not a url")).toThrow(/not a valid URL/);
  });
  test("a refusal never contains the connection string", () => {
    try {
      assertStagingDatabaseUrl(url(PROD_ENDPOINT));
    } catch (e) {
      expect(String(e)).not.toContain("secret-pass");
    }
  });
  test("loadConfig applies the guard in staging mode and the REHEARSAL prefix", () => {
    expect(() => loadConfig({ E2E_MODE: "staging", E2E_DATABASE_URL: url(PROD_ENDPOINT) })).toThrow(/PRODUCTION/);
    const staging = loadConfig({ E2E_MODE: "staging", E2E_DATABASE_URL: url(STAGING_ENDPOINT) });
    expect(staging.namePrefix).toBe("[REHEARSAL] ");
    expect(loadConfig({}).namePrefix).toBe("");
    expect(() => loadConfig({ E2E_MODE: "prod" })).toThrow(/must be/);
    expect(() => loadConfig({ E2E_DB_NAME: "cdpi" })).toThrow(/c3_/);
    expect(() => loadConfig({ E2E_PORT: "5060" })).toThrow(/5060/);
  });
  test("DDL (database drop/create, db:push) is allowed in local mode only", () => {
    expect(mayChangeSchema("local")).toBe(true);
    expect(mayChangeSchema("staging")).toBe(false);
  });
  test("hostname is anchored: look-alike hosts are refused", () => {
    const host = (h: string) => `postgresql://u:secret-pass@${h}/db?sslmode=require`;
    expect(() => assertStagingDatabaseUrl(host(`${STAGING_ENDPOINT}.attacker.example`))).toThrow(/not the staging/);
    expect(() => assertStagingDatabaseUrl(host(`${STAGING_ENDPOINT}.c-3.sa-east-1.aws.neon.tech.evil.com`))).toThrow(/not the staging/);
    expect(() => assertStagingDatabaseUrl(host(`x${STAGING_ENDPOINT}.c-3.sa-east-1.aws.neon.tech`))).toThrow(/not the staging/);
    expect(() => assertStagingDatabaseUrl(host(`${STAGING_ENDPOINT}.c-3.sa-east-1.aws.neon.tech`.toUpperCase()))).not.toThrow();
  });
  test("prod endpoint anywhere in the URL is refused first", () => {
    const base = url(STAGING_ENDPOINT);
    expect(() => assertStagingDatabaseUrl(`${base}&application_name=${PROD_ENDPOINT}`)).toThrow(/PRODUCTION/);
    expect(() => assertStagingDatabaseUrl(`${base}&host=${PROD_ENDPOINT}.neon.tech`)).toThrow(/PRODUCTION/);
  });
  test("host / hostaddr / options query overrides are refused", () => {
    for (const q of ["host=evil.example", "hostaddr=10.0.0.1", "options=-c%20search_path%3Dx", "HOST=evil.example"]) {
      expect(() => assertStagingDatabaseUrl(`${url(STAGING_ENDPOINT)}&${q}`), q).toThrow(/query parameter/);
    }
  });
  test("PGHOST / PGHOSTADDR / PGDATABASE in the environment are refused", () => {
    for (const name of ["PGHOST", "PGHOSTADDR", "PGDATABASE"]) {
      expect(() => assertStagingDatabaseUrl(url(STAGING_ENDPOINT), { [name]: "x" }), name).toThrow(new RegExp(name));
    }
    expect(() => assertStagingDatabaseUrl(url(STAGING_ENDPOINT), {})).not.toThrow();
  });
  test("local mode accepts only localhost / 127.0.0.1 / ::1 as E2E_PG_HOST", () => {
    for (const h of ["localhost", "127.0.0.1", "::1"]) expect(() => loadConfig({ E2E_PG_HOST: h })).not.toThrow();
    for (const h of ["db.example.com", "10.0.0.5", "localhost.evil.com", "ep-summer-sun-acft18c1.c-3.neon.tech"]) {
      expect(() => loadConfig({ E2E_PG_HOST: h }), h).toThrow(/E2E_PG_HOST/);
    }
  });
});
