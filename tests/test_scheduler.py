"""Tests for scheduled reminder jobs."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch, MagicMock
from uuid import uuid4

from sqlmodel import Session

from tests.conftest import make_account, make_user


def test_send_statement_reminders_matching_day(session: Session):
    """Sends email when account's statement day matches today."""
    user = make_user(session, email="alice@test.com")
    make_account(session, user, name="Visa", statement_available_day=15)

    with (
        patch("app.scheduler.date") as mock_date,
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.send_statement_reminder_email") as mock_send,
    ):
        mock_date.today.return_value = date(2026, 3, 15)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import _send_statement_reminders
        _send_statement_reminders()

    mock_send.assert_called_once()
    call_args = mock_send.call_args
    assert call_args[0][0] == "alice@test.com"
    assert "Visa" in call_args[0][1]


def test_send_statement_reminders_deduplication(session: Session):
    """Skips accounts where reminder was already sent today."""
    user = make_user(session, email="bob@test.com")
    make_account(
        session, user, name="Amex",
        statement_available_day=15,
        last_statement_reminder_sent=date(2026, 3, 15),
    )

    with (
        patch("app.scheduler.date") as mock_date,
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.send_statement_reminder_email") as mock_send,
    ):
        mock_date.today.return_value = date(2026, 3, 15)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import _send_statement_reminders
        _send_statement_reminders()

    mock_send.assert_not_called()


def test_send_statement_reminders_last_day_fallback(session: Session):
    """Day 31 triggers on Feb 28 (last day of month)."""
    user = make_user(session, email="carol@test.com")
    make_account(session, user, name="RBC", statement_available_day=31)

    with (
        patch("app.scheduler.date") as mock_date,
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.send_statement_reminder_email") as mock_send,
    ):
        mock_date.today.return_value = date(2026, 2, 28)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import _send_statement_reminders
        _send_statement_reminders()

    mock_send.assert_called_once()
    assert "RBC" in mock_send.call_args[0][1]


def test_send_statement_reminders_no_accounts(session: Session):
    """No errors when no accounts have reminders configured."""
    with (
        patch("app.scheduler.date") as mock_date,
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.send_statement_reminder_email") as mock_send,
    ):
        mock_date.today.return_value = date(2026, 3, 15)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import _send_statement_reminders
        _send_statement_reminders()

    mock_send.assert_not_called()
