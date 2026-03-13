"""Application configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql://postgres:postgres@db:5432/finance"
    db_pool_size: int = 5
    db_max_overflow: int = 10

    # Plaid (set via env vars - never commit real values)
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"  # sandbox | development | production

    # Encryption key for access tokens (32 bytes hex = 64 chars)
    encryption_key: str = ""

    # Google OAuth
    google_client_id: str = ""

    # JWT session secret
    jwt_secret: str = ""

    # LLM categorization (OpenAI-compatible API — works with OpenAI, Ollama, etc.)
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    # Scheduled sync (cron-style, runs daily by default at midnight)
    sync_enabled: bool = True
    sync_hour: int = 0
    sync_minute: int = 0
    sync_timezone: str = "America/Toronto"

    # Email (SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "FinanceApp"
    smtp_use_tls: bool = True
    app_url: str = "http://localhost:3000"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    secure_cookies: bool = False
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    run_scheduler: bool = True
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 120
    auth_rate_limit_per_minute: int = 30
    plaid_rate_limit_per_minute: int = 60
    rate_limit_trust_proxy: bool = False
    rate_limit_backend: str = "memory"  # memory | redis
    redis_url: str = "redis://redis:6379/0"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
