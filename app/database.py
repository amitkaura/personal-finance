"""Database connection and session management."""

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings
from app.models import Account, CategoryRule, PlaidItem, Transaction

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
