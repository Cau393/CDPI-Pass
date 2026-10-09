import { afterEach, describe, it, expect, vi } from "vitest";
import { AsaasService, asaasBaseUrl } from "../../services/asaasService";
import { AsaasApiError } from "../../utils/asaasErrors";

const FOREIGN_PAYMENT = {
  name: "Participante Estrangeira",
  email: "foreign@example.test",
  cpfCnpj: "PYA1234567",
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
