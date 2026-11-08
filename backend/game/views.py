from datetime import timedelta

from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from rooms.models import AORoom

from .live import PARTICIPANTS_DQ_ALLOWED, WARNINGS_ALLOWED, answer_matches, apply_next_answerers
from .models import Answer, GameSession, Participant, Team, generate_code
from .serializers import (
    GameSessionSerializer,
    GameStartSerializer,
    ScoreUpdateSerializer,
    StateUpdateSerializer,
)


def host_session(request, pk):
    return get_object_or_404(GameSession, pk=pk, host=request.user)


class GameStartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = GameStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        room = get_object_or_404(
            AORoom, Q(is_public=True) | Q(author=request.user), pk=data["room_id"]
        )
        online = data["mode"] == GameSession.MODE_ONLINE
        session = GameSession.objects.create(
            room=room,
            host=request.user,
            mode=data["mode"],
            status=GameSession.STATUS_LOBBY if online else GameSession.STATUS_ACTIVE,
            code=generate_code() if online else None,
            state={"view": "lobby"} if online else {},
            anticheat=online and data["anticheat"],
            board=online and data["board"],
            expected_teams=data["expected_teams"] if online else 0,
            team_size=data["team_size"] if online else 0,
            autostart=online and data["autostart"] and data["expected_teams"] > 0,
            timer_duration=data.get("timer_duration") or None,
        )
        teams = data["teams"]
        if data["mode"] == GameSession.MODE_SOLO:
            # Одиночная игра: единственная «команда» — сам игрок. Имя он вводит при запуске,
            # по умолчанию — его логин
            name = (teams[0]["name"].strip() if teams else "") or request.user.username
            teams = [{"name": name[:100], "color": "#10B981"}]
        Team.objects.bulk_create(
            [Team(session=session, name=t["name"], color=t["color"]) for t in teams]
        )
        return Response(GameSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class GameDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        return Response(GameSessionSerializer(host_session(request, pk)).data)


class GameScoreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        session = host_session(request, pk)
        serializer = ScoreUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        team = get_object_or_404(Team, pk=data["team_id"], session=session)
        if team.disqualified:
            return Response(
                {"detail": "Команда дисквалифицирована — её баллы заморожены."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if "score" in data:
            team.score = data["score"]
            team.save(update_fields=["score"])
        else:
            Team.objects.filter(pk=team.pk).update(score=F("score") + data["delta"])
        return Response(GameSessionSerializer(session).data)


class GameFinishView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        session = host_session(request, pk)
        session.status = GameSession.STATUS_FINISHED
        session.state = {**(session.state or {}), "view": "results"}
        session.state_version += 1
        session.timer_ends_at = None
        session.timer_left = None
        session.save(update_fields=["status", "state", "state_version", "timer_ends_at", "timer_left"])
        return Response(GameSessionSerializer(session).data)


# ---------- Онлайн-режим: управление ведущего ----------

class GameStateView(APIView):
    """Ведущий публикует публичное состояние игры (то, что видят команды)."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        session = host_session(request, pk)
        serializer = StateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Новый вопрос — вступают в силу замены, намеченные капитанами во время прошлого
        prev_q = ((session.state or {}).get("question") or {}).get("id")
        new_state = data["state"]
        new_q = (new_state.get("question") or {}).get("id")
        if new_state.get("view") == "question" and new_q and new_q != prev_q:
            apply_next_answerers(session)

        session.state = new_state
        session.state_version += 1
        fields = ["state", "state_version"]
        if data["state"].get("view") not in ("grid", "tiles") and session.pick:
            session.pick = None
            fields.append("pick")
        if "timer" in data:
            timer = data["timer"]
            if not timer:
                session.timer_ends_at, session.timer_left = None, None
            elif timer.get("running"):
                session.timer_ends_at = timezone.now() + timedelta(seconds=int(timer.get("left", 0)))
                session.timer_left = None
            else:
                session.timer_ends_at, session.timer_left = None, max(0, int(timer.get("left", 0)))
            fields += ["timer_ends_at", "timer_left"]
        session.save(update_fields=fields)
        return Response({"version": session.state_version})


class GameBeginView(APIView):
    """Из лобби в игру: дальше новые команды присоединиться не могут."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        session = host_session(request, pk)
        if session.status != GameSession.STATUS_LOBBY:
            return Response({"detail": "Игра уже началась."}, status=status.HTTP_400_BAD_REQUEST)
        teams = list(session.teams.prefetch_related("participants"))
        if not teams:
            return Response({"detail": "Дождитесь хотя бы одной команды."}, status=status.HTTP_400_BAD_REQUEST)
        # Команда готова, когда капитан назначил отвечающего
        not_ready = [t.name for t in teams if not t.ready]
        if not_ready:
            return Response(
                {"detail": "Ещё не готовы: " + ", ".join(not_ready) + ". Капитан выбирает, кто пишет ответы."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.status = GameSession.STATUS_ACTIVE
        session.state = {"view": "waiting"}
        session.state_version += 1
        session.save(update_fields=["status", "state", "state_version"])
        return Response(GameSessionSerializer(session).data)


class GameTeamDeleteView(APIView):
    """Ведущий убирает команду из лобби."""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, team_id):
        session = host_session(request, pk)
        if session.status != GameSession.STATUS_LOBBY:
            return Response({"detail": "Убрать команду можно только до начала игры."}, status=status.HTTP_400_BAD_REQUEST)
        get_object_or_404(Team, pk=team_id, session=session).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameAnswersView(APIView):
    """Опрос ведущего в онлайн-игре: ответы команд на вопросы (+ подсказка о совпадении) и выбор клетки командой."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        session = host_session(request, pk)
        ids = [int(i) for i in request.query_params.get("questions", "").split(",") if i.strip().isdigit()]
        answers = Answer.objects.filter(session=session, question_id__in=ids).select_related("question")
        return Response({
            "answers": [
                {
                    "question_id": a.question_id,
                    "team_id": a.team_id,
                    "text": a.text,
                    "matches": answer_matches(a.text, a.question.answer, a.question.alt_answers),
                    "submitted_at": a.submitted_at,
                }
                for a in answers
            ],
            "pick": session.pick,
        })


class GameAnticheatView(APIView):
    """Ведущий следит за античитом: предупреждения, дисквалификации и связь с устройствами команд."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        session = host_session(request, pk)
        now = timezone.now()

        def offline(obj):
            # Устройство молчит дольше 10 с — скорее всего, страница игры закрыта
            return bool(obj.last_seen and (now - obj.last_seen).total_seconds() > 10)

        return Response({
            "anticheat": session.anticheat,
            "warnings_allowed": WARNINGS_ALLOWED,
            "participants_dq_allowed": PARTICIPANTS_DQ_ALLOWED,
            "teams": [
                {
                    "id": t.id,
                    "name": t.name,
                    "color": t.color,
                    "score": t.score,
                    "warnings": t.warnings,
                    "disqualified": t.disqualified,
                    "dq_reason": t.dq_reason,
                    "offline": offline(t),
                    "participants": [
                        {
                            "id": p.id,
                            "name": p.name,
                            "is_captain": p.is_captain,
                            "is_answerer": t.answerer_id == p.id,
                            "is_next_answerer": t.next_answerer_id == p.id,
                            "warnings": p.warnings,
                            "disqualified": p.disqualified,
                            "dq_reason": p.dq_reason,
                            "offline": offline(p),
                        }
                        for p in t.participants.all()
                    ],
                }
                for t in session.teams.prefetch_related("participants")
            ],
            "violations": [
                {
                    "id": v.id,
                    "team_id": v.team_id,
                    "team": v.team.name,
                    "participant_id": v.participant_id,
                    "participant": v.participant.name if v.participant_id else "",
                    "kind": v.kind,
                    "label": v.get_kind_display(),
                    "fatal": v.fatal,
                    "at": v.at,
                }
                for v in session.violations.select_related("team", "participant")[:30]
            ],
        })


def clear_dq(obj):
    obj.warnings = 0
    obj.disqualified = False
    obj.dq_reason = ""
    obj.dq_at = None
    obj.save(update_fields=["warnings", "disqualified", "dq_reason", "dq_at"])


class GamePardonView(APIView):
    """Ведущий возвращает команду в игру: снимает дисквалификацию со всего состава.

    Команда выбывает, когда вне зачёта оказываются двое, поэтому возвращать её по одному
    участнику бессмысленно — сняли бы с команды и тут же вернули обратно.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, team_id):
        session = host_session(request, pk)
        team = get_object_or_404(Team, pk=team_id, session=session)
        with transaction.atomic():
            clear_dq(team)
            for p in team.participants.filter(disqualified=True):
                clear_dq(p)
        return Response({"ok": True, "team_id": team.id})


class GameParticipantPardonView(APIView):
    """Ведущий возвращает в игру одного участника."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, participant_id):
        session = host_session(request, pk)
        participant = get_object_or_404(Participant, pk=participant_id, team__session=session)
        team = participant.team
        with transaction.atomic():
            clear_dq(participant)
            # Команда вылетела из-за выбывших — пересчитываем, хватает ли их ещё
            if team.disqualified and team.participants.filter(disqualified=True).count() < PARTICIPANTS_DQ_ALLOWED:
                clear_dq(team)
        return Response({"ok": True, "participant_id": participant.id, "team_id": team.id})


class GameHistoryView(APIView):
    """
    История игр, которые человек провёл сам: что за комната, когда и с каким счётом.

    Берём только сыгранное — лобби, которое так и не началось, историей не является
    и только засоряло бы список. Команды отдаём сразу, одним запросом с подгрузкой:
    иначе на полсотни игр ушло бы полсотни запросов в базу.
    """

    permission_classes = [permissions.IsAuthenticated]

    LIMIT = 50

    def get(self, request):
        sessions = (
            GameSession.objects.filter(host=request.user)
            .exclude(status=GameSession.STATUS_LOBBY)
            .select_related("room")
            .prefetch_related("teams")
            .order_by("-created_at")[: self.LIMIT]
        )
        data = []
        for s in sessions:
            teams = sorted(s.teams.all(), key=lambda t: (t.disqualified, -t.score))
            winner = next((t for t in teams if not t.disqualified), None)
            data.append(
                {
                    "id": s.pk,
                    "room": {"id": s.room_id, "title": s.room.title, "format": s.room.format},
                    "mode": s.mode,
                    "status": s.status,
                    "created_at": s.created_at,
                    "winner": winner.name if winner and len(teams) > 1 else None,
                    "teams": [
                        {
                            "id": t.pk,
                            "name": t.name,
                            "color": t.color,
                            "score": t.score,
                            "disqualified": t.disqualified,
                        }
                        for t in teams
                    ],
                }
            )
        return Response(data)
