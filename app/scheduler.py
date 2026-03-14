"""Scheduled background jobs for per-household transaction syncing."""

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
from app.models import Account, HouseholdMember, HouseholdSyncConfig, PlaidItem, User
from app.routes.plaid import sync_transactions

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _sync_household_items(household_id: int) -> None:
    """Sync Plaid items for all members of a specific household."""
    with Session(engine) as session:
        user_ids = [
            m.user_id
            for m in session.exec(
                select(HouseholdMember).where(HouseholdMember.household_id == household_id)
            ).all()
        ]
        if not user_ids:
            return
        items = session.exec(
            select(PlaidItem).where(PlaidItem.user_id.in_(user_ids))  # type: ignore[union-attr]
        ).all()

    if not items:
        logger.info("Scheduled sync (household %d): no Plaid items, skipping", household_id)
        return

    logger.info("Scheduled sync (household %d): syncing %d item(s)", household_id, len(items))
    for item in items:
        try:
            sync_transactions(item.id)
        except Exception:
            logger.exception("Scheduled sync failed for Plaid item %d", item.id)

    logger.info("Scheduled sync (household %d): complete", household_id)


def _send_statement_reminders(household_id: int) -> None:
    """Send email reminders for accounts whose statement day is today (scoped to household)."""
    today = date.today()
    last_day = calendar.monthrange(today.year, today.month)[1]
    settings = get_settings()

    with Session(engine) as session:
        user_ids = [
            m.user_id
            for m in session.exec(
                select(HouseholdMember).where(HouseholdMember.household_id == household_id)
            ).all()
        ]
        if not user_ids:
            return

        accounts = session.exec(
            select(Account).where(
                Account.statement_available_day.is_not(None),  # type: ignore[union-attr]
                Account.user_id.in_(user_ids),  # type: ignore[union-attr]
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

    logger.info("Statement reminders (household %d): checked %d account(s)", household_id, len(accounts))


def start_scheduler() -> None:
    """Start the background scheduler with one cron job per household."""
    global _scheduler

    with Session(engine) as session:
        configs = session.exec(
            select(HouseholdSyncConfig).where(HouseholdSyncConfig.sync_enabled == True)  # noqa: E712
        ).all()

    if not configs:
        logger.info("Scheduled sync is disabled (no household has sync enabled)")
        return

    _scheduler = BackgroundScheduler()
    for cfg in configs:
        trigger = CronTrigger(
            hour=cfg.sync_hour,
            minute=cfg.sync_minute,
            timezone=cfg.sync_timezone,
        )
        _scheduler.add_job(
            _sync_household_items, trigger,
            args=[cfg.household_id],
            id=f"sync_hh_{cfg.household_id}",
        )
        _scheduler.add_job(
            _send_statement_reminders, trigger,
            args=[cfg.household_id],
            id=f"reminders_hh_{cfg.household_id}",
        )
        logger.info(
            "Household %d: syncing daily at %02d:%02d (%s)",
            cfg.household_id, cfg.sync_hour, cfg.sync_minute, cfg.sync_timezone,
        )
    _scheduler.start()


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
