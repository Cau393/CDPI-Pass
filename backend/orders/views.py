from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status, permissions, parsers
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db import transaction

import io
import csv
from uuid import uuid4
from decimal import Decimal
from datetime import datetime

from .models import Order, CourtesyLink
from tickets.models import Ticket, CourtesyAttendee
from events.models import Event
from helper_functions import detect_delimiter, generate_courtesy_code, fulfill_order
from .serializers import OrderSerializer, CourtesyLinkSerializer
from tickets.serializers import TicketSerializer
from tasks.asaas_payment_task import AsaasPaymentTask
from tasks.email_tasks import send_mass_email

import logging
logger = logging.getLogger(__name__)

class OrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, format=None):
        user = request.user
        data = request.data
        event_id = data.get("eventId")
        payment_method = data.get("paymentMethod")
        promo_code = data.get("code")
        quantity = int(data.get("quantity", 1))

        # 🧩 Validate basic input
        if not event_id or not payment_method:
            return Response({"error": "eventId and paymentMethod are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response({"error": "Evento não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        # 🏷️ Check event capacity
        if hasattr(event, "max_attendees") and event.max_attendees is not None:
            current_tickets = Ticket.objects.filter(event=event).count()
            if current_tickets + quantity > event.max_attendees:
                return Response({"error": "Evento lotado"}, status=status.HTTP_400_BAD_REQUEST)

        # 💰 Base ticket price
        final_price = Decimal(event.price)
        
        # FIX: Initialize courtesy_link as None here
        courtesy_link = None 

        # 🎟️ Handle promoCode / Courtesy logic
        if promo_code:
            try:
                courtesy_link = CourtesyLink.objects.get(code=promo_code, event=event, is_active=True)
                remaining_uses = courtesy_link.ticket_count - courtesy_link.used_count

                if remaining_uses <= 0:
                    return Response({"error": "Código promocional esgotado"}, status=status.HTTP_400_BAD_REQUEST)

                if courtesy_link.override_price:
                    final_price = courtesy_link.override_price

                # increment used count
                courtesy_link.used_count += quantity
                courtesy_link.save(update_fields=["used_count"])
            except CourtesyLink.DoesNotExist:
                return Response({"error": "Código promocional inválido"}, status=status.HTTP_400_BAD_REQUEST)

        # ⚙️ Calculate total (ticket price + convenience fee)
        convenience_fee = Decimal("5.00")
        total_amount = (final_price * quantity) + convenience_fee

        # FIX: This line was the bug. It has been removed.
        # courtesy_link = None 

        # 💾 Create order and tickets atomically
        try:
            with transaction.atomic():
                order_id = str(uuid4())
                order = Order.objects.create(
                    id=order_id,
                    user=user,
                    status="pending",
                    quantity=quantity,
                    payment_method=payment_method,
                    amount=total_amount,
                )

                # 🎫 Create tickets
                tickets = []
                for i in range(quantity):
                    ticket_name = f"{user.get_full_name() or user.username} - Ticket {i+1}"
                    
                    ticket = Ticket.objects.create(
                        id=uuid4(),
                        name=ticket_name,
                        order=order,
                        event=event,
                        cpf=user.cpf,
                        type_of_ticket=event.batch,
                        qr_code_data=f"QR-{uuid4()}",
                    )
                    
                    # Add courtesy link if applicable
                    if courtesy_link:
                        ticket.courtesy_link_id = courtesy_link
                        ticket.type_of_ticket = "sale"
                        ticket.save(update_fields=["courtesy_link_id", "type_of_ticket"])

                        order.courtesy_link_id = courtesy_link
                        order.save(update_fields=["courtesy_link_id"])

                    tickets.append(ticket)

                # 💳 Create payment (Asaas)
                payment_task = AsaasPaymentTask()
                payment_data = payment_task.create_payment(order, user)

                order.asaas_payment_id = payment_data.get("id", "")
                order.save(update_fields=["asaas_payment_id"])

        except Exception as e:
            logger.error(f"Error creating order: {e}", exc_info=True)
            return Response({"error": "Erro interno ao criar pedido"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # ✅ Success response
        return Response(
            {
                "message": "Pedido criado com sucesso",
                "order": OrderSerializer(order).data,
                "payment": payment_data,
            },
            status=status.HTTP_201_CREATED
        )

    def get(self, request, format=None):
        user = request.user
        orders = Order.objects.filter(user=user).order_by("-created_at")

        paginator = PageNumberPagination()
        paginator.page_size_query_param = 'page_size'
        paginated_orders = paginator.paginate_queryset(orders, request, view=self)

        serializer = OrderSerializer(paginated_orders, many=True)
        return paginator.get_paginated_response(serializer.data)

class TicketListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = PageNumberPagination

    def get(self, request, format=None):
        user = request.user
        
        # Use select_related to efficiently fetch related order and event
        # in a single query
        tickets = Ticket.objects.filter(order__user=user) \
                                .select_related('order', 'event') \
                                .order_by("-created_at")

        # The rest of the logic works perfectly with the new paginator class
        paginator = self.pagination_class()
        paginated_tickets = paginator.paginate_queryset(tickets, request, view=self)
        
        # Use the new TicketSerializer with nested data
        serializer = TicketSerializer(paginated_tickets, many=True)
        return paginator.get_paginated_response(serializer.data)

class CancelOrderView(APIView):
    def delete(self, request, pk, format=None):
        """
        Cancel an order.
        """
        user = request.user
        try:
            order = Order.objects.get(id=pk, user=user)
        except Order.DoesNotExist:
            return Response({"message": "Pedido não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if order.status == "canceled":
            return Response({"message": "Pedido já foi cancelado"}, status=status.HTTP_400_BAD_REQUEST)

        # --- Cancel payment (Asaas)
        payment_task = AsaasPaymentTask()
        payment_task.cancel_payment(order.asaas_payment_id)

        # --- Update order status
        order.status = "canceled"
        order.save(update_fields=["status"])

        # --- Delete associated tickets 
        Ticket.objects.filter(order=order).delete()

        return Response({"message": "Pedido cancelado com sucesso"}, status=status.HTTP_200_OK)

class CheckOrderStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, format=None):
        """
        Check the status of an order.
        """
        user = request.user
        try:
            order = Order.objects.get(id=pk, user=user)
        except Order.DoesNotExist:
            return Response({"message": "Pedido não encontrado"}, status=status.HTTP_404_NOT_FOUND)
        if not order.asaas_payment_id:
            return Response({"message": "Pedido não possui um ID de pagamento"}, status=status.HTTP_400_BAD_REQUEST)

        payment_task = AsaasPaymentTask()
        payment_status = payment_task.check_payment(order.asaas_payment_id)

        # --- Map Asaas status to internal status
        status_map = {
            "PENDING": "pending",
            "OVERDUE": "pending",
            "RECEIVED": "paid",
            "CONFIRMED": "paid",
            "RECEIVED_IN_CASH": "paid",
            "REFUNDED": "cancelled",
            "REFUSED": "cancelled",
            "CANCELLED": "cancelled",
            "CHARGEBACK_REQUESTED": "cancelled",
            "CHARGEBACK_DISPUTE": "cancelled",
            "AWAITING_CHARGEBACK_REVERSAL": "cancelled",
        }

        internal_status = status_map.get(payment_status.upper(), "pending")

        order.status = internal_status
        order.save(update_fields=["status"])

        return Response(
            {
                "asaas_status": payment_status,
                "internal_status": internal_status,
                "message": f"Status do pedido atualizado para {internal_status}"
            },
            status=status.HTTP_200_OK,
        )

class CourtesyLinksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        """
        List all courtesy links for the authenticated user.
        """
        user = request.user
        if not user.is_staff:
            return Response({"message": "Acesso negado"}, status=status.HTTP_403_FORBIDDEN)

        links_qs = CourtesyLink.objects.filter(created_by=user).order_by('-created_at')
        paginator = PageNumberPagination()
        paginator.page_size_query_param = 'page_size'
        paginated_links = paginator.paginate_queryset(links_qs, request, view=self)

        serializer = CourtesyLinkSerializer(paginated_links, many=True)

        return paginator.get_paginated_response(serializer.data)
    
    def post(self, request, format=None):
        """
        Create a new courtesy link.
        """
        user = request.user
        if not user.is_staff:
            return Response({"message": "Acesso negado"}, status=status.HTTP_403_FORBIDDEN)
        serializer = CourtesyLinkSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CourtesyLinksDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code, format=None):
        """
        Get details of a specific courtesy link.
        """
        try:
            link = CourtesyLink.objects.get(code=code)
        except CourtesyLink.DoesNotExist:
            return Response({"message": "Link de cortesia não encontrado"}, status=status.HTTP_404_NOT_FOUND)
        if not link.is_active:
            return Response({"message": "Link de cortesia inativo"}, status=status.HTTP_400_BAD_REQUEST)
        if link.used_count >= link.ticket_count:
            return Response({"message": "Todos os ingressos deste link já foram resgatados"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CourtesyLinkSerializer(link)
        return Response(serializer.data)

class CourtesyRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Redeem a courtesy code for an attendee.
        """
        user = request.user
        data = request.data
        code = data.get("code")

        # --- Validate input
        if not code:
            return Response({"message": "Código de cortesia é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        required_fields = ["name", "email", "cpf", "phone", "birthDate"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            return Response({"message": f"Campos obrigatórios ausentes: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # --- Get Courtesy Link
                try:
                    link = CourtesyLink.objects.select_related("event").get(code=code)
                except CourtesyLink.DoesNotExist:
                    return Response({"message": "Link de cortesia não encontrado"}, status=status.HTTP_404_NOT_FOUND)

                if link.override_price:
                    return Response(
                        {"message": "Este é um código de desconto e deve ser usado na página do evento."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if not link.is_active:
                    return Response({"message": "Link de cortesia inativo"}, status=status.HTTP_400_BAD_REQUEST)

                remaining = link.ticket_count - link.used_count
                if remaining <= 0:
                    return Response({"message": "Todos os ingressos deste link já foram resgatados"}, status=status.HTTP_400_BAD_REQUEST)

                # --- Get Event
                event = link.event
                if not event:
                    return Response({"message": "Evento não encontrado"}, status=status.HTTP_404_NOT_FOUND)

                # --- Check if CPF already used for same event
                cpf_exists = Ticket.objects.filter(
                    event=event,
                    cpf=data["cpf"],
                ).exists()
                if cpf_exists:
                    return Response({"message": "CPF já cadastrado para este evento"}, status=status.HTTP_400_BAD_REQUEST)

                # --- Check event capacity
                if hasattr(event, "max_attendees") and event.max_attendees is not None:
                    current_tickets = Ticket.objects.filter(event=event).count()
                    if current_tickets >= event.max_attendees:
                        return Response({"message": "Evento lotado"}, status=status.HTTP_400_BAD_REQUEST)

                # --- Create CourtesyAttendee record
                birth_date = None
                try:
                    birth_date = datetime.strptime(data["birthDate"], "%Y-%m-%d").date()
                except Exception:
                    pass

                # --- Create Courtesy Order (status = paid)
                order_id = str(uuid4())

                attendee = CourtesyAttendee.objects.create(
                    order_id=order_id,
                    name=data["name"],
                    email=data["email"],
                    cpf=data["cpf"],
                    phone=data.get("phone"),
                    birth_date=birth_date,
                    address=data.get("address"),
                    occupation=data.get("occupation"),
                    partner_company=data.get("partnerCompany"),
                    event_title=event.title,
                    courtesy_link_id=link,
                )

                order = Order.objects.create(
                    id=order_id,
                    user=user,
                    status="paid",
                    quantity=1,
                    payment_method="courtesy",
                    amount=Decimal("0.00"),
                    courtesy_link_id=link,
                )

                # --- Create Courtesy Ticket
                ticket = Ticket.objects.create(
                    id=uuid4(),
                    name=data["name"],
                    order=order,
                    event=event,
                    type_of_ticket="courtesy",
                    qr_code_data=f"QR-{uuid4()}",
                    courtesy_link_id=link,
                )

                # --- Update Courtesy Link usage
                link.used_count += 1
                if link.used_count >= link.ticket_count:
                    link.is_active = False
                link.save(update_fields=["used_count", "is_active"])

                if hasattr(event, "current_attendees"):
                    event.current_attendees = (event.current_attendees or 0) + 1
                    event.save(update_fields=["current_attendees"])

                fulfill_order(order)

                return Response(
                    {
                        "message": "Cortesia resgatada com sucesso!",
                        "order": OrderSerializer(order).data,
                        "qrCode": ticket.qr_code_data,
                    },
                    status=status.HTTP_201_CREATED,
                )

        except Exception as e:
            logger.error(f"Erro ao resgatar cortesia: {e}", exc_info=True)
            return Response({"message": "Erro interno ao resgatar cortesia"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class CourtesyMassSendView(APIView):
    """
    POST /api/courtesy/mass-send/
    Admin-only endpoint to process a CSV and send courtesy emails.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return Response({"message": "Acesso negado. Somente administradores podem usar este endpoint."}, status=status.HTTP_403_FORBIDDEN)
        csv_file = request.FILES.get("csvFile")
        attachment_file = request.FILES.get("attachment")

        if not csv_file:
            return Response({"message": "Nenhum arquivo CSV enviado."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            delimiter = detect_delimiter(csv_file)
            decoded_csv = csv_file.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(decoded_csv), delimiter=delimiter)
            rows = list(reader)

            print(f"🧩 Detected delimiter: {repr(delimiter)} — {len(rows)} rows found")

            # Prepare optional attachment
            attachment_data = None
            if attachment_file:
                attachment_data = [{
                    "filename": attachment_file.name,
                    "content": attachment_file.read().decode("latin1"),  # base64 handled in task if needed
                    "type": attachment_file.content_type
                }]

            for i, row in enumerate(rows, start=1):
                normalized = {k.strip(): (v or "").strip() for k, v in row.items()}
                name = normalized.get("name")
                email = normalized.get("email")
                amount = normalized.get("amount_of_courtesies", "1")
                event_id = normalized.get("event_id")

                if not event_id:
                    print(f"⚠️ Row {i} skipped (missing event_id): {normalized}")
                    continue

                try:
                    event = Event.objects.get(id=event_id)
                except Event.DoesNotExist:
                    print(f"❌ Event not found (row {i}, id={event_id})")
                    continue

                # ✅ Use your existing courtesy code generator
                code = generate_courtesy_code()

                link = CourtesyLink.objects.create(
                    code=code,
                    event=event,
                    ticket_count=int(amount),
                    created_by=request.user,
                    is_active=True,
                )

                print(f"✅ Courtesy link created for {email}: {link.code}")

                # ✅ Use your Celery task to send email asynchronously
                send_mass_email.delay(
                    email=email,
                    name=name,
                    event_name=event.title,
                    courtesy_code=link.code,
                    event_date=event.date.isoformat(),
                    attachments=attachment_data
                )

            return Response({"message": "E-mails de cortesia enfileirados para envio."}, status=status.HTTP_200_OK)

        except Exception as e:
            print("🚨 Error processing CSV:", e)
            return Response({"message": "Erro ao processar o arquivo CSV."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        



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
                fulfill_order(order)

            elif payment_status in ["OVERDUE", "DELETED"]:
                if order.status != "canceled":
                    order.status = "canceled"
                    order.event.current_attendees -= 1
                    order.save()
            
            return Response({"status": "Webhook processed successfully"}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            return Response({"error": "Internal server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)