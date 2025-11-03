from rest_framework import serializers
from events.models import Event
from orders.models import CourtesyLink

class EventSerializer(serializers.ModelSerializer):
    eventId = serializers.PrimaryKeyRelatedField(
    queryset=Event.objects.all(),
    source='id',
    write_only=True
    )
    class Meta:
        model = Event
        fields = "__all__"
        read_only_fields = ['created_by']
