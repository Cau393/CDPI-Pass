import pytest
import datetime
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone

from tickets.models import Ticket
from events.models import Event
from users.models import User
from orders.models import Order

pytestmark = pytest.mark.django_db

@pytest.fixture
def api_client():
    """Fixture for DRF API client"""
    return APIClient()


@pytest.fixture
def staff_user(db):
    """Create and return a staff user"""
    return User.objects.create_user(
        email="staff@example.com",
        password="StaffPass123!",
        first_name="Staff",
        last_name="Member",
        is_staff=True,
        is_email_verified=True,
        cpf="123.456.789-00",
        phone="+5511999999999",
        birth_date=datetime.date(1990, 1, 1),
        address="Rua das Flores, 123",
        partner_company="Company XYZ",
    )


@pytest.fixture
def regular_user(db):
    """Create and return a regular (non-staff) user"""
    return User.objects.create_user(
        email="user@example.com",
        password="UserPass123!",
        first_name="Normal",
        last_name="User",
        is_staff=False,
        is_email_verified=True,
        cpf="987.654.321-00",
        phone="+5511888888888",
        birth_date=datetime.date(1995, 5, 15),
        address="Avenida Central, 456",
    )


@pytest.fixture
def test_event(db):
    """Create a simple event instance"""
    return Event.objects.create(
        id="123456",
        title="Rock Festival 2025",
        description="Awesome music event",
        location="São Paulo",
        date=timezone.now() + datetime.timedelta(days=10),
        price=100.00,
    )


@pytest.fixture
def test_order(db, regular_user):
    """Create a mock order (simplified)"""
    return Order.objects.create(
        id="123456",
        user=regular_user,
        amount=100.00,
    )


@pytest.fixture
def test_ticket(db, test_event, test_order):
    """Create a valid ticket for testing"""

    event = test_event
    order = test_order

    # both must be saved (have .pk) before using in Ticket
    assert event.pk, "Event fixture must be saved to DB"
    assert order.pk, "Order fixture must be saved to DB"

    return Ticket.objects.create(
        name="John Doe",
        cpf="123.456.789-00",
        order=test_order,
        event=test_event,
        type_of_ticket="first batch",
        qr_code_data="QR123ABC",
        qr_code_s3_url="https://example.com/qr.png",
        is_used=False,
    )


@pytest.mark.django_db
class TestVerifyTicketView:
    """Test cases for VerifyTicketView"""

    def test_unauthorized_user(self, api_client, regular_user, test_ticket):
        """Non-staff user should not be able to verify tickets"""
        url = reverse("verify-ticket")
        api_client.force_authenticate(user=regular_user)
        response = api_client.post(url, {"qr_code_data": test_ticket.qr_code_data}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["error"] == "Not authorized"

    def test_missing_qr_code(self, api_client, staff_user):
        """QR code missing from request"""
        url = reverse("verify-ticket")
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(url, {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "QR Code data is required" in response.data["error"]

    def test_ticket_not_found(self, api_client, staff_user):
        """When QR code does not exist in database"""
        url = reverse("verify-ticket")
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(url, {"qr_code_data": "NON_EXISTENT_CODE"}, format="json")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data["error"] == "Ticket not found"

    def test_ticket_already_used(self, api_client, staff_user, test_ticket):
        """Ticket already verified"""
        test_ticket.is_used = True
        test_ticket.used_at = timezone.now()
        test_ticket.save()

        url = reverse("verify-ticket")
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(url, {"qr_code_data": test_ticket.qr_code_data}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Ticket already verified"

    def test_verify_success(self, api_client, staff_user, test_ticket):
        """Successful ticket verification"""
        url = reverse("verify-ticket")
        api_client.force_authenticate(user=staff_user)
        response = api_client.post(url, {"qr_code_data": test_ticket.qr_code_data}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["success"] is True
        assert "Ingresso verificado com sucesso" in response.data["message"]
        assert response.data["userName"] == test_ticket.name
        assert response.data["eventTitle"] == test_ticket.event.title

        # Reload and check DB changes
        test_ticket.refresh_from_db()
        assert test_ticket.is_used is True
        assert test_ticket.used_at is not None