from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction
from django.utils import timezone

from .models import User
from .serializers import RegisterSerializer, LoginSerializer, VerifyCodeSerializer, UserSerializer, ProfileUpdateSerializer
from utils import generate_verification_code, get_code_expiration, verify_reset_token
from tasks.email_tasks import send_verification_email, send_password_reset_email

import logging
logger = logging.getLogger(__name__)

class RegisterView(APIView):
    permission_classes = [AllowAny]
    """
    View para registro de usuário.

    /register/
    """
    def post(self, request, format=None):
        try:
            serializer = RegisterSerializer(data=request.data)
            if serializer.is_valid():
                
                # Create user and send verification email
                with transaction.atomic():
                    user = serializer.save()
                    verification_code = generate_verification_code()

                    user.email_verification_code = make_password(verification_code)
                    user.email_verification_code_expires_at = get_code_expiration()
                    user.save()

                transaction.on_commit(lambda: send_verification_email(user.email, verification_code))

                return Response(
                    {
                        'message': 'Registro bem-sucedido. Verifique seu email para verificar sua conta.',
                        'email': user.email,
                    }, 
                    status=status.HTTP_201_CREATED
                    )
        
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Registration error: {str(e)}")

            # Return a generic error message to the user
            return Response(
                {
                    'Erro interno do servidor': 'Ocorreu um erro ao registrar o usuário. Por favor, tente novamente.'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class VerifyCodeView(APIView):
    permission_classes = [AllowAny]
    """
    View para verificação de código de verificação.

    /verify-code/
    """
    def post(self, request, format=None):
        try:
            serializer = VerifyCodeSerializer(data=request.data)
            if serializer.is_valid():
                email = serializer.validated_data['email']
                verification_code = serializer.validated_data['code']

                try:
                    user = User.objects.get(email=email)
                except User.DoesNotExist:
                    return Response({'Erro': 'Email não registrado.'}, status=status.HTTP_404_NOT_FOUND)

                except User.MultipleObjectsReturned:
                    return Response({'Erro': 'Mais de um usuário com este email foi encontrado.'}, status=status.HTTP_400_BAD_REQUEST)

                if not check_password(verification_code, user.email_verification_code):
                    return Response({'Erro': 'Código de verificação inválido.'}, status=status.HTTP_400_BAD_REQUEST)

                if user.email_verification_code_expires_at < timezone.now():
                    return Response({'Erro': 'Código de verificação expirado. Por favor, solicite um novo.'}, status=status.HTTP_400_BAD_REQUEST)

                # Mark the user as email verified and clear the verification code fields
                user.is_email_verified = True
                user.email_verification_code = ''
                user.email_verification_code_expires_at = None
                user.save()

                # Generate JWT tokens
                refresh = RefreshToken.for_user(user)
                access_token = str(refresh.access_token)
        
                return Response(
                    {
                        'token': access_token,
                        'refresh': str(refresh),
                        'user': UserSerializer(user).data,
                    }
                    , status=status.HTTP_200_OK
                    )
        
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Code verification error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao verificar o código. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ResendCodeView(APIView):
    permission_classes = [AllowAny]
    """
    View para reenvio de código de verificação.

    /resend-code/
    """
    def post(self, request, format=None):
        try:
            email = request.data.get('email')
            if not email:
                return Response({'Erro': 'Email é necessário.'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                return Response({'Erro': 'Email não registrado.'}, status=status.HTTP_404_NOT_FOUND)
            
            if user.is_email_verified:
                return Response({'Erro': 'Email já verificado.'}, status=status.HTTP_400_BAD_REQUEST)
            
            if user.email_verification_code_expires_at > timezone.now():
                return Response({'Erro': 'Código de verificação ainda válido. Aguarde até que expire.'}, status=status.HTTP_400_BAD_REQUEST)
            
            new_verification_code = generate_verification_code()
            with transaction.atomic():
                user.email_verification_code = make_password(new_verification_code)
                user.email_verification_code_expires_at = get_code_expiration()
                user.save()
            
            # Send the new verification code to the user's email
            transaction.on_commit(lambda: send_verification_email(user.email, new_verification_code))
            
            return Response({'message': 'Novo código de verificação enviado para o email.'}, status=status.HTTP_200_OK)
        
        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Resend code error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao reenviar o código. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class LoginView(APIView):
    permission_classes = [AllowAny]
    """
    View para login de usuário.

    /login/
    """
    def post(self, request, format=None):
        try:
            serializer = LoginSerializer(data=request.data)
            if serializer.is_valid():
                email = serializer.validated_data['email']
                password = serializer.validated_data['password']

                try:
                    user = User.objects.get(email=email)
                except User.DoesNotExist:
                    return Response({'Erro': 'Email não registrado.'}, status=status.HTTP_404_NOT_FOUND)
                except User.MultipleObjectsReturned:
                    return Response({'Erro': 'Mais de um usuário com este email foi encontrado. Por favor, entre em contato com o suporte.'}, status=status.HTTP_400_BAD_REQUEST)

                if not check_password(password, user.password):
                    return Response({'Erro': 'Senha inválida.'}, status=status.HTTP_400_BAD_REQUEST)

                if not user.is_email_verified:
                    return Response({'Erro': 'Email não verificado. Por favor, verifique seu email.'}, status=status.HTTP_400_BAD_REQUEST)
                
                refresh = RefreshToken.for_user(user)
                access_token = str(refresh.access_token)
    
                return Response(
                    {
                        'token': access_token,
                        'refresh': str(refresh),
                        'user': UserSerializer(user).data,
                    }
                    , status=status.HTTP_200_OK
                    )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Login error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao fazer login. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    """
    View para recuperação de senha.

    /forgot-password/
    """
    def post(self, request, format=None):
        try:
            email = request.data.get('email')
            if not email:
                return Response({'Erro': 'Email é necessário.'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Security porpuses
                return Response({'message': 'Link para redefinição de senha enviado para o email.'}, status=status.HTTP_200_OK)
            except User.MultipleObjectsReturned:
                return Response({'Erro': 'Mais de um usuário com este email foi encontrado. Por favor, entre em contato com o suporte.'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Send the reset link to the user's email
            transaction.on_commit(lambda: send_password_reset_email.delay(user.email))
            
            return Response({'message': 'Link para redefinição de senha enviado para o email.'}, status=status.HTTP_200_OK)
        
        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Forgot password error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao solicitar a redefinição de senha. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    """
    View para redefinição de senha.

    /reset-password/
    """
    def post(self, request, format=None):
        try:
            token = request.data.get('token')
            
            if not token:
                return Response({'Erro': 'Token é necessário.'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                email = verify_reset_token(token)
            except ValueError as e:
                return Response({'Erro': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                return Response({'Erro': 'Email não registrado.'}, status=status.HTTP_404_NOT_FOUND)
            except User.MultipleObjectsReturned:
                return Response({'Erro': 'Mais de um usuário com este email foi encontrado. Por favor, entre em contato com o suporte.'}, status=status.HTTP_400_BAD_REQUEST)
            
            password = request.data.get('password')
            if not password:
                return Response({'Erro': 'Nova senha é necessária.'}, status=status.HTTP_400_BAD_REQUEST)
            
            user.set_password(password)
            user.save()

            refresh = RefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            
            return Response(
                {
                    'token': access_token,
                    'refresh': str(refresh),
                    'user': UserSerializer(user).data,
                }
                , status=status.HTTP_200_OK
                )
        
        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Reset password error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao redefinir a senha. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class MeView(APIView):
    permission_classes = [IsAuthenticated]
    """
    View para obter informações do usuário autenticado.

    /me/
    """
    def get(self, request, format=None):
        try:
            user = request.user
            return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
        except Exception as e:
            # Log the error for debugging purposes
            logging.error(f"Me error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao obter as informações do usuário. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ProfileDetailView(APIView):
    permission_classes = [IsAuthenticated]
    """
    View para atualizar informações do perfil do usuário autenticado.

    /profile/
    """
    def patch(self, request, format=None):
        try:
            user = request.user
            serializer = ProfileUpdateSerializer(user, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                with transaction.atomic():
                    serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Log the error for debugging purposes
            logger.exception("Profile update error")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao atualizar as informações do perfil. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ProfilePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    """
    View para atualizar a senha do perfil do usuário autenticado.

    /profile/password/
    """
    def patch(self, request, format=None):
        try:
            user = request.user
            
            if not user.check_password(request.data.get('old_password')):
                return Response({'Erro': 'Senha atual incorreta.'}, status=status.HTTP_400_BAD_REQUEST)

            serializer = PasswordChangeSerializer(user, data=request.data, context={'request': request})

            if serializer.is_valid():
                with transaction.atomic():
                    user.set_password(serializer.validated_data['new_password'])
                    user.save()
                return Response({'message': 'Senha atualizada com sucesso.'}, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Log the error for debugging purposes
            logger.exception("Password change error")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao atualizar a senha. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    """
    View para fazer logout do usuário autenticado.

    /auth/logout/
    """
    def post(self, request, format=None):
        try:
            refresh_token = request.data.get('refresh_token')
            if not refresh_token:
                return Response({'Erro': 'Token de refresh é necessário.'}, status=status.HTTP_400_BAD_REQUEST)
            
            RefreshToken(refresh_token).blacklist()
            
            return Response({'message': 'Logout realizado com sucesso.'}, status=status.HTTP_200_OK)
        except Exception as e:
            # Log the error for debugging purposes
            logger.exception("Logout error")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao fazer logout. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)