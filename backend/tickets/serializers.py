from rest_framework import serializers

from events.serializers import EventSerializer
from orders.serializers import OrderSerializer

from .models import CourtesyAttendee, Ticket


class TicketSerializer(serializers.ModelSerializer):
    # Tell the serializer to use the EventSerializer
    # to render the 'event' foreign key
    event = EventSerializer(read_only=True)

    # Tell the serializer to use the OrderSerializer
    # to render the 'order' foreign key
    order = OrderSerializer(read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id",
            "name",
            "cpf",
            "order",
            "event",
            "type_of_ticket",
            "qr_code_data",
            "qr_code_s3_url",
            "is_used",
            "used_at",
            "created_at",
            "courtesy_link_id",
        ]


class CourtesyAttendeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtesyAttendee
        fields = "__all__"
