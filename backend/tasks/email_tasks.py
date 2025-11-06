from celery import shared_task
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, From, To
from datetime import datetime, timedelta
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition

import logging
logger = logging.getLogger(__name__)

from orders.models import Order

from os import getenv
from dotenv import load_dotenv
load_dotenv()

@shared_task
def send_verification_email(email: str, verification_code: str):
    sg = SendGridAPIClient(getenv('SENDGRID_API_KEY'))
    from_email = From(getenv('DEFAULT_FROM_EMAIL'), 'CDPI Pass')
    subject = 'Seu Código de Verificação - CDPI Pass'
    plain_text_content = f'Seu código de verificação é: {verification_code}'
    html_content = f'''
                        <h1>Confirme seu email - CDPI Pass</h1>
                        <p>Seu código de verificação é:</p>
                        <h2><b>{verification_code}</b></h2>
                        <p>Este código expira em 15 minutos.</p>
                    '''
    to_email = To(email)
    mail = Mail(from_email, to_email, subject, plain_text_content, html_content)
    response = sg.send(mail)
    return response


@shared_task
def send_password_reset_email(email: str):
    """
    Send a password reset email to the user.
    """
    from helper_functions import generate_reset_token
    
    reset_token = generate_reset_token(email)

    sg = SendGridAPIClient(getenv('SENDGRID_API_KEY'))
    reset_link = f"{getenv('BASE_URL')}/reset-password?token={reset_token}"
    from_email = From(getenv('DEFAULT_FROM_EMAIL'), 'CDPI Pass')
    subject = 'Redefinição de Senha - CDPI Pass'
    plain_text_content = f'Clique no link abaixo para redefinir sua senha: {reset_link}'
    html_content = f'''
                        <h1>Redefinição de Senha - CDPI Pass</h1>
                        <p>Clique no link abaixo para redefinir sua senha:</p>
                        <a href="{reset_link}">{reset_link}</a>
                        <p>Este link expira em 15 minutos.</p>
                    '''
    to_email = To(email)
    mail = Mail(from_email, to_email, subject, plain_text_content, html_content)
    response = sg.send(mail)
    return response.status_code

@shared_task
def send_ticket_email(recipient_email, order_id):
    """
    Sends ticket email(s) for a given order ID after payment confirmation.
    Fetches required data efficiently from the database.
    Sends one email per ticket associated with the order.
    """
    logger.info(f"Attempting to send ticket email(s) for order_id: {order_id} to {recipient_email}")
    try:
        order = Order.objects.select_related(
                    'user', 
                    'courtesy_link_id__event'
                ).prefetch_related(
                    'tickets__event'
                ).get(id=order_id)

    except Order.DoesNotExist:
        logger.error(f"Order with ID {order_id} not found for sending ticket email.")
        return {"error": "Order not found"}
    except Exception as e:
        logger.error(f"Error fetching order {order_id}: {e}", exc_info=True)
        return {"error": f"Error fetching order: {e}"}

    # Access related objects fetched efficiently
    user = order.user
    tickets = order.tickets.all()

    if not tickets:
        logger.warning(f"No tickets found for order {order_id}. Cannot send email.")
        return {"warning": "No tickets found for this order"}

    # --- Send one email per ticket ---
    email_sent_count = 0
    for ticket in tickets:
        try:
            # Use the ticket's event (in case there are multiple events)
            ticket_event = ticket.event
            event_dt = ticket_event.date
            formatted_event_date = event_dt.strftime("%A, %d de %B de %Y às %H:%M")

            # Ensure ticket has necessary data
            qr_code_url = ticket.qr_code_s3_url
            if not qr_code_url:
                 logger.warning(f"QR code S3 URL missing for ticket {ticket.id} in order {order.id}. Email content might be incomplete.")

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Seu ingresso - CDPI Pass</title>
              <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #0F4C75; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; background: #f9f9f9; }}
                .ticket-info {{ background: white; border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; text-align: left;}}
                .qr-code {{ margin: 20px 0; padding: 20px; background: white; border: 1px solid #ddd; display: inline-block; text-align: center; }}
                .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎫 Seu Ingresso</h1>
                  <h2>CDPI Pass</h2>
                </div>
                <div class="content">
                  <p>Olá, <strong>{ticket.name or user.first_name or 'Participante'}</strong>!</p>
                  <p>Seu pagamento foi confirmado! Aqui está seu ingresso para o evento:</p>

                  <div class="ticket-info">
                    <h3>{ticket_event.title}</h3>
                    <p><strong>📅 Data:</strong> {formatted_event_date}</p>
                    <p><strong>📍 Local:</strong> {ticket_event.location}</p>
                    <p><strong>👤 Portador:</strong> {ticket.name}</p>
                    <p><strong>🎟️ Pedido:</strong> #{order.id}</p>
                    <p><strong>🏷️ Ingresso ID:</strong> {ticket.id}</p>
                  </div>

                  <div class="qr-code" style="text-align: center;">
                      <p><strong>QR Code do Ingresso:</strong></p>
                      {f'<img src="{qr_code_url}" alt="QR Code do Ingresso" style="max-width: 256px; height: auto; display: block; margin: 10px auto;">' if qr_code_url else '<p style="color: red;">QR Code não disponível.</p>'}
                      <p style="font-size: 12px; color: #666;">
                        Apresente este QR Code na entrada do evento
                      </p>
                  </div>

                  <div style="background: #BBE1FA; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h4>📋 Instruções Importantes:</h4>
                    <ul style="text-align: left;">
                      <li>Chegue com 30 minutos de antecedência</li>
                      <li>O QR Code pode ser apresentado impresso ou no celular</li>
                      <li>Em caso de dúvidas, entre em contato conosco</li>
                    </ul>
                  </div>
                </div>
                <div class="footer">
                  <p>CDPI Pass</p>
                  <p>relacionamento@cdpipharma.com.br | +55 (62) 99860-6833</p>
                </div>
              </div>
            </body>
            </html>
            """

            text_content = f"""
            CDPI Pass - Seu Ingresso

            Olá, {ticket.name or user.first_name or 'Participante'}!

            Seu pagamento foi confirmado! Detalhes do evento:

            Evento: {ticket_event.title}
            Data: {formatted_event_date}
            Local: {ticket_event.location}
            Pedido: #{order.id}
            Ingresso ID: {ticket.id}

            Importante: Seu QR Code está anexado ou incluído neste email (se disponível).
            Apresente-o na entrada do evento.
            """

            # Build SendGrid message
            message = Mail(
                from_email=From(getenv('DEFAULT_FROM_EMAIL'), 'CDPI Pass'),
                to_emails=recipient_email,
                subject=f"Seu ingresso para {ticket_event.title} - CDPI Pass (Ingresso {ticket.id})",
                html_content=html_content,
                plain_text_content=text_content,
            )

            # Send via SendGrid
            sg = SendGridAPIClient(getenv('SENDGRID_API_KEY'))
            response = sg.send(message)
            logger.info(f"SendGrid response for ticket {ticket.id} (Order {order.id}) to {recipient_email}: Status {response.status_code}")
            email_sent_count += 1

        except Exception as e:
            logger.error(f"🚨 Error sending specific ticket email for ticket {ticket.id} (Order {order.id}) to {recipient_email}: {e}", exc_info=True)
            raise self.retry(exc=e, countdown=60)

    if email_sent_count == len(tickets):
        logger.info(f"✅ Successfully sent all {email_sent_count} ticket email(s) for order {order_id} to {recipient_email}")
        return {"status": "success", "sent_count": email_sent_count}
    else:
         logger.warning(f"⚠️ Sent {email_sent_count} out of {len(tickets)} ticket email(s) for order {order_id} to {recipient_email}")
         return {"status": "partial_failure", "sent_count": email_sent_count, "total_tickets": len(tickets)}

@shared_task
def send_mass_email(email, name, event_name, courtesy_code, event_date, attachments=None):
    """Asynchronous task to send courtesy email using SendGrid."""
    try:
        base_url = getenv("BASE_URL", "https://cdpipharma.com.br")
        redeem_url = f"{base_url}/cortesia?code={courtesy_code}"
        subject = f"Sua cortesia para o evento {event_name}"

        # Format dates
        event_dt = datetime.fromisoformat(event_date)
        formatted_event_date = event_dt.strftime("%A, %d de %B de %Y")

        redeem_by_date = event_dt - timedelta(days=6)
        formatted_redeem_by_date = redeem_by_date.strftime("%d/%m/%Y")

        # Build HTML
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>{subject}</title>
          <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: auto; padding: 20px; }}
            .header {{ background: #0F4C75; color: white; padding: 20px; text-align: center; }}
            .content {{ background: #f9f9f9; padding: 20px; text-align: center; }}
            .cta-button {{
              background-color: #3282B8;
              color: white;
              padding: 15px 25px;
              text-decoration: none;
              border-radius: 5px;
              display: inline-block;
              margin-top: 20px;
            }}
            .important {{ background: #BBE1FA; padding: 15px; border-radius: 5px; text-align: left; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎁 Você Recebeu uma Cortesia!</h1>
              <h2>CDPI Pass</h2>
            </div>
            <div class="content">
              <p>Olá <strong>{name}</strong>!</p>
              <p>Você recebeu uma cortesia para o <strong>{event_name}</strong> na data <strong>{formatted_event_date}</strong>!</p>
              <p style="font-style: italic;">Um evento que amplia horizontes e conecta quem faz a diferença na indústria.</p>
              <a href="{redeem_url}" class="cta-button">Resgatar Ingresso Agora</a>
              <div class="important">
                <p>Ou utilize o código: <strong>{courtesy_code}</strong></p>
                <p>Resgate até <strong>{formatted_redeem_by_date}</strong> para garantir sua vaga.</p>
              </div>
            </div>
            <footer style="text-align:center;font-size:12px;color:#666;">
              <p>Equipe CDPI Pass</p>
              <p>relacionamento@cdpipharma.com.br | +55 (62) 99860-6833</p>
            </footer>
          </div>
        </body>
        </html>
        """

        text_content = f"""
        Olá {name}!

        Você recebeu uma cortesia para o {event_name} na data {formatted_event_date}!

        Para resgatar seu ingresso, acesse: {redeem_url}

        ⚠️ Resgate até {formatted_redeem_by_date} para garantir sua vaga.

        Atenciosamente,
        Equipe CDPI Pass
        """

        # Create email
        message = Mail(
            from_email=From(getenv("DEFAULT_FROM_EMAIL"), 'CDPI Pass'),
            to_emails=To(email),
            subject=subject,
            html_content=html_content,
            plain_text_content=text_content,
        )

        # Attachments if any
        if attachments:
            for file in attachments:
                message.attachment = Attachment(
                    FileContent(file["content"]),
                    FileName(file["filename"]),
                    FileType(file["type"]),
                    Disposition("attachment"),
                )

        sg = SendGridAPIClient(getenv("SENDGRID_API_KEY"))
        sg.send(message)
        print(f"📨 SendGrid: courtesy email sent to {email}")
        return True

    except Exception as e:
        print(f"🚨 SendGrid email error for {email}: {e}")
        return False