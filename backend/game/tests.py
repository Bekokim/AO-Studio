from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from rooms.models import AORoom, Question

from .models import Answer, GameSession, Participant, Team, Violation

User = get_user_model()


class LiveMixin:
    """Вход участников в игру с доски: капитан заводит команду, остальные её выбирают."""

    def join_captain(self, code, team_name="Ала-Тоо", name="Капитан", size=2):
        res = self.client.post(
            f"/api/live/{code}/join/",
            {"name": name, "team_name": team_name, "size": size},
            format="json",
        )
        return res

    def join_member(self, code, team_id, name="Второй"):
        return self.client.post(
            f"/api/live/{code}/join/", {"name": name, "team_id": team_id}, format="json"
        )

    def set_answerer(self, code, captain_token, participant_id):
        return self.client.post(
            f"/api/live/{code}/answerer/",
            {"participant_id": participant_id},
            format="json",
            headers={"X-Team-Token": captain_token},
        )

    def violate(self, code, token, kind="hidden"):
        return self.client.post(
            f"/api/live/{code}/violation/", {"kind": kind}, format="json", headers={"X-Team-Token": token}
        )

    def space_out_violations(self, token):
        """Разводим нарушения по времени: подряд идущие считаются одним уходом с экрана."""
        Violation.objects.filter(participant__token=token).update(at="2020-01-01T00:00:00Z")


class AnticheatTests(LiveMixin, APITestCase):
    """Античит: нарушение считается участнику лично, двое выбывших снимают команду."""

    def setUp(self):
        self.host = User.objects.create_user(username="host", password="pwd12345")
        self.room = AORoom.objects.create(title="Тест", format="classic", author=self.host)
        self.question = Question.objects.create(room=self.room, text="2+2?", answer="4", points=1)
        self.session = GameSession.objects.create(
            room=self.room,
            host=self.host,
            mode=GameSession.MODE_ONLINE,
            status=GameSession.STATUS_LOBBY,
            code="ABC123",
            anticheat=True,
        )
        self.code = self.session.code
        # Команда из трёх человек: капитан он же отвечающий, плюс двое в запасе
        res = self.join_captain(self.code, size=3)
        self.assertEqual(res.status_code, 201, res.data)
        self.captain_token = res.data["token"]
        self.team = Team.objects.get(session=self.session)
        self.captain = Participant.objects.get(token=self.captain_token)
        self.second_token = self.join_member(self.code, self.team.id, "Второй").data["token"]
        self.third_token = self.join_member(self.code, self.team.id, "Третий").data["token"]
        self.second = Participant.objects.get(token=self.second_token)
        self.set_answerer(self.code, self.captain_token, self.captain.id)

    def begin(self):
        """Ведущий начал игру и открыл приём ответов на вопрос."""
        self.session.status = GameSession.STATUS_ACTIVE
        self.session.state = {"view": "question", "accepting": True, "question": {"id": self.question.id}}
        self.session.save(update_fields=["status", "state"])

    def test_first_violation_warns_second_puts_participant_out(self):
        self.begin()

        res = self.violate(self.code, self.second_token)
        self.assertTrue(res.data["counted"])
        self.assertEqual(res.data["warnings"], 1)
        self.assertFalse(res.data["disqualified"], "первое нарушение — только предупреждение")

        # Два события одного ухода с экрана (blur + hidden) не должны стоить двух нарушений
        res = self.violate(self.code, self.second_token, "blur")
        self.assertFalse(res.data["counted"])
        self.assertEqual(res.data["warnings"], 1)

        self.space_out_violations(self.second_token)
        res = self.violate(self.code, self.second_token, "fullscreen")
        self.assertTrue(res.data["counted"])
        self.assertTrue(res.data["disqualified"])
        self.assertEqual(res.data["dq_reason"], "Вышел из полноэкранного режима")
        # Выбыл один — команда ещё в игре
        self.assertFalse(res.data["team_disqualified"])

    def test_two_participants_out_disqualify_the_team(self):
        self.begin()
        for token in (self.second_token, self.third_token):
            self.violate(self.code, token)
            self.space_out_violations(token)
            res = self.violate(self.code, token, "fullscreen")
            self.assertTrue(res.data["disqualified"])
            self.space_out_violations(token)

        self.assertTrue(res.data["team_disqualified"], "двое вне зачёта — команду снимают")
        self.team.refresh_from_db()
        self.assertTrue(self.team.disqualified)

    def test_only_answerer_may_answer_and_pick(self):
        self.begin()
        # Отвечающий — капитан, поэтому второму участнику отвечать нельзя
        res = self.client.post(
            f"/api/live/{self.code}/answer/",
            {"question_id": self.question.id, "text": "4"},
            format="json",
            headers={"X-Team-Token": self.second_token},
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("отвечает другой", res.data["detail"])

        res = self.client.post(
            f"/api/live/{self.code}/answer/",
            {"question_id": self.question.id, "text": "4"},
            format="json",
            headers={"X-Team-Token": self.captain_token},
        )
        self.assertEqual(res.status_code, 200, res.data)

    def test_participant_out_of_play_cannot_answer_or_pick(self):
        self.begin()
        # Отвечающим делаем второго, а потом выводим его из зачёта
        self.set_answerer(self.code, self.captain_token, self.second.id)
        Participant.objects.filter(pk=self.second.pk).update(disqualified=True, dq_reason="Свернул игру")

        res = self.client.post(
            f"/api/live/{self.code}/answer/",
            {"question_id": self.question.id, "text": "4"},
            format="json",
            headers={"X-Team-Token": self.second_token},
        )
        self.assertEqual(res.status_code, 403)

        res = self.client.post(
            f"/api/live/{self.code}/pick/",
            {"question_id": self.question.id},
            format="json",
            headers={"X-Team-Token": self.second_token},
        )
        self.assertEqual(res.status_code, 403)

    def test_score_frozen_and_pardon_restores_whole_team(self):
        self.begin()
        self.team.score = 5
        self.team.disqualified = True
        self.team.save()
        Participant.objects.filter(team=self.team).update(disqualified=True, warnings=2)

        self.client.force_authenticate(self.host)
        res = self.client.patch(
            f"/api/game/{self.session.id}/score/", {"team_id": self.team.id, "delta": 3}, format="json"
        )
        self.assertEqual(res.status_code, 400, "баллы снятой команды заморожены")
        self.team.refresh_from_db()
        self.assertEqual(self.team.score, 5)

        res = self.client.post(f"/api/game/{self.session.id}/teams/{self.team.id}/pardon/")
        self.assertEqual(res.status_code, 200)
        self.team.refresh_from_db()
        self.assertFalse(self.team.disqualified)
        # Вернули команду — значит и весь её состав
        self.assertEqual(Participant.objects.filter(team=self.team, disqualified=True).count(), 0)

        res = self.client.patch(
            f"/api/game/{self.session.id}/score/", {"team_id": self.team.id, "delta": 3}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.team.refresh_from_db()
        self.assertEqual(self.team.score, 8)

    def test_pardoning_one_participant_returns_the_team(self):
        """Команда выбыла из-за двоих: вернули одного — снятие с команды снимается тоже."""
        self.begin()
        for token in (self.second_token, self.third_token):
            self.violate(self.code, token)
            self.space_out_violations(token)
            self.violate(self.code, token, "fullscreen")
            self.space_out_violations(token)
        self.team.refresh_from_db()
        self.assertTrue(self.team.disqualified)

        self.client.force_authenticate(self.host)
        res = self.client.post(f"/api/game/{self.session.id}/participants/{self.second.id}/pardon/")
        self.assertEqual(res.status_code, 200)

        self.second.refresh_from_db()
        self.team.refresh_from_db()
        self.assertFalse(self.second.disqualified)
        self.assertFalse(self.team.disqualified, "выбывших снова меньше двух — команда играет")

    def test_no_violations_in_lobby_or_with_anticheat_off(self):
        # Игра ещё не началась — телефон свободен
        res = self.violate(self.code, self.second_token)
        self.assertFalse(res.data["counted"])

        self.begin()
        self.session.anticheat = False
        self.session.save(update_fields=["anticheat"])
        res = self.violate(self.code, self.second_token)
        self.assertFalse(res.data["counted"], "при выключенном античите нарушения не считаются")
        self.assertEqual(Violation.objects.count(), 0)

    def test_beacon_sends_token_in_body(self):
        """Уход со страницы отправляется через sendBeacon — заголовки там недоступны."""
        self.begin()
        res = self.client.post(
            f"/api/live/{self.code}/violation/",
            {"kind": "left", "token": self.second_token},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["counted"])
        self.assertEqual(res.data["warnings"], 1)

    def test_participant_and_host_see_anticheat_state(self):
        self.begin()
        self.violate(self.code, self.second_token)

        # Устройство участника видит свои предупреждения и свою роль
        res = self.client.get(f"/api/live/{self.code}/", headers={"X-Team-Token": self.second_token})
        self.assertTrue(res.data["anticheat"])
        self.assertEqual(res.data["me"]["warnings"], 1)
        self.assertFalse(res.data["me"]["disqualified"])
        self.assertFalse(res.data["me"]["is_answerer"])
        self.assertEqual(res.data["my_team"]["id"], self.team.id)

        # Ведущий видит журнал нарушений поимённо
        self.client.force_authenticate(self.host)
        res = self.client.get(f"/api/game/{self.session.id}/anticheat/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["violations"]), 1)
        self.assertEqual(res.data["violations"][0]["kind"], "hidden")
        self.assertEqual(res.data["violations"][0]["participant"], "Второй")
        people = {p["name"]: p for p in res.data["teams"][0]["participants"]}
        self.assertEqual(people["Второй"]["warnings"], 1)
        self.assertTrue(people["Капитан"]["is_captain"])


class TeamSetupTests(LiveMixin, APITestCase):
    """Сбор состава: капитан, выбор команды участниками и назначение отвечающего."""

    def setUp(self):
        self.host = User.objects.create_user(username="host", password="pwd12345")
        self.room = AORoom.objects.create(title="Тест", format="classic", author=self.host)
        self.question = Question.objects.create(room=self.room, text="2+2?", answer="4", points=1)
        self.session = GameSession.objects.create(
            room=self.room,
            host=self.host,
            mode=GameSession.MODE_ONLINE,
            status=GameSession.STATUS_LOBBY,
            code="ABC123",
            anticheat=True,
        )
        self.code = self.session.code

    def test_captain_creates_team_and_mates_join_it(self):
        res = self.join_captain(self.code, "Ала-Тоо", "Азамат", size=2)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["me"]["is_captain"])
        team_id = res.data["me"]["team_id"]

        team = Team.objects.get(pk=team_id)
        self.assertEqual(team.size, 2)
        self.assertFalse(team.ready, "отвечающего ещё не выбрали")

        res = self.join_member(self.code, team_id, "Бакыт")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data["me"]["is_captain"])
        self.assertEqual(Participant.objects.filter(team=team).count(), 2)

    def test_team_does_not_take_more_than_captain_declared(self):
        team_id = self.join_captain(self.code, size=2).data["me"]["team_id"]
        self.join_member(self.code, team_id, "Бакыт")

        res = self.join_member(self.code, team_id, "Лишний")
        self.assertEqual(res.status_code, 400)
        self.assertIn("мест больше нет", res.data["detail"])
        self.assertEqual(Participant.objects.filter(team_id=team_id).count(), 2)

    def test_duplicate_names_are_refused(self):
        team_id = self.join_captain(self.code, "Ала-Тоо", "Азамат", size=3).data["me"]["team_id"]
        res = self.join_member(self.code, team_id, "азамат")
        self.assertEqual(res.status_code, 400)
        self.assertIn("именем", res.data["detail"])

        res = self.join_captain(self.code, "ала-тоо", "Другой", size=2)
        self.assertEqual(res.status_code, 400)
        self.assertIn("названием", res.data["detail"])

    def test_size_must_be_sane(self):
        res = self.join_captain(self.code, "Ала-Тоо", "Азамат", size=0)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Сколько вас", res.data["detail"])

    def test_host_team_size_caps_the_captain(self):
        self.session.team_size = 3
        self.session.save(update_fields=["team_size"])
        res = self.join_captain(self.code, "Ала-Тоо", "Азамат", size=5)
        self.assertEqual(res.status_code, 400)
        self.assertIn("от 1 до 3", res.data["detail"])

    def test_only_captain_assigns_the_answerer(self):
        captain_token = self.join_captain(self.code, size=2).data["token"]
        team = Team.objects.get(session=self.session)
        mate_token = self.join_member(self.code, team.id, "Бакыт").data["token"]
        mate = Participant.objects.get(token=mate_token)

        res = self.set_answerer(self.code, mate_token, mate.id)
        self.assertEqual(res.status_code, 403)
        self.assertIn("капитан", res.data["detail"])

        res = self.set_answerer(self.code, captain_token, mate.id)
        self.assertEqual(res.status_code, 200)
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, mate.id)
        self.assertTrue(team.ready, "отвечающий назначен — команда готова")

    def test_answerer_is_not_swapped_mid_question(self):
        """Во время вопроса выбор не подменяет отвечающего сразу — он ждёт следующего вопроса."""
        captain_token = self.join_captain(self.code, size=2).data["token"]
        team = Team.objects.get(session=self.session)
        mate = Participant.objects.get(token=self.join_member(self.code, team.id, "Бакыт").data["token"])
        captain = Participant.objects.get(token=captain_token)
        self.set_answerer(self.code, captain_token, captain.id)

        self.session.status = GameSession.STATUS_ACTIVE
        self.session.state = {"view": "question", "accepting": True, "question": {"id": self.question.id}}
        self.session.save(update_fields=["status", "state"])
        res = self.set_answerer(self.code, captain_token, mate.id)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["queued"])
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, captain.id, "текущий вопрос дописывает прежний отвечающий")
        self.assertEqual(team.next_answerer_id, mate.id)

        # Между вопросами — сразу
        self.session.state = {"view": "grid", "available": []}
        self.session.save(update_fields=["state"])
        res = self.set_answerer(self.code, captain_token, mate.id)
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["queued"])
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, mate.id)
        self.assertIsNone(team.next_answerer_id)

    def test_choice_during_a_question_waits_for_the_next_one(self):
        """Во время вопроса капитан выбирает на следующий — текущего отвечающего это не меняет."""
        captain_token = self.join_captain(self.code, size=3).data["token"]
        team = Team.objects.get(session=self.session)
        captain = Participant.objects.get(token=captain_token)
        mate = Participant.objects.get(token=self.join_member(self.code, team.id, "Бакыт").data["token"])
        self.set_answerer(self.code, captain_token, captain.id)

        self.client.force_authenticate(self.host)
        open_question = lambda qid: self.client.patch(
            f"/api/game/{self.session.id}/state/",
            {"state": {"view": "question", "accepting": True, "question": {"id": qid}}},
            format="json",
        )
        self.session.status = GameSession.STATUS_ACTIVE
        self.session.save(update_fields=["status"])
        open_question(self.question.id)
        self.client.force_authenticate(None)

        res = self.set_answerer(self.code, captain_token, mate.id)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["queued"], "выбор встал в очередь")
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, captain.id, "на текущем вопросе отвечает прежний")
        self.assertEqual(team.next_answerer_id, mate.id)

        # Ведущий открывает следующий вопрос — замена вступает в силу
        other = Question.objects.create(room=self.room, text="3+3?", answer="6", points=1)
        self.client.force_authenticate(self.host)
        open_question(other.id)
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, mate.id)
        self.assertIsNone(team.next_answerer_id)

    def test_choice_between_questions_applies_at_once(self):
        captain_token = self.join_captain(self.code, size=3).data["token"]
        team = Team.objects.get(session=self.session)
        captain = Participant.objects.get(token=captain_token)
        mate = Participant.objects.get(token=self.join_member(self.code, team.id, "Бакыт").data["token"])
        self.set_answerer(self.code, captain_token, captain.id)

        self.session.status = GameSession.STATUS_ACTIVE
        self.session.state = {"view": "grid", "available": []}
        self.session.save(update_fields=["status", "state"])

        res = self.set_answerer(self.code, captain_token, mate.id)
        self.assertFalse(res.data["queued"])
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, mate.id)
        self.assertIsNone(team.next_answerer_id)

    def test_queued_participant_who_drops_out_is_not_seated(self):
        captain_token = self.join_captain(self.code, size=3).data["token"]
        team = Team.objects.get(session=self.session)
        captain = Participant.objects.get(token=captain_token)
        mate_token = self.join_member(self.code, team.id, "Бакыт").data["token"]
        mate = Participant.objects.get(token=mate_token)
        self.set_answerer(self.code, captain_token, captain.id)

        self.session.status = GameSession.STATUS_ACTIVE
        self.session.state = {"view": "question", "accepting": True, "question": {"id": self.question.id}}
        self.session.save(update_fields=["status", "state"])
        self.set_answerer(self.code, captain_token, mate.id)

        # Намеченный вылетел, пока шёл вопрос
        Participant.objects.filter(pk=mate.pk).update(disqualified=True, dq_reason="Свернул игру")

        other = Question.objects.create(room=self.room, text="3+3?", answer="6", points=1)
        self.client.force_authenticate(self.host)
        self.client.patch(
            f"/api/game/{self.session.id}/state/",
            {"state": {"view": "question", "accepting": True, "question": {"id": other.id}}},
            format="json",
        )
        team.refresh_from_db()
        self.assertEqual(team.answerer_id, captain.id, "за команду по-прежнему отвечает капитан")
        self.assertIsNone(team.next_answerer_id)

    def test_losing_the_answerer_leaves_the_team_without_one(self):
        """Отвечающего вывели из зачёта — капитан обязан назначить нового."""
        captain_token = self.join_captain(self.code, size=3).data["token"]
        team = Team.objects.get(session=self.session)
        mate_token = self.join_member(self.code, team.id, "Бакыт").data["token"]
        mate = Participant.objects.get(token=mate_token)
        self.set_answerer(self.code, captain_token, mate.id)

        self.session.status = GameSession.STATUS_ACTIVE
        self.session.state = {"view": "question", "accepting": True, "question": {"id": self.question.id}}
        self.session.save(update_fields=["status", "state"])

        self.violate(self.code, mate_token)
        self.space_out_violations(mate_token)
        self.violate(self.code, mate_token, "fullscreen")

        team.refresh_from_db()
        self.assertIsNone(team.answerer_id)
        self.assertFalse(team.ready)


class BoardLaunchTests(LiveMixin, APITestCase):
    """Запуск с доски: ожидаемый состав, лимит мест и старт только по готовности команд."""

    def setUp(self):
        self.host = User.objects.create_user(username="host", password="pwd12345")
        self.room = AORoom.objects.create(title="Тест", format="classic", author=self.host)
        Question.objects.create(room=self.room, text="2+2?", answer="4", points=1)

    def start_board(self, **extra):
        self.client.force_authenticate(self.host)
        payload = {
            "room_id": self.room.id,
            "mode": "online",
            "board": True,
            "expected_teams": 2,
            "team_size": 4,
            "autostart": True,
            "timer_duration": 45,
            "teams": [],
        }
        payload.update(extra)
        res = self.client.post("/api/game/start/", payload, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.client.force_authenticate(None)
        return res.data

    def ready_team(self, code, team_name, size=1):
        """Капитан заводит команду и сразу назначает отвечающим себя."""
        data = self.join_captain(code, team_name, f"Капитан {team_name}", size=size).data
        me = Participant.objects.get(token=data["token"])
        self.set_answerer(code, data["token"], me.id)
        return data["token"]

    def test_board_settings_saved_and_returned(self):
        data = self.start_board()
        self.assertTrue(data["board"])
        self.assertTrue(data["autostart"])
        self.assertEqual(data["expected_teams"], 2)
        self.assertEqual(data["team_size"], 4)
        self.assertEqual(data["timer_duration"], 45)
        self.assertEqual(data["status"], "lobby")

        # Участник видит ожидаемый состав ещё до входа
        res = self.client.get(f"/api/live/{data['code']}/")
        self.assertEqual(res.data["expected_teams"], 2)
        self.assertEqual(res.data["team_size"], 4)

    def test_timer_must_be_one_of_allowed(self):
        self.client.force_authenticate(self.host)
        res = self.client.post(
            "/api/game/start/",
            {"room_id": self.room.id, "mode": "online", "board": True, "timer_duration": 90, "teams": []},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("timer_duration", res.data)

    def test_answer_is_locked_after_first_submit(self):
        """Ответ отправляется один раз: до конца таймера изменить его нельзя."""
        data = self.start_board(autostart=False)
        code = data["code"]
        token = self.ready_team(code, "Первая")
        session = GameSession.objects.get(pk=data["id"])
        question = self.room.questions.first()
        session.status = GameSession.STATUS_ACTIVE
        session.state = {"view": "question", "accepting": True, "question": {"id": question.id}}
        session.save(update_fields=["status", "state"])

        def send(text):
            return self.client.post(
                f"/api/live/{code}/answer/",
                {"question_id": question.id, "text": text},
                format="json",
                headers={"X-Team-Token": token},
            )

        self.assertEqual(send("Иссык-Куль").status_code, 200)
        res = send("Сон-Куль")
        self.assertEqual(res.status_code, 400)
        team = Participant.objects.get(token=token).team
        self.assertEqual(Answer.objects.get(team=team, question=question).text, "Иссык-Куль")

    def test_autostart_waits_for_every_team_to_be_ready(self):
        data = self.start_board()
        code = data["code"]
        session_id = data["id"]

        # Первая команда готова — ждём вторую
        self.ready_team(code, "Первая")
        self.assertEqual(GameSession.objects.get(pk=session_id).status, GameSession.STATUS_LOBBY)

        # Вторая вошла, но отвечающего ещё не назначила — старта быть не должно
        captain = self.join_captain(code, "Вторая", "Капитан 2", size=1).data
        self.assertEqual(GameSession.objects.get(pk=session_id).status, GameSession.STATUS_LOBBY)

        me = Participant.objects.get(token=captain["token"])
        self.set_answerer(code, captain["token"], me.id)
        session = GameSession.objects.get(pk=session_id)
        self.assertEqual(session.status, GameSession.STATUS_ACTIVE, "все готовы — игра начинается сама")
        self.assertEqual(session.state, {"view": "waiting"})

    def test_join_refused_when_all_places_taken(self):
        data = self.start_board(autostart=False)
        code = data["code"]
        self.join_captain(code, "Первая", "К1", size=1)
        self.join_captain(code, "Вторая", "К2", size=1)

        res = self.join_captain(code, "Третья", "К3", size=1)
        self.assertEqual(res.status_code, 400)
        self.assertIn("мест", res.data["detail"])
        self.assertEqual(Team.objects.filter(session_id=data["id"]).count(), 2)

    def test_host_cannot_start_until_every_team_is_ready(self):
        data = self.start_board(autostart=False)
        code = data["code"]
        self.ready_team(code, "Первая")
        self.join_captain(code, "Вторая", "Капитан 2", size=1)

        self.client.force_authenticate(self.host)
        res = self.client.patch(f"/api/game/{data['id']}/begin/")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Вторая", res.data["detail"])
        self.assertEqual(GameSession.objects.get(pk=data["id"]).status, GameSession.STATUS_LOBBY)

    def test_without_autostart_host_starts_manually(self):
        data = self.start_board(autostart=False)
        code = data["code"]
        self.ready_team(code, "Первая")
        self.ready_team(code, "Вторая")
        self.assertEqual(GameSession.objects.get(pk=data["id"]).status, GameSession.STATUS_LOBBY)

        self.client.force_authenticate(self.host)
        res = self.client.patch(f"/api/game/{data['id']}/begin/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(GameSession.objects.get(pk=data["id"]).status, GameSession.STATUS_ACTIVE)
