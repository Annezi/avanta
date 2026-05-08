from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Auth (login fixed per plan)
    admin_login: str = "AvantaPrint"
    admin_password_hash: str = Field(
        ...,
        description="bcrypt hash of admin password",
    )
    jwt_secret: str = Field(..., min_length=16)
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30

    # Telegram
    bot_token: str = Field(..., min_length=20)
    bot_registration_secret: str = Field(..., min_length=8)
    # Comma-separated chat IDs that always receive bot notifications.
    telegram_forced_chat_ids: str = "-5230142394,-241757057"

    # Storage
    data_dir: Path = Path("./data")
    retention_days: int = 30

    # LibreOffice (Windows: often "C:\\Program Files\\LibreOffice\\program\\soffice.exe")
    libreoffice_path: str = "soffice"

    # CORS — comma-separated origins, or * for dev (not recommended prod)
    cors_origins: str = "*"

    timezone: str = "Europe/Moscow"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def cors_origins_list() -> List[str]:
    s = get_settings().cors_origins.strip()
    if s == "*":
        return ["*"]
    return [o.strip() for o in s.split(",") if o.strip()]
