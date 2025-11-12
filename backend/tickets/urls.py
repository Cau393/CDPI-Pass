from django.urls import path

from .views import VerifyTicketView

urlpatterns = [
    # Verify Ticket /api/tickets/verify-ticket/
    path(
        "verify-ticket/", VerifyTicketView.as_view(), name="verify-ticket"
    ),  # POST Admin only (validating qr codes in the events)
]
