from django.core.management.base import BaseCommand
from .models import Order
from .asaas_payment_task import AsaasPaymentTask
from django.db import transaction
from tasks.email_tasks import send_ticket_email

import logging
logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Check all pending Asaas payments and update their status if confirmed or cancelled."

    def handle(self, *args, **options):
        service = AsaasPaymentTask()
        pending_orders = Order.objects.filter(status="pending", asaas_payment_id__isnull=False)

        logger.info(f"Checking {pending_orders.count()} pending Asaas payments...")

        for order in pending_orders:
            try:
                payment = service.get_payment(order.asaas_payment_id)
                payment_status = payment.get("status")

                if payment_status in ["CONFIRMED", "RECEIVED"]:
                    with transaction.atomic():
                        order.status = "paid"
                        order.event.current_attendees += 1
                        order.save(update_fields=["status"])
                        logger.info(f"✅ Payment confirmed for order {order.id}")

                        event = order.event
                        event.current_attendees = getattr(event, "current_attendees", 0) + 1
                        event.save(update_fields=["current_attendees"])

                        send_ticket_email.delay(order.id)

                elif payment_status in ["CANCELLED", "OVERDUE"]:
                    order.status = "cancelled"
                    order.save(update_fields=["status"])
                    logger.info(f"❌ Payment cancelled or overdue for order {order.id}")

            except Exception as e:
                logger.error(f"Error checking payment status for order {order.id}: {e}")

        logger.info("Finished checking pending payments.")
