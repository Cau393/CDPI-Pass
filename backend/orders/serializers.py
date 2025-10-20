from rest_framework import serializers
from .models import Order, EmailQueue, CourtesyLink

class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = ["user", "amount", "status"]

class EmailQueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailQueue
        fields = "__all__"

class CourtesyLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtesyLink
        fields = "__all__"
