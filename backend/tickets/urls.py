from django.urls import path
from .views import TicketView

urlpatterns = [
    # Verify Ticket /api/tickets/verify-ticket/
    path('verify-ticket/', TicketView.as_view(), name='verify-ticket'), # POST Admin only (validating qr codes in the events)
]