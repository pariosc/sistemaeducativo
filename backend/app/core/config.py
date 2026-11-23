from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.core.validation import is_valid_cookie_name, is_valid_origin

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: str = "development"
    database_url: str = (
        "postgresql+psycopg://academico:academico_dev_only@localhost:55432/academico"
    )
    session_cookie_name: str = "academico_session"
    session_ttl_hours: int = 8
    session_cookie_secure: bool = False
    initial_admin_ci: str = "admin"
    initial_admin_nombres: str = "Administrador"
    initial_admin_apellidos: str = "Principal"
    initial_admin_correo: str = "admin@example.com"
    initial_admin_telefono: str = "0000000000"
    initial_admin_password: str = ""
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("app_env")
    @classmethod
    def valid_app_env(cls, value: str) -> str:
        if value not in {"development", "test", "production"}:
            raise ValueError("APP_ENV debe ser development, test o production")
        return value

    @field_validator("session_cookie_name")
    @classmethod
    def valid_cookie_name(cls, value: str) -> str:
        if not is_valid_cookie_name(value):
            raise ValueError("SESSION_COOKIE_NAME solo admite letras, números, - y _ (1-64)")
        return value

    @field_validator("session_ttl_hours")
    @classmethod
    def valid_ttl(cls, value: int) -> int:
        if not 1 <= value <= 24:
            raise ValueError("SESSION_TTL_HOURS debe estar entre 1 y 24")
        return value

    @field_validator("session_cookie_secure")
    @classmethod
    def secure_cookie_in_production(cls, value: bool, info) -> bool:
        if info.data.get("app_env") == "production" and not value:
            raise ValueError("SESSION_COOKIE_SECURE debe ser true en producción")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: str | list[str]) -> list[str]:
        origins = (
            [origin.strip() for origin in value.split(",") if origin.strip()]
            if isinstance(value, str)
            else list(value)
        )
        if not origins:
            raise ValueError("CORS_ORIGINS debe contener al menos un origen")
        for origin in origins:
            if not is_valid_origin(origin):
                raise ValueError(f"Origen inválido en CORS_ORIGINS: {origin}")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
