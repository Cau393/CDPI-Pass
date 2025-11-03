from random import randint
from datetime import datetime, timedelta
from jwt import ExpiredSignatureError, InvalidTokenError, encode, decode
from django.conf import settings
import string
import random

import logging

logger = logging.getLogger(__name__)

def generate_verification_code():
        """
        Generate a 6-digit verification code.
        """
        return str(randint(100000, 999999))
    
def get_code_expiration():
    """
    Get the expiration time for the verification code.
    """
    return datetime.now() + timedelta(minutes=15)

def generate_reset_token(email: str) -> str:
    """
    Generate a JWT token for password reset that expires in 15 minutes.
    """
    secret_key = settings.SECRET_KEY
    payload = {
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=15),
        "iat": datetime.utcnow(),
        "type": "password_reset"
    }
    token = encode(payload, secret_key, algorithm="HS256")
    return token

def verify_reset_token(token: str):
    try:
        payload = decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "password_reset":
            raise InvalidTokenError("Invalid token type.")
        return payload["email"]
    except ExpiredSignatureError:
        raise ValueError("Token has expired.")
    except InvalidTokenError:
        raise ValueError("Invalid token.")

def generate_courtesy_code():
    """Generate an 8-character code starting with CDPI"""
    random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f"CDPI{random_part}"

def detect_delimiter(file_obj):
        """Detect the most likely delimiter in the CSV."""
        sample = file_obj.read(1024).decode("utf-8").split("\n")[0]
        comma_count = sample.count(",")
        semicolon_count = sample.count(";")
        tab_count = sample.count("\t")

        if semicolon_count > comma_count and semicolon_count > tab_count:
            return ";"
        elif tab_count > comma_count and tab_count > semicolon_count:
            return "\t"
        else:
            return ","

def fulfill_order(order):
    """
    Process order fulfillment after payment confirmation.
    Generates QR codes and sends ticket emails.
    """
    from tasks.email_tasks import send_ticket_email
    from tickets.models import Ticket
    from tickets.models import CourtesyAttendee
    
    try:
        # Get all tickets for this order
        tickets = Ticket.objects.filter(order=order).select_related('event', 'courtesy_link_id')
        
        if not tickets.exists():
            logger.warning(f"No tickets found for order {order.id}")
            return
        
        # Track events to update attendee counts (handle multiple events)
        events_to_update = {}
        failed_qr_count = 0
        
        # Update order status
        order.status = "paid"
        order.save(update_fields=["status"])

        # Generate QR codes for all tickets and send them via email
        for ticket in tickets:
            qr_url = process_ticket_qr(ticket)
            if not qr_url:
                logger.error(f"Failed to process QR for ticket {ticket.id}")
                failed_qr_count += 1
            
            # Track event for attendee count update
            event = ticket.event
            if event and hasattr(event, "current_attendees"):
                if event.id not in events_to_update:
                    events_to_update[event.id] = event

            if ticket.type_of_ticket == "courtesy":
                attendee = CourtesyAttendee.objects.get(courtesy_link_id=ticket.courtesy_link_id)
                email = attendee.email
            else:
                email = order.user.email
            
            send_ticket_email.delay(email, str(order.id))
        
        
        # Update attendee counts for all events
        for event in events_to_update.values():
            event.current_attendees = (event.current_attendees or 0) + order.quantity
            event.save(update_fields=["current_attendees"])
        
        if failed_qr_count > 0:
            logger.warning(f"⚠️ Order {order.id} fulfilled with {failed_qr_count} QR code failures")
        else:
            logger.info(f"✅ Order {order.id} fulfilled successfully")
        
    except Exception as e:
        logger.error(f"Error fulfilling order {order.id}: {e}", exc_info=True)
        raise

def process_ticket_qr(ticket):
    """
    Generate QR code and upload to S3 for a ticket.
    Updates ticket.qr_code_s3_url.
    
    Returns: S3 URL or None
    """
    from tasks.qr_code_task import generate_ticket_qr_code
    from tasks.s3_task import upload_qr_to_s3

    try:
        # 1. Generate QR code
        qr_bytes = generate_ticket_qr_code(ticket)
        
        # 2. Upload to S3
        filename = f"{ticket.id}-{ticket.event.id}"
        s3_url = upload_qr_to_s3(qr_bytes, filename)
        
        # 3. Update ticket
        if s3_url:
            ticket.qr_code_s3_url = s3_url
            ticket.save(update_fields=["qr_code_s3_url"])
            return s3_url
        
        logger.warning(f"Failed to upload QR code for ticket {ticket.id}")
        return None
        
    except Exception as e:
        logger.error(f"Error processing QR for ticket {ticket.id}: {e}")
        return None