"""Spending reports – category breakdown, trends, month-over-month."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, Transaction, User

router = APIRouter(prefix="/reports", tags=["reports"])


_MAX_TRANSACTIONS = 10_000
_MAX_MONTHS = 60


def _get_user_transactions(
    session: Session,
    user_ids: list[int],
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> list[Transaction]:
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all()
    stmt = select(Transaction).where(
        Transaction.account_id.in_(user_account_ids)  # type: ignore[union-attr]
    )
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    stmt = stmt.limit(_MAX_TRANSACTIONS)
    txns = list(session.exec(stmt).all())

    manual_stmt = select(Transaction).where(
        Transaction.user_id.in_(user_ids),  # type: ignore[union-attr]
        Transaction.is_manual == True,
    )
    if start:
        manual_stmt = manual_stmt.where(Transaction.date >= start)
    if end:
        manual_stmt = manual_stmt.where(Transaction.date <= end)
    manual_stmt = manual_stmt.limit(_MAX_TRANSACTIONS)
    manual_txns = session.exec(manual_stmt).all()
    seen_ids = {t.id for t in txns}
    txns.extend(t for t in manual_txns if t.id not in seen_ids)
    return txns


@router.get("/spending-by-category")
def spending_by_category(
    months: int = Query(1, ge=1, le=_MAX_MONTHS),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Category-level spending breakdown for the last N months."""
    today = date.today()
    if today.month - months + 1 > 0:
        start = date(today.year, today.month - months + 1, 1)
    else:
        years_back = (months - today.month) // 12 + 1
        start_month = today.month - months + 1 + 12 * years_back
        start = date(today.year - years_back, start_month, 1)

    user_ids = get_scoped_user_ids(session, user, scope)
    txns = _get_user_transactions(session, user_ids, start=start, end=today)

    by_cat: dict[str, float] = defaultdict(float)
    total_expenses = 0.0
    total_income = 0.0

    for t in txns:
        amt = float(t.amount)
        cat = t.category or "Uncategorized"
        if amt > 0:
            by_cat[cat] += amt
            total_expenses += amt
        else:
            total_income += abs(amt)

    categories = sorted(by_cat.items(), key=lambda x: x[1], reverse=True)
    items = []
    for cat, amount in categories:
        items.append({
            "category": cat,
            "amount": round(amount, 2),
            "percent": round(amount / total_expenses * 100, 1) if total_expenses > 0 else 0,
        })

    return {
        "period_months": months,
        "total_expenses": round(total_expenses, 2),
        "total_income": round(total_income, 2),
        "categories": items,
    }


@router.get("/monthly-trends")
def monthly_trends(
    months: int = Query(6, ge=1, le=_MAX_MONTHS),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Monthly income vs expenses over the last N months."""
    today = date.today()
    if today.month - months + 1 > 0:
        start = date(today.year, today.month - months + 1, 1)
    else:
        years_back = (months - today.month) // 12 + 1
        start_month = today.month - months + 1 + 12 * years_back
        start = date(today.year - years_back, start_month, 1)

    user_ids = get_scoped_user_ids(session, user, scope)
    txns = _get_user_transactions(session, user_ids, start=start, end=today)

    monthly: dict[str, dict[str, float]] = defaultdict(lambda: {"income": 0, "expenses": 0})

    for t in txns:
        month_key = t.date.strftime("%Y-%m")
        amt = float(t.amount)
        if amt > 0:
            monthly[month_key]["expenses"] += amt
        else:
            monthly[month_key]["income"] += abs(amt)

    result = []
    for key in sorted(monthly.keys()):
        data = monthly[key]
        result.append({
            "month": key,
            "income": round(data["income"], 2),
            "expenses": round(data["expenses"], 2),
            "net": round(data["income"] - data["expenses"], 2),
        })

    return result


@router.get("/category-trends")
def category_trends(
    category: str = Query(...),
    months: int = Query(6, ge=1, le=_MAX_MONTHS),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Monthly spending trend for a specific category."""
    today = date.today()
    if today.month - months + 1 > 0:
        start = date(today.year, today.month - months + 1, 1)
    else:
        years_back = (months - today.month) // 12 + 1
        start_month = today.month - months + 1 + 12 * years_back
        start = date(today.year - years_back, start_month, 1)

    user_ids = get_scoped_user_ids(session, user, scope)
    txns = _get_user_transactions(session, user_ids, start=start, end=today)
    filtered = [t for t in txns if t.category == category and float(t.amount) > 0]

    monthly: dict[str, float] = defaultdict(float)
    for t in filtered:
        month_key = t.date.strftime("%Y-%m")
        monthly[month_key] += float(t.amount)

    result = []
    for key in sorted(monthly.keys()):
        result.append({
            "month": key,
            "amount": round(monthly[key], 2),
        })

    avg = sum(d["amount"] for d in result) / len(result) if result else 0

    return {
        "category": category,
        "months": result,
        "average": round(avg, 2),
    }


@router.get("/top-merchants")
def top_merchants(
    months: int = Query(3, ge=1, le=_MAX_MONTHS),
    limit: int = Query(10, ge=1, le=50),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Top merchants by total spend."""
    today = date.today()
    if today.month - months + 1 > 0:
        start = date(today.year, today.month - months + 1, 1)
    else:
        years_back = (months - today.month) // 12 + 1
        start_month = today.month - months + 1 + 12 * years_back
        start = date(today.year - years_back, start_month, 1)

    user_ids = get_scoped_user_ids(session, user, scope)
    txns = _get_user_transactions(session, user_ids, start=start, end=today)

    by_merchant: dict[str, dict] = {}
    for t in txns:
        if not t.merchant_name or float(t.amount) <= 0:
            continue
        name = t.merchant_name
        if name not in by_merchant:
            by_merchant[name] = {"total": 0, "count": 0, "category": t.category}
        by_merchant[name]["total"] += float(t.amount)
        by_merchant[name]["count"] += 1

    sorted_merchants = sorted(by_merchant.items(), key=lambda x: x[1]["total"], reverse=True)
    return [
        {
            "merchant": name,
            "total": round(data["total"], 2),
            "count": data["count"],
            "category": data["category"],
        }
        for name, data in sorted_merchants[:limit]
    ]
