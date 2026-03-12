"""Transaction endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.categorizer import auto_categorize_pending
from app.database import get_session
from app.models import Account, Transaction, User

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
    offset: int = Query(0),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id == user.id)
    ).all()
    stmt = (
        select(Transaction)
        .where(Transaction.account_id.in_(user_account_ids))  # type: ignore[union-attr]
        .order_by(Transaction.date.desc())
    )
    if needs_review is not None:
        stmt = stmt.where(Transaction.needs_review == needs_review)
    if category:
        stmt = stmt.where(Transaction.category == category)
    stmt = stmt.offset(offset).limit(limit)
    txns = session.exec(stmt).all()
    return [_txn_to_dict(t) for t in txns]


@router.get("/categories")
def get_categories():
    return AVAILABLE_CATEGORIES


class TransactionUpdate(BaseModel):
    needs_review: Optional[bool] = None
    category: Optional[str] = None


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
    acct = session.get(Account, txn.account_id) if txn.account_id else None
    if not acct or acct.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if body.needs_review is not None:
        txn.needs_review = body.needs_review
    if body.category is not None:
        txn.category = body.category
    session.add(txn)
    session.commit()
    session.refresh(txn)
    return _txn_to_dict(txn)


@router.post("/auto-categorize")
def auto_categorize(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Batch-categorize all transactions that need review using rules + LLM."""
    result = auto_categorize_pending(session, user.id)
    return result


def _txn_to_dict(t: Transaction) -> dict:
    return {
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
    }
