"""Shared helper for recording user activity."""

from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from app.models import ActivityAction, ActivityLog


def log_activity(
    session: Session,
    user_id: int,
    action: ActivityAction,
    detail: Optional[str] = None,
) -> None:
    session.add(ActivityLog(user_id=user_id, action=action, detail=detail))
    session.commit()
