from django.db import models
from users.models import User
from events.models import Event


class CourtesyLink(models.Model):
    id = models.CharField(max_length=255, primary_key=True)
    code = models.CharField(max_length=100, unique=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, db_column='event_id')
    ticket_count = models.IntegerField(default=1)
    used_count = models.IntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, db_column='created_by')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    override_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    class Meta:
        db_table = 'courtesy_links'

class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
        ('courtesy', 'Courtesy'),
    ]
    
    """
    The unique identifier for the order.
    """
    id = models.CharField(max_length=255, primary_key=True)

    """
    The user who placed the order.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    
    """
    The event for which the order is placed.
    """
    event = models.ForeignKey(Event, on_delete=models.CASCADE, db_column='event_id')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    quantity = models.PositiveIntegerField(default=1)
    payment_method = models.CharField(max_length=50)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    asaas_payment_id = models.CharField(max_length=255, blank=True)
    courtesy_link = models.ForeignKey(
        CourtesyLink, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        db_column='courtesy_link_id'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'orders'

class EmailQueue(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
    ]
    id = models.CharField(max_length=255, primary_key=True)
    to = models.EmailField(max_length=255)
    subject = models.CharField(max_length=255)
    html = models.TextField()
    text = models.TextField()
    attachments = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'email_queue'