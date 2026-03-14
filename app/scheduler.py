"""Scheduled background jobs for automatic transaction syncing."""

from __future__ import annotations

import calendar
import logging
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from app.config import get_settings
from app.database import engine
from app.email import send_statement_reminder_email
from app.models import Account, PlaidItem, User, UserSettings
from app.routes.plaid import sync_transactions

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _sync_all_items() -> None:
    """Sync transactions for every linked Plaid item across all users."""
    with Session(engine) as session:
        items = session.exec(select(PlaidItem)).all()

    if not items:
        logger.info("Scheduled sync: no Plaid items linked, skipping")
        return

    logger.info("Scheduled sync: syncing %d Plaid item(s)", len(items))
    for item in items:
        try:
            sync_transactions(item.id)
        except Exception:
            logger.exception("Scheduled sync failed for Plaid item %d", item.id)

    logger.info("Scheduled sync: complete")


def _send_statement_reminders() -> None:
    """Send email reminders for accounts whose statement day is today."""
    today = date.today()
    last_day = calendar.monthrange(today.year, today.month)[1]
    settings = get_settings()

    with Session(engine) as session:
        accounts = session.exec(
            select(Account).where(
                Account.statement_available_day.is_not(None),  # type: ignore[union-attr]
            )
        ).all()

        for acct in accounts:
            day = acct.statement_available_day
            matches = day == today.day or (day > last_day and today.day == last_day)
            if not matches:
                continue
            if acct.last_statement_reminder_sent == today:
                continue

            user = session.get(User, acct.user_id)
            if not user:
                continue

            send_statement_reminder_email(user.email, acct.name, settings.app_url)
            acct.last_statement_reminder_sent = today
            session.add(acct)

        session.commit()

    logger.info("Statement reminders: checked %d account(s)", len(accounts))


def start_scheduler() -> None:
    """Start the background scheduler using env-level sync settings."""
    global _scheduler

    env = get_settings()
    if not env.sync_enabled:
        logger.info("Scheduled sync is disabled")
        return

    _scheduler = BackgroundScheduler()
    trigger = CronTrigger(
        hour=env.sync_hour,
        minute=env.sync_minute,
        timezone=env.sync_timezone,
    )
    _scheduler.add_job(_sync_all_items, trigger, id="sync_all_transactions")
    _scheduler.add_job(_send_statement_reminders, trigger, id="send_statement_reminders")
    _scheduler.start()

    logger.info(
        "Scheduler started — syncing daily at %02d:%02d (%s)",
        env.sync_hour,
        env.sync_minute,
        env.sync_timezone,
    )


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")


def restart_scheduler() -> None:
    """Stop and re-start the scheduler with current settings."""
    stop_scheduler()
    start_scheduler()
