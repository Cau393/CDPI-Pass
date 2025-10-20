from django.urls import path
from .views import RegisterView, VerifyCodeView, ResendCodeView, LoginView, ForgotPasswordView, ResetPasswordView, MeView, LogoutView, ProfileDetailView, ProfilePasswordView

urlpatterns = [
    # Auth routes
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/verify-code/', VerifyCodeView.as_view(), name='verify-code'),
    path('auth/resend-code/', ResendCodeView.as_view(), name='resend-code'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('auth/reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),

    # Profile routes
    path('profile/', ProfileDetailView.as_view(), name='profile'),
    path('profile/password/', ProfilePasswordView.as_view(), name='profile-password'),
]