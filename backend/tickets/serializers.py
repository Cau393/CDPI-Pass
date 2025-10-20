from rest_framework import serializers
from .models import Ticket, CourtesyAttendee

class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = "__all__"

class CourtesyAttendeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtesyAttendee
        fields = "__all__"