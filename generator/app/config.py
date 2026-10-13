from pathlib import Path

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

# generator/.env, found regardless of the directory the service is started from
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8")

    ollama_url: str
    ollama_model: str
    ollama_timeout: float = 120
    ollama_num_ctx: int = 12288


def load_settings() -> Settings:
    """Load the settings, or stop the service with a readable message."""
    try:
        return Settings()
    except ValidationError as exc:
        names = ", ".join(str(error["loc"][0]).upper() for error in exc.errors())
        raise SystemExit(f"Invalid or missing environment variables: {names}") from None
