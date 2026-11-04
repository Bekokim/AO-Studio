from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("rooms", views.RoomViewSet, basename="room")
router.register("questions", views.QuestionViewSet, basename="question")
router.register("categories", views.CategoryViewSet, basename="category")

urlpatterns = [
    path("stats/", views.PlatformStatsView.as_view()),
    # Сборка комнаты по описанию: GET — доступна ли, POST — собрать заготовку
    path("rooms/generate/", views.RoomGenerateView.as_view()),
] + router.urls
