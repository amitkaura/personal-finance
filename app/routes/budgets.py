"""Budget endpoints – category-based monthly budgets with rollover."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, Budget, Transaction, User

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _validate_month(month: str) -> str:
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", month):
        raise HTTPException(status_code=400, detail="Month must be in YYYY-MM format")
    return month


class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: Optional[str] = None
    rollover: bool = False


class BudgetUpdate(BaseModel):
    amount: Optional[float] = None
    rollover: Optional[bool] = None


def _budget_to_dict(b: Budget) -> dict:
    return {
        "id": b.id,
        "category": b.category,
        "amount": float(b.amount),
        "month": b.month,
        "rollover": b.rollover,
    }


@router.get("")
def list_budgets(
    month: Optional[str] = Query(None),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = _validate_month(month) if month else _current_month()
    user_ids = get_scoped_user_ids(session, user, scope)
    budgets = session.exec(
        select(Budget).where(
            Budget.user_id.in_(user_ids),  # type: ignore[union-attr]
            Budget.month == m,
        )
    ).all()
    return [_budget_to_dict(b) for b in budgets]


@router.post("", status_code=201)
def create_budget(
    body: BudgetCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = _validate_month(body.month) if body.month else _current_month()
    existing = session.exec(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.category == body.category,
            Budget.month == m,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Budget already exists for this category/month")
    budget = Budget(
        user_id=user.id,
        category=body.category,
        amount=Decimal(str(body.amount)),
        month=m,
        rollover=body.rollover,
    )
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _budget_to_dict(budget)


@router.patch("/{budget_id}")
def update_budget(
    budget_id: int,
    body: BudgetUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    budget = session.get(Budget, budget_id)
    if not budget or budget.user_id != user.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    if body.amount is not None:
        budget.amount = Decimal(str(body.amount))
    if body.rollover is not None:
        budget.rollover = body.rollover
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _budget_to_dict(budget)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    budget = session.get(Budget, budget_id)
    if not budget or budget.user_id != user.id:
        raise HTTPException(status_code=404, detail="Budget not found")
    session.delete(budget)
    session.commit()


@router.post("/copy")
def copy_budgets(
    source_month: str = Query(...),
    target_month: str = Query(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Copy all budgets from one month to another."""
    source_month = _validate_month(source_month)
    target_month = _validate_month(target_month)
    source = session.exec(
        select(Budget).where(Budget.user_id == user.id, Budget.month == source_month)
    ).all()
    if not source:
        raise HTTPException(status_code=404, detail="No budgets found for source month")

    created = 0
    for b in source:
        existing = session.exec(
            select(Budget).where(
                Budget.user_id == user.id,
                Budget.category == b.category,
                Budget.month == target_month,
            )
        ).first()
        if existing:
            continue
        new_budget = Budget(
            user_id=user.id,
            category=b.category,
            amount=b.amount,
            month=target_month,
            rollover=b.rollover,
        )
        session.add(new_budget)
        created += 1
    session.commit()
    return {"copied": created, "target_month": target_month}


@router.get("/summary")
def budget_summary(
    month: Optional[str] = Query(None),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Budget vs actual spending for each category in a given month."""
    m = _validate_month(month) if month else _current_month()
    year, mo = int(m[:4]), int(m[5:7])
    user_ids = get_scoped_user_ids(session, user, scope)

    budgets = session.exec(
        select(Budget).where(
            Budget.user_id.in_(user_ids),  # type: ignore[union-attr]
            Budget.month == m,
        )
    ).all()

    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all()

    from datetime import date as date_type

    month_start = date_type(year, mo, 1)
    if mo == 12:
        month_end = date_type(year + 1, 1, 1)
    else:
        month_end = date_type(year, mo + 1, 1)

    txns = session.exec(
        select(Transaction).where(
            Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
            Transaction.date >= month_start,
            Transaction.date < month_end,
        )
    ).all()
    # Also include manual transactions
    manual_txns = session.exec(
        select(Transaction).where(
            Transaction.user_id.in_(user_ids),  # type: ignore[union-attr]
            Transaction.is_manual == True,
            Transaction.date >= month_start,
            Transaction.date < month_end,
        )
    ).all()

    all_txns = list(txns) + [t for t in manual_txns if t not in txns]

    spent_by_cat: dict[str, float] = {}
    for t in all_txns:
        if t.category and t.amount > 0:  # expenses are positive in Plaid
            spent_by_cat[t.category] = spent_by_cat.get(t.category, 0) + float(t.amount)

    # Calculate rollover from previous month
    rollover_by_cat: dict[str, float] = {}
    for b in budgets:
        if b.rollover:
            if mo == 1:
                prev_month = f"{year - 1}-12"
            else:
                prev_month = f"{year}-{mo - 1:02d}"
            prev_budget = session.exec(
                select(Budget).where(
                    Budget.user_id == b.user_id,
                    Budget.category == b.category,
                    Budget.month == prev_month,
                )
            ).first()
            if prev_budget:
                prev_year, prev_mo = int(prev_month[:4]), int(prev_month[5:7])
                prev_start = date_type(prev_year, prev_mo, 1)
                prev_end = date_type(year, mo, 1)
                prev_txns = session.exec(
                    select(Transaction).where(
                        Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                        Transaction.date >= prev_start,
                        Transaction.date < prev_end,
                        Transaction.category == b.category,
                    )
                ).all()
                prev_spent = sum(float(t.amount) for t in prev_txns if t.amount > 0)
                leftover = float(prev_budget.amount) - prev_spent
                if leftover > 0:
                    rollover_by_cat[b.category] = leftover

    items = []
    total_budgeted = 0.0
    total_spent = 0.0
    budgeted_by_cat: dict[str, float] = {}
    category_ids: dict[str, int] = {}
    for b in budgets:
        budgeted_by_cat[b.category] = budgeted_by_cat.get(b.category, 0.0) + float(b.amount)
        if b.id is not None and b.category not in category_ids:
            category_ids[b.category] = b.id

    for category, budgeted in sorted(budgeted_by_cat.items()):
        spent = spent_by_cat.get(category, 0)
        rollover = rollover_by_cat.get(category, 0)
        effective = budgeted + rollover
        total_budgeted += effective
        total_spent += spent
        items.append({
            "id": category_ids.get(category, 0),
            "category": category,
            "budgeted": budgeted,
            "rollover": rollover,
            "effective_budget": effective,
            "spent": spent,
            "remaining": effective - spent,
            "percent_used": round(spent / effective * 100, 1) if effective > 0 else 0,
        })

    return {
        "month": m,
        "items": items,
        "total_budgeted": total_budgeted,
        "total_spent": total_spent,
        "total_remaining": total_budgeted - total_spent,
    }
