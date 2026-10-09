// --import: installs the db swap hook (Neon driver -> node-postgres) and a guard that
// blocks every outbound request whose host is not localhost. Asaas is a local fake
// (e2e/harness/fake-asaas.ts), so the app never reaches a real payment provider.
import { register, syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import http from "node:http";
import https from "node:https";
const root = process.env.APP_ROOT;
register(new URL("./hook.mjs", import.meta.url), {
  data: {
    appDbUrl: pathToFileURL(`${root}/server/db.ts`).href,
    shimUrl: new URL("./db-shim.ts", import.meta.url).href,
  },
});
const LOCAL = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/;
const blocked = (host) => { console.error(`[e2e-guard] blocked outbound request to ${host}`); return new Error(`e2e guard: ${host} blocked`); };
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  return LOCAL.test(url.hostname) ? realFetch(input, init) : Promise.reject(blocked(url.hostname));
};
for (const mod of [http, https]) {
  for (const name of ["request", "get"]) {
    const orig = mod[name];
    mod[name] = function (...args) {
      const a = args[0];
      const host = typeof a === "string" || a instanceof URL ? new URL(a).hostname : (a?.hostname ?? a?.host ?? "localhost");
      if (!LOCAL.test(String(host).replace(/:\d+$/, ""))) throw blocked(host);
      return orig.apply(this, args);
    };
  }
}
syncBuiltinESMExports();
