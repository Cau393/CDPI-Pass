import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone

from events.models import Event


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def active_event(db):
    """An active event to appear in the list."""
    return Event.objects.create(
        id=1,
        title="Active Festival",
        description="Main summer event",
        date=timezone.now() + timezone.timedelta(days=10),
        location="São Paulo",
        batch="first batch",
        price=100.00,
        is_active=True,
    )


@pytest.fixture
def inactive_event(db):
    """An inactive event that must NOT appear."""
    return Event.objects.create(
        id=2,
        title="Old Event",
        description="Outdated event",
        date=timezone.now() - timezone.timedelta(days=5),
        location="Rio de Janeiro",
        batch="first batch",
        price=50.00,
        is_active=False,
    )


@pytest.mark.django_db
class TestEventListView:
    """Tests for EventListView (/api/events/)"""

    def test_returns_only_active_events(
        self, api_client, active_event, inactive_event
    ):
        url = reverse("event-list")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        titles = [ev["title"] for ev in response.data["results"]]
        assert active_event.title in titles
        assert inactive_event.title not in titles

    def test_ordering_by_date_and_id(self, api_client, db):
        e1 = Event.objects.create(
            id=10,
            title="Earlier",
            description="Test A",
            date=timezone.now() + timezone.timedelta(days=1),
            location="A",
            batch="first batch",
            price=10,
            is_active=True,
        )
        e2 = Event.objects.create(
            id=11,
            title="Later",
            description="Test B",
            date=timezone.now() + timezone.timedelta(days=2),
            location="B",
            batch="first batch",
            price=20,
            is_active=True,
        )
        url = reverse("event-list")
        response = api_client.get(url)
        titles = [r["title"] for r in response.data["results"]]
        assert titles == ["Earlier", "Later"]


@pytest.mark.django_db
class TestEventDetailView:
    """Tests for EventDetailView (/api/events/<id>/)"""

    def test_retrieve_existing_event(self, api_client, active_event):
        url = reverse("event-detail", kwargs={"pk": active_event.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == active_event.title
        assert response.data["location"] == "São Paulo"

    def test_event_not_found_returns_404(self, api_client):
        url = reverse("event-detail", kwargs={"pk": 999})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Evento não encontrado" in str(response.data)

    def test_internal_server_error_handled(self, api_client, monkeypatch, active_event):
        from rest_framework import generics

        def raise_exception(*args, **kwargs):
            raise Exception("Unexpected")

        # Patch the actual function used inside RetrieveAPIView
        monkeypatch.setattr(generics, "get_object_or_404", raise_exception)

        url = reverse("event-detail", kwargs={"pk": active_event.id})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "Erro interno do servidor" in str(response.data)
