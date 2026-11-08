from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("google/", views.GoogleLoginView.as_view()),
    path("config/", views.AuthConfigView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("me/", views.MeView.as_view()),
    path("me/update/", views.MeUpdateView.as_view()),
    path("me/delete/", views.MeDeleteView.as_view()),
    path("me/activity/", views.MeActivityView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
]
