from celery import shared_task

from utils import generate_reset_token

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, From
from tickets.models import Ticket


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
    to_email = email
    mail = Mail(from_email, subject, to_email, plain_text_content, html_content)
    response = sg.send(mail)
    return response


@shared_task
def send_password_reset_email(email: str):
    """
    Send a password reset email to the user.
    """
    reset_token = generate_reset_token()

    sg = SendGridAPIClient(getenv('SENDGRID_API_KEY'))
    reset_link = f"{getenv('BASE_URL')}/api/users/auth/reset-password?token={reset_token}"
    from_email = From(getenv('DEFAULT_FROM_EMAIL'), 'CDPI Pass')
    subject = 'Redefinição de Senha - CDPI Pass'
    plain_text_content = f'Clique no link abaixo para redefinir sua senha: {reset_link}'
    html_content = f'''
                        <h1>Redefinição de Senha - CDPI Pass</h1>
                        <p>Clique no link abaixo para redefinir sua senha:</p>
                        <a href="{reset_link}">{reset_link}</a>
                        <p>Este link expira em 15 minutos.</p>
                    '''
    to_email = email
    mail = Mail(from_email, subject, to_email, plain_text_content, html_content)
    response = sg.send(mail)
    return response

@shared_task
def send_ticket_email(email: str, ticket: Ticket):
    """
    Send a ticket email to the user.
    """