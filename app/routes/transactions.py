"""Transaction endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import date as date_type
from datetime import timedelta
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, or_, select

from app.auth import get_current_user
from app.categorizer import auto_categorize_pending
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, Tag, Transaction, TransactionTag, User

router = APIRouter(prefix="/transactions", tags=["transactions"])

AVAILABLE_CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transportation",
    "Utilities",
    "Entertainment",
    "Shopping",
    "Health & Fitness",
    "Travel",
    "Education",
    "Subscriptions",
    "Income",
    "Transfer",
    "Rent & Mortgage",
    "Insurance",
    "Investments",
    "Other",
]


@router.get("")
def list_transactions(
    needs_review: Optional[bool] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    user_ids = get_scoped_user_ids(session, user, scope)
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all()
    stmt = (
        select(Transaction)
        .where(
            or_(
                Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                Transaction.user_id.in_(user_ids),  # type: ignore[union-attr]
            )
        )
        .order_by(Transaction.date.desc())
    )
    if needs_review is not None:
        stmt = stmt.where(Transaction.needs_review == needs_review)
    if category:
        stmt = stmt.where(Transaction.category == category)
    stmt = stmt.offset(offset).limit(limit)
    txns = session.exec(stmt).all()

    owner_map: dict[int, dict] = {}
    user_info_map: dict[int, dict] = {}
    if scope != "personal":
        user_cache: dict[int, dict] = {}
        for uid in user_ids:
            if uid not in user_cache:
                u = session.get(User, uid)
                user_cache[uid] = {
                    "name": (u.display_name or u.name) if u else "",
                    "picture": (u.avatar_url or u.picture) if u else None,
                }
            user_info_map[uid] = user_cache[uid]

        accounts_with_owners = session.exec(
            select(Account.id, Account.user_id).where(
                Account.user_id.in_(user_ids)  # type: ignore[union-attr]
            )
        ).all()
        for aid, uid in accounts_with_owners:
            owner_map[aid] = user_cache.get(uid, {"name": "", "picture": None})

    txn_ids = [t.id for t in txns if t.id is not None]
    tags_by_txn = _load_tags_for_transactions(session, txn_ids)

    return [
        _txn_to_dict(t, owner_map, user_info_map, tags_by_txn)
        for t in txns
    ]


@router.get("/categories")
def get_categories():
    return AVAILABLE_CATEGORIES


class TransactionCreate(BaseModel):
    date: str
    amount: float
    merchant_name: str
    category: Optional[str] = None
    notes: Optional[str] = None
    account_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    needs_review: Optional[bool] = None
    category: Optional[str] = None
    merchant_name: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    notes: Optional[str] = None


@router.post("", status_code=201)
def create_transaction(
    body: TransactionCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Create a manual transaction."""
    if body.category is not None and body.category not in AVAILABLE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if body.account_id:
        acct = session.get(Account, body.account_id)
        if not acct or acct.user_id != user.id:
            raise HTTPException(status_code=404, detail="Account not found")

    txn = Transaction(
        plaid_transaction_id=f"manual-{uuid4().hex}",
        date=date_type.fromisoformat(body.date),
        amount=Decimal(str(body.amount)),
        merchant_name=body.merchant_name,
        category=body.category,
        needs_review=False,
        account_id=body.account_id,
        is_manual=True,
        notes=body.notes,
        user_id=user.id,
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)
    tags_by_txn = _load_tags_for_transactions(session, [txn.id] if txn.id else [])
    return _txn_to_dict(txn, tags_by_txn=tags_by_txn)


@router.patch("/{transaction_id}")
def update_transaction(
    transaction_id: int,
    body: TransactionUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.account_id:
        acct = session.get(Account, txn.account_id)
        if not acct or acct.user_id != user.id:
            raise HTTPException(status_code=404, detail="Transaction not found")
    elif not txn.user_id or txn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if body.needs_review is not None:
        txn.needs_review = body.needs_review
    if body.category is not None:
        if body.category not in AVAILABLE_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        txn.category = body.category
    if body.merchant_name is not None:
        txn.merchant_name = body.merchant_name
    if body.amount is not None:
        txn.amount = Decimal(str(body.amount))
    if body.date is not None:
        txn.date = date_type.fromisoformat(body.date)
    if body.notes is not None:
        txn.notes = body.notes
    session.add(txn)
    session.commit()
    session.refresh(txn)
    tags_by_txn = _load_tags_for_transactions(session, [txn.id] if txn.id else [])
    return _txn_to_dict(txn, tags_by_txn=tags_by_txn)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete a manual transaction."""
    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if not txn.is_manual:
        raise HTTPException(status_code=400, detail="Only manual transactions can be deleted")
    if not txn.user_id or txn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tag_links = session.exec(
        select(TransactionTag).where(TransactionTag.transaction_id == transaction_id)
    ).all()
    for link in tag_links:
        session.delete(link)
    session.delete(txn)
    session.commit()


@router.post("/auto-categorize")
def auto_categorize(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Batch-categorize all transactions that need review using rules + LLM."""
    result = auto_categorize_pending(session, user.id)
    return result


@router.get("/recurring")
def recurring_transactions(
    months: int = Query(12, ge=1, le=60),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Detect recurring transactions with frequency and amount analysis."""
    user_ids = get_scoped_user_ids(session, user, scope)
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all()
    cutoff_days = months * 31
    from datetime import date as dt_date
    cutoff = dt_date.today() - timedelta(days=cutoff_days)
    txns = session.exec(
        select(Transaction)
        .where(
            or_(
                Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                Transaction.user_id.in_(user_ids),  # type: ignore[union-attr]
            ),
            Transaction.date >= cutoff,
        )
        .order_by(Transaction.date.desc())
    ).all()

    merchant_data: dict[str, list[Transaction]] = defaultdict(list)
    for t in txns:
        if t.merchant_name and float(t.amount) > 0:
            merchant_data[t.merchant_name.lower()].append(t)

    recurring = []
    for _merchant_key, merchant_txns in merchant_data.items():
        if len(merchant_txns) < 2:
            continue

        sorted_txns = sorted(merchant_txns, key=lambda t: t.date, reverse=True)
        amounts = [float(t.amount) for t in sorted_txns]
        avg_amount = sum(amounts) / len(amounts)
        amount_variance = max(amounts) - min(amounts)
        is_consistent = amount_variance / avg_amount < 0.15 if avg_amount > 0 else False

        gaps = []
        for i in range(len(sorted_txns) - 1):
            gap = (sorted_txns[i].date - sorted_txns[i + 1].date).days
            gaps.append(gap)
        avg_gap = sum(gaps) / len(gaps) if gaps else 0

        if avg_gap <= 10:
            frequency = "weekly"
        elif avg_gap <= 20:
            frequency = "bi-weekly"
        elif avg_gap <= 45:
            frequency = "monthly"
        elif avg_gap <= 100:
            frequency = "quarterly"
        elif avg_gap <= 200:
            frequency = "semi-annual"
        else:
            frequency = "annual"

        latest = sorted_txns[0]
        next_expected = None
        if avg_gap > 0:
            next_date = latest.date + timedelta(days=int(avg_gap))
            next_expected = next_date.isoformat()

        recurring.append({
            "merchant_name": latest.merchant_name,
            "category": latest.category,
            "latest_amount": float(latest.amount),
            "average_amount": round(avg_amount, 2),
            "is_consistent_amount": is_consistent,
            "frequency": frequency,
            "occurrence_count": len(sorted_txns),
            "last_date": latest.date.isoformat(),
            "next_expected": next_expected,
        })

    recurring.sort(key=lambda x: x["average_amount"], reverse=True)
    return recurring


def _txn_to_dict(
    t: Transaction,
    owner_map: dict[int, dict] | None = None,
    user_info_map: dict[int, dict] | None = None,
    tags_by_txn: dict[int, list[dict]] | None = None,
) -> dict:
    tags = tags_by_txn.get(t.id, []) if tags_by_txn and t.id else []

    d = {
        "id": t.id,
        "date": t.date.isoformat(),
        "amount": float(t.amount),
        "merchant_name": t.merchant_name,
        "plaid_category_code": t.plaid_category_code,
        "category": t.category,
        "pending_status": t.pending_status,
        "needs_review": t.needs_review,
        "account_id": t.account_id,
        "plaid_transaction_id": t.plaid_transaction_id,
        "is_manual": t.is_manual,
        "notes": t.notes,
        "tags": tags,
    }
    info: dict | None = None
    if owner_map and t.account_id:
        info = owner_map.get(t.account_id)
    elif user_info_map and t.user_id:
        info = user_info_map.get(t.user_id)
    if info:
        d["owner_name"] = info.get("name", "")
        d["owner_picture"] = info.get("picture")
    return d


def _load_tags_for_transactions(
    session: Session,
    transaction_ids: list[int],
) -> dict[int, list[dict]]:
    if not transaction_ids:
        return {}
    tag_links = session.exec(
        select(TransactionTag).where(
            TransactionTag.transaction_id.in_(transaction_ids)  # type: ignore[union-attr]
        )
    ).all()
    if not tag_links:
        return {}

    tag_ids = sorted({link.tag_id for link in tag_links})
    tags = session.exec(
        select(Tag).where(Tag.id.in_(tag_ids))  # type: ignore[union-attr]
    ).all()
    tag_map = {
        tag.id: {"id": tag.id, "name": tag.name, "color": tag.color}
        for tag in tags
        if tag.id is not None
    }

    out: dict[int, list[dict]] = {}
    for link in tag_links:
        if link.transaction_id not in out:
            out[link.transaction_id] = []
        tag_payload = tag_map.get(link.tag_id)
        if tag_payload:
            out[link.transaction_id].append(tag_payload)
    return out
