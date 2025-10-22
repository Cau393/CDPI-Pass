from django.urls import path
from .views import OrderView

urlpatterns = [
    path('', OrderView.as_view(), name='order-list'),
    path('<int:pk>/', OrderView.as_view(), name='order'),
    # Cancel Order <int:pk>/cancel/ POST (Cancel on the Asaas as well as in the database)
    # Check Order Status <int:pk>/check-status/ GET
    # Courtesy Redeem courtesy/redeem/ POST
    # Courtesy Links courtesy/links/ GET List (Admin Only)
    # Courtesy Links courtesy/links/<int:pk> GET Details (Admin Only)
    # Courtesy Mass Send courtesy/mass-send/ POST (Admin Only)
]