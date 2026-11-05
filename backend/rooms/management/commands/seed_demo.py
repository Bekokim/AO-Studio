"""Создаёт демо-пользователя и примеры AO комнат всех трёх форматов.

Запуск: python manage.py seed_demo
Логин: demo / demo-ao-2026
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from rooms.models import AORoom
from rooms.serializers import RoomWriteSerializer

DEMO_USERNAME = "demo"
DEMO_EMAIL = "demo@aostudio.kg"
DEMO_PASSWORD = "demo-ao-2026"

ROOMS = [
    {
        "title": "Кыргызстан: история и география",
        "format": "classic",
        "timer_duration": 60,
        "description": "Классическая разминка о родной стране.",
        "categories": [
            {"name": "География", "questions": [
                {"text": "Какое озеро — крупнейшее в Кыргызстане?", "answer": "Иссык-Куль", "points": 1},
                {"text": "Как называется самая высокая точка Кыргызстана?", "answer": "Пик Жеңиш (Победы)", "points": 2},
                {"text": "Столица Кыргызстана?", "answer": "Бишкек", "points": 1},
            ]},
            {"name": "Культура", "questions": [
                {"text": "Как называется кыргызский эпос — один из самых объёмных в мире?", "answer": "Манас", "points": 2},
                {"text": "Трёхструнный кыргызский музыкальный инструмент?", "answer": "Комуз", "points": 1},
                {"text": "Как называется войлочная юрта по-кыргызски?", "answer": "Боз үй", "points": 3},
            ]},
        ],
    },
    {
        "title": "Своя игра: IT",
        "format": "strategic",
        "timer_duration": 45,
        "description": "Программирование и компьютеры — по стоимости как в «Своей игре».",
        "categories": [
            {"name": "Python", "questions": [
                {"text": "Какой оператор выводит текст на экран?", "answer": "print()", "points": 1},
                {"text": "Как называется неизменяемый список?", "answer": "Кортеж (tuple)", "points": 2},
                {"text": "Что вернёт len('Акыл')?", "answer": "4", "points": 3},
                {"text": "Ключевое слово для объявления генератора?", "answer": "yield", "points": 4},
                {"text": "Что такое GIL?", "answer": "Global Interpreter Lock", "points": 5},
            ]},
            {"name": "Web", "questions": [
                {"text": "Что означает HTML?", "answer": "HyperText Markup Language", "points": 1},
                {"text": "Какой HTTP-код означает «Не найдено»?", "answer": "404", "points": 2},
                {"text": "Язык стилей веб-страниц?", "answer": "CSS", "points": 3},
                {"text": "Какой метод HTTP используется для создания ресурса?", "answer": "POST", "points": 4},
                {"text": "Что такое CORS?", "answer": "Cross-Origin Resource Sharing", "points": 5},
            ]},
            {"name": "Железо", "questions": [
                {"text": "Мозг компьютера — это…", "answer": "Процессор (CPU)", "points": 1},
                {"text": "Сколько бит в байте?", "answer": "8", "points": 2},
                {"text": "Энергозависимая память компьютера?", "answer": "ОЗУ (RAM)", "points": 3},
                {"text": "Что означает SSD?", "answer": "Solid State Drive", "points": 4},
                {"text": "Кто считается первым программистом?", "answer": "Ада Лавлейс", "points": 5},
            ]},
        ],
    },
    {
        "title": "Эрудит вслепую",
        "format": "random",
        "timer_duration": 30,
        "description": "Скрытые карточки с вопросами обо всём на свете.",
        "questions": [
            {"text": "Сколько континентов на Земле?", "answer": "7"},
            {"text": "Самая длинная река в мире?", "answer": "Нил (или Амазонка)"},
            {"text": "Химический символ золота?", "answer": "Au"},
            {"text": "Кто написал «Белый пароход»?", "answer": "Чингиз Айтматов"},
            {"text": "Сколько планет в Солнечной системе?", "answer": "8"},
            {"text": "Самое большое животное на Земле?", "answer": "Синий кит"},
            {"text": "Сколько сторон у шестиугольника?", "answer": "6"},
            {"text": "Самый лёгкий химический элемент?", "answer": "Водород"},
            {"text": "Сколько минут в сутках?", "answer": "1440"},
            {"text": "Какая планета — красная?", "answer": "Марс"},
            {"text": "В каком году человек впервые полетел в космос?", "answer": "1961"},
            {"text": "Сколько струн у комуза?", "answer": "3"},
        ],
    },
    {
        "title": "Python с нуля",
        "format": "classic",
        "timer_duration": 60,
        "description": "Десять простых вопросов для тех, кто только начинает программировать.",
        "categories": [
            {"name": "О языке", "questions": [
                {"text": "Кто создал язык Python?", "answer": "Гвидо ван Россум",
                 "alt_answers": ["Гвидо", "ван Россум", "Guido van Rossum", "Van Rossum"]},
                {"text": "В каком году появился Python?", "answer": "1991",
                 "alt_answers": ["в 1991 году", "1991 год"]},
            ]},
            {"name": "Математика", "questions": [
                {"text": "Сколько будет 7 + 5?", "answer": "12"},
                {"text": "Сколько будет 10 - 4?", "answer": "6"},
                {"text": "Сколько будет 6 * 7?", "answer": "42"},
                # В Python деление всегда даёт дробь, поэтому 5.0 засчитываем наравне с 5
                {"text": "Что выведет 20 / 4?", "answer": "5", "alt_answers": ["5.0", "пять"]},
                {"text": "Сколько будет 10 % 3 — остаток от деления?", "answer": "1",
                 "alt_answers": ["один"]},
            ]},
            {"name": "Ввод и вывод", "questions": [
                {"text": "Какая команда выводит текст на экран?", "answer": "print",
                 "alt_answers": ["print()", "принт"]},
                {"text": "Какая команда считывает то, что ввёл пользователь?", "answer": "input",
                 "alt_answers": ["input()", "инпут"]},
            ]},
            {"name": "Основы", "questions": [
                {"text": "Каким словом в Python обозначается истина?", "answer": "True",
                 "alt_answers": ["истина", "тру"]},
            ]},
        ],
    },
    {
        "title": "Гарри Поттер: своя игра",
        "format": "strategic",
        "timer_duration": 45,
        "description": "Две категории по пять вопросов: чем дороже клетка, тем глубже нужно знать книги.",
        "categories": [
            {"name": "Хогвартс", "questions": [
                {"text": "На каком факультете учился Гарри Поттер?", "answer": "Гриффиндор",
                 "alt_answers": ["Gryffindor"], "points": 1},
                # Номер платформы пишут и цифрами, и словами — засчитываем оба вида
                {"text": "С какой платформы вокзала Кингс-Кросс отходит «Хогвартс-экспресс»?",
                 "answer": "9¾", "alt_answers": ["9 3/4", "девять и три четверти", "три четверти", "9 и 3/4"],
                 "points": 2},
                # Снегг у Росмэна, Снейп в оригинале, Злей у Махаона — принимаем все переводы
                {"text": "Какой предмет ведёт Северус Снегг в первых книгах?", "answer": "Зельеварение",
                 "alt_answers": ["зелья", "варка зелий"], "points": 3},
                {"text": "Как называется карта, показывающая всех, кто находится в Хогвартсе?",
                 "answer": "Карта Мародёров", "alt_answers": ["Карта мародеров", "Мародёров"], "points": 4},
                {"text": "Кто из Мародёров умел превращаться в крысу?", "answer": "Питер Петтигрю",
                 "alt_answers": ["Петтигрю", "Хвост", "Питер"], "points": 5},
            ]},
            {"name": "Магия и твари", "questions": [
                {"text": "Каким заклинанием зажигают огонёк на конце палочки?", "answer": "Люмос",
                 "alt_answers": ["Lumos"], "points": 1},
                {"text": "Как называется спортивная игра волшебников на мётлах?", "answer": "Квиддич",
                 "alt_answers": ["Quidditch"], "points": 2},
                {"text": "Какое заклинание вызывает Патронуса?", "answer": "Экспекто Патронум",
                 "alt_answers": ["Expecto Patronum", "Экспекто патронум"], "points": 3},
                {"text": "Какие существа охраняют тюрьму Азкабан?", "answer": "Дементоры",
                 "alt_answers": ["дементор", "Dementors"], "points": 4},
                {"text": "Что лежит в сердцевине волшебной палочки Гарри?", "answer": "Перо феникса",
                 "alt_answers": ["перо Фоукса", "феникс", "перо феникса Фоукса"], "points": 5},
            ]},
        ],
    },
    {
        "title": "Мультфильмы: сложный раунд",
        "format": "random",
        "timer_duration": 45,
        "description": "Двадцать непростых вопросов о мультфильмах — от студии Гибли до «Ну, погоди!».",
        # Вопросы намеренно самодостаточны: к любому можно добавить кадр в редакторе,
        # но и без картинки на них отвечают — комната играется сразу
        "questions": [
            {"text": "Как зовут девочку, попавшую в мир духов в мультфильме «Унесённые призраками»?",
             "answer": "Тихиро", "alt_answers": ["Тихиро Огино", "Сэн"]},
            {"text": "Кто снял «Унесённые призраками» и «Мой сосед Тоторо»?", "answer": "Хаяо Миядзаки",
             "alt_answers": ["Миядзаки", "Hayao Miyazaki"]},
            {"text": "Какая студия сняла «Историю игрушек» — первый полностью компьютерный полнометражный мультфильм?",
             "answer": "Pixar", "alt_answers": ["Пиксар", "Пиксар"]},
            {"text": "Как зовут робота-мусорщика из мультфильма Pixar 2008 года о покинутой Земле?",
             "answer": "ВАЛЛ-И", "alt_answers": ["WALL-E", "Валли", "Волли"]},
            {"text": "В голове какой девочки происходит действие мультфильма «Головоломка»?",
             "answer": "Райли", "alt_answers": ["Riley", "Райли Андерсен"]},
            {"text": "Как зовут отца Симбы в «Короле Льве»?", "answer": "Муфаса", "alt_answers": ["Mufasa"]},
            {"text": "Как зовут брата Муфасы, который его убил?", "answer": "Шрам",
             "alt_answers": ["Scar", "Скар"]},
            {"text": "Какой мультфильм первым получил «Оскар» за лучший анимационный полнометражный фильм?",
             "answer": "Шрек", "alt_answers": ["Shrek"]},
            {"text": "Какая студия сняла «Шрека»?", "answer": "DreamWorks",
             "alt_answers": ["ДримВоркс", "Дримворкс", "DreamWorks Animation"]},
            {"text": "Как зовут пса главного героя в мультфильме «Тайна Коко»?", "answer": "Данте",
             "alt_answers": ["Dante"]},
            {"text": "Как зовут главного героя мультфильма «Как приручить дракона»?", "answer": "Иккинг",
             "alt_answers": ["Hiccup", "Икинг"]},
            {"text": "Как зовут дракона Иккинга?", "answer": "Беззубик", "alt_answers": ["Toothless"]},
            {"text": "Кто озвучил Джинна в диснеевском «Аладдине» 1992 года?", "answer": "Робин Уильямс",
             "alt_answers": ["Robin Williams", "Уильямс"]},
            {"text": "Как называется первый полнометражный мультфильм студии Disney?",
             "answer": "Белоснежка и семь гномов", "alt_answers": ["Белоснежка", "Snow White"]},
            {"text": "Как называется королевство из мультфильма «Холодное сердце»?", "answer": "Эренделл",
             "alt_answers": ["Арендейл", "Арендель", "Arendelle"]},
            {"text": "Как зовут крольчиху-полицейского из «Зверополиса»?", "answer": "Джуди Хоппс",
             "alt_answers": ["Джуди", "Judy Hopps"]},
            {"text": "Как зовут отца Немо в мультфильме «В поисках Немо»?", "answer": "Марлин",
             "alt_answers": ["Marlin", "Мерлин"]},
            {"text": "Кто снял мультфильм «Ёжик в тумане»?", "answer": "Юрий Норштейн",
             "alt_answers": ["Норштейн", "Норштейн Юрий"]},
            {"text": "В каком году вышел первый выпуск «Ну, погоди!»?", "answer": "1969",
             "alt_answers": ["в 1969", "1969 год"]},
            {"text": "Как называется короткометражка 1928 года, в которой Микки Маус впервые заговорил?",
             "answer": "Пароходик Вилли", "alt_answers": ["Steamboat Willie", "Пароход Вилли"]},
        ],
    },
]


class Command(BaseCommand):
    help = "Создать демо-пользователя и примеры AO комнат"

    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=DEMO_USERNAME, defaults={"email": DEMO_EMAIL}
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
        for data in ROOMS:
            if AORoom.objects.filter(author=user, title=data["title"]).exists():
                continue
            s = RoomWriteSerializer(data=data)
            s.is_valid(raise_exception=True)
            s.save(author=user)
        self.stdout.write(self.style.SUCCESS(
            f"Готово. Логин: {DEMO_USERNAME} / пароль: {DEMO_PASSWORD}"
        ))
