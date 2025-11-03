from django.urls import path
from .views import OrderView, CourtesyRedeemView, CancelOrderView, CheckOrderStatusView, CourtesyLinksView, CourtesyLinksDetailView, CourtesyMassSendView, TicketListView


urlpatterns = [
    # Get a list of all orders for a user or create a new order
    path('', OrderView.as_view(), name='order-list'),

    # Get order details
    path('<int:pk>/', OrderView.as_view(), name='order-detail'),

    # Courtesy Redeem courtesy/redeem/ POST
    path('courtesy/redeem/', CourtesyRedeemView.as_view(), name='order-courtesy-redeem'),
    
    # Cancel Order <int:pk>/cancel/ POST (Cancel on the Asaas as well as in the database)
    path('<str:pk>/cancel/', CancelOrderView.as_view(), name='order-cancel'),
    
    # Get a list of all tickets for a user using its orders
    path('tickets/', TicketListView.as_view(), name='ticket-list'),
    
    # Check Order Status <int:pk>/check-status/ GET (Check the status of an order)
    path('<str:pk>/check-status/', CheckOrderStatusView.as_view(), name='order-check-status'),
    
    # Courtesy Links courtesy/links/ GET List and POST Create (Admin Only)
    path('courtesy/links/', CourtesyLinksView.as_view(), name='courtesy-links-list'),
    
    # Courtesy Links courtesy/links/<int:code>/ GET Details (Admin Only)
    path('courtesy/links/<str:code>/', CourtesyLinksDetailView.as_view(), name='courtesy-links-detail'),
    
    # Courtesy Mass Send courtesy/mass-send/ POST (Admin Only)
    path('courtesy/mass-send/', CourtesyMassSendView.as_view(), name='courtesy-mass-send'),
]