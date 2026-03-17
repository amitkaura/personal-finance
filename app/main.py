"""Personal Finance API - FastAPI application."""

from __future__ import annotations

from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threading import Lock
from time import time
from typing import Protocol

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis, from_url
from sqlalchemy import text

from app.config import get_settings
from app.database import create_db_and_tables, engine
from app.routes.accounts import router as accounts_router
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.budgets import router as budgets_router
from app.routes.categories import router as categories_router
from app.routes.goals import router as goals_router
from app.routes.household import router as household_router
from app.routes.net_worth import router as net_worth_router
from app.routes.plaid import router as plaid_router
from app.routes.reports import router as reports_router
from app.routes.settings import router as settings_router
from app.routes.tags import router as tags_router
from app.routes.transactions import router as transactions_router
from app.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_startup_settings()
    await _initialize_rate_limiter_backend()
    create_db_and_tables()
    _migrate_user_admin_fields()
    _migrate_timestamps()
    _migrate_llm_fields_to_household()
    _migrate_sync_fields_to_household()
    _migrate_household_plaid_mode()
    _migrate_household_llm_mode()
    _backfill_orphan_households()
    settings = get_settings()
    if settings.run_scheduler:
        start_scheduler()
    yield
    if settings.run_scheduler:
        stop_scheduler()
    await _shutdown_rate_limiter_backend()


def _migrate_llm_fields_to_household() -> None:
    """Drop legacy LLM columns from user_settings (moved to household_llm_configs)."""
    import logging

    logger = logging.getLogger(__name__)
    stmts = [
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS llm_base_url",
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS llm_api_key",
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS llm_model",
    ]
    with engine.connect() as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        conn.commit()
    logger.info("LLM field migration check complete")


def _migrate_sync_fields_to_household() -> None:
    """Drop legacy sync columns from user_settings and backfill HouseholdSyncConfig."""
    import logging
    from sqlmodel import Session, select
    from app.models import Household, HouseholdSyncConfig

    logger = logging.getLogger(__name__)
    stmts = [
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS sync_enabled",
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS sync_hour",
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS sync_minute",
        "ALTER TABLE user_settings DROP COLUMN IF EXISTS sync_timezone",
    ]
    with engine.connect() as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass
        conn.commit()

    with Session(engine) as session:
        existing_hh_ids = set(
            session.exec(select(HouseholdSyncConfig.household_id)).all()
        )
        all_hh_ids = set(session.exec(select(Household.id)).all())
        missing = all_hh_ids - existing_hh_ids
        for hh_id in missing:
            session.add(HouseholdSyncConfig(household_id=hh_id))
        if missing:
            session.commit()
            logger.info("Backfilled HouseholdSyncConfig for %d household(s)", len(missing))

    logger.info("Sync field migration check complete")


def _backfill_orphan_households() -> None:
    """Create a personal household for any existing user who doesn't have one."""
    import logging
    from sqlmodel import Session, select
    from app.models import Household, HouseholdMember, User

    logger = logging.getLogger(__name__)
    with Session(engine) as session:
        all_user_ids = set(session.exec(select(User.id)).all())
        member_user_ids = set(session.exec(select(HouseholdMember.user_id)).all())
        orphans = all_user_ids - member_user_ids
        if not orphans:
            return
        logger.info("Backfilling households for %d orphan user(s)", len(orphans))
        for uid in orphans:
            user = session.get(User, uid)
            if not user:
                continue
            hh = Household(name=f"{user.name}'s Household")
            session.add(hh)
            session.flush()
            session.add(HouseholdMember(household_id=hh.id, user_id=user.id, role="owner"))
        session.commit()
        logger.info("Backfill complete")


def _migrate_user_admin_fields() -> None:
    """Add is_admin and is_disabled columns to users table."""
    import logging

    logger = logging.getLogger(__name__)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false"))
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false"))
        except Exception:
            conn.rollback()
        conn.commit()
    logger.info("User admin fields migration check complete")


def _migrate_household_plaid_mode() -> None:
    """Add plaid_mode column to households and backfill existing rows to 'byok'."""
    import logging

    logger = logging.getLogger(__name__)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE households ADD COLUMN IF NOT EXISTS plaid_mode varchar"))
        except Exception:
            conn.rollback()
        conn.execute(text("UPDATE households SET plaid_mode = 'byok' WHERE plaid_mode IS NULL"))
        conn.commit()
    logger.info("Household plaid_mode migration check complete")


def _migrate_household_llm_mode() -> None:
    """Add llm_mode column to households (nullable, no backfill needed)."""
    import logging

    logger = logging.getLogger(__name__)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE households ADD COLUMN IF NOT EXISTS llm_mode varchar"))
        except Exception:
            conn.rollback()
        conn.commit()
    logger.info("Household llm_mode migration check complete")


def _migrate_timestamps() -> None:
    """Add created_at/updated_at columns to all tables."""
    import logging

    logger = logging.getLogger(__name__)

    created_at_tables = [
        "plaid_items", "accounts", "transactions", "categories",
        "category_rules", "user_settings", "budgets", "spending_preferences",
        "goal_account_links", "net_worth_snapshots", "account_balance_snapshots",
        "tags", "transaction_tags", "household_plaid_configs", "app_plaid_config",
        "household_llm_configs", "app_llm_config", "household_sync_configs",
    ]
    updated_at_tables = created_at_tables + [
        "users", "goals", "goal_contributions", "households",
        "household_invitations", "household_members", "activity_log", "error_log",
    ]

    with engine.connect() as conn:
        for t in created_at_tables:
            try:
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS "
                    "created_at timestamp without time zone NOT NULL DEFAULT now()"
                ))
            except Exception:
                pass
        for t in updated_at_tables:
            try:
                conn.execute(text(
                    f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS "
                    "updated_at timestamp without time zone"
                ))
            except Exception:
                pass
        conn.commit()
    logger.info("Timestamp migration check complete")


def _validate_startup_settings() -> None:
    """Validate critical runtime settings before serving requests."""
    settings = get_settings()
    missing = []
    if not settings.jwt_secret:
        missing.append("JWT_SECRET")
    if settings.jwt_secret == "change-me-in-production":
        missing.append("JWT_SECRET (must not use insecure default)")
    if not settings.google_client_id:
        missing.append("GOOGLE_CLIENT_ID")
    if not settings.encryption_key:
        missing.append("ENCRYPTION_KEY")
    if not settings.debug and not settings.secure_cookies:
        missing.append("SECURE_COOKIES=true (required when DEBUG=false)")
    if settings.rate_limit_backend not in {"memory", "redis"}:
        missing.append("RATE_LIMIT_BACKEND must be either 'memory' or 'redis'")
    if settings.rate_limit_backend == "redis" and not settings.redis_url:
        missing.append("REDIS_URL (required when RATE_LIMIT_BACKEND=redis)")
    if missing:
        raise RuntimeError(f"Missing/invalid required settings: {', '.join(missing)}")


@dataclass(frozen=True)
class _RateLimitRule:
    prefix: str
    limit: int


class _InMemoryRateLimiter:
    """Simple fixed-window rate limiter with per-IP buckets."""

    def __init__(self, window_seconds: int = 60):
        self.window_seconds = window_seconds
        self._lock = Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def allow(self, key: str, limit: int) -> tuple[bool, int]:
        now = time()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(bucket[0] + self.window_seconds - now))
                return False, retry_after
            bucket.append(now)
            return True, 0


class _RateLimiterBackend(Protocol):
    async def allow(self, key: str, limit: int) -> tuple[bool, int]:
        ...


class _RedisRateLimiter:
    """Distributed fixed-window rate limiter backed by Redis."""

    def __init__(self, redis: Redis, window_seconds: int = 60):
        self.redis = redis
        self.window_seconds = window_seconds

    async def allow(self, key: str, limit: int) -> tuple[bool, int]:
        redis_key = f"rl:{key}"
        count = await self.redis.incr(redis_key)
        if count == 1:
            await self.redis.expire(redis_key, self.window_seconds)
        if count > limit:
            retry_after = await self.redis.ttl(redis_key)
            return False, max(1, int(retry_after if retry_after > 0 else 1))
        return True, 0


app = FastAPI(
    title="Personal Finance API",
    description="Self-hosted personal finance system with Plaid integration.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request: Request, exc: RequestValidationError):
    errors = exc.errors()
    field_errors: list[dict[str, str]] = []
    for err in errors:
        loc = err.get("loc", ())
        field = ".".join(str(part) for part in loc if part != "body")
        field_errors.append(
            {
                "field": field,
                "message": str(err.get("msg", "Invalid value.")),
                "code": str(err.get("type", "validation_error")),
            }
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "message": "Validation failed.",
            "detail": errors,
            "field_errors": field_errors,
        },
    )

settings = get_settings()
allow_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_redis_client: Redis | None = None
_rate_limiter: _RateLimiterBackend = _InMemoryRateLimiter(window_seconds=60)
_rate_limit_rules = [
    _RateLimitRule("/api/v1/auth", settings.auth_rate_limit_per_minute),
    _RateLimitRule("/api/v1/plaid", settings.plaid_rate_limit_per_minute),
]


async def _initialize_rate_limiter_backend() -> None:
    global _redis_client, _rate_limiter
    if settings.rate_limit_backend != "redis":
        _rate_limiter = _InMemoryRateLimiter(window_seconds=60)
        return
    _redis_client = from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    await _redis_client.ping()
    _rate_limiter = _RedisRateLimiter(_redis_client, window_seconds=60)


async def _shutdown_rate_limiter_backend() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


def _client_ip(request: Request) -> str:
    if settings.rate_limit_trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    client = request.client.host if request.client else None
    return client or "unknown"


def _limit_for_path(path: str) -> int | None:
    for rule in _rate_limit_rules:
        if path.startswith(rule.prefix):
            return rule.limit
    if path.startswith("/api/v1"):
        return settings.rate_limit_per_minute
    return None


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    if settings.secure_cookies and not settings.debug:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not settings.rate_limit_enabled:
        return await call_next(request)

    limit = _limit_for_path(request.url.path)
    if limit is None:
        return await call_next(request)

    bucket_key = f"{request.method}:{request.url.path}:{_client_ip(request)}"
    allowed, retry_after = await _rate_limiter.allow(bucket_key, limit)
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many requests"},
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(limit),
            },
        )
    return await call_next(request)


app.include_router(admin_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(household_router, prefix="/api/v1")
app.include_router(plaid_router, prefix="/api/v1")
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(transactions_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(budgets_router, prefix="/api/v1")
app.include_router(goals_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(net_worth_router, prefix="/api/v1")
app.include_router(tags_router, prefix="/api/v1")
app.include_router(categories_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness_check():
    checks: dict[str, str] = {}

    # DB readiness: ensure we can perform a basic query.
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    # Redis readiness is only required when Redis backend is configured.
    if settings.rate_limit_backend == "redis":
        temp_client = None
        try:
            if _redis_client:
                await _redis_client.ping()
            else:
                temp_client = from_url(
                    settings.redis_url, encoding="utf-8", decode_responses=True
                )
                await temp_client.ping()
            checks["redis"] = "ok"
        except Exception:
            checks["redis"] = "error"
        finally:
            if temp_client:
                await temp_client.aclose()
    else:
        checks["redis"] = "skipped"

    if any(status_value == "error" for status_value in checks.values()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "degraded", "checks": checks},
        )
    return {"status": "ok", "checks": checks}
