from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import Ticket
from .serializers import TicketSerializer
from django.utils import timezone
from django.db import transaction
import logging

logger = logging.getLogger(__name__)

class VerifyTicketView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, format=None):
        # Check if user is staff
        if not request.user.is_staff:
            return Response({"error": "Not authorized"}, status=status.HTTP_403_FORBIDDEN)

        qr_code = request.data.get("qr_code_data")
        if not qr_code:
            return Response({"error": "QR Code data is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                ticket = Ticket.objects.get(qr_code_data=qr_code)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)
        if ticket.is_used:
            return Response({"error": "Ticket already verified"}, status=status.HTTP_400_BAD_REQUEST)
        ticket.is_used = True
        ticket.used_at = timezone.now()
        ticket.save()
        logger.info(f"Ticket {ticket.id} verified by {request.user} at {timezone.now()}")
        return Response(
            { 
                "success": True, 
                "message": "Ingresso verificado com sucesso",
                "userName": "Participante Confirmado", # alter this when the Pouso Alegre event ends
                "eventTitle": ticket.event.title or "Evento"
            },
            status=status.HTTP_201_CREATED)