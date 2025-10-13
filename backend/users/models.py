from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import BaseUserManager

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('Email must be provided')
        
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        
        return self.create_user(email, password, **extra_fields)

class User(AbstractUser):
    # Name is being handled in the AbstractUser super class.
    
    username = None
    """
    The username field is not used in this model.
    """
    email = models.EmailField(unique=True)
    
    cpf = models.CharField(max_length=14, unique=True)
    phone = models.CharField(max_length=20)
    birth_date = models.DateField()
    address = models.TextField()
    partner_company = models.CharField(max_length=255, blank=True)
    """
    The company name if the user is a partner.
    """
    date_joined = models.DateTimeField(auto_now_add=True)
    """
    The date and time when the user joined.
    """
    last_login = models.DateTimeField(null=True, blank=True)
    """
    The date and time of the user's last login.
    """
    is_active = models.BooleanField(default=False)
    """
    Whether the user account is active.
    """
    
    # Email verification (6 digits code)
    email_verification_code = models.CharField(max_length=6, blank=True)
    email_verification_code_expires_at = models.DateTimeField(null=True, blank=True)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = CustomUserManager()
    
    class Meta:
        db_table = 'users'
    
    def __str__(self):
        return self.email
