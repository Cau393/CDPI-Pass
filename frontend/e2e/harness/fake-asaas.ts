/**
 * Fake Asaas HTTP API for the e2e suite. The app server points ASAAS_API_URL here,
 * so no request ever leaves localhost.
 *
 * It also answers S3 `PUT object` (AWS_ENDPOINT_URL points here): courtesy redemption
 * for in-person events waits for the QR upload to be recorded.
 *
 * Behaviour switch: a foreign customer whose e-mail starts with `blocked.` is
 * rejected like the real API does while foreign payers are not enabled on the
 * Asaas account (400 invalid_object "pagadores estrangeiros"). Everything else succeeds.
 */
import http from "node:http";
import { loadConfig } from "./config";
import { FAKE_CARDS } from "./fakeCards";

const cfg = loadConfig();
// 1x1 transparent PNG.
const PIX_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
let seq = 0;
// installment id -> row values, answered by GET /payments?installment=<id>.
const installments = new Map<string, number[]>();
const requests: { method: string; path: string; body: unknown }[] = [];

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", cfg.asaasUrl);
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body: any = null;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    } catch {
      body = null;
    }
    const path = url.pathname.replace(/^\/v3/, "");
    const method = req.method ?? "GET";
    if (method === "PUT") {
      res.writeHead(200, { ETag: '"e2e-fake-etag"' });
      return res.end();
    }
    if (path === "/__requests") return send(res, 200, requests);
    if (path === "/health") return send(res, 200, { ok: true });
    requests.push({ method, path, body: body ? { ...body, cpfCnpj: undefined, creditCard: undefined, creditCardHolderInfo: undefined } : null });
    if (requests.length > 500) requests.shift();

    if (method === "GET" && path === "/customers") return send(res, 200, { data: [] });
    if (method === "POST" && path === "/customers") {
      if (body?.foreignCustomer && String(body?.email ?? "").toLowerCase().startsWith("blocked.")) {
        return send(res, 400, {
          errors: [
            {
              code: "invalid_object",
              description: "Não é possível criar cobranças para pagadores estrangeiros nesta conta.",
            },
          ],
        });
      }
      return send(res, 200, { id: `cus_fake${++seq}`, name: body?.name });
    }
    if (method === "POST" && path === "/paymentLinks") {
      const id = String(1000 + ++seq);
      return send(res, 200, {
        id,
        url: `${cfg.asaasUrl}/link/${id}`,
        value: body?.value,
        netValue: body?.value,
        dateCreated: new Date().toISOString(),
      });
    }
    if (method === "POST" && path === "/payments" && body?.creditCard) {
      const number = String(body.creditCard.number ?? "").replace(/\D/g, "");
      if (number === FAKE_CARDS.declined) {
        return send(res, 400, {
          errors: [{ code: "invalid_creditCard", description: "Transação não autorizada." }],
        });
      }
      const id = `pay_fake${++seq}`;
      const count = Number(body.installmentCount) || 1;
      const total = Number(body.totalValue ?? body.value);
      const value = count > 1 ? Math.round((total / count) * 100) / 100 : total;
      let installment: string | undefined;
      if (count > 1) {
        installment = `ins_fake${++seq}`;
        installments.set(installment, Array.from({ length: count }, () => value));
      }
      const risk = number === FAKE_CARDS.risk;
      return send(res, 200, {
        id,
        status: risk ? "AWAITING_RISK_ANALYSIS" : "CONFIRMED",
        value,
        netValue: value,
        billingType: "CREDIT_CARD",
        ...(installment ? { installment } : {}),
        dateCreated: new Date().toISOString(),
        creditCard: { creditCardNumber: number.slice(-4), creditCardBrand: "VISA", creditCardToken: "fake-token" },
      });
    }
    if (method === "POST" && path === "/payments") {
      const id = `pay_fake${++seq}`;
      return send(res, 200, {
        id,
        status: "PENDING",
        value: body?.value,
        netValue: body?.value,
        dateCreated: new Date().toISOString(),
        invoiceUrl: `${cfg.asaasUrl}/invoice/${id}`,
        bankSlipUrl: `${cfg.asaasUrl}/boleto/${id}`,
      });
    }
    const pix = path.match(/^\/payments\/([^/]+)\/pixQrCode$/);
    if (method === "GET" && pix) {
      return send(res, 200, {
        encodedImage: PIX_IMAGE,
        payload: "00020126FAKE-PIX-PAYLOAD-FOR-E2E",
        expirationDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }
    if (method === "GET" && path === "/payments" && url.searchParams.get("installment")) {
      const rows = installments.get(url.searchParams.get("installment")!) ?? [];
      return send(res, 200, { data: rows.map((value, i) => ({ id: `pay_fakeins${i}`, value })) });
    }
    if (method === "GET" && path.startsWith("/payments")) return send(res, 200, { data: [] });
    if (method === "GET" && /^\/(invoice|boleto|link)\//.test(path)) {
      return send(res, 200, "<!doctype html><title>fake asaas</title><p>fake asaas page</p>", "text/html");
    }
    return send(res, 404, { errors: [{ code: "not_found", description: `${method} ${path}` }] });
  });
});

server.listen(cfg.asaasPort, "127.0.0.1", () => console.log(`[fake-asaas] listening on ${cfg.asaasUrl}`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close(() => process.exit(0)));
