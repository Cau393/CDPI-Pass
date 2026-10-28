import { AsaasApiError, CardChargeOutcomeUnknownError, CardDeclinedError } from "../utils/asaasErrors";
import { brazilianNationalPhone } from "../utils/normalizePhoneE164";

const DEFAULT_ASAAS_API_URL = "https://api.asaas.com/v3";

/** Production unless ASAAS_API_URL points elsewhere (sandbox: https://api-sandbox.asaas.com/v3). */
export function asaasBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.ASAAS_API_URL || DEFAULT_ASAAS_API_URL).replace(/\/+$/, "");
}

/** The `payment` object of an Asaas webhook (or of GET /payments/{id}). */
export type ReceivedAsaasPayment = {
  id: string;
  billingType?: string | null;
  value?: number | null;
  /** Card installment plan id; the same for every installment of one purchase. */
  installment?: string | null;
};

interface AsaasCustomer {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
}

interface AsaasPaymentRequest {
  customer: AsaasCustomer;
  billingType: "BOLETO" | "PIX";
  value: number;
  dueDate: Date;
  description: string;
  externalReference: string;
}

interface AsaasPaymentResponse {
  id: string;
  dateCreated: string;
  customer: string;
  paymentLink: string;
  value: number;
  netValue: number;
  billingType: string;
  status: string;
  /** Card installment plan id (bought in installments). */
  installment?: string | null;
  pixTransaction?: {
    qrCode: {
      encodedImage: string;
      payload: string;
    };
    expirationDate: string;
  };
  bankSlipUrl?: string;
}

export interface CardPaymentParams {
  customer: AsaasCustomer;
  /** False for guest orders: the customer is always created from the typed contact. */
  reuseCustomer: boolean;
  /** Order total; with installments Asaas splits it. */
  value: number;
  dueDate: Date;
  installmentCount: 1 | 2 | 3;
  description: string;
  externalReference: string;
  card: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
  holder: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
  remoteIp: string;
}

/** Only what the route needs: never the Asaas `creditCard` object (brand, last 4, token). */
export interface CardPaymentResult {
  id: string;
  status: string;
  value: number;
  installment: string | null;
}

/** Asaas asks for at least 60 s on the card charge; nginx in front of the API waits 120 s. */
const CARD_CHARGE_TIMEOUT_MS = 90_000;

export class AsaasService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ASAAS_API_KEY || "";
    this.baseUrl = asaasBaseUrl();
    
    if (!process.env.ASAAS_API_KEY) {
      console.error("ASAAS_API_KEY environment variable is required for payment processing");
    }
  }

  private async makeRequest(
    endpoint: string,
    method: string = "GET",
    data?: any,
    signal?: AbortSignal,
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "access_token": this.apiKey,
      },
      ...(signal ? { signal } : {}),
    };

    if (data && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new AsaasApiError(response.status, await response.json().catch(() => null));
      }
      return await response.json();
    } catch (error) {
      // Path only: the query string can carry a CPF or passport.
      console.error(`Asaas API request failed (${method} ${endpoint.split("?")[0]}):`, error);
      throw error;
    }
  }

  async createCustomer(customerData: AsaasCustomer): Promise<any> {
    try {
      // First, try to find existing customer by CPF
      const existingCustomers = await this.makeRequest(`/customers?cpfCnpj=${customerData.cpfCnpj}`);
      
      if (existingCustomers.data && existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }

      // Create new customer if not found
      return await this.makeRequest("/customers", "POST", customerData);
    } catch (error) {
      console.error("Error creating/finding customer:", error);
      throw error;
    }
  }

  async createPayment(paymentData: AsaasPaymentRequest): Promise<AsaasPaymentResponse> {
    try {
      // Create or get customer
      const customer = await this.createCustomer(paymentData.customer);

      const paymentPayload = {
        customer: customer.id,
        billingType: paymentData.billingType,
        value: paymentData.value,
        dueDate: paymentData.dueDate.toISOString().split("T")[0],
        description: paymentData.description,
        externalReference: paymentData.externalReference,
      };

      const payment = await this.makeRequest("/payments", "POST", paymentPayload);

      // For PIX payments, get the QR code
      if (paymentData.billingType === "PIX") {
        try {
          const pixInfo = await this.makeRequest(`/payments/${payment.id}/pixQrCode`);
          payment.pixTransaction = {
            qrCode: {
              encodedImage: pixInfo.encodedImage,
              payload: pixInfo.payload,
            },
            expirationDate: pixInfo.expirationDate,
          };
        } catch (pixError) {
          console.error("Error getting PIX QR code:", pixError);
        }
      }

      // For bank slip, the URL is already in the response
      if (paymentData.billingType === "BOLETO") {
        payment.bankSlipUrl = payment.bankSlipUrl;
      }

      return payment;
    } catch (error) {
      console.error("Error creating payment:", error);
      throw error;
    }
  }

  /**
   * Inline card charge (ADR-017). This is the only place that builds the Asaas card
   * request, and it never logs it: makeRequest logs method, path and the error
   * (status and codes only). A 400 from POST /payments is a declined card (Asaas
   * does not save the charge); any other failure of that request is an unknown
   * outcome (CardChargeOutcomeUnknownError). Customer-step failures propagate as is:
   * nothing was charged.
   */
  async createCardPayment(params: CardPaymentParams): Promise<CardPaymentResult> {
    // Asaas wants the national form of a Brazilian phone ("11987654321"), not E.164.
    const nationalPhone = (phone: string) => brazilianNationalPhone(phone) ?? phone;
    const contact = { ...params.customer, phone: nationalPhone(params.customer.phone) };
    const customer = params.reuseCustomer
      ? await this.createCustomer(contact)
      : await this.makeRequest("/customers", "POST", contact);

    const body = {
      customer: customer.id,
      billingType: "CREDIT_CARD",
      ...(params.installmentCount === 1
        ? { value: params.value }
        : { installmentCount: params.installmentCount, totalValue: params.value }),
      dueDate: params.dueDate.toISOString().split("T")[0],
      description: params.description,
      externalReference: params.externalReference,
      creditCard: {
        holderName: params.card.holderName,
        number: params.card.number,
        expiryMonth: params.card.expiryMonth,
        expiryYear: params.card.expiryYear,
        ccv: params.card.ccv,
      },
      creditCardHolderInfo: {
        name: params.holder.name,
        email: params.holder.email,
        cpfCnpj: params.holder.cpfCnpj,
        postalCode: params.holder.postalCode,
        addressNumber: params.holder.addressNumber,
        phone: nationalPhone(params.holder.phone),
      },
      remoteIp: params.remoteIp,
    };

    try {
      const payment: { id: string; status: string; value: number; installment?: string | null } =
        await this.makeRequest("/payments", "POST", body, AbortSignal.timeout(CARD_CHARGE_TIMEOUT_MS));
      if (typeof payment?.id !== "string" || !payment.id) throw new Error("card charge answer without an id");
      return {
        id: payment.id,
        status: payment.status,
        value: payment.value,
        installment: payment.installment ?? null,
      };
    } catch (error) {
      if (error instanceof AsaasApiError) {
        if (error.status === 400) throw new CardDeclinedError(error.codes);
        // Definite rejections of the request itself (credentials, route, rate limit): no charge exists.
        if ([401, 403, 404, 429].includes(error.status)) throw error;
      }
      // Anything else (network, timeout, 408, 5xx, an unreadable answer) does not prove Asaas refused
      // it: the charge may exist, the route keeps the order for the webhook.
      throw new CardChargeOutcomeUnknownError(error);
    }
  }

  /**
   * One-off international card charge. Asaas does not allow payment links,
   * installments, PIX, or boleto for foreignCustomer. Lookup is by
   * externalReference (our user id), not by document, so a passport cannot
   * collide with a Brazilian CPF. The passport is never sent: Asaas validates
   * `cpfCnpj` as a Brazilian document even with `foreignCustomer: true` and
   * answers 400 "O CPF/CNPJ informado é inválido" (sandbox, 2026-10-09).
   */
  async createForeignCardPayment(params: {
    name: string;
    email: string;
    phone: string;
    userId: string;
    value: number;
    dueDate: Date;
    description: string;
    orderExternalReference: string;
    /** False for a guest (ADR-017): the customer is always created from the typed contact. */
    reuseCustomer?: boolean;
  }): Promise<AsaasPaymentResponse> {
    const listed =
      params.reuseCustomer === false
        ? null
        : await this.makeRequest(
            `/customers?externalReference=${encodeURIComponent(params.userId)}&limit=1`,
          );
    const customer =
      listed && listed.data?.length > 0
        ? listed.data[0]
        : await this.makeRequest("/customers", "POST", {
            name: params.name,
            email: params.email,
            phone: params.phone,
            mobilePhone: params.phone,
            foreignCustomer: true,
            externalReference: params.userId,
          });

    const payment = await this.makeRequest("/payments", "POST", {
      customer: customer.id,
      billingType: "CREDIT_CARD",
      value: params.value,
      dueDate: params.dueDate.toISOString().split("T")[0],
      description: params.description,
      externalReference: params.orderExternalReference,
    });

    const invoiceUrl = payment.invoiceUrl as string | undefined;
    if (!invoiceUrl) {
      throw new Error("Asaas não retornou a URL da cobrança internacional");
    }

    return {
      id: payment.id,
      dateCreated: payment.dateCreated,
      customer: customer.id,
      paymentLink: invoiceUrl,
      value: payment.value,
      netValue: payment.netValue ?? payment.value,
      billingType: "CREDIT_CARD",
      status: payment.status ?? "PENDING",
    };
  }

  /**
   * Cobranças PIX/boleto usam id `pay_...`. Cartão via link de pagamento guarda o id do link (numérico);
   * a cobrança real é resolvida por `externalReference` (= id do pedido no sistema).
   */
  private pickBestPaymentFromList(payments: any[]): AsaasPaymentResponse {
    const paidStatuses = new Set(["CONFIRMED", "RECEIVED"]);
    const paid = payments.filter((p) => paidStatuses.has(p.status));
    const pool = paid.length > 0 ? paid : payments;
    const sorted = [...pool].sort((a, b) => {
      const ta = new Date(
        a.paymentDate || a.confirmedDate || a.dateCreated || 0
      ).getTime();
      const tb = new Date(
        b.paymentDate || b.confirmedDate || b.dateCreated || 0
      ).getTime();
      return tb - ta;
    });
    return sorted[0] as AsaasPaymentResponse;
  }

  async getPayment(
    storedAsaasId: string,
    orderExternalRef: string
  ): Promise<AsaasPaymentResponse> {
    try {
      if (storedAsaasId.startsWith("pay_")) {
        return await this.makeRequest(`/payments/${storedAsaasId}`);
      }

      const query = new URLSearchParams({
        externalReference: orderExternalRef,
        limit: "100",
      });
      const list = await this.makeRequest(`/payments?${query.toString()}`);

      if (!list.data || list.data.length === 0) {
        return { status: "PENDING" } as AsaasPaymentResponse;
      }

      return this.pickBestPaymentFromList(list.data);
    } catch (error) {
      console.error("Error getting payment:", error);
      throw error;
    }
  }

  async updatePayment(paymentId: string, updateData: any): Promise<AsaasPaymentResponse> {
    try {
      return await this.makeRequest(`/payments/${paymentId}`, "POST", updateData);
    } catch (error) {
      console.error("Error updating payment:", error);
      throw error;
    }
  }

  /**
   * The `asaas-access-token` header must match ASAAS_WEBHOOK_TOKEN. In production a missing
   * token rejects every delivery (fail closed); elsewhere it skips the check, for local runs.
   */
  validateWebhookSignature(requestToken: string | undefined): boolean {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expectedToken) {
      if (process.env.NODE_ENV === "production") {
        console.error("ASAAS_WEBHOOK_TOKEN is not set: rejecting the Asaas webhook delivery.");
        return false;
      }
      console.warn("ASAAS_WEBHOOK_TOKEN is not set. Skipping webhook validation (non-production).");
      return true;
    }
    return requestToken === expectedToken;
  }

  /**
   * Refunds a payment we RECEIVED (the webhook's `payment`, never the order's link id).
   * - Card bought in installments: the whole installment plan, so no installment is left charged.
   * - Boleto: Asaas cannot push money back to a boleto payer; it returns `requestUrl`, a form
   *   where the buyer enters their bank account. The refund completes only after that. Asaas
   *   refuses it ("não possui um celular válido") unless the customer has a mobile phone, and
   *   our customers are created with `phone` only, so the buyer's phone is set first.
   * - PIX and single card: refunded directly (PIX needs enough balance in the account).
   * Asaas rejects a second refund of the same payment, which makes retries harmless.
   */
  async refundReceivedPayment(
    payment: ReceivedAsaasPayment,
    buyerPhone?: string | null,
  ): Promise<{ requestUrl: string | null }> {
    const description = "Estorno automático CDPI Pass";
    if (payment.billingType === "CREDIT_CARD" && payment.installment) {
      await this.makeRequest(`/installments/${payment.installment}/refund`, "POST", {});
      return { requestUrl: null };
    }
    if (payment.billingType === "BOLETO") {
      const mobilePhone = brazilianNationalPhone(buyerPhone);
      if (mobilePhone) {
        const { customer } = await this.makeRequest(`/payments/${payment.id}`);
        await this.makeRequest(`/customers/${customer}`, "POST", { mobilePhone });
      }
      const res = await this.makeRequest(`/payments/${payment.id}/bankSlip/refund`, "POST", {});
      return { requestUrl: typeof res?.requestUrl === "string" ? res.requestUrl : null };
    }
    await this.makeRequest(`/payments/${payment.id}/refund`, "POST", { description });
    return { requestUrl: null };
  }

  /**
   * True when Asaas already refunded (or is refunding) this payment. A refund that waits for
   * authorization (AWAITING_CRITICAL_ACTION_AUTHORIZATION) leaves the status RECEIVED and shows
   * only in `refunds`.
   */
  async isRefunded(paymentId: string): Promise<boolean> {
    const payment = await this.makeRequest(`/payments/${paymentId}`);
    if (typeof payment?.status === "string" && payment.status.startsWith("REFUND")) return true;
    const refunds: { status?: string }[] = Array.isArray(payment?.refunds) ? payment.refunds : [];
    return refunds.some((refund) => refund.status !== "CANCELLED");
  }

  /** Sum of every payment of a card installment plan (one webhook arrives per installment). */
  async installmentTotal(installmentId: string): Promise<number> {
    const list = await this.makeRequest(`/payments?installment=${encodeURIComponent(installmentId)}&limit=100`);
    const rows: { value?: number }[] = Array.isArray(list?.data) ? list.data : [];
    return rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  }

  /** Switches a payment link off so it takes no new purchase; the charges it made stay as they are. */
  async deactivatePaymentLink(linkId: string): Promise<void> {
    await this.makeRequest(`/paymentLinks/${linkId}`, "PUT", { active: false });
  }

  async cancelPayment(paymentId: string): Promise<any> {
    try {
      if (paymentId.startsWith("pay_")) {
        return await this.makeRequest(`/payments/${paymentId}`, "DELETE");
      }
      return await this.makeRequest(`/paymentLinks/${paymentId}`, "DELETE");
    } catch (error) {
      console.error("Error canceling Asaas payment:", error);
      throw error;
    }
  }
}

export const asaasService = new AsaasService();
