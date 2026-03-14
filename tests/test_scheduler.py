"""Tests for scheduled reminder jobs and per-household scheduler."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch, MagicMock, call
from uuid import uuid4

from sqlmodel import Session

from tests.conftest import (
    add_household_member,
    make_account,
    make_household,
    make_sync_config,
    make_user,
)


def test_send_statement_reminders_matching_day(session: Session):
    """Sends email when account's statement day matches today."""
    user = make_user(session, email="alice@test.com")
    hh = make_household(session, user)
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
        _send_statement_reminders(hh.id)

    mock_send.assert_called_once()
    call_args = mock_send.call_args
    assert call_args[0][0] == "alice@test.com"
    assert "Visa" in call_args[0][1]


def test_send_statement_reminders_deduplication(session: Session):
    """Skips accounts where reminder was already sent today."""
    user = make_user(session, email="bob@test.com")
    hh = make_household(session, user)
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
        _send_statement_reminders(hh.id)

    mock_send.assert_not_called()


def test_send_statement_reminders_last_day_fallback(session: Session):
    """Day 31 triggers on Feb 28 (last day of month)."""
    user = make_user(session, email="carol@test.com")
    hh = make_household(session, user)
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
        _send_statement_reminders(hh.id)

    mock_send.assert_called_once()
    assert "RBC" in mock_send.call_args[0][1]


def test_send_statement_reminders_no_accounts(session: Session):
    """No errors when no accounts have reminders configured."""
    user = make_user(session)
    hh = make_household(session, user)
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
        _send_statement_reminders(hh.id)

    mock_send.assert_not_called()


# -- Per-household scheduler -----------------------------------------------

def test_start_scheduler_reads_from_household_config(session: Session):
    """Scheduler creates a cron job using HouseholdSyncConfig values from DB."""
    user = make_user(session)
    hh = make_household(session, user)
    make_sync_config(session, hh, sync_hour=14, sync_minute=30, sync_timezone="US/Pacific")

    with (
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.BackgroundScheduler") as mock_sched_cls,
    ):
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)
        mock_sched = MagicMock()
        mock_sched_cls.return_value = mock_sched

        from app.scheduler import start_scheduler
        start_scheduler()

    mock_sched.add_job.assert_called()
    mock_sched.start.assert_called_once()
    job_ids = [c.kwargs.get("id") or c[1].get("id") for c in mock_sched.add_job.call_args_list]
    assert f"sync_hh_{hh.id}" in job_ids


def test_start_scheduler_no_config_skips(session: Session):
    """Scheduler does not start when no HouseholdSyncConfig exists."""
    with (
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.BackgroundScheduler") as mock_sched_cls,
    ):
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import start_scheduler
        start_scheduler()

    mock_sched_cls.assert_not_called()


def test_start_scheduler_sync_disabled_skips(session: Session):
    """Scheduler does not start when config exists but sync_enabled is False."""
    user = make_user(session)
    hh = make_household(session, user)
    make_sync_config(session, hh, sync_enabled=False)

    with (
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.BackgroundScheduler") as mock_sched_cls,
    ):
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import start_scheduler
        start_scheduler()

    mock_sched_cls.assert_not_called()


def test_start_scheduler_multiple_households(session: Session):
    """Two households with different schedules get separate cron jobs."""
    user1 = make_user(session)
    hh1 = make_household(session, user1)
    make_sync_config(session, hh1, sync_hour=6, sync_minute=0)

    user2 = make_user(session)
    hh2 = make_household(session, user2)
    make_sync_config(session, hh2, sync_hour=22, sync_minute=45)

    with (
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.BackgroundScheduler") as mock_sched_cls,
    ):
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)
        mock_sched = MagicMock()
        mock_sched_cls.return_value = mock_sched

        from app.scheduler import start_scheduler
        start_scheduler()

    job_ids = [c.kwargs.get("id") or c[1].get("id") for c in mock_sched.add_job.call_args_list]
    assert f"sync_hh_{hh1.id}" in job_ids
    assert f"sync_hh_{hh2.id}" in job_ids
    assert len(mock_sched.add_job.call_args_list) == 4  # 2 sync + 2 reminder


def test_sync_household_items_only_syncs_own_items(session: Session):
    """_sync_household_items only syncs Plaid items for that household's members."""
    user1 = make_user(session)
    hh1 = make_household(session, user1)
    item1 = _make_plaid_item(session, user1)

    user2 = make_user(session)
    _hh2 = make_household(session, user2)
    _item2 = _make_plaid_item(session, user2)

    with (
        patch("app.scheduler.Session") as mock_session_cls,
        patch("app.scheduler.sync_transactions") as mock_sync,
    ):
        mock_session_cls.return_value.__enter__ = MagicMock(return_value=session)
        mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)

        from app.scheduler import _sync_household_items
        _sync_household_items(hh1.id)

    mock_sync.assert_called_once_with(item1.id)


def test_send_statement_reminders_scoped_to_household(session: Session):
    """Statement reminders only sent for accounts belonging to household members."""
    user1 = make_user(session, email="alice@test.com")
    hh1 = make_household(session, user1)
    make_account(session, user1, name="Visa", statement_available_day=15)

    user2 = make_user(session, email="bob@test.com")
    _hh2 = make_household(session, user2)
    make_account(session, user2, name="Amex", statement_available_day=15)

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
        _send_statement_reminders(hh1.id)

    mock_send.assert_called_once()
    assert mock_send.call_args[0][0] == "alice@test.com"


def _make_plaid_item(session: Session, user):
    from app.crypto import encrypt_token
    from app.models import PlaidItem
    item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token("test-token"),
        item_id=f"item-{uuid4().hex[:12]}",
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item
