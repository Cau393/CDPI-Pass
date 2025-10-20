from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from rest_framework.response import Response
from django.db import transaction

from uuid import uuid4
from tickets.models import Ticket
from tickets.serializers import TicketSerializer
from tasks.asaas_payment_task import AsaasPaymentTask
from .serializers import OrderSerializer
from .models import Order

import logging
logger = logging.getLogger(__name__)

class OrderView(APIView):
    permission_classes = [IsAuthenticated]
    """
    POST: Create a new order for the authenticated user.
    GET: Retrieve orders for the authenticated user.
    """
    def post(self, request, format=None):
        serializer = OrderSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            with transaction.atomic():
                user = request.user
                order = serializer.save(user=user)
                quantity = order.quantity or 1

                tickets = []
                
                for _ in range(quantity):
                    ticket = Ticket.objects.create(
                        order=order,
                        event=order.event,
                        user=user,
                        qr_code_data=f"QR-{uuid4()}",
                    )
                    tickets.append(ticket)
                
                payment_task = AsaasPaymentTask()
                payment_data = payment_task.create_payment(order, user)

                order.asaas_payment_id = payment_data["id"]
                order.save()

                return Response(
                    {
                        "message": "Order created successfully",
                        "order": OrderSerializer(order).data,
                        "payment": payment_data,
                        "tickets": TicketSerializer(tickets, many=True).data,
                    },
                    status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Error creating order: {e}")
            return Response({"error": "Internal server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get(self, request, format=None):
        user = request.user
        orders = Order.objects.filter(user=user)
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

class WebHookView(APIView):
    permission_classes = [AllowAny]
    def post(self, request, format=None):
        payment_task = AsaasPaymentTask()
        
        try:
            token = request.headers.get("access_token") or request.headers.get("Authorization")
            if not token:
                return Response({"error": "Authorization token missing"}, status=status.HTTP_401_UNAUTHORIZED)
            if not payment_task.validate_webhook_signature(token):
                return Response({"error": "Invalid webhook signature"}, status=status.HTTP_403_FORBIDDEN)
            
            payment_data = request.data.get("payment", {})
            external_reference = payment_data.get("externalReference")
            if not external_reference:
                return Response({"error": "External reference missing"}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                order = Order.objects.get(id=external_reference)
                if order.status == "paid":
                    return Response({"message": "Order already paid"}, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)
            
            payment_status = payment_data.get("status")
            if payment_status in ["CONFIRMED", "RECEIVED"]:
                order.status = "paid"
                order.event.current_attendees += 1
                order.save()
                
                send_ticket_email.delay(order.id)
            
            return Response({"status": "Webhook processed successfully"}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            return Response({"error": "Internal server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
