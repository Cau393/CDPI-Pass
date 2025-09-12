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

class AsaasService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ASAAS_API_KEY || "";
    this.baseUrl = "https://api.asaas.com/v3"; // Use production API
    
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
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(`Asaas API error: ${response.status} - ${JSON.stringify(responseData)}`);
      }

      return responseData;
    } catch (error) {
      console.error("Asaas API request failed:", error);
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
        dueDate: paymentData.dueDate.toISOString().split('T')[0], // YYYY-MM-DD format
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

  async getPayment(paymentId: string): Promise<AsaasPaymentResponse> {
    try {
      return await this.makeRequest(`/payments/${paymentId}`);
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
  validateWebhookSignature(payload: string, signature: string): boolean {
    // Implement webhook signature validation based on Asaas documentation
    // This is important for production to ensure webhook authenticity
    return true; // Simplified for now
  }

  async cancelPayment(paymentId: string): Promise<any> {
  try {
    // The endpoint for deleting a payment is typically /payments/{id}
    return await this.makeRequest(`/payments/${paymentId}`, "DELETE");
    } catch (error) {
    console.error("Error canceling Asaas payment:", error);
    throw error;
    }
  }
}

export const asaasService = new AsaasService();
