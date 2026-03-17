"""Database connection and session management."""

from datetime import datetime, timezone

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings
import app.models as _models  # noqa: F401 — registers table metadata with SQLModel

settings = get_settings()

_engine_kwargs: dict = {
    "echo": settings.debug,
    "pool_pre_ping": True,
}
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs["pool_size"] = settings.db_pool_size
    _engine_kwargs["max_overflow"] = settings.db_max_overflow

_db_url = settings.database_url
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(_db_url, **_engine_kwargs)


def create_db_and_tables() -> None:
    """Create all database tables."""
    SQLModel.metadata.create_all(engine)


@event.listens_for(Session, "before_flush")
def _set_updated_at(session, flush_context, instances):
    for obj in session.dirty:
        if hasattr(obj, "updated_at"):
            obj.updated_at = datetime.now(timezone.utc)


def get_session():
    """Dependency that yields a database session."""
    with Session(engine) as session:
        yield session
