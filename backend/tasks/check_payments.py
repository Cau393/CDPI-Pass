import logging

from django.core.management.base import BaseCommand
from django.db import transaction
from utils_apps import fulfill_order

from .asaas_payment_task import AsaasPaymentTask
from .models import Order

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Check all pending Asaas payments and update their status if confirmed or cancelled."

    def handle(self, *args, **options):
        service = AsaasPaymentTask()
        pending_orders = Order.objects.filter(
            status="pending", asaas_payment_id__isnull=False
        )

        logger.info(f"Checking {pending_orders.count()} pending Asaas payments...")

        for order in pending_orders:
            try:
                payment = service.get_payment(order.asaas_payment_id)
                payment_status = payment.get("status")

                if payment_status in ["CONFIRMED", "RECEIVED"]:
                    with transaction.atomic():
                        fulfill_order(order)

                elif payment_status in ["CANCELLED", "OVERDUE"]:
                    order.status = "cancelled"
                    order.save(update_fields=["status"])
                    logger.info(f"❌ Payment cancelled or overdue for order {order.id}")

            except Exception as e:
                logger.error(f"Error checking payment status for order {order.id}: {e}")

        logger.info("Finished checking pending payments.")
