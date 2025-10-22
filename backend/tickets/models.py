from uuid import uuid4
from django.db import models
from orders.models import Order
from events.models import Event
from django.utils import timezone

class Ticket(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid4,
        editable=False
    )
    order = models.ForeignKey(Order, related_name='tickets', on_delete=models.CASCADE, db_column='order_id')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, db_column='event_id')
    type = models.CharField(max_length=20, choices=[('first batch', 'First Batch'), ('second batch', 'Second Batch'), ('third batch', 'Third Batch'), ('coupon', 'Coupon'), ('courtesy', 'Courtesy')])
    qr_code_data = models.TextField()
    qr_code_s3_url = models.CharField(max_length=500, blank=True)
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'tickets'
    
    def __str__(self):
        return f"Ticket {self.id} - {self.event.title}"

# Preference for not having this table later in the database
class CourtesyAttendee(models.Model):
    """
    Represents an attendee registered as a courtesy guest for an event.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid4,
        editable=False
    )

    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=255)
    cpf = models.CharField(max_length=14)
    phone = models.CharField(max_length=20)
    birth_date = models.DateTimeField()
    address = models.TextField()
    partner_company = models.CharField(max_length=255, blank=True, null=True)
    event_title = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'courtesy_attendees'
        verbose_name = 'Courtesy Attendee'
        verbose_name_plural = 'Courtesy Attendees'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.email})"

    def save(self, *args, **kwargs):
        self.updated_at = timezone.now()
        super().save(*args, **kwargs)