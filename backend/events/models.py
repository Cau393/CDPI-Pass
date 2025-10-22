from django.db import models

class Event(models.Model):
    id = models.CharField(max_length=255, primary_key=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    date = models.DateTimeField()
    location = models.CharField(max_length=255)
    batch = models.CharField(max_length=20, choices=[('first batch', 'First Batch'), ('second batch', 'Second Batch'), ('third batch', 'Third Batch')])
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image_url = models.CharField(max_length=500, blank=True)
    max_attendees = models.IntegerField(null=True, blank=True)
    current_attendees = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'events'
    
    def __str__(self):
        return self.title
