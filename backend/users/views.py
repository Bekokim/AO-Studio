from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .google import GoogleAuthError, get_or_create_user, verify_credential
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    UpdateProfileSerializer,
    UserSerializer,
)

User = get_user_model()


def auth_payload(user, request):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user, context={"request": request}).data,
    }


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(auth_payload(user, request), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        login = serializer.validated_data["login"].strip()
        password = serializer.validated_data["password"]
        user = User.objects.filter(Q(username__iexact=login) | Q(email__iexact=login)).first()
        if not user or not user.check_password(password) or not user.is_active:
            return Response(
                {"detail": "Неверный логин или пароль."}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(auth_payload(user, request))


class GoogleLoginView(APIView):
    """Вход/регистрация через Google: принимает ID-токен (credential) от Google Identity Services."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        credential = request.data.get("credential")
        if not credential:
            return Response({"detail": "Нет токена Google."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user, created = get_or_create_user(verify_credential(credential))
        except GoogleAuthError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {**auth_payload(user, request), "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AuthConfigView(APIView):
    """Публичные настройки авторизации для фронтенда."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"google_client_id": settings.GOOGLE_CLIENT_ID or None})


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh")).blacklist()
        except (TokenError, TypeError):
            pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)


class MeUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        serializer = UpdateProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)


class MeDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        if request.data.get("username") != request.user.username:
            return Response(
                {"detail": "Введённый логин не совпадает."}, status=status.HTTP_400_BAD_REQUEST
            )
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeActivityView(APIView):
    """
    Календарь активности за последний год — по дню на клетку, как на GitHub.

    Активностью считаем то, что человек сделал сам: создал AO комнату или провёл игру.
    Считаем на сервере одним запросом на вид активности, а не выгружаем даты на клиент:
    за год у активного автора это сотни записей, а клетки всё равно дневные.
    """

    permission_classes = [permissions.IsAuthenticated]

    DAYS = 365

    def get(self, request):
        from django.db.models import Count
        from django.db.models.functions import TruncDate

        from game.models import GameSession
        from rooms.models import AORoom

        today = timezone.localdate()
        start = today - timedelta(days=self.DAYS - 1)
        days = {}

        def collect(qs, key):
            rows = (
                qs.annotate(day=TruncDate("created_at"))
                .values("day")
                .annotate(n=Count("id"))
                .order_by()
            )
            for row in rows:
                if row["day"] is None:
                    continue
                day = days.setdefault(row["day"].isoformat(), {"rooms": 0, "games": 0})
                day[key] += row["n"]

        collect(AORoom.objects.filter(author=request.user, created_at__date__gte=start), "rooms")
        collect(
            GameSession.objects.filter(host=request.user, created_at__date__gte=start), "games"
        )
        total = sum(d["rooms"] + d["games"] for d in days.values())
        return Response(
            {"from": start.isoformat(), "to": today.isoformat(), "total": total, "days": days}
        )
