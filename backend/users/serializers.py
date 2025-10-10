from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User
from tasks.email import send_verification_email

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
        'id', 'name', 'email', 'cpf', 'phone', 'birth_date', 'address', 'partner_company'
        ]

class RegisterSerializer(serializers.ModelSerializer):
    # Password fields that are extra to validate and confirm the registration
    password = serializers.CharField(write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})
    password_confirm = serializers.CharField(write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})
    
    cpf = serializers.RegexField(
        regex=r'^\d{3}\.\d{3}\.\d{3}-\d{2}$',
        error_messages={
            'invalid': 'CPF inválido. O formato deve ser XXX.XXX.XXX-XX.'
        }
    )
    phone = serializers.RegexField(
        regex=r'^\(\d{2}\)\s\d{4,5}-\d{4}$',
        error_messages={
            'invalid': 'Telefone inválido. O formato deve ser (XX) XXXXX-XXXX ou (XX) XXXX-XXXX.'
        }
    )
    address = serializers.CharField(max_length=255, min_length=10)

    class Meta:
        model = User
        fields = [
        'email', 'password', 'password_confirm', 'name', 'cpf', 'phone', 'birth_date', 'address', 'partner_company'
        ]
    
    def validate(self, attrs):
        """
        Object-level validation for confirming that both passwords match.
        """
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')
        if password != password_confirm:
            raise serializers.ValidationError("As senhas não coincidem.")
        return attrs
    
    def validate_password(self, value):
        """
        Validate password using Django's built-in validators.
        """
        validate_password(value)
        return value
    
    def create(self, validated_data):
        """
        Remove password_confirm from validated_data and create the user.
        """
        validated_data.pop('password_confirm', None)
        password = validated_data.pop('password')

        user = User(**validated_data)
        user.set_password(password)
        
        user.email_verification_code = self.generate_verification_code()
        user.email_verification_code_expires_at = self.get_code_expiration()

        user.save()

        send_verification_email.delay(user.email, user.email_verification_code)

        return user
    
    # ----- Auxiliary functions -----
    def generate_verification_code(self):
        """
        Generate a random 6-digit verification code.
        """
        from random import randint
        return str(randint(100000, 999999))
    
    def get_code_expiration(self):
        """
        Get the expiration time for the verification code.
        """
        from datetime import datetime, timedelta
        return datetime.now() + timedelta(minutes=15)

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})

    def validate(self, attrs):
        """
        Validate email and password.
        """
        email = attrs.get('email')
        password = attrs.get('password')

        if not email or not password:
            raise serializers.ValidationError("Email e senha são obrigatórios.")

        return attrs

class VerifyCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)

class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['name', 'phone', 'birth_date', 'address', 'partner_company', 'password']
    
    def validate_password(self, value):
        """
        Validate password using Django's built-in validators.
        """
        validate_password(value)
        return value

class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})
    new_password = serializers.CharField(write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})
    new_password_confirm = serializers.CharField(write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})

    def validate(self, attrs):
        """
        Object-level validation for confirming that both new passwords match.
        """
        new_password = attrs.get('new_password')
        new_password_confirm = attrs.get('new_password_confirm')
        if new_password != new_password_confirm:
            raise serializers.ValidationError("As novas senhas não coincidem.")
        return attrs
    
    def validate_new_password(self, value):
        """
        Validate new_password using Django's built-in validators.
        """
        validate_password(value)
        return value