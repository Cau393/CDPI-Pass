import { describe, it, expect } from "vitest";
import { CONTACT_EMAIL } from "@shared/contact";
import { AsaasApiError, checkoutPaymentErrorResponse } from "../../utils/asaasErrors";

// Body Asaas returned on 2026-10-06 for a passport customer in production.
const FOREIGN_PAYER_DENIED = {
  errors: [
    {
      code: "invalid_object",
      description:
        "Sua conta não tem permissão para gerar pagadores estrangeiros. Para mais informações, entre em contato com seu Gerente de Contas.",
    },
    { code: "invalid_object", description: "O CPF/CNPJ informado é inválido." },
  ],
};

const INVALID_DOCUMENT = {
  errors: [{ code: "invalid_object", description: "O CPF/CNPJ informado é inválido." }],
};

describe("AsaasApiError", () => {
  it("recognises the foreign-payer permission error", () => {
    expect(new AsaasApiError(400, FOREIGN_PAYER_DENIED).isForeignPayerNotAllowed).toBe(true);
  });

  it("does not flag other Asaas errors as the foreign-payer one", () => {
    expect(new AsaasApiError(400, INVALID_DOCUMENT).isForeignPayerNotAllowed).toBe(false);
  });

  it("keeps only the status and error codes, never the raw response", () => {
    const error = new AsaasApiError(400, {
      errors: [{ code: "invalid_object", description: "Documento PYA1234567 inválido" }],
    });

    expect(`${error.message} ${JSON.stringify(error)}`).not.toMatch(/PYA1234567|inválido/);
  });

  it("names the status and codes in its message", () => {
    expect(new AsaasApiError(400, INVALID_DOCUMENT).message).toBe(
      "Asaas API error 400: invalid_object",
    );
  });

  it("tolerates a body that is not JSON", () => {
    expect(new AsaasApiError(502, null).message).toBe("Asaas API error 502");
  });
});

describe("checkoutPaymentErrorResponse", () => {
  it("answers 503 with the CDPI contact when Asaas refuses foreign payers", () => {
    expect(checkoutPaymentErrorResponse(new AsaasApiError(400, FOREIGN_PAYER_DENIED))).toMatchObject({
      status: 503,
      body: { code: "foreign_payment_unavailable", message: expect.stringContaining(CONTACT_EMAIL) },
    });
  });

  it("answers 502 for any other Asaas 4xx", () => {
    expect(checkoutPaymentErrorResponse(new AsaasApiError(400, INVALID_DOCUMENT)).status).toBe(502);
  });

  it("answers 502 when Asaas rejects our credentials", () => {
    expect(checkoutPaymentErrorResponse(new AsaasApiError(401, null)).status).toBe(502);
  });

  it("keeps the generic 500 for errors that did not come from Asaas", () => {
    expect(checkoutPaymentErrorResponse(new Error("QR upload failed"))).toEqual({
      status: 500,
      body: { message: "Erro ao processar pagamento. Tente novamente." },
    });
  });
});
