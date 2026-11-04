from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q, Subquery, Value
from django.db.models.fields import BooleanField, IntegerField
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AORoom, Category, Question
from .serializers import (
    CategorySerializer,
    QuestionUpdateSerializer,
    RoomDetailSerializer,
    RoomListSerializer,
    RoomWriteSerializer,
)


class IsAuthorOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        room = obj if isinstance(obj, AORoom) else obj.room
        return room.author_id == request.user.id


def annotate_rooms(qs, user):
    qs = qs.select_related("author", "saved_from").prefetch_related("categories").annotate(
        questions_count=Count("questions", distinct=True)
    )
    if user.is_authenticated:
        mine = AORoom.objects.filter(saved_from=OuterRef("pk"), author=user)
        # Своя копия этой комнаты: по ней фронт ведёт на редактирование
        qs = qs.annotate(
            is_saved=Exists(mine),
            my_copy_id=Subquery(mine.values("pk")[:1]),
        )
    else:
        qs = qs.annotate(
            is_saved=Value(False, output_field=BooleanField()),
            my_copy_id=Value(None, output_field=IntegerField()),
        )
    return qs


class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return RoomWriteSerializer
        if self.action == "retrieve":
            return RoomDetailSerializer
        return RoomListSerializer

    def get_queryset(self):
        user = self.request.user
        params = self.request.query_params
        base = AORoom.objects.all()

        if self.action in ("list", "my"):
            show = "mine" if self.action == "my" else params.get("show", "all")
            search = params.get("search", "").strip()
            # Приватную комнату не видно в списке: её находят, набрав название целиком,
            # или открывают по прямой ссылке
            found_private = Q(is_public=False, title__iexact=search) if search else Q(pk__in=[])
            if show in ("mine", "saved") and not user.is_authenticated:
                return AORoom.objects.none()
            if show == "mine":
                # Свои комнаты — только созданные, сохранённые копии лежат отдельно
                base = base.filter(author=user, saved_from__isnull=True)
            elif show == "saved":
                base = base.filter(author=user, saved_from__isnull=False)
            elif show == "available" and user.is_authenticated:
                # Для запуска игры: публичные, свои приватные и найденные по точному названию
                base = base.filter(Q(is_public=True) | Q(author=user) | found_private)
            else:
                base = base.filter(Q(is_public=True) | found_private)
        elif self.action != "retrieve":
            # Приватные комнаты не показываем в общих списках…
            visible = Q(is_public=True)
            if user.is_authenticated:
                visible |= Q(author=user)
            base = base.filter(visible)
        # …а по прямой ссылке (retrieve) комната открывается у всех, кому её дали

        qs = annotate_rooms(base, user)

        if self.action == "retrieve":
            qs = qs.prefetch_related("categories__questions", "questions")

        if self.action in ("list", "my"):
            if search:
                qs = qs.filter(title__icontains=search)
            fmt = params.get("fmt")
            if fmt in dict(AORoom.FORMAT_CHOICES):
                qs = qs.filter(format=fmt)
            qcount = params.get("qcount")
            if qcount == "5-10":
                qs = qs.filter(questions_count__gte=5, questions_count__lte=10)
            elif qcount == "10-20":
                qs = qs.filter(questions_count__gte=10, questions_count__lte=20)
            elif qcount == "20+":
                qs = qs.filter(questions_count__gte=20)
            cats = [c.strip() for c in params.get("categories", "").split(",") if c.strip()]
            if cats:
                cat_q = Q()
                for c in cats:
                    cat_q |= Q(categories__name__iexact=c)
                qs = qs.filter(cat_q).filter(format__in=AORoom.CATEGORY_FORMATS).distinct()
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def my(self, request):
        return Response(RoomListSerializer(self.get_queryset(), many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def saved(self, request):
        """Сохранённые комнаты — личные копии чужих игр, их можно править как свои."""
        qs = annotate_rooms(
            AORoom.objects.filter(author=request.user, saved_from__isnull=False), request.user
        )
        return Response(RoomListSerializer(qs, many=True, context={"request": request}).data)

    @action(
        detail=False, methods=["get"], url_path="categories-list",
        permission_classes=[permissions.AllowAny],
    )
    def categories_list(self, request):
        """Популярные категории для фильтра-мультиселекта."""
        names = (
            Category.objects.filter(room__is_public=True)
            .filter(room__format__in=AORoom.CATEGORY_FORMATS)
            .values("name")
            .annotate(n=Count("id"))
            .order_by("-n", "name")[:30]
        )
        return Response([n["name"] for n in names])

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def save(self, request, pk=None):
        """Сохранить комнату себе — то есть сделать личную копию, которую можно править.

        Оригинал автора не меняется. Повторный вызов копию не плодит: возвращаем уже
        сделанную, фронт ведёт по ней на редактирование.
        """
        room = self.get_object()
        if room.author_id == request.user.id and room.saved_from_id is None:
            return Response(
                {"detail": "Это ваша комната — её не нужно сохранять."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Копию снимаем с оригинала: копия копии остаётся привязанной к первоисточнику
        source = room.saved_from or room
        existing = AORoom.objects.filter(saved_from=source, author=request.user).first()
        if existing:
            copy = existing
        else:
            copy = self._copy_room(source, request.user)
        source.refresh_from_db(fields=["saves_count"])
        return Response(
            {"is_saved": True, "saves_count": source.saves_count, "copy_id": copy.id},
            status=status.HTTP_201_CREATED if not existing else status.HTTP_200_OK,
        )

    @staticmethod
    @transaction.atomic
    def _copy_room(source, user):
        """Копирует комнату целиком: категории, вопросы и файлы фотографий."""
        copy = AORoom.objects.create(
            title=source.title,
            format=source.format,
            timer_duration=source.timer_duration,
            # Копия всегда приватная: это личный экземпляр, а не вторая публикация чужой игры
            is_public=False,
            description=source.description,
            author=user,
            saved_from=source,
        )
        cat_map = {}
        for cat in source.categories.all():
            cat_map[cat.id] = Category.objects.create(room=copy, name=cat.name, order=cat.order)
        for q in source.questions.all():
            new_q = Question(
                room=copy,
                category=cat_map.get(q.category_id),
                text=q.text,
                answer=q.answer,
                alt_answers=list(q.alt_answers or []),
                points=q.points,
                order=q.order,
            )
            # Фото копируем файлом, а не ссылкой: иначе удаление вопроса у автора
            # оставило бы копию с битой картинкой
            if q.photo:
                try:
                    q.photo.open("rb")
                    new_q.photo.save(q.photo.name.rsplit("/", 1)[-1], ContentFile(q.photo.read()), save=False)
                except (OSError, ValueError):
                    # Файл недоступен — копия просто останется без фото
                    pass
                finally:
                    q.photo.close()
            new_q.save()
        return copy

    def _own_room(self):
        room = self.get_object()
        if room.author_id != self.request.user.id:
            raise PermissionDenied("Только автор может изменять комнату.")
        return room

    @action(
        detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated],
        parser_classes=[JSONParser, MultiPartParser, FormParser],
    )
    def questions(self, request, pk=None):
        room = self._own_room()
        category = None
        if request.data.get("category"):
            category = generics.get_object_or_404(Category, pk=request.data["category"], room=room)
        serializer = QuestionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(room=room, category=category, order=room.questions.count())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def categories(self, request, pk=None):
        room = self._own_room()
        if room.format not in AORoom.CATEGORY_FORMATS:
            return Response(
                {"detail": "В формате «Рандом» нет категорий."}, status=status.HTTP_400_BAD_REQUEST
            )
        serializer = CategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(room=room, order=room.categories.count())
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class QuestionViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = QuestionUpdateSerializer
    permission_classes = [permissions.IsAuthenticated, IsAuthorOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return Question.objects.filter(room__author=self.request.user)

    def perform_destroy(self, instance):
        instance.photo.delete(save=False)
        instance.delete()


class CategoryViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsAuthorOrReadOnly]

    def get_queryset(self):
        return Category.objects.filter(room__author=self.request.user)


class PlatformStatsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from game.models import GameSession

        return Response({
            "users": get_user_model().objects.count(),
            "rooms": AORoom.objects.count(),
            "games": GameSession.objects.count(),
            "rating": 98,
        })
