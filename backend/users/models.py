from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    
    cpf = models.CharField(max_length=14, unique=True)
    phone = models.CharField(max_length=20)
    birth_date = models.DateField()
    address = models.TextField()
    partner_company = models.CharField(max_length=255, blank=True)
    
    # Email verification (6 digits code)
    email_verification_code = models.CharField(max_length=6, blank=True)
    email_verification_code_expires_at = models.DateTimeField(null=True, blank=True)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    class Meta:
        db_table = 'users'
    
    def __str__(self):
        return self.email
