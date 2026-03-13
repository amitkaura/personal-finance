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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, or_, select

from app.auth import get_current_user
from app.categorizer import categorize_by_rules
from app.crypto import decrypt_token, encrypt_token
from app.database import get_session
from app.models import (
    Account,
    AccountType,
    Budget,
    Category,
    CategoryRule,
    Goal,
    GoalAccountLink,
    GoalContribution,
    HouseholdMember,
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

    data = body.model_dump(exclude_unset=True)
    if "sync_hour" in data and data["sync_hour"] is not None:
        if not (0 <= data["sync_hour"] <= 23):
            raise HTTPException(status_code=400, detail="sync_hour must be 0-23")
    if "sync_minute" in data and data["sync_minute"] is not None:
        if not (0 <= data["sync_minute"] <= 59):
            raise HTTPException(status_code=400, detail="sync_minute must be 0-59")

    for field, value in data.items():
        if field == "llm_api_key" and value:
            value = encrypt_token(value)
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
        "Pending", "Account ID",
    ])
    for t in txns:
        writer.writerow([
            t.date.isoformat(),
            t.merchant_name or "",
            float(t.amount),
            t.category or "",
            t.pending_status,
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


# ── Factory Reset ──────────────────────────────────────────────


@router.delete("/all-data", status_code=204)
def factory_reset(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete ALL user financial data while preserving the User record and household membership."""
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
    for acct in session.exec(select(Account).where(Account.user_id == user.id)).all():
        session.delete(acct)

    for item in session.exec(select(PlaidItem).where(PlaidItem.user_id == user.id)).all():
        try:
            from app.crypto import decrypt_token
            from app.plaid_client import get_plaid_client
            from plaid.model.item_remove_request import ItemRemoveRequest
            client = get_plaid_client()
            access_token = decrypt_token(item.encrypted_access_token)
            client.item_remove(ItemRemoveRequest(access_token=access_token))
        except Exception:
            pass
        session.delete(item)

    settings = session.exec(select(UserSettings).where(UserSettings.user_id == user.id)).first()
    if settings:
        session.delete(settings)

    session.commit()


# ── Per-Account CSV Import (streaming NDJSON) ─────────────────


class ImportRow(BaseModel):
    date: str
    amount: float
    merchant_name: str
    category: Optional[str] = None


class ImportRequest(BaseModel):
    transactions: list[ImportRow]


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
            _import_generator(body.transactions, acct, session, user),
            media_type="application/x-ndjson",
        )
    return _import_sync(body.transactions, acct, session, user)


def _import_sync(
    rows: list[ImportRow], acct: Account, session: Session, user: User,
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
        if not category:
            category = categorize_by_rules(row.merchant_name, session, user.id)
            if category:
                categorized += 1

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
):
    imported = skipped = categorized = 0
    errors: list[str] = []
    total = len(rows)

    for idx, row in enumerate(rows, 1):
        status = "imported"
        cat: str | None = None

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
                categorized += 1
                status = "categorized"

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


class BulkImportRequest(BaseModel):
    accounts: list[BulkAccountEntry] = []
    transactions: list[BulkTransactionRow]
    new_categories: list[str] = []


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

    accepts = request.headers.get("accept", "")
    if "application/x-ndjson" in accepts:
        return StreamingResponse(
            _bulk_import_generator(body.transactions, account_map, owner_map, session, user),
            media_type="application/x-ndjson",
        )
    return _bulk_import_sync(body.transactions, account_map, owner_map, session, user)


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
        acct = Account(
            user_id=user.id,
            name=entry.name,
            type=AccountType(entry.type),
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
    user: User,
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
        owner_id = _pick_owner_id(row.owner_name, owner_map, user.id)  # type: ignore[arg-type]

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
        if not category:
            category = categorize_by_rules(row.merchant_name, session, user.id)  # type: ignore[arg-type]
            if category:
                categorized += 1

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
    user: User,
):
    imported = skipped = categorized = 0
    errors: list[str] = []
    total = len(rows)

    for idx, row in enumerate(rows, 1):
        status = "imported"
        cat: str | None = None

        try:
            parsed_date = date_type.fromisoformat(row.date)
        except ValueError:
            errors.append(f"Invalid date: {row.date}")
            yield _ndjson({"type": "progress", "current": idx, "total": total,
                           "merchant": row.merchant_name, "status": "error", "category": None})
            continue

        acct_id = account_map.get(row.account_name.lower()) if row.account_name else None
        owner_id = _pick_owner_id(row.owner_name, owner_map, user.id)  # type: ignore[arg-type]

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
            cat = categorize_by_rules(row.merchant_name, session, user.id)  # type: ignore[arg-type]
            if cat:
                categorized += 1
                status = "categorized"

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
