import pytest
from uuid import uuid4
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone
from unittest.mock import patch

from events.models import Event
from orders.models import CourtesyLink, Order
from tickets.models import Ticket


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def test_event(db):
    """Simple event fixture"""
    return Event.objects.create(
        id=10,
        title="Rock Festival 2025",
        description="A classic event",
        date=timezone.now() + timezone.timedelta(days=5),
        location="São Paulo",
        batch="first batch",
        price=Decimal("100.00"),
        max_attendees=3,
    )


@pytest.fixture
def staff_user(db, django_user_model):
    """Authenticated user for order creation"""
    return django_user_model.objects.create_user(
        email="user1@example.com",
        password="UserPass123!",
        first_name="John",
        last_name="Doe",
        is_email_verified=True,
        cpf="701.237.101-38",
        birth_date="2000-01-01",
    )


@pytest.fixture
def courtesy_link(db, staff_user, test_event):
    """Valid courtesy link for promo tests"""
    return CourtesyLink.objects.create(
        code="PROMO123",
        event=test_event,
        ticket_count=2,
        used_count=0,
        created_by=staff_user,
        is_active=True,
        override_price=Decimal("50.00"),
    )


@pytest.mark.django_db
class TestOrderView:
    """Tests for POST /api/orders/ (OrderView)"""

    def test_missing_fields(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        url = reverse("order-list")

        response = api_client.post(url, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "eventId" in response.data["error"]

    def test_event_not_found(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        url = reverse("order-list")

        response = api_client.post(
            url,
            {"eventId": 999, "paymentMethod": "credit_card"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.data["error"] == "Evento não encontrado"

    def test_event_capacity_full(self, api_client, staff_user, test_event):
        """Fails when current tickets exceed event max"""
        test_event.max_attendees = 1
        test_event.save()
        # Create one ticket to fill capacity
        Order.objects.create(
            id=str(uuid4()),
            user=staff_user,
            amount=Decimal("100.00"),
            payment_method="credit_card",
        )
        Ticket.objects.create(
            id=uuid4(),
            name="Existing",
            cpf="000.000.000-00",
            order=Order.objects.first(),
            event=test_event,
            type_of_ticket="first batch",
            qr_code_data="USED",
        )

        api_client.force_authenticate(user=staff_user)
        url = reverse("order-list")
        data = {"eventId": test_event.id, "paymentMethod": "credit_card", "quantity": 1}

        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Evento lotado" in response.data["error"]

    def test_invalid_promo_code(self, api_client, staff_user, test_event):
        api_client.force_authenticate(user=staff_user)
        url = reverse("order-list")
        data = {
            "eventId": test_event.id,
            "paymentMethod": "credit_card",
            "code": "INVALID",
        }

        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "inválido" in response.data["error"]

    def test_courtesy_code_no_remaining_uses(self, api_client, staff_user, courtesy_link):
        courtesy_link.used_count = 2
        courtesy_link.save()

        url = reverse("order-list")
        api_client.force_authenticate(user=staff_user)
        data = {
            "eventId": courtesy_link.event.id,
            "paymentMethod": "credit_card",
            "code": courtesy_link.code,
        }

        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "esgotado" in response.data["error"]

    @patch('tasks.asaas_payment_task.AsaasPaymentTask.create_payment')
    def test_order_with_valid_promo_code(self, mock_create_payment, api_client, staff_user, courtesy_link):
        # Mock the payment response
        mock_create_payment.return_value = {
            'id': 'pay_123',
            'invoiceUrl': 'https://test.com',
            'status': 'PENDING'
        }
        
        api_client.force_authenticate(user=staff_user)
        url = reverse("order-list")
        data = {
            "eventId": courtesy_link.event.id,
            "paymentMethod": "credit_card",
            "code": courtesy_link.code,
            "quantity": 1,
        }
        
        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_normal_order_creation(self, api_client, staff_user, test_event):
        """Happy path: regular paid order"""
        api_client.force_authenticate(user=staff_user)
        url = reverse("order-list")
        data = {
            "eventId": test_event.id,
            "paymentMethod": "credit_card",
            "quantity": 1,
        }

        response = api_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "order" in response.data
        created_order = Order.objects.get(id=response.data["order"]["id"])
        assert created_order.amount > 0
        assert Ticket.objects.filter(order=created_order).count() == 1