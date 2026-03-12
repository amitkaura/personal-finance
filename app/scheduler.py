"""Scheduled background jobs for automatic transaction syncing."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from app.database import engine
from app.models import PlaidItem, UserSettings
from app.routes.plaid import sync_transactions

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _get_sync_settings() -> UserSettings:
    """Read sync config from the DB, falling back to defaults."""
    with Session(engine) as session:
        settings = session.get(UserSettings, 1)
        return settings or UserSettings(id=1)


def _sync_all_items() -> None:
    """Sync transactions for every linked Plaid item."""
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


def start_scheduler() -> None:
    """Start the background scheduler if sync is enabled."""
    global _scheduler

    settings = _get_sync_settings()
    if not settings.sync_enabled:
        logger.info("Scheduled sync is disabled")
        return

    _scheduler = BackgroundScheduler()
    trigger = CronTrigger(
        hour=settings.sync_hour,
        minute=settings.sync_minute,
        timezone=settings.sync_timezone,
    )
    _scheduler.add_job(_sync_all_items, trigger, id="sync_all_transactions")
    _scheduler.start()

    logger.info(
        "Scheduler started — syncing daily at %02d:%02d (%s)",
        settings.sync_hour,
        settings.sync_minute,
        settings.sync_timezone,
    )


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")


def restart_scheduler() -> None:
    """Stop and re-start the scheduler with current DB settings."""
    stop_scheduler()
    start_scheduler()
