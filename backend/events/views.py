import logging

from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Event
from .serializers import EventSerializer

logger = logging.getLogger(__name__)


class EventListView(ListAPIView):
    queryset = Event.objects.filter(is_active=True).order_by("date", "id")
    serializer_class = EventSerializer
    permission_classes = [AllowAny]


class EventDetailView(RetrieveAPIView):
    queryset = Event.objects.filter(is_active=True).order_by("-date", "-id")
    serializer_class = EventSerializer
    permission_classes = [AllowAny]

    def handle_exception(self, exc):
        from django.http import Http404

        if isinstance(exc, (Http404, Event.DoesNotExist)):
            return Response(
                {"Erro": "Evento não encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        logger.exception("Erro ao buscar evento")
        return Response(
            {"Erro interno do servidor": "Ocorreu um erro ao buscar o evento."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
