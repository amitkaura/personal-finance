"""User settings and category rule endpoints."""

from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, or_, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Account, CategoryRule, Transaction, User, UserSettings

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create_settings(session: Session, user_id: int) -> UserSettings:
    """Return the user's settings row, creating it with defaults if needed."""
    settings = session.exec(
        select(UserSettings).where(UserSettings.user_id == user_id)
    ).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


# ── Profile ────────────────────────────────────────────────────

_MAX_DISPLAY_NAME = 100
_MAX_BIO = 300
_MAX_URL = 500


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None


def _profile_to_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.display_name or u.name,
        "picture": u.avatar_url or u.picture,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
        "bio": u.bio,
        "google_name": u.google_name or u.name,
        "google_picture": u.google_picture or u.picture,
    }


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user)):
    return _profile_to_dict(user)


@router.put("/profile")
def update_profile(
    body: ProfileUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.display_name is not None:
        trimmed = body.display_name.strip()
        if len(trimmed) > _MAX_DISPLAY_NAME:
            raise HTTPException(status_code=400, detail="Display name too long")
        user.display_name = trimmed or None
        if trimmed:
            user.name = trimmed
        else:
            user.name = user.google_name or user.name

    if body.avatar_url is not None:
        trimmed = body.avatar_url.strip()
        if trimmed and len(trimmed) > _MAX_URL:
            raise HTTPException(status_code=400, detail="Avatar URL too long")
        if trimmed and not trimmed.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Avatar URL must start with http:// or https://")
        user.avatar_url = trimmed or None
        if trimmed:
            user.picture = trimmed
        else:
            user.picture = user.google_picture or user.picture

    if body.bio is not None:
        trimmed = body.bio.strip()
        if len(trimmed) > _MAX_BIO:
            raise HTTPException(status_code=400, detail="Bio too long")
        user.bio = trimmed or None

    session.add(user)
    session.commit()
    session.refresh(user)
    return _profile_to_dict(user)


# ── User Settings ──────────────────────────────────────────────


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    date_format: Optional[str] = None
    locale: Optional[str] = None
    sync_enabled: Optional[bool] = None
    sync_hour: Optional[int] = None
    sync_minute: Optional[int] = None
    sync_timezone: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None


def _settings_to_dict(s: UserSettings) -> dict:
    return {
        "currency": s.currency,
        "date_format": s.date_format,
        "locale": s.locale,
        "sync_enabled": s.sync_enabled,
        "sync_hour": s.sync_hour,
        "sync_minute": s.sync_minute,
        "sync_timezone": s.sync_timezone,
        "llm_base_url": s.llm_base_url,
        "llm_api_key_set": bool(s.llm_api_key),
        "llm_model": s.llm_model,
    }


@router.get("")
def get_settings(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    return _settings_to_dict(_get_or_create_settings(session, user.id))


@router.put("")
def update_settings(
    body: SettingsUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(session, user.id)

    sync_fields = {"sync_enabled", "sync_hour", "sync_minute", "sync_timezone"}
    sync_changed = False

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
        if field in sync_fields:
            sync_changed = True

    session.add(settings)
    session.commit()
    session.refresh(settings)

    if sync_changed:
        from app.scheduler import restart_scheduler
        restart_scheduler()

    return _settings_to_dict(settings)


# ── Category Rules ─────────────────────────────────────────────


class RuleCreate(BaseModel):
    keyword: str
    category: str
    case_sensitive: bool = False


class RuleUpdate(BaseModel):
    keyword: Optional[str] = None
    category: Optional[str] = None
    case_sensitive: Optional[bool] = None


def _rule_to_dict(r: CategoryRule) -> dict:
    return {
        "id": r.id,
        "keyword": r.keyword,
        "category": r.category,
        "case_sensitive": r.case_sensitive,
    }


@router.get("/rules")
def list_rules(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rules = session.exec(
        select(CategoryRule)
        .where(CategoryRule.user_id == user.id)
        .order_by(CategoryRule.id)
    ).all()
    return [_rule_to_dict(r) for r in rules]


@router.post("/rules", status_code=201)
def create_rule(
    body: RuleCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rule = CategoryRule(user_id=user.id, **body.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _rule_to_dict(rule)


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    body: RuleUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rule = session.get(CategoryRule, rule_id)
    if not rule or rule.user_id != user.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _rule_to_dict(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rule = session.get(CategoryRule, rule_id)
    if not rule or rule.user_id != user.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()


# ── Data Export & Management ───────────────────────────────────


@router.get("/export")
def export_transactions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Export all transactions as a CSV download."""
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id == user.id)
    ).all()
    txns = session.exec(
        select(Transaction)
        .where(
            or_(
                Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                Transaction.user_id == user.id,
            )
        )
        .order_by(Transaction.date.desc())
    ).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Date", "Merchant", "Amount", "Category",
        "Pending", "Needs Review", "Account ID",
    ])
    for t in txns:
        writer.writerow([
            t.date.isoformat(),
            t.merchant_name or "",
            float(t.amount),
            t.category or "",
            t.pending_status,
            t.needs_review,
            t.account_id or "",
        ])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


@router.delete("/transactions", status_code=204)
def clear_transactions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete all transaction records for the current user. Irreversible."""
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id == user.id)
    ).all()
    txns = session.exec(
        select(Transaction).where(
            or_(
                Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                Transaction.user_id == user.id,
            )
        )
    ).all()
    for t in txns:
        session.delete(t)
    session.commit()
