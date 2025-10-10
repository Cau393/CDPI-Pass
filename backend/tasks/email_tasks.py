from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, From
import os


def send_verification_email(email: str, verification_code: str):
    sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    from_email = From(os.environ.get('DEFAULT_FROM_EMAIL'), 'CDPI Pass')
    subject = 'Email Verification Code'
    plain_text_content = f'Your verification code is: {verification_code}'
    html_content = f'<strong>Your verification code is: {verification_code}</strong>'
    to_email = email
    mail = Mail(from_email, subject, to_email, plain_text_content, html_content)
    response = sg.send(mail)
    return response