from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/events/', include('events.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/webhooks/', include('orders.webhook_urls')), # Webhooks for Asaas
    path('api/tickets/', include('tickets.urls')),
]
