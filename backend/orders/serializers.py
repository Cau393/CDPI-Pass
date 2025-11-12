from os import getenv

from dotenv import load_dotenv
from rest_framework import serializers

from events.models import Event
from events.serializers import EventSerializer

from .models import CourtesyLink, Order

load_dotenv()


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = ["user", "amount", "status"]


class CourtesyLinkSerializer(serializers.ModelSerializer):
    eventId = serializers.PrimaryKeyRelatedField(
        queryset=Event.objects.all(), source="event", write_only=True
    )

    event = EventSerializer(read_only=True)

    remainingTickets = serializers.SerializerMethodField()
    redeemUrl = serializers.SerializerMethodField()

    class Meta:
        model = CourtesyLink

        fields = [
            "id",
            "code",
            "eventId",
            "event",
            "ticket_count",
            "used_count",
            "created_by",
            "created_at",
            "updated_at",
            "override_price",
            "recipient_email",
            "recipient_name",
            "remainingTickets",
            "redeemUrl",
        ]

        read_only_fields = [
            "created_by",
            "code",
            "id",
            "created_at",
            "updated_at",
            "used_count",
        ]

    def get_remainingTickets(self, obj):
        return obj.ticket_count - obj.used_count

    def get_redeemUrl(self, obj):
        # FIX: Add logic to check for override_price
        # If a price is set, it's a promo link for the event page
        if obj.override_price is not None:
            return f"{getenv('BASE_URL')}/event/{obj.event.id}?promo={obj.code}"
        # Otherwise, it's a free courtesy ticket for the redeem page
        else:
            return f"{getenv('BASE_URL')}/cortesia?code={obj.code}"
