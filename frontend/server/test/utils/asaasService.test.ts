import { afterEach, describe, it, expect, vi } from "vitest";
import { AsaasService, asaasBaseUrl } from "../../services/asaasService";
import { AsaasApiError } from "../../utils/asaasErrors";

const FOREIGN_PAYMENT = {
  name: "Participante Estrangeira",
  email: "foreign@example.test",
  phone: "595981123456",
  userId: "user-1",
  value: 105,
  dueDate: new Date("2026-10-15T00:00:00Z"),
  description: "Ingresso",
  orderExternalReference: "order-1",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("asaasBaseUrl", () => {
  it("defaults to the production API", () => {
    expect(asaasBaseUrl({})).toBe("https://api.asaas.com/v3");
  });

  it("reads ASAAS_API_URL without a trailing slash", () => {
    expect(asaasBaseUrl({ ASAAS_API_URL: "https://api-sandbox.asaas.com/v3/" })).toBe(
      "https://api-sandbox.asaas.com/v3",
    );
  });
});

describe("AsaasService requests", () => {
  it("sends requests to ASAAS_API_URL", async () => {
    vi.stubEnv("ASAAS_API_URL", "https://api-sandbox.asaas.com/v3");
    const fetchMock = vi.fn(async () => jsonResponse(400, { errors: [] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await new AsaasService().createForeignCardPayment(FOREIGN_PAYMENT).catch(() => {});

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/api-sandbox\.asaas\.com\/v3\/customers\?/,
    );
  });

  it("rejects an Asaas 400 with an AsaasApiError carrying the status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { errors: [] })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(new AsaasService().createForeignCardPayment(FOREIGN_PAYMENT)).rejects.toMatchObject({
      constructor: AsaasApiError,
      status: 400,
    });
  });

  it("creates the foreign customer without cpfCnpj (Asaas rejects a passport there)", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)));
        if (String(url).includes("/customers?")) return jsonResponse(200, { data: [] });
        if (String(url).endsWith("/customers")) return jsonResponse(200, { id: "cus_1" });
        return jsonResponse(200, { id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/pay_1", value: 105 });
      }),
    );

    const payment = await new AsaasService().createForeignCardPayment(FOREIGN_PAYMENT);

    const customer = bodies[0];
    expect(customer).toMatchObject({ foreignCustomer: true, externalReference: "user-1" });
    expect(customer).not.toHaveProperty("cpfCnpj");
    expect(payment.paymentLink).toBe("https://sandbox.asaas.com/i/pay_1");
  });

  it("a guest never reuses a customer: no lookup, a new customer with the typed name and phone", async () => {
    const calls: Array<{ url: string; method: string; body?: any }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (String(url).includes("/customers?")) return jsonResponse(200, { data: [{ id: "cus_account" }] });
        if (String(url).endsWith("/customers")) return jsonResponse(200, { id: "cus_new" });
        return jsonResponse(200, { id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/pay_1", value: 105 });
      }),
    );

    await new AsaasService().createForeignCardPayment({ ...FOREIGN_PAYMENT, reuseCustomer: false });

    expect(calls.some((c) => c.url.includes("/customers?"))).toBe(false);
    const created = calls.find((c) => c.url.endsWith("/customers") && c.method === "POST")!;
    expect(created.body).toMatchObject({ name: FOREIGN_PAYMENT.name, phone: FOREIGN_PAYMENT.phone });
    expect(calls.find((c) => c.url.endsWith("/payments"))!.body.customer).toBe("cus_new");
  });

  it("a session request reuses the customer found by externalReference", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(url)}`);
        if (String(url).includes("/customers?")) return jsonResponse(200, { data: [{ id: "cus_account" }] });
        return jsonResponse(200, { id: "pay_1", invoiceUrl: "https://sandbox.asaas.com/i/pay_1", value: 105 });
      }),
    );

    await new AsaasService().createForeignCardPayment({ ...FOREIGN_PAYMENT, reuseCustomer: true });

    expect(calls.some((c) => c.startsWith("POST") && c.endsWith("/customers"))).toBe(false);
  });

  it("never logs the raw Asaas response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(400, {
          errors: [{ code: "invalid_object", description: "Documento PYA1234567 inválido" }],
        }),
      ),
    );
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${JSON.stringify(a)}` : String(a))).join(" "));
    });

    await new AsaasService().createForeignCardPayment(FOREIGN_PAYMENT).catch(() => {});

    expect(logged.join("\n")).not.toMatch(/PYA1234567|inválido/);
  });
});
