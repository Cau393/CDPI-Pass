import random
from datetime import datetime, timedelta

def generate_verification_code():
        """
        Generate a 6-digit verification code.
        """
        return str(random.randint(100000, 999999))
    
def get_code_expiration():
    """
    Get the expiration time for the verification code.
    """
    return datetime.now() + timedelta(minutes=10)