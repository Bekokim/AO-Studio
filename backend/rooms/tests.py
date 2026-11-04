from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import AORoom, Category, Question

User = get_user_model()


class PointsByFormatTests(APITestCase):
    """Баллы назначаются только в стратегическом формате; в классике и рандоме вопрос стоит 1 балл."""

    def setUp(self):
        self.author = User.objects.create_user(username="author", email="author@test.local", password="pwd12345")
        self.client.force_authenticate(self.author)

    def create_room(self, fmt, points):
        body = {"title": f"Комната {fmt}", "format": fmt, "timer_duration": 60, "is_public": True}
        question = {"text": "2+2?", "answer": "4", "points": points}
        if fmt == AORoom.FORMAT_RANDOM:
            body["questions"] = [question]
        else:
            body["categories"] = [{"name": "Математика", "questions": [question]}]
        return self.client.post("/api/rooms/", body, format="json")

    def test_classic_and_random_questions_always_cost_one_point(self):
        for fmt in (AORoom.FORMAT_CLASSIC, AORoom.FORMAT_RANDOM):
            with self.subTest(fmt=fmt):
                res = self.create_room(fmt, points=5)
                self.assertEqual(res.status_code, 201, res.data)
                room = AORoom.objects.get(pk=res.data["id"])
                self.assertEqual([q.points for q in room.questions.all()], [1])

    def test_strategic_keeps_chosen_points(self):
        res = self.create_room(AORoom.FORMAT_STRATEGIC, points=4)
        self.assertEqual(res.status_code, 201, res.data)
        room = AORoom.objects.get(pk=res.data["id"])
        self.assertEqual([q.points for q in room.questions.all()], [4])

    def test_points_above_five_rejected(self):
        res = self.create_room(AORoom.FORMAT_STRATEGIC, points=6)
        self.assertEqual(res.status_code, 400)

    def test_random_room_has_no_categories(self):
        res = self.create_room(AORoom.FORMAT_RANDOM, points=1)
        self.assertEqual(res.data["categories"], [])
        room = AORoom.objects.get(pk=res.data["id"])
        self.assertEqual(room.categories.count(), 0)
        self.assertEqual(room.questions.filter(category__isnull=True).count(), 1)


class PrivateRoomVisibilityTests(APITestCase):
    """Приватная комната не видна в списке: её находят по названию целиком или открывают по ссылке."""

    def setUp(self):
        self.author = User.objects.create_user(username="author", email="author@test.local", password="pwd12345")
        self.other = User.objects.create_user(username="other", email="other@test.local", password="pwd12345")
        self.private = AORoom.objects.create(
            title="Секретный квиз", format=AORoom.FORMAT_RANDOM, author=self.author, is_public=False
        )
        Question.objects.create(room=self.private, text="2+2?", answer="4", points=1)
        AORoom.objects.create(
            title="Открытый квиз", format=AORoom.FORMAT_RANDOM, author=self.author, is_public=True
        )

    def titles(self, **params):
        res = self.client.get("/api/rooms/", params)
        self.assertEqual(res.status_code, 200)
        return [r["title"] for r in res.data]

    # Регистр в тестах совпадает с названием: на SQLite поиск без учёта регистра
    # работает только для латиницы, на боевом PostgreSQL — для кириллицы тоже
    def test_hidden_from_list_and_from_partial_search(self):
        self.client.force_authenticate(self.other)
        self.assertNotIn("Секретный квиз", self.titles())
        self.assertNotIn("Секретный квиз", self.titles(search="Секрет"))

    def test_found_by_full_title(self):
        self.client.force_authenticate(self.other)
        self.assertIn("Секретный квиз", self.titles(search="Секретный квиз"))

    def test_opens_by_direct_link_for_anyone(self):
        self.client.force_authenticate(self.other)
        res = self.client.get(f"/api/rooms/{self.private.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["title"], "Секретный квиз")

    def test_author_sees_own_private_room_in_list(self):
        self.client.force_authenticate(self.author)
        self.assertIn("Секретный квиз", self.titles(show="mine"))


class SaveRoomTests(APITestCase):
    """Сохранить комнату — значит сделать личную копию, которую можно править."""

    def setUp(self):
        self.author = User.objects.create_user(username="author", email="a@test.local", password="pwd12345")
        self.other = User.objects.create_user(username="other", email="o@test.local", password="pwd12345")
        self.room = AORoom.objects.create(
            title="Кыргызстан", format=AORoom.FORMAT_CLASSIC, author=self.author, is_public=True
        )
        self.cat = Category.objects.create(room=self.room, name="История", order=0)
        Question.objects.create(room=self.room, category=self.cat, text="Год независимости?", answer="1991", order=0)
        Question.objects.create(room=self.room, category=self.cat, text="Столица?", answer="Бишкек", order=1)

    def save_room(self):
        return self.client.post(f"/api/rooms/{self.room.id}/save/")

    def test_save_copies_room_with_categories_and_questions(self):
        self.client.force_authenticate(self.other)
        res = self.save_room()
        self.assertEqual(res.status_code, 201, res.data)

        copy = AORoom.objects.get(pk=res.data["copy_id"])
        self.assertEqual(copy.author, self.other)
        self.assertEqual(copy.saved_from, self.room)
        self.assertEqual(copy.title, self.room.title)
        self.assertEqual([c.name for c in copy.categories.all()], ["История"])
        self.assertEqual(
            sorted(q.answer for q in copy.questions.all()), ["1991", "Бишкек"]
        )
        # Вопросы копии лежат в её собственной категории, а не в чужой
        self.assertEqual({q.category.room_id for q in copy.questions.all()}, {copy.id})

    def test_copy_is_private_and_original_untouched(self):
        self.client.force_authenticate(self.other)
        copy = AORoom.objects.get(pk=self.save_room().data["copy_id"])
        self.assertFalse(copy.is_public)

        copy.questions.update(text="Изменённый вопрос")
        self.room.refresh_from_db()
        self.assertEqual(self.room.questions.count(), 2)
        self.assertNotIn("Изменённый вопрос", [q.text for q in self.room.questions.all()])

    def test_saves_count_follows_copies(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.save_room().data["saves_count"], 1)
        self.room.refresh_from_db()
        self.assertEqual(self.room.saves_count, 1)

        AORoom.objects.get(saved_from=self.room, author=self.other).delete()
        self.room.refresh_from_db()
        self.assertEqual(self.room.saves_count, 0)

    def test_second_save_returns_same_copy(self):
        self.client.force_authenticate(self.other)
        first = self.save_room()
        second = self.save_room()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["copy_id"], first.data["copy_id"])
        self.assertEqual(AORoom.objects.filter(saved_from=self.room).count(), 1)

    def test_own_room_cannot_be_saved(self):
        self.client.force_authenticate(self.author)
        self.assertEqual(self.save_room().status_code, 400)

    def test_anonymous_cannot_save(self):
        self.assertEqual(self.save_room().status_code, 401)

    def test_private_copy_is_not_visible_to_others(self):
        self.client.force_authenticate(self.other)
        copy_id = self.save_room().data["copy_id"]
        third = User.objects.create_user(username="third", email="t@test.local", password="pwd12345")
        self.client.force_authenticate(third)

        self.assertEqual(self.client.post(f"/api/rooms/{copy_id}/save/").status_code, 404)

    def test_copy_of_republished_copy_points_at_original(self):
        """Если копию выложили публично, сохранение с неё всё равно считается оригиналу."""
        self.client.force_authenticate(self.other)
        copy = AORoom.objects.get(pk=self.save_room().data["copy_id"])
        copy.is_public = True
        copy.save()
        third = User.objects.create_user(username="third", email="t@test.local", password="pwd12345")
        self.client.force_authenticate(third)

        res = self.client.post(f"/api/rooms/{copy.id}/save/")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(AORoom.objects.get(pk=res.data["copy_id"]).saved_from, self.room)

    def test_lists_separate_own_rooms_from_saved(self):
        self.client.force_authenticate(self.other)
        own = AORoom.objects.create(
            title="Своя игра", format=AORoom.FORMAT_RANDOM, author=self.other, is_public=True
        )
        self.save_room()

        mine = self.client.get("/api/rooms/", {"show": "mine"})
        self.assertEqual([r["title"] for r in mine.data], [own.title])

        saved = self.client.get("/api/rooms/saved/")
        self.assertEqual([r["title"] for r in saved.data], [self.room.title])
        self.assertEqual(saved.data[0]["saved_from"]["title"], self.room.title)

    def test_list_marks_saved_room_and_gives_copy_id(self):
        self.client.force_authenticate(self.other)
        copy_id = self.save_room().data["copy_id"]
        res = self.client.get(f"/api/rooms/{self.room.id}/")
        self.assertTrue(res.data["is_saved"])
        self.assertEqual(res.data["my_copy_id"], copy_id)


class AltAnswersTests(APITestCase):
    """Дополнительные формулировки ответа засчитываются наравне с основным."""

    def setUp(self):
        self.author = User.objects.create_user(username="author", email="a@test.local", password="pwd12345")
        self.client.force_authenticate(self.author)

    def test_alt_answers_saved_and_returned(self):
        body = {
            "title": "Города", "format": AORoom.FORMAT_RANDOM, "timer_duration": 60, "is_public": True,
            "questions": [{
                "text": "Столица Кыргызстана?", "answer": "Бишкек", "points": 1,
                "alt_answers": ["город Бишкек", "  г. Бишкек  ", "", "   "],
            }],
        }
        res = self.client.post("/api/rooms/", body, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        question = AORoom.objects.get(pk=res.data["id"]).questions.first()
        # Пустые строки отброшены, лишние пробелы срезаны
        self.assertEqual(question.alt_answers, ["город Бишкек", "г. Бишкек"])
        self.assertEqual(res.data["questions"][0]["alt_answers"], ["город Бишкек", "г. Бишкек"])

    def test_question_without_alt_answers_defaults_to_empty(self):
        body = {
            "title": "Без вариантов", "format": AORoom.FORMAT_RANDOM, "timer_duration": 60, "is_public": True,
            "questions": [{"text": "2+2?", "answer": "4", "points": 1}],
        }
        res = self.client.post("/api/rooms/", body, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(AORoom.objects.get(pk=res.data["id"]).questions.first().alt_answers, [])

    def test_saved_copy_keeps_alt_answers(self):
        room = AORoom.objects.create(
            title="Города", format=AORoom.FORMAT_RANDOM, author=self.author, is_public=True
        )
        Question.objects.create(
            room=room, text="Столица?", answer="Бишкек", alt_answers=["город Бишкек"], order=0
        )
        other = User.objects.create_user(username="other", email="o@test.local", password="pwd12345")
        self.client.force_authenticate(other)

        res = self.client.post(f"/api/rooms/{room.id}/save/")
        self.assertEqual(res.status_code, 201, res.data)
        copy = AORoom.objects.get(pk=res.data["copy_id"])
        self.assertEqual(copy.questions.first().alt_answers, ["город Бишкек"])


class AnswerMatchingTests(APITestCase):
    """Сверка ответа: основной, дополнительные и варианты внутри одной строки."""

    def test_matches_main_alt_and_inline_variants(self):
        from game.live import answer_matches

        self.assertTrue(answer_matches("бишкек", "Бишкек"))
        self.assertTrue(answer_matches("ГОРОД БИШКЕК", "Бишкек", ["город Бишкек"]))
        self.assertTrue(answer_matches("г Бишкек", "Бишкек", ["г. Бишкек"]))
        # Варианты через «или» и «/» разбираются и внутри дополнительного ответа
        self.assertTrue(answer_matches("Фрунзе", "Бишкек", ["Пишпек или Фрунзе"]))
        self.assertTrue(answer_matches("Пишпек", "Бишкек", ["Пишпек/Фрунзе"]))

    def test_rejects_wrong_and_empty(self):
        from game.live import answer_matches

        self.assertFalse(answer_matches("Ош", "Бишкек", ["город Бишкек"]))
        self.assertFalse(answer_matches("", "Бишкек", ["город Бишкек"]))
        self.assertFalse(answer_matches("!!!", "Бишкек", ["город Бишкек"]))
        # Пустые и пробельные варианты не должны засчитывать что попало
        self.assertFalse(answer_matches("Ош", "Бишкек", ["", "   "]))
