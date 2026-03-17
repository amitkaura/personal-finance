"""Database connection and session management."""

import logging
from datetime import datetime, timezone

from sqlalchemy import event, inspect as sa_inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings
import app.models as _models  # noqa: F401 — registers table metadata with SQLModel

logger = logging.getLogger(__name__)

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


def _safe_default(pg_type: str, *, is_pg: bool = True) -> str:
    """Return a safe DEFAULT literal for a given column type."""
    t = pg_type.upper()
    if "BOOL" in t:
        return "false"
    if "INT" in t or "SERIAL" in t:
        return "0"
    if "NUMERIC" in t or "DECIMAL" in t or "FLOAT" in t or "DOUBLE" in t:
        return "0"
    if "TIMESTAMP" in t or "DATE" in t:
        return "now()" if is_pg else "CURRENT_TIMESTAMP"
    return "''"


def auto_sync_columns(target_engine=None) -> list[str]:
    """Add any columns defined in SQLModel metadata but missing from the DB.

    Returns a list of ``table.column`` strings that were added.
    Accepts an optional *target_engine* for testing; defaults to the
    module-level engine.
    """
    eng = target_engine or engine
    inspector = sa_inspect(eng)
    db_tables = set(inspector.get_table_names())
    is_pg = eng.dialect.name == "postgresql"
    added: list[str] = []

    with eng.connect() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in db_tables:
                continue

            existing = {c["name"] for c in inspector.get_columns(table.name)}

            for col in table.columns:
                if col.name in existing:
                    continue

                col_type = col.type.compile(dialect=eng.dialect)
                if_not_exists = "IF NOT EXISTS " if is_pg else ""
                parts = [
                    f"ALTER TABLE {table.name} ADD COLUMN "
                    f'{if_not_exists}"{col.name}" {col_type}'
                ]

                if not col.nullable:
                    parts.append("NOT NULL")
                    if col.server_default is not None:
                        parts.append(f"DEFAULT {col.server_default.arg}")
                    else:
                        parts.append(f"DEFAULT {_safe_default(str(col_type), is_pg=is_pg)}")
                elif col.server_default is not None:
                    parts.append(f"DEFAULT {col.server_default.arg}")

                stmt = " ".join(parts)
                try:
                    conn.execute(text(stmt))
                    added.append(f"{table.name}.{col.name}")
                except Exception as exc:
                    logger.warning("auto_sync_columns: failed %s.%s: %s", table.name, col.name, exc)

        conn.commit()

    if added:
        logger.info("auto_sync_columns added %d column(s): %s", len(added), ", ".join(added))
    else:
        logger.info("auto_sync_columns: schema up to date")
    return added


@event.listens_for(Session, "before_flush")
def _set_updated_at(session, flush_context, instances):
    for obj in session.dirty:
        if hasattr(obj, "updated_at"):
            obj.updated_at = datetime.now(timezone.utc)


def get_session():
    """Dependency that yields a database session."""
    with Session(engine) as session:
        yield session
