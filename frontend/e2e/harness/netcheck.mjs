// Run with `node --import ./e2e/harness/register.mjs e2e/harness/netcheck.mjs <localUrl>`:
// proves the harness network guard. Prints one JSON line per probe.
import { MailService } from "@sendgrid/mail";
import http from "node:http";
import https from "node:https";

const local = process.argv[2];
// The app's only outbound HTTP library path: @sendgrid/mail -> axios -> follow-redirects.
const sendgrid = new MailService();
sendgrid.setApiKey("SG.e2e-netcheck");
const probes = {
  fetchRemote: () => fetch("https://example.com/"),
  sendgridRemote: () =>
    sendgrid.send({ to: "netcheck@example.com", from: "netcheck@example.com", subject: "netcheck", text: "netcheck" }),
  httpsRemote: () => new Promise((resolve) => https.get("https://example.com/", resolve)),
  httpRemote: () => new Promise((resolve) => http.get("http://example.com/", resolve)),
  fetchLocal: () => fetch(`${local}/health`),
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
