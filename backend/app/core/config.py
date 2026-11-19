from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

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
    def parse_origins(cls, value: str | list[str]) -> str | list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
