// Run with `node --import ./e2e/harness/register.mjs e2e/harness/netcheck.mjs <localUrl>`:
// proves the harness network guard. Prints one JSON line per probe.
import axios from "axios";
import http from "node:http";
import https from "node:https";

const local = process.argv[2];
const probes = {
  fetchRemote: () => fetch("https://example.com/"),
  axiosRemote: () => axios.get("https://example.com/", { timeout: 3000 }),
  axiosMake: () => axios.post("https://hook.us2.make.com/x", {}, { timeout: 3000 }),
  httpsRemote: () => new Promise((resolve) => https.get("https://example.com/", resolve)),
  httpRemote: () => new Promise((resolve) => http.get("http://example.com/", resolve)),
  fetchLocal: () => fetch(`${local}/health`),
  axiosLocal: () => axios.get(`${local}/health`, { timeout: 3000 }),
};
for (const [name, run] of Object.entries(probes)) {
  try {
    const r = await run();
    console.log(JSON.stringify({ name, ok: true, status: r.status ?? r.statusCode ?? null }));
    r?.resume?.();
  } catch (e) {
    console.log(JSON.stringify({ name, ok: false, error: String(e?.cause?.message ?? e?.message ?? e) }));
  }
}
process.exit(0);
