import logging
import httpx
from os import getenv
from dotenv import load_dotenv
from datetime import date
from tickets.models import Ticket

load_dotenv()

logger = logging.getLogger(__name__)

class AsaasPaymentTask:
    """
    Handles all interactions with the Asaas Payment API.
    Mirrors the logic of your Node.js AsaasService.
    """

    def __init__(self):
        self.api_key = getenv("ASAAS_API_KEY")
        self.base_url = getenv("ASAAS_API_URL", "https://api.asaas.com/v3")

        if not self.api_key:
            logger.error("ASAAS_API_KEY environment variable is required for payment processing")

    # ------------------------
    # Internal request helper
    # ------------------------
    def _make_request(self, endpoint: str, method: str = "GET", data: dict | None = None):
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "access_token": self.api_key,
        }

        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.request(method, url, headers=headers, json=data)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Asaas API error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.exception(f"Failed Asaas API request to {url}: {e}")
            raise

    # ------------------------
    # Customer Handling
    # ------------------------
    def create_or_get_customer(self, customer_data: dict):
        """
        If a customer with this CPF/CNPJ exists, return it.
        Otherwise, create a new customer.
        """
        try:
            query = f"/customers?cpfCnpj={customer_data['cpfCnpj']}"
            existing = self._make_request(query)

            if existing.get("data"):
                return existing["data"][0]

            # Create if not found
            return self._make_request("/customers", "POST", customer_data)
        except Exception as e:
            logger.exception("Error creating/finding Asaas customer")
            raise

    # ------------------------
    # Payment Creation
    # ------------------------
    def create_payment(self, order, user):
        """
        Create a payment in Asaas for this order.
        Returns a dict with Asaas payment data (including PIX/Boleto links).
        """
        try:
            # Prepare customer info
            customer_data = {
                "name": user.get_full_name() or user.username,
                "email": user.email,
                "cpfCnpj": getattr(user, "cpf", None),
                "phone": getattr(user, "phone", None),
            }

            if not customer_data["cpfCnpj"]:
                raise ValueError("User CPF/CNPJ is required for Asaas payment")

            customer = self.create_or_get_customer(customer_data)

            event_title = Ticket.objects.filter(order=order).first().event.title

            # Asaas requires dueDate in YYYY-MM-DD
            due_date = (order.created_at or date.today()).strftime("%Y-%m-%d")

            payment_payload = {
                "customer": customer["id"],
                "billingType": order.payment_method.upper(),  # e.g. "PIX", "BOLETO", "CREDIT_CARD"
                "value": float(order.amount),
                "dueDate": due_date,
                "description": f"Order {order.id} for {event_title}",
                "externalReference": str(order.id),
            }

            logger.info(f"Creating Asaas payment for order {order.id} - {payment_payload}")

            payment = self._make_request("/payments", "POST", payment_payload)

            # ---------------------------------------------------
            # 🔹 For PIX payments: fetch QR code for the frontend
            # ---------------------------------------------------
            if payment_payload["billingType"] == "PIX":
                try:
                    pix_info = self._make_request(f"/payments/{payment['id']}/pixQrCode")
                    payment["pixTransaction"] = {
                        "qrCode": {
                            "encodedImage": pix_info.get("encodedImage"),
                            "payload": pix_info.get("payload"),
                        },
                        "expirationDate": pix_info.get("expirationDate"),
                    }
                except Exception as e:
                    logger.warning(f"Failed to retrieve PIX QR code for {payment['id']}: {e}")

            # ---------------------------------------------------
            # 🔹 For BOLETO payments: the link is already in the response
            # ---------------------------------------------------
            if payment_payload["billingType"] == "BOLETO":
                payment["bankSlipUrl"] = payment.get("bankSlipUrl")

            # ---------------------------------------------------
            # 🔹 CREDIT CARD flow is handled in Asaas checkout link
            # ---------------------------------------------------
            if payment_payload["billingType"] == "CREDIT_CARD":
                # Optionally, you can generate a payment link
                try:
                    payment_link_data = self._make_request(
                        "/paymentLinks", "POST",
                        {
                            "name": f"Order {order.id}",
                            "billingType": "CREDIT_CARD",
                            "chargeType": "DETACHED",
                            "value": float(order.amount),
                            "dueDateLimitDays": 1,
                            "description": f"Payment for order {order.id}",
                            "endDate": due_date,
                        }
                    )
                    payment["paymentLink"] = payment_link_data.get("url")
                except Exception as e:
                    logger.warning(f"Failed to create credit card link for {order.id}: {e}")

            return payment

        except Exception as e:
            logger.exception("Error creating Asaas payment")
            raise

    # ------------------------
    # Payment Retrieval
    # ------------------------
    def get_payment(self, payment_id: str):
        """Retrieve payment details by ID."""
        try:
            return self._make_request(f"/payments/{payment_id}")
        except Exception as e:
            logger.exception(f"Error fetching Asaas payment {payment_id}")
            raise

    # ------------------------
    # Payment Cancellation
    # ------------------------
    def cancel_payment(self, payment_id: str):
        """Cancel an existing payment on Asaas."""
        try:
            return self._make_request(f"/payments/{payment_id}", method="DELETE")
        except Exception as e:
            logger.exception(f"Error cancelling Asaas payment {payment_id}")
            raise

    # ------------------------
    # Webhook Validation
    # ------------------------
    def validate_webhook_signature(self, request_token: str | None):
        """
        Validate webhook token (compares to ASAAS_WEBHOOK_TOKEN).
        """
        expected_token = getenv("ASAAS_WEBHOOK_TOKEN")

        if not expected_token:
            logger.warning("ASAAS_WEBHOOK_TOKEN not set. Skipping webhook validation.")
            return True

        if not request_token:
            return False

        return request_token == expected_token