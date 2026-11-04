"""Настройки Django для AO Studio."""
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Локальные настройки (DATABASE_URL и т.п.) из backend/.env — файл не коммитится
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-change-me-ao-studio")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

# На Vercel: VERCEL=1 и адреса деплоя приходят из окружения
ON_VERCEL = os.environ.get("VERCEL") == "1"
VERCEL_HOSTS = [
    h for h in (os.environ.get("VERCEL_URL"), os.environ.get("VERCEL_PROJECT_PRODUCTION_URL"),
                os.environ.get("VERCEL_BRANCH_URL")) if h
]
ALLOWED_HOSTS += VERCEL_HOSTS
CSRF_TRUSTED_ORIGINS = [
    o
    for o in os.environ.get(
        "CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o
] + [f"https://{h}" for h in VERCEL_HOSTS]

INSTALLED_APPS = [
    "core",  # свой runserver (собирает фронтенд) — должен быть перед staticfiles
    "jazzmin",  # тема админки — должна быть перед django.contrib.admin
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "users",
    "rooms",
    "game",
]

MIDDLEWARE = [
    "core.middleware.LocalhostRedirectMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# PostgreSQL через DATABASE_URL (postgres://user:pass@host:5432/db).
# Без переменной — SQLite для локальной разработки.
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        # В серверных функциях соединения не переиспользуются между вызовами
        conn_max_age=0 if ON_VERCEL else 600,
    )
}

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "ru"
TIME_ZONE = "Asia/Bishkek"
USE_I18N = True
USE_TZ = True

# Собранный React-фронтенд: Django раздаёт его файлы (/assets/…, /favicon.svg) через WhiteNoise,
# а для страниц сайта возвращает index.html (core.views.spa)
FRONTEND_DIR = BASE_DIR.parent / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None

STATIC_URL = "static/"
# На Vercel статика админки отдаётся WhiteNoise прямо из пакетов (без collectstatic)
WHITENOISE_USE_FINDERS = ON_VERCEL

# Загружаемые файлы: на Vercel — в Vercel Blob, локально — в backend/media
STORAGES = {
    "default": {
        "BACKEND": "core.storage.VercelBlobStorage"
        if os.environ.get("BLOB_READ_WRITE_TOKEN")
        else "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# Вход через Google: OAuth Client ID (тип «Web application») из Google Cloud Console.
# Пусто — кнопка Google на сайте не показывается.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
# Окно входа Google общается с сайтом через window.opener — строгий "same-origin" его ломает (белое окно)
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"

CORS_ALLOWED_ORIGINS = [
    o
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o
]

# За прокси Railway/Vercel — доверяем X-Forwarded-Proto
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Лимит загрузки (фото вопросов/аватары)
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# ---------- Админка (Jazzmin) ----------
JAZZMIN_SETTINGS = {
    "site_title": "AO Studio Admin",
    "site_header": "AO Studio",
    "site_brand": "AO Studio",
    "welcome_sign": "Панель администратора AO Studio",
    "copyright": "AO Studio",
    "search_model": ["users.User", "rooms.AORoom"],
    "topmenu_links": [
        {"name": "Главная админки", "url": "admin:index"},
        {"name": "Открыть сайт", "url": os.environ.get("FRONTEND_URL", "http://localhost:5173/"), "new_window": True},
    ],
    "show_sidebar": True,
    "navigation_expanded": True,
    "order_with_respect_to": ["users", "rooms", "game", "auth", "token_blacklist"],
    "hide_apps": ["token_blacklist"],
    "icons": {
        "users.User": "fas fa-user",
        "auth.Group": "fas fa-users-cog",
        "rooms.AORoom": "fas fa-gamepad",
        "rooms.Category": "fas fa-folder-open",
        "rooms.Question": "fas fa-question-circle",
        "game.GameSession": "fas fa-trophy",
        "game.Team": "fas fa-flag",
    },
    "changeform_format": "horizontal_tabs",
    "related_modal_active": True,
    "language_chooser": False,
}

JAZZMIN_UI_TWEAKS = {
    "theme": "darkly",
    "dark_mode_theme": "darkly",
    "navbar": "navbar-dark",
    "sidebar": "sidebar-dark-success",
    "accent": "accent-success",
    "brand_colour": "navbar-success",
    "button_classes": {
        "primary": "btn-success",
        "secondary": "btn-secondary",
        "info": "btn-outline-success",
        "warning": "btn-warning",
        "danger": "btn-danger",
        "success": "btn-success",
    },
}
