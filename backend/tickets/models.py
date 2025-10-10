from django.db import models

class Ticket(models.Model):
    id = models.CharField(max_length=255, primary_key=True)
    order = models.ForeignKey(Order, related_name='tickets', on_delete=models.CASCADE, db_column='order_id')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, db_column='event_id')
    qr_code_data = models.TextField()
    qr_code_s3_url = models.CharField(max_length=500, blank=True)
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'tickets'
    
    def __str__(self):
        return f"Ticket {self.id} - {self.event.title}"
