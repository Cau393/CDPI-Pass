from celery import shared_task
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, From
import os

@shared_task
def send_verification_email(email: str, verification_code: str):
    sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    from_email = From(os.environ.get('DEFAULT_FROM_EMAIL'), 'CDPI Pass')
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