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

/**
 * Asaas refused the card charge (HTTP 400 on POST /payments; the charge is not
 * saved on their side). Like its parent it keeps only status and error codes:
 * descriptions can echo card or customer data.
 */
export class CardDeclinedError extends AsaasApiError {
  constructor(codes: string[] = []) {
    super(400, { errors: codes.map((code) => ({ code, description: "" })) });
    this.name = "CardDeclinedError";
  }
}

/**
 * The card charge request (POST /payments) failed in a way that does not prove Asaas refused it
 * (network, timeout, 5xx, 401): the charge may exist. Keeps only the HTTP status and Asaas error
 * codes of the original failure, never its request data.
 */
export class CardChargeOutcomeUnknownError extends Error {
  readonly status: number | null;
  readonly codes: string[];

  constructor(cause: unknown) {
    const status = cause instanceof AsaasApiError ? cause.status : null;
    super(`Card charge outcome unknown${status ? ` (Asaas ${status})` : ""}`);
    this.name = "CardChargeOutcomeUnknownError";
    this.status = status;
    this.codes = cause instanceof AsaasApiError ? cause.codes : [];
  }
}

export interface CheckoutPaymentErrorResponse {
  status: number;
  body: { message: string; code?: string };
}

/** HTTP answer for a failed charge in `POST /api/orders` (the order is deleted by the caller). */
export function checkoutPaymentErrorResponse(error: unknown): CheckoutPaymentErrorResponse {
  if (error instanceof CardDeclinedError) {
    return {
      status: 402,
      body: {
        code: "card_declined",
        message: "Pagamento não aprovado. Confira os dados do cartão ou use outro cartão.",
      },
    };
  }
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
  if (error instanceof AsaasApiError || error instanceof CardChargeOutcomeUnknownError) {
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
