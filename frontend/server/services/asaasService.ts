import { AsaasApiError } from "../utils/asaasErrors";

const DEFAULT_ASAAS_API_URL = "https://api.asaas.com/v3";

/** Production unless ASAAS_API_URL points elsewhere (sandbox: https://api-sandbox.asaas.com/v3). */
export function asaasBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.ASAAS_API_URL || DEFAULT_ASAAS_API_URL).replace(/\/+$/, "");
}

interface AsaasCustomer {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
}

interface AsaasPaymentRequest {
  customer: AsaasCustomer;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX";
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
  pixTransaction?: {
    qrCode: {
      encodedImage: string;
      payload: string;
    };
    expirationDate: string;
  };
  bankSlipUrl?: string;
}

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

  private async makeRequest(endpoint: string, method: string = "GET", data?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "access_token": this.apiKey,
      },
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

      /**
       * Cartão: apenas Link de Pagamento — evita criar uma cobrança avulsa que dispara
       * e-mail automático de "cobrança" do Asaas. Ver PaymentLinkSaveRequestDTO:
       * notificationEnabled: false desativa notificações para clientes cadastrados via o link.
       */
      if (paymentData.billingType === "CREDIT_CARD") {
        const paymentLinkPayload = {
          name: `Pedido ${paymentData.externalReference}`,
          billingType: "CREDIT_CARD",
          chargeType: "INSTALLMENT",
          maxInstallmentCount: 3,
          value: paymentData.value,
          dueDateLimitDays: 1,
          description: paymentData.description,
          externalReference: paymentData.externalReference,
          notificationEnabled: false,
        };

        const paymentLinkData = await this.makeRequest("/paymentLinks", "POST", paymentLinkPayload);

        return {
          id: paymentLinkData.id,
          dateCreated: paymentLinkData.dateCreated,
          customer: customer.id,
          paymentLink: paymentLinkData.url,
          value: paymentLinkData.value,
          netValue: paymentLinkData.netValue ?? paymentLinkData.value,
          billingType: "CREDIT_CARD",
          status: "PENDING",
        };
      }

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
  }): Promise<AsaasPaymentResponse> {
    const listed = await this.makeRequest(
      `/customers?externalReference=${encodeURIComponent(params.userId)}&limit=1`,
    );
    const customer =
      listed?.data?.length > 0
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

  // Webhook signature validation (for production use)
  validateWebhookSignature(requestToken: string | undefined): boolean {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

        if (!expectedToken) {
            // If the token is not configured on the server, validation is skipped.
            // Log a warning in production environments.
            console.warn("ASAAS_WEBHOOK_TOKEN is not set. Skipping webhook validation.");
            return true;
        }

        if (!requestToken) {
            // No token was provided in the request
            return false;
        }

        // Simple, secure string comparison
        return requestToken === expectedToken;
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
