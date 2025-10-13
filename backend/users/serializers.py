import re
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User
from .utils import generate_verification_code, get_code_expiration

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the User model.
    """
    class Meta:
        model = User
        fields = [
        'id', 'first_name', 'last_name', 'email', 'cpf', 'phone', 'birth_date', 'address', 'partner_company'
        ]

class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField() 
    password = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True, min_length=6)
    cpf = serializers.RegexField(regex=r'^\d{3}\.\d{3}\.\d{3}-\d{2}$')
    phone = serializers.RegexField(regex=r'^\(\d{2}\)\s\d{4,5}-\d{4}$')
    birth_date = serializers.DateField()
    address = serializers.CharField(min_length=10)
    partner_company = serializers.CharField(required=False, allow_blank=True)

    def validate_name(self, value):
        """Split full name into first and last name"""
        parts = value.split(' ', 1)  # Split on first space
        if len(parts) < 2:
            raise serializers.ValidationError("Please provide both first and last name")
        return value
    
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
        # Remove fields that aren't in the model
        # Handle password
        # Generate verification code
        # Create user
        """
        # Remove fields that aren't in the model
        name = validated_data.pop('name')
        password = validated_data.pop('password')
        password_confirm = validated_data.pop('password_confirm')

        # Parse name
        first_name, last_name = name.split(' ', 1)
        
        user = User.objects.create_user(
        first_name=first_name,
        last_name=last_name,
        password=password,
        **validated_data
        )
        
        return user
    
    def validate_email(self, value):
        """
        Validate that the email is not already registered.
        """
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Este email já está cadastrado.")
        return value

    def validate_cpf(self, value):
        """
        Validate that the CPF is not already registered.
        """
        if User.objects.filter(cpf=value).exists():
            raise serializers.ValidationError("Este CPF já está cadastrado.")
        return value

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True, min_length=6, max_length=128, style={'input_type': 'password'})

class VerifyCodeSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    code = serializers.CharField(max_length=6, min_length=6, required=True)

    def validate_code(self, value):
        """
        Validate the verification code.
        """
        if not re.match(r'^\d{6}$', value):
            raise serializers.ValidationError("Código de verificação inválido. Deve conter 6 dígitos numéricos.")
        return value

class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone', 'birth_date', 'address', 'partner_company']
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'phone': {'required': False},
            'birth_date': {'required': False},
            'address': {'required': False},
            'partner_company': {'required': False},
        }

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