from django.contrib import admin
from django.urls import path, include

# Views


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
]
