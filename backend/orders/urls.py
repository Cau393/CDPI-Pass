from django.urls import path
from .views import OrderView, CourtesyRedeemView

urlpatterns = [
    path('', OrderView.as_view(), name='order-list'), # List all orders for a user
    path('<int:pk>/', OrderView.as_view(), name='order-detail'), # Get order details
    # Courtesy Redeem courtesy/redeem/ POST
    path('courtesy/redeem/', CourtesyRedeemView.as_view(), name='order-courtesy-redeem'),
    # Cancel Order <int:pk>/cancel/ POST (Cancel on the Asaas as well as in the database)
    path('<int:pk>/cancel/', CancelOrderView.as_view(), name='order-cancel'),
    # Check Order Status <int:pk>/check-status/ GET (Check the status of an order)
    path('<int:pk>/check-status/', CheckOrderStatusView.as_view(), name='order-check-status'),
    # Courtesy Links courtesy/links/ GET List and POST Create (Admin Only)
    path('courtesy/links/', CourtesyLinksView.as_view(), name='courtesy-links-list'),
    # Courtesy Links courtesy/links/<int:pk> GET Details (Admin Only)
    path('courtesy/links/<int:pk>/', CourtesyLinksDetailView.as_view(), name='courtesy-links-detail'),
    # Courtesy Mass Send courtesy/mass-send/ POST (Admin Only)
]