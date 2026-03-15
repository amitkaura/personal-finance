"""User settings, category rule, and CSV import endpoints."""

from __future__ import annotations

import csv
import io
import json
from datetime import date as date_type
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, or_, select

from app.auth import get_current_user
from app.categorizer import categorize_by_rules, categorize_single_llm
from app.config import get_settings as get_app_settings
from app.crypto import decrypt_token, encrypt_token
from app.database import get_session
from app.models import (
    Account,
    AccountBalanceSnapshot,
    AccountType,
    Budget,
    Category,
    CategoryRule,
    Goal,
    GoalAccountLink,
    GoalContribution,
    Household,
    HouseholdInvitation,
    HouseholdMember,
    HouseholdLLMConfig,
    HouseholdPlaidConfig,
    HouseholdSyncConfig,
    NetWorthSnapshot,
    PlaidItem,
    SpendingPreference,
    Tag,
    Transaction,
    TransactionTag,
    User,
    UserSettings,
)

router = APIRouter(prefix="/settings", tags=["settings"])

_ALLOWED_LLM_HOSTS = {
    "localhost", "127.0.0.1", "::1",
    "api.openai.com", "api.anthropic.com", "api.groq.com",
    "generativelanguage.googleapis.com",
}


def _validate_llm_base_url(url: str) -> None:
    """Reject LLM base URLs that point to non-allowlisted hosts to prevent SSRF."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=400, detail="Invalid LLM base URL")
    if host in _ALLOWED_LLM_HOSTS:
        return
    if host.endswith(".openai.com") or host.endswith(".anthropic.com"):
        return
    raise HTTPException(
        status_code=400,
        detail=f"LLM host '{host}' is not allowed. Use localhost or a supported provider.",
    )


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


def _settings_to_dict(s: UserSettings) -> dict:
    return {
        "currency": s.currency,
        "date_format": s.date_format,
        "locale": s.locale,
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

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(settings, field, value)

    session.add(settings)
    session.commit()
    session.refresh(settings)

    return _settings_to_dict(settings)


# ── Plaid Config (per-household) ───────────────────────────────

_VALID_PLAID_ENVS = {"sandbox", "production"}


class PlaidConfigUpdate(BaseModel):
    client_id: str
    secret: str
    plaid_env: str


def _plaid_config_response(config: Optional[HouseholdPlaidConfig]) -> dict:
    if not config:
        return {"configured": False, "plaid_env": None, "client_id_last4": None, "secret_last4": None}
    client_id = decrypt_token(config.encrypted_client_id)
    secret = decrypt_token(config.encrypted_secret)
    return {
        "configured": True,
        "plaid_env": config.plaid_env,
        "client_id_last4": client_id[-4:] if len(client_id) >= 4 else client_id,
        "secret_last4": secret[-4:] if len(secret) >= 4 else secret,
    }


@router.get("/plaid-config")
def get_plaid_config(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        return _plaid_config_response(None)

    config = session.exec(
        select(HouseholdPlaidConfig).where(
            HouseholdPlaidConfig.household_id == member.household_id
        )
    ).first()
    return _plaid_config_response(config)


@router.put("/plaid-config")
def update_plaid_config(
    body: PlaidConfigUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the household owner can manage Plaid config")

    if body.plaid_env not in _VALID_PLAID_ENVS:
        raise HTTPException(status_code=400, detail=f"plaid_env must be one of: {', '.join(sorted(_VALID_PLAID_ENVS))}")

    config = session.exec(
        select(HouseholdPlaidConfig).where(
            HouseholdPlaidConfig.household_id == member.household_id
        )
    ).first()

    if config:
        config.encrypted_client_id = encrypt_token(body.client_id)
        config.encrypted_secret = encrypt_token(body.secret)
        config.plaid_env = body.plaid_env
    else:
        config = HouseholdPlaidConfig(
            household_id=member.household_id,
            encrypted_client_id=encrypt_token(body.client_id),
            encrypted_secret=encrypt_token(body.secret),
            plaid_env=body.plaid_env,
        )

    session.add(config)
    session.commit()
    session.refresh(config)
    return _plaid_config_response(config)


@router.delete("/plaid-config", status_code=204)
def delete_plaid_config(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the household owner can manage Plaid config")

    config = session.exec(
        select(HouseholdPlaidConfig).where(
            HouseholdPlaidConfig.household_id == member.household_id
        )
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Plaid config not found")

    session.delete(config)
    session.commit()


# ── LLM Config (per-household) ─────────────────────────────────


class LLMConfigUpdate(BaseModel):
    llm_base_url: str
    llm_api_key: str
    llm_model: str


def _llm_config_response(config: Optional[HouseholdLLMConfig]) -> dict:
    if not config:
        return {"configured": False, "llm_base_url": None, "llm_model": None, "api_key_last4": None}
    api_key = decrypt_token(config.encrypted_api_key)
    return {
        "configured": True,
        "llm_base_url": config.llm_base_url,
        "llm_model": config.llm_model,
        "api_key_last4": api_key[-4:] if len(api_key) >= 4 else api_key,
    }


@router.get("/llm-config")
def get_llm_config(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        return _llm_config_response(None)

    config = session.exec(
        select(HouseholdLLMConfig).where(
            HouseholdLLMConfig.household_id == member.household_id
        )
    ).first()
    return _llm_config_response(config)


@router.put("/llm-config")
def update_llm_config(
    body: LLMConfigUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the household owner can manage LLM config")

    _validate_llm_base_url(body.llm_base_url)

    config = session.exec(
        select(HouseholdLLMConfig).where(
            HouseholdLLMConfig.household_id == member.household_id
        )
    ).first()

    if config:
        config.llm_base_url = body.llm_base_url
        config.encrypted_api_key = encrypt_token(body.llm_api_key)
        config.llm_model = body.llm_model
    else:
        config = HouseholdLLMConfig(
            household_id=member.household_id,
            llm_base_url=body.llm_base_url,
            encrypted_api_key=encrypt_token(body.llm_api_key),
            llm_model=body.llm_model,
        )

    session.add(config)
    session.commit()
    session.refresh(config)
    return _llm_config_response(config)


@router.delete("/llm-config", status_code=204)
def delete_llm_config(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the household owner can manage LLM config")

    config = session.exec(
        select(HouseholdLLMConfig).where(
            HouseholdLLMConfig.household_id == member.household_id
        )
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="LLM config not found")

    session.delete(config)
    session.commit()


# ── Sync Config (per-household) ─────────────────────────────────


class SyncConfigUpdate(BaseModel):
    sync_enabled: Optional[bool] = None
    sync_hour: Optional[int] = None
    sync_minute: Optional[int] = None
    sync_timezone: Optional[str] = None


def _sync_config_response(config: Optional[HouseholdSyncConfig]) -> dict:
    if not config:
        return {"configured": False, "sync_enabled": None, "sync_hour": None, "sync_minute": None, "sync_timezone": None}
    return {
        "configured": True,
        "sync_enabled": config.sync_enabled,
        "sync_hour": config.sync_hour,
        "sync_minute": config.sync_minute,
        "sync_timezone": config.sync_timezone,
    }


@router.get("/sync-config")
def get_sync_config(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        return _sync_config_response(None)

    config = session.exec(
        select(HouseholdSyncConfig).where(
            HouseholdSyncConfig.household_id == member.household_id
        )
    ).first()
    return _sync_config_response(config)


@router.put("/sync-config")
def update_sync_config(
    body: SyncConfigUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the household owner can manage sync config")

    data = body.model_dump(exclude_unset=True)
    if "sync_hour" in data and data["sync_hour"] is not None:
        if not (0 <= data["sync_hour"] <= 23):
            raise HTTPException(status_code=400, detail="sync_hour must be 0-23")
    if "sync_minute" in data and data["sync_minute"] is not None:
        if not (0 <= data["sync_minute"] <= 59):
            raise HTTPException(status_code=400, detail="sync_minute must be 0-59")

    config = session.exec(
        select(HouseholdSyncConfig).where(
            HouseholdSyncConfig.household_id == member.household_id
        )
    ).first()

    if config:
        for field, value in data.items():
            setattr(config, field, value)
    else:
        config = HouseholdSyncConfig(household_id=member.household_id, **data)

    session.add(config)
    session.commit()
    session.refresh(config)

    from app.scheduler import restart_scheduler
    restart_scheduler()

    return _sync_config_response(config)


@router.delete("/sync-config", status_code=204)
def delete_sync_config(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the household owner can manage sync config")

    config = session.exec(
        select(HouseholdSyncConfig).where(
            HouseholdSyncConfig.household_id == member.household_id
        )
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Sync config not found")

    session.delete(config)
    session.commit()

    from app.scheduler import restart_scheduler
    restart_scheduler()


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


_EXPORT_CHUNK_SIZE = 1000


def _export_transactions_generator(
    session: Session,
    user_account_ids: list[int],
    user_id: int,
):
    """Yield CSV rows in chunks to avoid loading all transactions into memory."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Date", "Merchant", "Amount", "Category",
        "Pending", "Account ID",
    ])
    yield buf.getvalue()

    offset = 0
    while True:
        stmt = (
            select(Transaction)
            .where(
                or_(
                    Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                    Transaction.user_id == user_id,
                )
            )
            .order_by(Transaction.date.desc())
            .offset(offset)
            .limit(_EXPORT_CHUNK_SIZE)
        )
        txns = list(session.exec(stmt).all())
        if not txns:
            break
        buf = io.StringIO()
        writer = csv.writer(buf)
        for t in txns:
            writer.writerow([
                t.date.isoformat(),
                t.merchant_name or "",
                float(t.amount),
                t.category or "",
                t.pending_status,
                t.account_id or "",
            ])
        yield buf.getvalue()
        offset += _EXPORT_CHUNK_SIZE


@router.get("/export")
def export_transactions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Export all transactions as a CSV download (streamed in chunks)."""
    user_account_ids = list(
        session.exec(select(Account.id).where(Account.user_id == user.id)).all()
    )
    return StreamingResponse(
        _export_transactions_generator(session, user_account_ids, user.id),
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
    txn_ids = [t.id for t in txns if t.id is not None]
    if txn_ids:
        tags = session.exec(
            select(TransactionTag).where(
                TransactionTag.transaction_id.in_(txn_ids)  # type: ignore[union-attr]
            )
        ).all()
        for tag_link in tags:
            session.delete(tag_link)
    for t in txns:
        session.delete(t)
    session.commit()


# ── Factory Reset & Account Deletion ──────────────────────────


def _delete_all_user_data(session: Session, user: User) -> None:
    """Delete ALL user financial data (transactions, accounts, budgets, etc.).

    Does NOT delete the User row, household membership, or invitations.
    Commits the session when done.
    """
    user_account_ids = list(
        session.exec(select(Account.id).where(Account.user_id == user.id)).all()
    )
    txn_ids = list(
        session.exec(
            select(Transaction.id).where(
                or_(
                    Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                    Transaction.user_id == user.id,
                )
            )
        ).all()
    )

    if txn_ids:
        for tl in session.exec(select(TransactionTag).where(TransactionTag.transaction_id.in_(txn_ids))).all():  # type: ignore[union-attr]
            session.delete(tl)
    for t in session.exec(select(Transaction).where(Transaction.id.in_(txn_ids))).all():  # type: ignore[union-attr]
        session.delete(t)

    goal_ids = list(
        session.exec(select(Goal.id).where(Goal.user_id == user.id)).all()
    )
    if goal_ids:
        for gl in session.exec(select(GoalAccountLink).where(GoalAccountLink.goal_id.in_(goal_ids))).all():  # type: ignore[union-attr]
            session.delete(gl)
        for gc in session.exec(select(GoalContribution).where(GoalContribution.goal_id.in_(goal_ids))).all():  # type: ignore[union-attr]
            session.delete(gc)
    for g in session.exec(select(Goal).where(Goal.user_id == user.id)).all():
        session.delete(g)

    for sp in session.exec(select(SpendingPreference).where(SpendingPreference.user_id == user.id)).all():
        session.delete(sp)
    for b in session.exec(select(Budget).where(Budget.user_id == user.id)).all():
        session.delete(b)
    for nw in session.exec(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user.id)).all():
        session.delete(nw)
    for tag in session.exec(select(Tag).where(Tag.user_id == user.id)).all():
        session.delete(tag)
    for rule in session.exec(select(CategoryRule).where(CategoryRule.user_id == user.id)).all():
        session.delete(rule)
    for cat in session.exec(select(Category).where(Category.user_id == user.id)).all():
        session.delete(cat)
    if user_account_ids:
        for bs in session.exec(select(AccountBalanceSnapshot).where(
            AccountBalanceSnapshot.account_id.in_(user_account_ids)  # type: ignore[union-attr]
        )).all():
            session.delete(bs)
    for acct in session.exec(select(Account).where(Account.user_id == user.id)).all():
        session.delete(acct)

    for item in session.exec(select(PlaidItem).where(PlaidItem.user_id == user.id)).all():
        try:
            from app.plaid_client import get_household_plaid_client_for_user_id
            from plaid.model.item_remove_request import ItemRemoveRequest
            client = get_household_plaid_client_for_user_id(session, user.id)
            access_token = decrypt_token(item.encrypted_access_token)
            client.item_remove(ItemRemoveRequest(access_token=access_token))
        except Exception:
            pass
        session.delete(item)

    settings = session.exec(select(UserSettings).where(UserSettings.user_id == user.id)).first()
    if settings:
        session.delete(settings)

    session.commit()


@router.delete("/all-data", status_code=204)
def factory_reset(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete ALL user financial data while preserving the User record and household membership."""
    _delete_all_user_data(session, user)


_COOKIE_NAME = "session"


@router.delete("/account", status_code=204)
def delete_account(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Permanently delete the user account and all associated data."""
    _delete_all_user_data(session, user)

    # Clean up contributions to other users' goals (e.g. shared household goals)
    for gc in session.exec(
        select(GoalContribution).where(GoalContribution.user_id == user.id)
    ).all():
        session.delete(gc)

    # Clean up invitations created by this user
    for inv in session.exec(
        select(HouseholdInvitation).where(HouseholdInvitation.invited_by_user_id == user.id)
    ).all():
        session.delete(inv)

    # Clean up household membership
    membership = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    household_id = membership.household_id if membership else None
    if membership:
        session.delete(membership)
        session.flush()

    # Delete household if it's now empty
    if household_id is not None:
        remaining = session.exec(
            select(HouseholdMember).where(HouseholdMember.household_id == household_id)
        ).all()
        if not remaining:
            for inv in session.exec(
                select(HouseholdInvitation).where(HouseholdInvitation.household_id == household_id)
            ).all():
                session.delete(inv)
            household = session.get(Household, household_id)
            if household:
                session.delete(household)

    session.delete(user)
    session.commit()

    app_settings = get_app_settings()
    secure_cookie = app_settings.secure_cookies and not app_settings.debug
    resp = JSONResponse(content=None, status_code=204)
    resp.delete_cookie(
        key=_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
    )
    return resp


# ── Per-Account CSV Import (streaming NDJSON) ─────────────────


class ImportRow(BaseModel):
    date: str
    amount: float
    merchant_name: str
    category: Optional[str] = None


class ImportRequest(BaseModel):
    transactions: list[ImportRow]
    skip_llm: bool = False


@router.post("/import/{account_id}")
def import_transactions(
    account_id: int,
    body: ImportRequest,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    acct = session.get(Account, account_id)
    if not acct or acct.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")

    accepts = request.headers.get("accept", "")
    if "application/x-ndjson" in accepts:
        return StreamingResponse(
            _import_generator(body.transactions, acct, session, user, body.skip_llm),
            media_type="application/x-ndjson",
        )
    return _import_sync(body.transactions, acct, session, user, body.skip_llm)


def _import_sync(
    rows: list[ImportRow], acct: Account, session: Session, user: User,
    skip_llm: bool = False,
) -> dict:
    imported = skipped = categorized = 0
    errors: list[str] = []

    for row in rows:
        try:
            parsed_date = date_type.fromisoformat(row.date)
        except ValueError:
            errors.append(f"Invalid date: {row.date}")
            continue

        dup = session.exec(
            select(Transaction).where(
                Transaction.account_id == acct.id,
                Transaction.date == parsed_date,
                Transaction.amount == Decimal(str(row.amount)),
                Transaction.merchant_name == row.merchant_name,
            )
        ).first()
        if dup:
            skipped += 1
            continue

        category = row.category
        auto_cat = False
        if not category:
            category = categorize_by_rules(row.merchant_name, session, user.id)
            if category:
                auto_cat = True

        txn = Transaction(
            plaid_transaction_id=f"csv-{uuid4().hex}",
            date=parsed_date,
            amount=Decimal(str(row.amount)),
            merchant_name=row.merchant_name,
            category=category,
            account_id=acct.id,
            is_manual=True,
            user_id=user.id,
        )
        session.add(txn)

        if not category and not skip_llm:
            session.flush()
            llm_cat = categorize_single_llm(txn, user.id)
            if llm_cat:
                txn.category = llm_cat
                auto_cat = True

        if auto_cat:
            categorized += 1
        imported += 1

    session.commit()
    return {
        "type": "complete",
        "imported": imported,
        "skipped": skipped,
        "categorized": categorized,
        "errors": errors,
    }


def _import_generator(
    rows: list[ImportRow], acct: Account, session: Session, user: User,
    skip_llm: bool = False,
):
    imported = skipped = categorized = 0
    errors: list[str] = []
    total = len(rows)

    for idx, row in enumerate(rows, 1):
        status = "imported"
        cat: str | None = None
        auto_cat = False

        try:
            parsed_date = date_type.fromisoformat(row.date)
        except ValueError:
            errors.append(f"Invalid date: {row.date}")
            yield _ndjson({"type": "progress", "current": idx, "total": total,
                           "merchant": row.merchant_name, "status": "error", "category": None})
            continue

        dup = session.exec(
            select(Transaction).where(
                Transaction.account_id == acct.id,
                Transaction.date == parsed_date,
                Transaction.amount == Decimal(str(row.amount)),
                Transaction.merchant_name == row.merchant_name,
            )
        ).first()
        if dup:
            skipped += 1
            yield _ndjson({"type": "progress", "current": idx, "total": total,
                           "merchant": row.merchant_name, "status": "skipped", "category": None})
            continue

        cat = row.category
        if not cat:
            cat = categorize_by_rules(row.merchant_name, session, user.id)
            if cat:
                auto_cat = True

        txn = Transaction(
            plaid_transaction_id=f"csv-{uuid4().hex}",
            date=parsed_date,
            amount=Decimal(str(row.amount)),
            merchant_name=row.merchant_name,
            category=cat,
            account_id=acct.id,
            is_manual=True,
            user_id=user.id,
        )
        session.add(txn)

        if not cat and not skip_llm:
            session.flush()
            llm_cat = categorize_single_llm(txn, user.id)
            if llm_cat:
                txn.category = llm_cat
                cat = llm_cat
                auto_cat = True

        if auto_cat:
            categorized += 1
            status = "categorized"
        imported += 1

        yield _ndjson({"type": "progress", "current": idx, "total": total,
                       "merchant": row.merchant_name, "status": status, "category": cat})

    session.commit()
    yield _ndjson({
        "type": "complete",
        "imported": imported,
        "skipped": skipped,
        "categorized": categorized,
        "errors": errors,
    })


# ── Bulk CSV Import (multi-account, streaming NDJSON) ─────────


class BulkTransactionRow(BaseModel):
    date: str
    amount: float
    merchant_name: str
    category: Optional[str] = None
    notes: Optional[str] = None
    account_name: Optional[str] = None
    owner_name: Optional[str] = None


class BulkAccountEntry(BaseModel):
    name: str
    type: str
    subtype: Optional[str] = None
    current_balance: float = 0


class BulkImportRequest(BaseModel):
    accounts: list[BulkAccountEntry] = []
    transactions: list[BulkTransactionRow]
    new_categories: list[str] = []
    skip_llm: bool = False


@router.post("/bulk-import")
def bulk_import(
    body: BulkImportRequest,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    account_map = _resolve_accounts(body.accounts, session, user)
    owner_map = _resolve_owners(session, user)

    _create_new_categories(body.new_categories, session, user)
    session.commit()

    user_id = user.id

    accepts = request.headers.get("accept", "")
    if "application/x-ndjson" in accepts:
        return StreamingResponse(
            _bulk_import_generator(body.transactions, account_map, owner_map, session, user_id, body.skip_llm),
            media_type="application/x-ndjson",
        )
    return _bulk_import_sync(body.transactions, account_map, owner_map, session, user_id, body.skip_llm)


def _resolve_accounts(
    new_accounts: list[BulkAccountEntry], session: Session, user: User,
) -> dict[str, int]:
    """Build a case-insensitive name->id map; create new accounts as needed."""
    existing = session.exec(
        select(Account).where(Account.user_id == user.id)
    ).all()
    name_map: dict[str, int] = {}
    for a in existing:
        name_map[a.name.lower()] = a.id  # type: ignore[arg-type]

    for entry in new_accounts:
        key = entry.name.lower()
        if key in name_map:
            continue
        valid_types = {t.value for t in AccountType}
        acct_type = entry.type if entry.type in valid_types else "depository"
        acct = Account(
            user_id=user.id,
            name=entry.name,
            type=AccountType(acct_type),
            subtype=entry.subtype,
            current_balance=Decimal(str(entry.current_balance)),
            plaid_account_id=f"manual-{uuid4().hex}",
            is_linked=False,
        )
        session.add(acct)
        session.flush()
        name_map[key] = acct.id  # type: ignore[arg-type]

    return name_map


def _resolve_owners(session: Session, user: User) -> dict[str, int]:
    """Build a case-insensitive owner_name->user_id map from household."""
    members = session.exec(
        select(HouseholdMember).where(
            HouseholdMember.household_id.in_(  # type: ignore[union-attr]
                select(HouseholdMember.household_id).where(
                    HouseholdMember.user_id == user.id
                )
            )
        )
    ).all()

    owner_map: dict[str, int] = {}
    for m in members:
        u = session.get(User, m.user_id)
        if u:
            name = u.display_name or u.name
            owner_map[name.lower()] = u.id  # type: ignore[arg-type]
    return owner_map


def _pick_owner_id(
    owner_name: str | None, owner_map: dict[str, int], default_id: int,
) -> int:
    if not owner_name:
        return default_id
    return owner_map.get(owner_name.lower(), default_id)


def _create_new_categories(
    names: list[str], session: Session, user: User,
) -> None:
    """Create Category rows for any names that don't already exist."""
    if not names:
        return
    existing = session.exec(
        select(Category.name).where(Category.user_id == user.id)
    ).all()
    existing_lower = {n.lower() for n in existing}
    for name in names:
        if name.strip().lower() not in existing_lower:
            session.add(Category(user_id=user.id, name=name.strip()))
            existing_lower.add(name.strip().lower())
    session.flush()


def _bulk_import_sync(
    rows: list[BulkTransactionRow],
    account_map: dict[str, int],
    owner_map: dict[str, int],
    session: Session,
    user_id: int,
    skip_llm: bool = False,
) -> dict:
    imported = skipped = categorized = 0
    errors: list[str] = []

    for row in rows:
        try:
            parsed_date = date_type.fromisoformat(row.date)
        except ValueError:
            errors.append(f"Invalid date: {row.date}")
            continue

        acct_id = account_map.get(row.account_name.lower()) if row.account_name else None
        owner_id = _pick_owner_id(row.owner_name, owner_map, user_id)  # type: ignore[arg-type]

        dup_stmt = select(Transaction).where(
            Transaction.date == parsed_date,
            Transaction.amount == Decimal(str(row.amount)),
            Transaction.merchant_name == row.merchant_name,
        )
        if acct_id:
            dup_stmt = dup_stmt.where(Transaction.account_id == acct_id)
        else:
            dup_stmt = dup_stmt.where(Transaction.user_id == owner_id)

        if session.exec(dup_stmt).first():
            skipped += 1
            continue

        category = row.category
        auto_cat = False
        if not category:
            category = categorize_by_rules(row.merchant_name, session, user_id)  # type: ignore[arg-type]
            if category:
                auto_cat = True

        txn = Transaction(
            plaid_transaction_id=f"csv-{uuid4().hex}",
            date=parsed_date,
            amount=Decimal(str(row.amount)),
            merchant_name=row.merchant_name,
            category=category,
            account_id=acct_id,
            is_manual=True,
            notes=row.notes,
            user_id=owner_id,
        )
        session.add(txn)

        if not category and not skip_llm:
            session.flush()
            llm_cat = categorize_single_llm(txn, user_id)
            if llm_cat:
                txn.category = llm_cat
                auto_cat = True

        if auto_cat:
            categorized += 1
        imported += 1

    session.commit()
    return {
        "type": "complete",
        "imported": imported,
        "skipped": skipped,
        "categorized": categorized,
        "errors": errors,
    }


def _bulk_import_generator(
    rows: list[BulkTransactionRow],
    account_map: dict[str, int],
    owner_map: dict[str, int],
    session: Session,
    user_id: int,
    skip_llm: bool = False,
):
    imported = skipped = categorized = 0
    errors: list[str] = []
    total = len(rows)

    for idx, row in enumerate(rows, 1):
        status = "imported"
        cat: str | None = None
        auto_cat = False

        try:
            parsed_date = date_type.fromisoformat(row.date)
        except ValueError:
            errors.append(f"Invalid date: {row.date}")
            yield _ndjson({"type": "progress", "current": idx, "total": total,
                           "merchant": row.merchant_name, "status": "error", "category": None})
            continue

        acct_id = account_map.get(row.account_name.lower()) if row.account_name else None
        owner_id = _pick_owner_id(row.owner_name, owner_map, user_id)  # type: ignore[arg-type]

        dup_stmt = select(Transaction).where(
            Transaction.date == parsed_date,
            Transaction.amount == Decimal(str(row.amount)),
            Transaction.merchant_name == row.merchant_name,
        )
        if acct_id:
            dup_stmt = dup_stmt.where(Transaction.account_id == acct_id)
        else:
            dup_stmt = dup_stmt.where(Transaction.user_id == owner_id)

        if session.exec(dup_stmt).first():
            skipped += 1
            yield _ndjson({"type": "progress", "current": idx, "total": total,
                           "merchant": row.merchant_name, "status": "skipped", "category": None})
            continue

        cat = row.category
        if not cat:
            cat = categorize_by_rules(row.merchant_name, session, user_id)  # type: ignore[arg-type]
            if cat:
                auto_cat = True

        txn = Transaction(
            plaid_transaction_id=f"csv-{uuid4().hex}",
            date=parsed_date,
            amount=Decimal(str(row.amount)),
            merchant_name=row.merchant_name,
            category=cat,
            account_id=acct_id,
            is_manual=True,
            notes=row.notes,
            user_id=owner_id,
        )
        session.add(txn)

        if not cat and not skip_llm:
            session.flush()
            llm_cat = categorize_single_llm(txn, user_id)
            if llm_cat:
                txn.category = llm_cat
                cat = llm_cat
                auto_cat = True

        if auto_cat:
            categorized += 1
            status = "categorized"
        imported += 1

        yield _ndjson({"type": "progress", "current": idx, "total": total,
                       "merchant": row.merchant_name, "status": status, "category": cat})

    session.commit()
    yield _ndjson({
        "type": "complete",
        "imported": imported,
        "skipped": skipped,
        "categorized": categorized,
        "errors": errors,
    })


def _ndjson(obj: dict) -> str:
    return json.dumps(obj) + "\n"


# ── Balance History Import ─────────────────────────────────────


class BalanceRow(BaseModel):
    date: str
    balance: float
    account_name: str


class AccountCreatePayload(BaseModel):
    name: str
    type: str = "depository"
    subtype: Optional[str] = None


class AccountMapEntry(BaseModel):
    csv_name: str
    account_id: Optional[int] = None
    create: Optional[AccountCreatePayload] = None


class BalanceImportRequest(BaseModel):
    rows: list[BalanceRow]
    account_mapping: list[AccountMapEntry]


@router.post("/import-balances")
def import_balances(
    body: BalanceImportRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Import account balance history from CSV data."""
    import bisect
    from collections import defaultdict

    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows to import")

    mapping_by_name: dict[str, AccountMapEntry] = {
        m.csv_name: m for m in body.account_mapping
    }
    csv_names = {r.account_name for r in body.rows}
    unmapped = csv_names - set(mapping_by_name.keys())
    if unmapped:
        raise HTTPException(
            status_code=400,
            detail=f"Unmapped account names: {', '.join(sorted(unmapped))}",
        )

    newest_balance_by_name: dict[str, tuple[date_type, Decimal]] = {}
    for row in body.rows:
        try:
            d = date_type.fromisoformat(row.date)
        except ValueError:
            continue
        prev = newest_balance_by_name.get(row.account_name)
        if prev is None or d > prev[0]:
            newest_balance_by_name[row.account_name] = (d, Decimal(str(row.balance)))

    resolved: dict[str, Account] = {}
    accounts_created = 0

    for csv_name, entry in mapping_by_name.items():
        if entry.account_id is not None:
            acct = session.get(Account, entry.account_id)
            if not acct or acct.user_id != user.id:
                raise HTTPException(status_code=404, detail=f"Account {entry.account_id} not found")
            resolved[csv_name] = acct
        elif entry.create:
            valid_types = {t.value for t in AccountType}
            acct_type = entry.create.type
            if acct_type not in valid_types:
                raise HTTPException(status_code=400, detail=f"Invalid type: {acct_type}")
            initial_balance = newest_balance_by_name.get(csv_name, (None, Decimal("0")))[1]
            acct = Account(
                user_id=user.id,
                name=entry.create.name,
                type=AccountType(acct_type),
                subtype=entry.create.subtype,
                current_balance=initial_balance,
                plaid_account_id=f"manual-{uuid4().hex}",
                plaid_item_id=None,
                is_linked=False,
            )
            session.add(acct)
            session.flush()
            session.refresh(acct)
            resolved[csv_name] = acct
            accounts_created += 1
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Mapping for '{csv_name}' must have account_id or create",
            )

    # -- Phase 1: Collect all parsed rows in memory --
    parsed_rows: list[tuple[int, date_type, Decimal]] = []
    unique_dates: set[date_type] = set()
    latest_date_per_acct: dict[int, tuple[date_type, Decimal]] = {}

    for row in body.rows:
        acct = resolved[row.account_name]
        try:
            parsed_date = date_type.fromisoformat(row.date)
        except ValueError:
            continue
        balance = Decimal(str(row.balance))
        parsed_rows.append((acct.id, parsed_date, balance))
        unique_dates.add(parsed_date)
        prev = latest_date_per_acct.get(acct.id)
        if prev is None or parsed_date > prev[0]:
            latest_date_per_acct[acct.id] = (parsed_date, balance)

    # -- Phase 2: Batch-load existing snapshots (1 query instead of N) --
    import_acct_ids = list({r[0] for r in parsed_rows})
    existing_snaps = session.exec(
        select(AccountBalanceSnapshot).where(
            AccountBalanceSnapshot.account_id.in_(import_acct_ids),
        )
    ).all()
    existing_map: dict[tuple[int, date_type], AccountBalanceSnapshot] = {
        (s.account_id, s.date): s for s in existing_snaps
    }

    # -- Phase 3: Batch upsert balance snapshots (0 queries, just session.add) --
    imported = 0
    for acct_id, d, balance in parsed_rows:
        key = (acct_id, d)
        if key in existing_map:
            existing_map[key].balance = balance
        else:
            snap = AccountBalanceSnapshot(account_id=acct_id, date=d, balance=balance)
            session.add(snap)
            existing_map[key] = snap
        imported += 1

    # -- Phase 4: Update current_balance on each account --
    for acct_id, (_, balance) in latest_date_per_acct.items():
        acct = session.get(Account, acct_id)
        if acct:
            acct.current_balance = balance

    session.flush()

    # -- Phase 5: Batch recompute net worth (3 queries instead of M * A) --
    accounts = session.exec(
        select(Account).where(
            Account.user_id == user.id,
            or_(
                Account.is_linked == True,  # noqa: E712
                Account.plaid_account_id.startswith("manual-"),  # type: ignore[union-attr]
            ),
        )
    ).all()

    all_acct_ids = [a.id for a in accounts]
    all_snaps = session.exec(
        select(AccountBalanceSnapshot)
        .where(AccountBalanceSnapshot.account_id.in_(all_acct_ids))
        .order_by(AccountBalanceSnapshot.account_id, AccountBalanceSnapshot.date)
    ).all()

    snaps_by_account: dict[int, list[tuple[date_type, Decimal]]] = defaultdict(list)
    for snap in all_snaps:
        snaps_by_account[snap.account_id].append((snap.date, snap.balance))

    account_types: dict[int, str] = {}
    for a in accounts:
        account_types[a.id] = a.type.value if hasattr(a.type, "value") else a.type

    nw_dates = sorted(unique_dates)
    existing_nw = session.exec(
        select(NetWorthSnapshot).where(
            NetWorthSnapshot.user_id == user.id,
            NetWorthSnapshot.date >= nw_dates[0],
            NetWorthSnapshot.date <= nw_dates[-1],
        )
    ).all()
    nw_map: dict[date_type, NetWorthSnapshot] = {s.date: s for s in existing_nw}

    snapshots_updated = 0
    for target_date in nw_dates:
        assets = Decimal("0")
        liabilities = Decimal("0")
        for acct_id in all_acct_ids:
            snaps = snaps_by_account.get(acct_id)
            if not snaps:
                continue
            idx = bisect.bisect_right([s[0] for s in snaps], target_date) - 1
            if idx >= 0:
                bal = snaps[idx][1]
                t = account_types.get(acct_id, "")
                if t in ("depository", "investment", "real_estate"):
                    assets += bal
                elif t in ("credit", "loan"):
                    liabilities += bal

        if target_date in nw_map:
            nw_map[target_date].assets = assets
            nw_map[target_date].liabilities = liabilities
            nw_map[target_date].net_worth = assets - liabilities
        else:
            session.add(NetWorthSnapshot(
                user_id=user.id,
                date=target_date,
                assets=assets,
                liabilities=liabilities,
                net_worth=assets - liabilities,
            ))
        snapshots_updated += 1

    session.commit()

    return {
        "imported": imported,
        "accounts_created": accounts_created,
        "snapshots_updated": snapshots_updated,
    }
