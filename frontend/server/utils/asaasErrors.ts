import { EMAIL_CONTACT_LINE } from "@shared/contact";

/**
 * Asaas returned code "invalid_object" for both this and an invalid CPF
 * (2026-10-06), so only the description identifies it.
 */
const FOREIGN_PAYER_NOT_ALLOWED = /pagadores estrangeiros/i;

interface AsaasErrorItem {
  code: string;
  description: string;
}

function asaasErrorItems(body: unknown): AsaasErrorItem[] {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((item) => ({
    code: String(item?.code ?? ""),
    description: String(item?.description ?? ""),
  }));
}

/**
 * Asaas answered with an HTTP error. Keeps only what is safe to log (status
 * and Asaas error codes): descriptions can echo customer data.
 */
export class AsaasApiError extends Error {
  readonly status: number;
  readonly codes: string[];
  readonly isForeignPayerNotAllowed: boolean;

  constructor(status: number, body: unknown) {
    const items = asaasErrorItems(body);
    const codes = items.map((item) => item.code).filter(Boolean);
    super(`Asaas API error ${status}${codes.length > 0 ? `: ${codes.join(", ")}` : ""}`);
    this.name = "AsaasApiError";
    this.status = status;
    this.codes = codes;
    this.isForeignPayerNotAllowed = items.some((item) =>
      FOREIGN_PAYER_NOT_ALLOWED.test(item.description),
    );
  }
}

export interface CheckoutPaymentErrorResponse {
  status: number;
  body: { message: string; code?: string };
}

/** HTTP answer for a failed charge in `POST /api/orders` (the order is deleted by the caller). */
export function checkoutPaymentErrorResponse(error: unknown): CheckoutPaymentErrorResponse {
  if (error instanceof AsaasApiError && error.isForeignPayerNotAllowed) {
    return {
      status: 503,
      body: {
        code: "foreign_payment_unavailable",
        message:
          "Pagamento com cartão internacional indisponível no momento; seu pedido não foi criado. " +
          "International card payment is temporarily unavailable; no order was created. " +
          `Fale com a equipe CDPI / Contact CDPI: ${EMAIL_CONTACT_LINE}`,
      },
    };
  }
  if (error instanceof AsaasApiError) {
    return {
      status: 502,
      body: {
        code: "payment_provider_error",
        message: "Não foi possível gerar a cobrança agora. Tente novamente em alguns minutos.",
      },
    };
  }
  return { status: 500, body: { message: "Erro ao processar pagamento. Tente novamente." } };
}
