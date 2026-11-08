from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.images import AVATAR_MAX_SIDE, shrink_image

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    rooms_count = serializers.SerializerMethodField()
    games_played = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "avatar", "created_at", "rooms_count", "games_played"]
        read_only_fields = ["id", "email", "created_at"]

    def get_rooms_count(self, obj):
        # Только свои комнаты: сохранённые копии чужих игр считаются отдельно,
        # иначе число в профиле не сходится со списком «Созданные AO комнаты»
        return obj.rooms.filter(saved_from__isnull=True).count()

    def get_games_played(self, obj):
        return obj.hosted_sessions.count()


class PublicUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "avatar"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "password_confirm"]
        extra_kwargs = {
            "username": {"error_messages": {"unique": "Этот логин уже занят."}},
            "email": {"error_messages": {"unique": "Этот email уже зарегистрирован."}},
        }

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Этот email уже зарегистрирован.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Пароли не совпадают."})
        user = User(username=attrs["username"], email=attrs["email"])
        validate_password(attrs["password"], user)
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField()
    password = serializers.CharField(write_only=True)


class UpdateProfileSerializer(serializers.ModelSerializer):
    remove_avatar = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ["username", "avatar", "remove_avatar"]
        extra_kwargs = {"username": {"error_messages": {"unique": "Этот логин уже занят."}}}

    def validate_avatar(self, value):
        """Ужимаем снимок до AVATAR_MAX_SIDE: иначе браузер давит его в кружок 120 px и мылит."""
        content, name = shrink_image(value, AVATAR_MAX_SIDE, value.name)
        if content is None:
            # Формат не разобрался — пусть сохранится как есть, загрузку из-за этого не роняем
            return value
        value.file = content
        value.name = name
        value.size = content.size
        return value

    def update(self, instance, validated_data):
        if validated_data.pop("remove_avatar", False):
            instance.avatar.delete(save=False)
            instance.avatar = None
        # Старый файл в хранилище не нужен, иначе он остаётся висеть навсегда
        elif validated_data.get("avatar") and instance.avatar:
            instance.avatar.delete(save=False)
        return super().update(instance, validated_data)
