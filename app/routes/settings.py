"""User settings and category rule endpoints."""

from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import CategoryRule, Transaction, UserSettings

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create_settings(session: Session) -> UserSettings:
    """Return the singleton settings row, creating it with defaults if needed."""
    settings = session.get(UserSettings, 1)
    if not settings:
        settings = UserSettings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


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
def get_settings(session: Session = Depends(get_session)):
    return _settings_to_dict(_get_or_create_settings(session))


@router.put("")
def update_settings(body: SettingsUpdate, session: Session = Depends(get_session)):
    settings = _get_or_create_settings(session)

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
def list_rules(session: Session = Depends(get_session)):
    rules = session.exec(select(CategoryRule).order_by(CategoryRule.id)).all()
    return [_rule_to_dict(r) for r in rules]


@router.post("/rules", status_code=201)
def create_rule(body: RuleCreate, session: Session = Depends(get_session)):
    rule = CategoryRule(**body.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _rule_to_dict(rule)


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: int, body: RuleUpdate, session: Session = Depends(get_session)
):
    rule = session.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _rule_to_dict(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(CategoryRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()


# ── Data Export & Management ───────────────────────────────────


@router.get("/export")
def export_transactions(session: Session = Depends(get_session)):
    """Export all transactions as a CSV download."""
    txns = session.exec(
        select(Transaction).order_by(Transaction.date.desc())
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
def clear_transactions(session: Session = Depends(get_session)):
    """Delete all transaction records. Irreversible."""
    txns = session.exec(select(Transaction)).all()
    for t in txns:
        session.delete(t)
    session.commit()
