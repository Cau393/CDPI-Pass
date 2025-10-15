from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import RegisterSerializer, LoginSerializer, VerifyCodeSerializer
from .utils import generate_verification_code, get_code_expiration
from .tasks import send_verification_email

class RegisterView(APIView):
    def post(self, request, format=None):
        try:
            serializer = RegisterSerializer(data=request.data)
            if serializer.is_valid():
                
                user = serializer.save()
                verification_code = generate_verification_code()

                user.email_verification_code = verification_code
                user.email_verification_code_expires_at = get_code_expiration()
                user.save()

                send_verification_email.delay(user.email, verification_code)

                return Response(
                    {
                    'message': 'Usuario registrado com sucesso. Código de verificação enviado para o email.', 
                    'email': user.email
                    }, 
                    status=status.HTTP_201_CREATED
                    )
        
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            # Log the error for debugging purposes
            print(f"Registration error: {str(e)}")

            # Return a generic error message to the user
            return Response({'Erro interno do servidor': 'Ocorreu um erro ao registrar o usuário. Por favor, tente novamente.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


