from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from game.models import GameSession
from rooms.models import AORoom

User = get_user_model()


class ActivityCalendarTests(APITestCase):
    """Календарь активности: своя комната и своя игра дают по клетке в своём дне."""

    def setUp(self):
        self.user = User.objects.create_user(username="author", email="author@example.com", password="pwd12345")
        self.other = User.objects.create_user(username="chuzhoy", email="chuzhoy@example.com", password="pwd12345")
        self.today = timezone.localdate()

    def make_room(self, author, days_ago=0):
        room = AORoom.objects.create(title="Тест", format="classic", author=author)
        if days_ago:
            AORoom.objects.filter(pk=room.pk).update(
                created_at=timezone.now() - timedelta(days=days_ago)
            )
        return room

    def test_counts_own_rooms_and_games_by_day(self):
        room = self.make_room(self.user)
        self.make_room(self.user, days_ago=3)
        GameSession.objects.create(room=room, host=self.user, status=GameSession.STATUS_FINISHED)
        self.client.force_authenticate(self.user)

        res = self.client.get("/api/auth/me/activity/")

        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["total"], 3)
        today = res.data["days"][self.today.isoformat()]
        self.assertEqual(today, {"rooms": 1, "games": 1})
        past = (self.today - timedelta(days=3)).isoformat()
        self.assertEqual(res.data["days"][past], {"rooms": 1, "games": 0})

    def test_ignores_other_users(self):
        room = self.make_room(self.other)
        GameSession.objects.create(room=room, host=self.other, status=GameSession.STATUS_FINISHED)
        self.client.force_authenticate(self.user)

        res = self.client.get("/api/auth/me/activity/")

        self.assertEqual(res.data["total"], 0)
        self.assertEqual(res.data["days"], {})

    def test_older_than_a_year_is_outside_the_calendar(self):
        self.make_room(self.user, days_ago=400)
        self.client.force_authenticate(self.user)

        res = self.client.get("/api/auth/me/activity/")

        self.assertEqual(res.data["total"], 0)

    def test_requires_login(self):
        self.assertEqual(self.client.get("/api/auth/me/activity/").status_code, 401)


class ProfileCountersTests(APITestCase):
    """Счётчик комнат в профиле не считает сохранённые копии чужих игр."""

    def test_saved_copies_are_not_counted_as_own_rooms(self):
        user = User.objects.create_user(username="author", email="author@example.com", password="pwd12345")
        other = User.objects.create_user(username="chuzhoy", email="chuzhoy@example.com", password="pwd12345")
        AORoom.objects.create(title="Своя", format="classic", author=user)
        original = AORoom.objects.create(title="Чужая", format="classic", author=other)
        AORoom.objects.create(title="Копия", format="classic", author=user, saved_from=original)
        self.client.force_authenticate(user)

        res = self.client.get("/api/auth/me/")

        self.assertEqual(res.data["rooms_count"], 1)
