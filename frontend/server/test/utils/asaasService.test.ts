import { afterEach, describe, it, expect, vi } from "vitest";
import { AsaasService, asaasBaseUrl } from "../../services/asaasService";
import { AsaasApiError, CardDeclinedError } from "../../utils/asaasErrors";

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

// Fake card data: Luhn-valid, distinctive so a leak is unambiguous.
const PAN = "4539578763621486";
const CCV = "7391";
const TOKEN = "tok-leak-check-5d41402a";

const CARD_PAYMENT = {
  customer: { name: "Comprador Teste", email: "comprador@example.test", cpfCnpj: "52998224725", phone: "11987654321" },
  reuseCustomer: false,
  value: 150,
  installmentCount: 1 as 1 | 2 | 3,
  description: "Ingresso para Evento",
  externalReference: "order-card-1",
  card: { holderName: "COMPRADOR TESTE", number: PAN, expiryMonth: "12", expiryYear: "2031", ccv: CCV },
  holder: {
    name: "Comprador Teste",
    email: "comprador@example.test",
    cpfCnpj: "52998224725",
    postalCode: "01310100",
    addressNumber: "100",
    phone: "11987654321",
  },
  remoteIp: "203.0.113.9",
};

interface Call {
  url: string;
  method: string;
  body?: any;
}

/** Fetch stub for the card flow; `paymentsResponse` answers POST /payments. */
function stubCardFetch(paymentsResponse: () => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = {
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      if (call.url.includes("/customers?")) return jsonResponse(200, { data: [{ id: "cus_found" }] });
      if (call.url.endsWith("/customers")) return jsonResponse(200, { id: "cus_new" });
      if (call.url.endsWith("/payments")) return paymentsResponse();
      return jsonResponse(404, {});
    }),
  );
  return calls;
}

const CONFIRMED_PAYMENT = () =>
  jsonResponse(200, {
    id: "pay_card_1",
    status: "CONFIRMED",
    value: 150,
    netValue: 145,
    installment: null,
    billingType: "CREDIT_CARD",
    creditCard: { creditCardNumber: "1486", creditCardBrand: "VISA", creditCardToken: TOKEN },
  });

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

describe("AsaasService.createCardPayment (ADR-017 Stage 3)", () => {
  it("posts a single card payment with value, creditCard, holder info and remoteIp", async () => {
    const calls = stubCardFetch(CONFIRMED_PAYMENT);

    await new AsaasService().createCardPayment(CARD_PAYMENT);

    const charge = calls.find((c) => c.method === "POST" && c.url.endsWith("/payments"))!;
    expect(charge.body).toMatchObject({
      customer: "cus_new",
      billingType: "CREDIT_CARD",
      value: 150,
      description: "Ingresso para Evento",
      externalReference: "order-card-1",
      remoteIp: "203.0.113.9",
      creditCard: { holderName: "COMPRADOR TESTE", number: PAN, expiryMonth: "12", expiryYear: "2031", ccv: CCV },
      creditCardHolderInfo: CARD_PAYMENT.holder,
    });
    expect(charge.body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(charge.body).not.toHaveProperty("installmentCount");
    expect(charge.body).not.toHaveProperty("totalValue");
  });

  it("posts a 3x plan with installmentCount and totalValue and no value", async () => {
    const calls = stubCardFetch(CONFIRMED_PAYMENT);

    await new AsaasService().createCardPayment({ ...CARD_PAYMENT, installmentCount: 3 });

    const charge = calls.find((c) => c.method === "POST" && c.url.endsWith("/payments"))!;
    expect(charge.body).toMatchObject({ billingType: "CREDIT_CARD", installmentCount: 3, totalValue: 150 });
    expect(charge.body).not.toHaveProperty("value");
  });

  it("reuseCustomer false never looks a customer up and creates one with the given contact", async () => {
    const calls = stubCardFetch(CONFIRMED_PAYMENT);

    await new AsaasService().createCardPayment({ ...CARD_PAYMENT, reuseCustomer: false });

    expect(calls.some((c) => c.method === "GET")).toBe(false);
    const created = calls.find((c) => c.method === "POST" && c.url.endsWith("/customers"))!;
    expect(created.body).toMatchObject(CARD_PAYMENT.customer);
  });

  it("reuseCustomer true finds the customer by CPF instead of creating one", async () => {
    const calls = stubCardFetch(CONFIRMED_PAYMENT);

    await new AsaasService().createCardPayment({ ...CARD_PAYMENT, reuseCustomer: true });

    expect(calls.some((c) => c.method === "GET" && c.url.includes("/customers?"))).toBe(true);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/customers"))).toBe(false);
    expect(calls.find((c) => c.url.endsWith("/payments"))!.body.customer).toBe("cus_found");
  });

  it("returns only id, status, value and installment: no creditCard object, no token", async () => {
    stubCardFetch(CONFIRMED_PAYMENT);

    const result = await new AsaasService().createCardPayment(CARD_PAYMENT);

    expect(result).toEqual({ id: "pay_card_1", status: "CONFIRMED", value: 150, installment: null });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("keeps the installment id of a plan", async () => {
    stubCardFetch(() =>
      jsonResponse(200, { id: "pay_card_2", status: "CONFIRMED", value: 50, installment: "ins_1" }),
    );

    const result = await new AsaasService().createCardPayment({ ...CARD_PAYMENT, installmentCount: 3 });

    expect(result).toEqual({ id: "pay_card_2", status: "CONFIRMED", value: 50, installment: "ins_1" });
  });

  it("turns an Asaas 400 on POST /payments into a CardDeclinedError carrying only codes", async () => {
    stubCardFetch(() =>
      jsonResponse(400, { errors: [{ code: "invalid_creditCard", description: `Cartão ${PAN} recusado` }] }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const failure = await new AsaasService().createCardPayment(CARD_PAYMENT).catch((e) => e);

    expect(failure).toBeInstanceOf(CardDeclinedError);
    expect(failure.status).toBe(400);
    expect(failure.codes).toEqual(["invalid_creditCard"]);
  });

  it("a 400 on POST /customers is a plain AsaasApiError, not a decline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { errors: [{ code: "invalid_object", description: "x" }] })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const failure = await new AsaasService().createCardPayment(CARD_PAYMENT).catch((e) => e);

    expect(failure).toBeInstanceOf(AsaasApiError);
    expect(failure).not.toBeInstanceOf(CardDeclinedError);
  });

  it("a 500 on POST /payments propagates as a plain AsaasApiError", async () => {
    stubCardFetch(() => jsonResponse(500, {}));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const failure = await new AsaasService().createCardPayment(CARD_PAYMENT).catch((e) => e);

    expect(failure).toBeInstanceOf(AsaasApiError);
    expect(failure).not.toBeInstanceOf(CardDeclinedError);
    expect(failure.status).toBe(500);
  });

  it("neither the thrown error nor any console call contains the PAN or CVV", async () => {
    stubCardFetch(() =>
      jsonResponse(400, { errors: [{ code: "invalid_creditCard", description: `Cartão ${PAN} ccv ${CCV}` }] }),
    );
    const consoleCalls: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleCalls.push(
          args
            .map((a) => (a instanceof Error ? `${a.message} ${a.stack} ${JSON.stringify(a)}` : JSON.stringify(a) ?? String(a)))
            .join(" "),
        );
      });
    }

    const failure = await new AsaasService().createCardPayment(CARD_PAYMENT).catch((e) => e);

    expect(failure).toBeInstanceOf(CardDeclinedError);
    const surfaces = [
      failure.message,
      String(failure),
      JSON.stringify(failure),
      JSON.stringify(Object.fromEntries(Object.getOwnPropertyNames(failure).map((k) => [k, (failure as any)[k]]))),
      ...consoleCalls,
    ].join("\n");
    expect(surfaces).not.toContain(PAN);
    expect(surfaces).not.toContain(CCV);
  });

  it("no console call contains the PAN, CVV or token on a successful charge", async () => {
    stubCardFetch(CONFIRMED_PAYMENT);
    const consoleCalls: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleCalls.push(args.map((a) => JSON.stringify(a) ?? String(a)).join(" "));
      });
    }

    await new AsaasService().createCardPayment(CARD_PAYMENT);

    const logged = consoleCalls.join("\n");
    expect(logged).not.toContain(PAN);
    expect(logged).not.toContain(CCV);
    expect(logged).not.toContain(TOKEN);
  });
});

describe("AsaasService.createPayment without the hosted card link", () => {
  it("posts PIX to /payments and never to /paymentLinks", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (String(url).includes("/customers?")) return jsonResponse(200, { data: [{ id: "cus_found" }] });
        if (String(url).includes("/pixQrCode")) return jsonResponse(200, { encodedImage: "img", payload: "pix", expirationDate: "2026-12-01" });
        return jsonResponse(200, { id: "pay_pix_1", status: "PENDING", value: 150 });
      }),
    );

    await new AsaasService().createPayment({
      customer: CARD_PAYMENT.customer,
      billingType: "PIX",
      value: 150,
      dueDate: new Date("2026-12-01T00:00:00Z"),
      description: "Ingresso",
      externalReference: "order-pix-1",
    });

    expect(calls.some((c) => c.url.includes("/paymentLinks"))).toBe(false);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/payments"))).toBe(true);
  });

  it("no longer builds a hosted payment link for CREDIT_CARD", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        if (String(url).includes("/customers?")) return jsonResponse(200, { data: [{ id: "cus_found" }] });
        return jsonResponse(200, { id: "pay_x", status: "PENDING", value: 150 });
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await new AsaasService()
      .createPayment({
        customer: CARD_PAYMENT.customer,
        billingType: "CREDIT_CARD" as any,
        value: 150,
        dueDate: new Date("2026-12-01T00:00:00Z"),
        description: "Ingresso",
        externalReference: "order-link-1",
      })
      .catch(() => {});

    expect(calls.some((c) => c.url.includes("/paymentLinks"))).toBe(false);
  });
});
