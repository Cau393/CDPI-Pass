from django.urls import path
from .views import WebHookView

urlpatterns = [
    path('asaas/', WebHookView.as_view(), name='order-asaas-webhook'),
]