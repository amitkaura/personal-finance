"""Tests for auto_sync_columns — ensures model-to-DB schema consistency."""

import pytest
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from app.database import auto_sync_columns


@pytest.fixture()
def sync_engine():
    """Fresh SQLite engine with all tables created."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    yield eng
    SQLModel.metadata.drop_all(eng)


class TestAllModelColumnsExist:
    """Every column defined in every SQLModel table class must exist in the DB."""

    def test_all_columns_present(self, sync_engine):
        inspector = sa_inspect(sync_engine)
        missing = []

        for table in SQLModel.metadata.sorted_tables:
            db_cols = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name not in db_cols:
                    missing.append(f"{table.name}.{col.name}")

        assert missing == [], (
            f"Columns defined in models but missing from DB: {missing}"
        )


class TestAutoSyncAddsColumns:
    """auto_sync_columns() should detect and add missing columns."""

    def test_adds_dropped_boolean_column(self, sync_engine):
        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN is_admin"))
            conn.commit()

        inspector = sa_inspect(sync_engine)
        assert "is_admin" not in {
            c["name"] for c in inspector.get_columns("users")
        }

        added = auto_sync_columns(target_engine=sync_engine)

        inspector = sa_inspect(sync_engine)
        cols = {c["name"] for c in inspector.get_columns("users")}
        assert "is_admin" in cols
        assert "users.is_admin" in added

    def test_adds_dropped_varchar_column(self, sync_engine):
        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN name"))
            conn.commit()

        added = auto_sync_columns(target_engine=sync_engine)

        inspector = sa_inspect(sync_engine)
        assert "name" in {c["name"] for c in inspector.get_columns("users")}
        assert "users.name" in added

    def test_adds_dropped_timestamp_column(self, sync_engine):
        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN created_at"))
            conn.commit()

        added = auto_sync_columns(target_engine=sync_engine)

        inspector = sa_inspect(sync_engine)
        assert "created_at" in {
            c["name"] for c in inspector.get_columns("users")
        }
        assert "users.created_at" in added

    def test_adds_dropped_nullable_column(self, sync_engine):
        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN picture"))
            conn.commit()

        added = auto_sync_columns(target_engine=sync_engine)

        inspector = sa_inspect(sync_engine)
        assert "picture" in {
            c["name"] for c in inspector.get_columns("users")
        }
        assert "users.picture" in added

    def test_adds_multiple_dropped_columns(self, sync_engine):
        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN is_admin"))
            conn.execute(text("ALTER TABLE users DROP COLUMN is_disabled"))
            conn.execute(text("ALTER TABLE users DROP COLUMN created_at"))
            conn.commit()

        added = auto_sync_columns(target_engine=sync_engine)

        inspector = sa_inspect(sync_engine)
        cols = {c["name"] for c in inspector.get_columns("users")}
        assert "is_admin" in cols
        assert "is_disabled" in cols
        assert "created_at" in cols
        assert len([a for a in added if a.startswith("users.")]) == 3

    def test_adds_columns_across_multiple_tables(self, sync_engine):
        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN is_admin"))
            conn.execute(text("ALTER TABLE accounts DROP COLUMN is_linked"))
            conn.commit()

        added = auto_sync_columns(target_engine=sync_engine)

        assert "users.is_admin" in added
        assert "accounts.is_linked" in added

    def test_noop_when_schema_complete(self, sync_engine):
        added = auto_sync_columns(target_engine=sync_engine)
        assert added == []

    def test_existing_rows_preserved(self, sync_engine):
        with Session(sync_engine) as sess:
            sess.execute(
                text(
                    "INSERT INTO users (google_id, email, name, is_admin, is_disabled, created_at) "
                    "VALUES ('g1', 'a@b.com', 'Test', 0, 0, '2026-01-01 00:00:00')"
                )
            )
            sess.commit()

        with sync_engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP COLUMN is_admin"))
            conn.commit()

        auto_sync_columns(target_engine=sync_engine)

        with Session(sync_engine) as sess:
            row = sess.execute(text("SELECT email, is_admin FROM users")).first()
            assert row[0] == "a@b.com"
            assert row[1] is not None  # default was applied
