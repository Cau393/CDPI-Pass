import io
import qrcode
from celery import shared_task
from tickets.models import Ticket


@shared_task
def generate_ticket_qr_code(ticket):
    """
    Generate QR codes for a single ticket, upload to S3, and send emails.
    """

    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(ticket.qr_code_data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="#0F4C75", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        return buffer.getvalue()

    except Exception as e:
        print(f"🚨 Error processing ticket #{ticket.id}: {e}")

