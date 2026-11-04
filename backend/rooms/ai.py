"""Сборка комнаты по описанию на обычном языке.

Ведущий пишет, чего хочет («комната «Бокс» на 6 вопросов, формат рандом» или сразу
со своими вопросами), модель возвращает заготовку комнаты в том же виде, в каком её
хранит редактор. Ничего не сохраняется: заготовка уходит в редактор, и ведущий правит
её перед сохранением — так ошибка модели не превращается в испорченную комнату.
"""
import json
import os

from django.conf import settings

from .models import AORoom

# Сколько вопросов разрешаем за один заход: и чтобы уложиться в таймаут функции,
# и чтобы случайная «тысяча вопросов» в промте не разорила автора
MAX_QUESTIONS = 30
MAX_CATEGORIES = 8
MAX_PROMPT = 2000

MODEL = "claude-opus-5-5"

# Схема ответа: модель обязана вернуть ровно это, разбирать свободный текст не нужно
QUESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "Текст вопроса"},
        "answer": {"type": "string", "description": "Короткий правильный ответ"},
        "alt_answers": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Другие формулировки того же ответа, которые тоже засчитываются",
        },
        "points": {
            "type": "integer",
            "description": "Стоимость вопроса. В классическом и рандоме всегда 1, в стратегическом от 1 до 5",
        },
    },
    "required": ["text", "answer", "alt_answers", "points"],
    "additionalProperties": False,
}

ROOM_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Название комнаты"},
        "format": {"type": "string", "enum": ["classic", "random", "strategic"]},
        "description": {"type": "string", "description": "Одно-два предложения о чём игра"},
        "timer_duration": {"type": "integer", "enum": list(AORoom.TIMER_CHOICES)},
        "categories": {
            "type": "array",
            "description": "Категории с вопросами. Пусто для формата random",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "questions": {"type": "array", "items": QUESTION_SCHEMA},
                },
                "required": ["name", "questions"],
                "additionalProperties": False,
            },
        },
        "questions": {
            "type": "array",
            "description": "Вопросы без категорий. Только для формата random, иначе пусто",
            "items": QUESTION_SCHEMA,
        },
    },
    "required": ["title", "format", "description", "timer_duration", "categories", "questions"],
    "additionalProperties": False,
}

SYSTEM = f"""Ты помогаешь ведущему собрать комнату для интеллектуальной игры «Акыл Ордо».
Отвечай только заготовкой комнаты по схеме.

Форматы:
- classic — вопросы разложены по категориям, каждый стоит 1 балл;
- random — без категорий, вопросы идут вперемешку, каждый стоит 1 балл;
- strategic — категории и цена вопроса от 1 до 5, как в «Своей игре»: в каждой категории
  вопросы разной стоимости, чем дороже, тем труднее.

Правила:
- формат бери из просьбы; если он не назван — classic, а если сказано «без категорий»
  или «вперемешку» — random;
- для random все вопросы клади в questions, а categories оставь пустым; для classic и
  strategic — наоборот, всё в categories, questions пустой;
- points: в classic и random всегда 1; в strategic — от 1 до 5;
- вопросы, которые ведущий написал сам, переноси дословно, ничего не переписывая, и
  ставь их первыми; остальные придумывай сам;
- ответ делай коротким — слово или имя, а не предложение. В alt_answers клади другие
  формулировки того же ответа (сокращения, латиница, падежи), чтобы в игре не спорили;
- вопросов не больше {MAX_QUESTIONS}, категорий не больше {MAX_CATEGORIES};
- всё пиши на языке просьбы; если язык неясен — по-русски;
- факты должны быть верными. Если не уверен в факте — бери другой вопрос."""


class AIError(Exception):
    """Понятная ведущему причина, почему заготовку собрать не вышло."""


def api_key():
    return os.environ.get("ANTHROPIC_API_KEY", "")


def available():
    return bool(api_key())


def _clean_question(raw, one_point):
    text = str(raw.get("text", "")).strip()[:2000]
    answer = str(raw.get("answer", "")).strip()[:500]
    if not text or not answer:
        return None
    alt = [str(a).strip()[:500] for a in (raw.get("alt_answers") or []) if str(a).strip()]
    try:
        points = int(raw.get("points", 1))
    except (TypeError, ValueError):
        points = 1
    return {
        "text": text,
        "answer": answer,
        # Модель иногда щедра на синонимы — в редакторе их больше десяти не помещается
        "alt_answers": alt[:10],
        "points": 1 if one_point else min(5, max(1, points)),
    }


def _clean(draft):
    """Приводим ответ модели к тому, что принимает редактор, и чиним мелкие вольности."""
    fmt = draft.get("format")
    if fmt not in dict(AORoom.FORMAT_CHOICES):
        fmt = AORoom.FORMAT_CLASSIC
    one_point = fmt in AORoom.ONE_POINT_FORMATS

    timer = draft.get("timer_duration")
    if timer not in AORoom.TIMER_CHOICES:
        timer = 60

    categories, questions, total = [], [], 0
    if fmt in AORoom.CATEGORY_FORMATS:
        for cat in (draft.get("categories") or [])[:MAX_CATEGORIES]:
            name = str(cat.get("name", "")).strip()[:100]
            items = []
            for raw in cat.get("questions") or []:
                if total >= MAX_QUESTIONS:
                    break
                q = _clean_question(raw, one_point)
                if q:
                    items.append(q)
                    total += 1
            if name and items:
                categories.append({"name": name, "questions": items})
        # Модель перепутала формат и сложила всё в questions — не теряем вопросы
        if not categories and draft.get("questions"):
            items = [q for q in (_clean_question(r, one_point) for r in draft["questions"][:MAX_QUESTIONS]) if q]
            if items:
                categories = [{"name": "Общая", "questions": items}]
                total = len(items)
    else:
        for raw in (draft.get("questions") or []) + [
            q for c in (draft.get("categories") or []) for q in (c.get("questions") or [])
        ]:
            if total >= MAX_QUESTIONS:
                break
            q = _clean_question(raw, one_point)
            if q:
                questions.append(q)
                total += 1

    if not total:
        raise AIError("Не удалось собрать ни одного вопроса. Попробуйте описать игру подробнее.")

    return {
        "title": str(draft.get("title", "")).strip()[:200] or "Новая игра",
        "format": fmt,
        "description": str(draft.get("description", "")).strip()[:1000],
        "timer_duration": timer,
        "categories": categories,
        "questions": questions,
    }


def generate_room(prompt: str):
    """Просит модель собрать заготовку комнаты. Возвращает её в виде, понятном редактору."""
    prompt = (prompt or "").strip()
    if len(prompt) < 5:
        raise AIError("Опишите, какая нужна игра: тема, сколько вопросов, формат.")
    if not available():
        raise AIError("Сборка по описанию не настроена: у сайта нет ключа ANTHROPIC_API_KEY.")

    try:
        import anthropic
    except ImportError as e:  # пакет не установлен на сервере
        raise AIError("Сборка по описанию недоступна: на сервере нет пакета anthropic.") from e

    client = anthropic.Anthropic(api_key=api_key(), timeout=settings.AI_TIMEOUT, max_retries=1)
    try:
        # Поток — чтобы длинный ответ не упёрся в таймаут HTTP, пока модель пишет вопросы
        with client.messages.stream(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": ROOM_SCHEMA}},
            messages=[{"role": "user", "content": prompt[:MAX_PROMPT]}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.APIStatusError as e:
        if e.status_code == 401:
            raise AIError("Ключ ANTHROPIC_API_KEY не принят.") from e
        if e.status_code == 429:
            raise AIError("Слишком много запросов к ИИ подряд. Подождите минуту и попробуйте снова.") from e
        raise AIError("ИИ сейчас не отвечает. Попробуйте ещё раз через минуту.") from e
    except anthropic.APIConnectionError as e:
        raise AIError("Не удалось связаться с ИИ. Проверьте связь и попробуйте снова.") from e

    if message.stop_reason == "refusal":
        raise AIError("ИИ не стал собирать игру на эту тему. Сформулируйте просьбу иначе.")

    text = next((b.text for b in message.content if b.type == "text"), "")
    try:
        draft = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError("ИИ вернул ответ, который не удалось разобрать. Попробуйте ещё раз.") from e
    return _clean(draft)
