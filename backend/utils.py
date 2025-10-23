from random import randint
from datetime import datetime, timedelta
from jwt import ExpiredSignatureError, InvalidTokenError, encode, decode
from django.conf import settings
import string
import random

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