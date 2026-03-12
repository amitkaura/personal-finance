"""Database connection and session management."""

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings
import app.models as _models  # noqa: F401 — registers table metadata with SQLModel

settings = get_settings()
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)


def create_db_and_tables() -> None:
    """Create all database tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency that yields a database session."""
    with Session(engine) as session:
        yield session
