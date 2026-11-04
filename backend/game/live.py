"""Онлайн-режим: публичные эндпоинты для команд (без аккаунта, по коду комнаты).

Ведущий публикует состояние игры (экран, вопрос, таймер, чей ход) — см. GameStateView.
Устройства команд раз в ~1.5 c запрашивают его здесь и отправляют ответы.
"""
import math
import re

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Answer, GameSession, Participant, Team, Violation

MAX_TEAMS = 40
# Сколько участников может быть в команде
MAX_TEAM_SIZE = 20

# Античит: сколько нарушений прощается, прежде чем дисквалифицировать участника
WARNINGS_ALLOWED = 1
# Сколько участников должно вылететь, чтобы из игры выбыла вся команда
PARTICIPANTS_DQ_ALLOWED = 2
# Два события от одного ухода с экрана (blur + hidden) не должны стоить двух нарушений
VIOLATION_COOLDOWN = 5  # секунд
VIOLATION_LABELS = dict(Violation.KINDS)
TEAM_COLORS = [
    "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#F97316",
    "#84CC16", "#14B8A6", "#EAB308", "#F43F5E", "#A3E635",
    "#FB7185", "#FBBF24", "#22C55E", "#E879F9", "#FDBA74",
]


def normalize(text: str) -> str:
    text = (text or "").lower().replace("ё", "е")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def answer_matches(given: str, correct: str, alt_answers=None) -> bool:
    """Подсказка ведущему: совпадает ли ответ с правильным (без учёта регистра, знаков, «ё»).

    Засчитываются: основной ответ, дополнительные формулировки из `alt_answers`, а также
    варианты, перечисленные прямо в тексте ответа через «/», «;», «,», скобки или «или».
    """
    g = normalize(given)
    if not g:
        return False
    variants = []
    for source in [correct, *(alt_answers or [])]:
        if not source:
            continue
        variants.append(source)
        variants += re.split(r"/|;|,|\(|\)|\bили\b", source, flags=re.IGNORECASE)
    return any(g == normalize(v) for v in variants if normalize(v))


def timer_payload(session: GameSession):
    if session.timer_ends_at:
        left = max(0, math.ceil((session.timer_ends_at - timezone.now()).total_seconds()))
        return {"left": left, "running": left > 0}
    if session.timer_left is not None:
        return {"left": session.timer_left, "running": False}
    return None


def request_token(request):
    # sendBeacon (уход со страницы) не умеет слать заголовки — там токен приходит в теле
    return request.headers.get("X-Team-Token", "") or str(request.data.get("token", ""))


def participant_from_request(request, session):
    """Участник, с чьего устройства пришёл запрос."""
    token = request_token(request)
    if not token:
        return None
    return (
        Participant.objects.filter(team__session=session, token=token)
        .select_related("team")
        .first()
    )


def team_payload(team: Team, *, with_participants=True):
    data = {
        "id": team.id,
        "name": team.name,
        "color": team.color,
        "score": team.score,
        "disqualified": team.disqualified,
        "size": team.size,
        "answerer_id": team.answerer_id,
        "next_answerer_id": team.next_answerer_id,
        "ready": team.ready,
    }
    if with_participants:
        data["participants"] = [
            {
                "id": p.id,
                "name": p.name,
                "is_captain": p.is_captain,
                "is_answerer": team.answerer_id == p.id,
                "is_next_answerer": team.next_answerer_id == p.id,
                "disqualified": p.disqualified,
                "warnings": p.warnings,
            }
            for p in team.participants.all()
        ]
    return data


def public_payload(session: GameSession, participant: Participant | None = None):
    state = session.state or {}
    teams = session.teams.prefetch_related("participants")
    payload = {
        "code": session.code,
        "mode": session.mode,
        "status": session.status,
        "room": {"title": session.room.title, "format": session.room.format},
        "state": state,
        "version": session.state_version,
        "timer": timer_payload(session),
        "server_time": timezone.now().isoformat(),
        "teams": [team_payload(t) for t in teams],
        "anticheat": session.anticheat and session.mode == GameSession.MODE_ONLINE,
        "warnings_allowed": WARNINGS_ALLOWED,
        "participants_dq_allowed": PARTICIPANTS_DQ_ALLOWED,
        "max_team_size": MAX_TEAM_SIZE,
        # Сбор команд: сколько ждём и сколько игроков в команде (0 — не задано)
        "expected_teams": session.expected_teams,
        "team_size": session.team_size,
        # Кто смотрит: участник и его команда
        "me": None,
        "my_team": None,
        "my_answer": None,
    }
    if participant:
        team = participant.team
        payload["me"] = {
            "id": participant.id,
            "name": participant.name,
            "is_captain": participant.is_captain,
            "is_answerer": team.answerer_id == participant.id,
            "is_next_answerer": team.next_answerer_id == participant.id,
            "disqualified": participant.disqualified,
            "warnings": participant.warnings,
            "dq_reason": participant.dq_reason,
            "team_id": team.id,
        }
        payload["my_team"] = team_payload(team)
        qid = (state.get("question") or {}).get("id")
        if qid:
            ans = Answer.objects.filter(team=team, question_id=qid).first()
            payload["my_answer"] = ans.text if ans else None
    return payload


class LiveBase(APIView):
    # Публичные эндпоинты: JWT не разбираем, чтобы просроченный токен ведущего в том же браузере не давал 401
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get_session(self, code):
        return get_object_or_404(
            GameSession.objects.select_related("room"), code=code.upper(), mode=GameSession.MODE_ONLINE
        )


class LiveStateView(LiveBase):
    def get(self, request, code):
        session = self.get_session(code)
        me = participant_from_request(request, session)
        if me:
            # Отметка связи — ведущий видит, что устройство на месте (пишем не чаще раза в 5 с)
            now = timezone.now()
            if not me.last_seen or (now - me.last_seen).total_seconds() > 5:
                Participant.objects.filter(pk=me.pk).update(last_seen=now)
                Team.objects.filter(pk=me.team_id).update(last_seen=now)
        return Response(public_payload(session, me))


def maybe_autostart(session: GameSession):
    """Все команды собрались и назначили отвечающего — начинаем, ведущему жать нечего."""
    if not session.autostart or session.status != GameSession.STATUS_LOBBY:
        return
    teams = list(session.teams.all())
    if session.expected_teams and len(teams) < session.expected_teams:
        return
    if not teams or not all(t.ready for t in teams):
        return
    session.status = GameSession.STATUS_ACTIVE
    session.state = {"view": "waiting"}
    session.state_version += 1
    session.save(update_fields=["status", "state", "state_version"])


class LiveJoinView(LiveBase):
    """Вход участника.

    Капитан создаёт команду: присылает своё имя, название команды и число участников.
    Остальные присылают имя и `team_id` — выбирают команду из уже созданных.
    """

    def post(self, request, code):
        session = self.get_session(code)
        # Повторный вход с того же устройства — возвращаем того же участника
        existing = participant_from_request(request, session)
        if existing:
            return Response({"token": existing.token, **public_payload(session, existing)})

        if session.status != GameSession.STATUS_LOBBY:
            return Response({"detail": "Игра уже началась — присоединиться нельзя."}, status=status.HTTP_400_BAD_REQUEST)

        name = str(request.data.get("name", "")).strip()[:40]
        if len(name) < 2:
            return Response({"detail": "Введите своё имя (минимум 2 символа)."}, status=status.HTTP_400_BAD_REQUEST)

        team_id = request.data.get("team_id")
        with transaction.atomic():
            if team_id:
                me = self._join_team(session, team_id, name)
            else:
                me = self._create_team(request, session, name)
            if isinstance(me, Response):
                return me
            maybe_autostart(session)

        session.refresh_from_db()
        return Response({"token": me.token, **public_payload(session, me)}, status=status.HTTP_201_CREATED)

    def _join_team(self, session, team_id, name):
        """Участник выбирает команду, которую уже завёл её капитан."""
        team = session.teams.select_for_update().filter(pk=team_id).first()
        if not team:
            return Response({"detail": "Команда не найдена."}, status=status.HTTP_400_BAD_REQUEST)
        mates = list(team.participants.all())
        if team.size and len(mates) >= team.size:
            return Response(
                {"detail": f"В команде «{team.name}» мест больше нет — капитан заявил {team.size}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if any(p.name.lower() == name.lower() for p in mates):
            return Response(
                {"detail": "В этой команде уже есть участник с таким именем."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Participant.objects.create(team=team, name=name, token=Participant.new_token())

    def _create_team(self, request, session, captain_name):
        """Капитан заводит команду: название, состав и он сам первым участником."""
        team_name = str(request.data.get("team_name", "")).strip()[:40]
        if len(team_name) < 2:
            return Response(
                {"detail": "Введите название команды (минимум 2 символа)."}, status=status.HTTP_400_BAD_REQUEST
            )

        # Ведущий мог задать размер команды при запуске — тогда это потолок
        limit_size = min(session.team_size or MAX_TEAM_SIZE, MAX_TEAM_SIZE)
        try:
            size = int(request.data.get("size", 0))
        except (TypeError, ValueError):
            size = 0
        if size < 1 or size > limit_size:
            return Response(
                {"detail": f"Сколько вас в команде? Число от 1 до {limit_size}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        teams = list(session.teams.select_for_update())
        limit = min(session.expected_teams or MAX_TEAMS, MAX_TEAMS)
        if len(teams) >= limit:
            return Response(
                {"detail": "Все места заняты — ведущий ждёт именно столько команд."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if any(t.name.lower() == team_name.lower() for t in teams):
            return Response({"detail": "Команда с таким названием уже есть."}, status=status.HTTP_400_BAD_REQUEST)

        used = {t.color for t in teams}
        color = next((c for c in TEAM_COLORS if c not in used), TEAM_COLORS[len(teams) % len(TEAM_COLORS)])
        team = Team.objects.create(session=session, name=team_name, color=color, size=size)
        return Participant.objects.create(
            team=team, name=captain_name, token=Participant.new_token(), is_captain=True
        )


class LiveAnswererView(LiveBase):
    """Капитан назначает участника, который пишет ответы за команду.

    До старта это и есть готовность команды. В игре выбор доступен всегда, но пока открыт
    текущий вопрос, подменять отвечающего нельзя — это был бы способ тянуть время. Поэтому
    выбор, сделанный во время вопроса, ждёт своей очереди и вступает в силу, когда ведущий
    откроет следующий.
    """

    def post(self, request, code):
        session = self.get_session(code)
        me = participant_from_request(request, session)
        if not me:
            return Response({"detail": "Сначала присоединитесь к игре."}, status=status.HTTP_403_FORBIDDEN)
        if not me.is_captain:
            return Response({"detail": "Отвечающего назначает капитан."}, status=status.HTTP_403_FORBIDDEN)

        team = me.team
        if team.disqualified:
            return Response({"detail": "Команда снята с игры."}, status=status.HTTP_400_BAD_REQUEST)
        target = team.participants.filter(pk=request.data.get("participant_id")).first()
        if not target:
            return Response({"detail": "Участник не найден."}, status=status.HTTP_400_BAD_REQUEST)
        if target.disqualified:
            return Response(
                {"detail": "Этот участник вне зачёта — выберите другого."}, status=status.HTTP_400_BAD_REQUEST
            )

        in_question = session.status == GameSession.STATUS_ACTIVE and (session.state or {}).get("view") == "question"
        if in_question:
            team.next_answerer = target
            team.save(update_fields=["next_answerer"])
        else:
            team.answerer = target
            team.next_answerer = None
            team.save(update_fields=["answerer", "next_answerer"])
        maybe_autostart(session)
        session.refresh_from_db()
        return Response({"queued": in_question, **public_payload(session, me)})


def apply_next_answerers(session: GameSession):
    """Открылся следующий вопрос — пересаживаем тех, кого капитаны наметили во время прошлого."""
    pending = session.teams.exclude(next_answerer=None).select_related("next_answerer")
    for team in pending:
        # Участник мог вылететь, пока шёл вопрос, — тогда замена не состоится
        if team.next_answerer and not team.next_answerer.disqualified:
            team.answerer_id = team.next_answerer_id
        team.next_answerer = None
        team.save(update_fields=["answerer", "next_answerer"])


class LiveAnswerView(LiveBase):
    def post(self, request, code):
        session = self.get_session(code)
        me = participant_from_request(request, session)
        if not me:
            return Response({"detail": "Сначала присоединитесь к игре."}, status=status.HTTP_403_FORBIDDEN)
        team = me.team
        if team.disqualified:
            return Response({"detail": "Команда дисквалифицирована."}, status=status.HTTP_403_FORBIDDEN)
        if me.disqualified:
            return Response({"detail": "Вы вне зачёта."}, status=status.HTTP_403_FORBIDDEN)
        if team.answerer_id != me.id:
            return Response({"detail": "За команду отвечает другой участник."}, status=status.HTTP_403_FORBIDDEN)
        state = session.state or {}
        question = state.get("question") or {}
        qid = request.data.get("question_id")
        if session.status != GameSession.STATUS_ACTIVE or not state.get("accepting") or question.get("id") != qid:
            return Response({"detail": "Приём ответов на этот вопрос закрыт."}, status=status.HTTP_400_BAD_REQUEST)
        answering = state.get("answer_team")
        if answering and answering != team.id:
            return Response({"detail": "Сейчас отвечает другая команда."}, status=status.HTTP_400_BAD_REQUEST)
        text = str(request.data.get("text", "")).strip()[:500]
        if not text:
            return Response({"detail": "Введите ответ."}, status=status.HTTP_400_BAD_REQUEST)
        # Ответ отправляется один раз: после отправки поле блокируется до конца таймера
        if Answer.objects.filter(team=team, question_id=qid).exists():
            return Response(
                {"detail": "Ответ уже отправлен — изменить его нельзя."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            Answer.objects.create(session=session, team=team, question_id=qid, text=text)
        except IntegrityError:
            return Response({"detail": "Вопрос не найден."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ok": True, "text": text})


class LivePickView(LiveBase):
    """Отвечающий выбирает клетку (стратегический) или карточку (слепой) со своего устройства."""

    def post(self, request, code):
        session = self.get_session(code)
        me = participant_from_request(request, session)
        if not me:
            return Response({"detail": "Сначала присоединитесь к игре."}, status=status.HTTP_403_FORBIDDEN)
        team = me.team
        if team.disqualified or me.disqualified:
            return Response({"detail": "Вы вне зачёта."}, status=status.HTTP_403_FORBIDDEN)
        if team.answerer_id != me.id:
            return Response({"detail": "Вопрос выбирает отвечающий."}, status=status.HTTP_403_FORBIDDEN)
        state = session.state or {}
        if session.status != GameSession.STATUS_ACTIVE or state.get("view") not in ("grid", "tiles"):
            return Response({"detail": "Сейчас выбирать нельзя."}, status=status.HTTP_400_BAD_REQUEST)
        if state.get("active_team") != team.id:
            return Response({"detail": "Сейчас ход другой команды."}, status=status.HTTP_400_BAD_REQUEST)
        qid = request.data.get("question_id")
        if qid not in (state.get("available") or []):
            return Response({"detail": "Этот вопрос уже сыгран."}, status=status.HTTP_400_BAD_REQUEST)
        session.pick = {"team_id": team.id, "question_id": qid, "at": timezone.now().isoformat()}
        session.save(update_fields=["pick"])
        return Response({"ok": True})


def disqualify_participant(participant: Participant, reason: str):
    """Участник вне зачёта. Двое выбывших — и команда целиком выбывает из игры."""
    participant.disqualified = True
    participant.dq_reason = reason
    participant.dq_at = timezone.now()
    participant.save(update_fields=["disqualified", "dq_reason", "dq_at"])

    team = participant.team
    mates = list(team.participants.all())
    # Отвечающий выбыл — команда без ответов, пока капитан не назначит другого
    if team.answerer_id == participant.id:
        team.answerer = None
        team.save(update_fields=["answerer"])
    # Выбыл капитан — права переходят первому, кто остался в зачёте
    if participant.is_captain:
        heir = next((p for p in mates if not p.disqualified and p.id != participant.id), None)
        if heir:
            Participant.objects.filter(pk=participant.pk).update(is_captain=False)
            Participant.objects.filter(pk=heir.pk).update(is_captain=True)

    out = sum(1 for p in mates if p.disqualified or p.id == participant.id)
    if out >= PARTICIPANTS_DQ_ALLOWED and not team.disqualified:
        team.disqualified = True
        team.dq_reason = f"Вне зачёта участников: {out}"
        team.dq_at = timezone.now()
        team.save(update_fields=["disqualified", "dq_reason", "dq_at"])
    return team


class LiveViolationView(LiveBase):
    """Устройство участника сообщает, что игра ушла с экрана.

    Считается каждому лично: первое нарушение — предупреждение, следующее — участник вне
    зачёта. Когда вне зачёта оказываются двое, из игры выбывает вся команда.
    """

    def post(self, request, code):
        session = self.get_session(code)
        me = participant_from_request(request, session)
        if not me:
            return Response({"detail": "Сначала присоединитесь к игре."}, status=status.HTTP_403_FORBIDDEN)

        kind = request.data.get("kind")
        if kind not in VIOLATION_LABELS:
            return Response({"detail": "Неизвестный тип нарушения."}, status=status.HTTP_400_BAD_REQUEST)

        def snapshot(counted):
            me.refresh_from_db()
            team = Team.objects.get(pk=me.team_id)
            return Response({
                "counted": counted,
                "warnings": me.warnings,
                "warnings_allowed": WARNINGS_ALLOWED,
                "disqualified": me.disqualified,
                "dq_reason": me.dq_reason,
                "team_disqualified": team.disqualified,
                "team_dq_reason": team.dq_reason,
            })

        # Античит работает только в идущей игре: в лобби и на итогах телефон свободен
        inactive = not session.anticheat or session.status != GameSession.STATUS_ACTIVE
        if inactive or me.disqualified or me.team.disqualified:
            return snapshot(False)

        with transaction.atomic():
            me = Participant.objects.select_for_update().select_related("team").get(pk=me.pk)
            recent = me.violations.first()
            if recent and (timezone.now() - recent.at).total_seconds() < VIOLATION_COOLDOWN:
                # Один и тот же уход с экрана — не наказываем дважды
                return snapshot(False)

            me.warnings += 1
            fatal = me.warnings > WARNINGS_ALLOWED
            me.save(update_fields=["warnings"])
            if fatal:
                disqualify_participant(me, VIOLATION_LABELS[kind])
            Violation.objects.create(session=session, team=me.team, participant=me, kind=kind, fatal=fatal)

        return snapshot(True)
