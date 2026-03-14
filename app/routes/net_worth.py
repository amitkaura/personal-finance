"""Net worth history – snapshots and historical tracking."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, or_, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, AccountBalanceSnapshot, AccountType, NetWorthSnapshot, User

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


def take_snapshot(session: Session, user_id: int) -> NetWorthSnapshot:
    """Create a net worth snapshot for today (or update if one already exists)."""
    accounts = session.exec(
        select(Account).where(
            Account.user_id == user_id,
            or_(
                Account.is_linked == True,  # noqa: E712
                Account.plaid_account_id.startswith("manual-"),  # type: ignore[union-attr]
            ),
        )
    ).all()

    assets = Decimal("0")
    liabilities = Decimal("0")
    for a in accounts:
        t = a.type.value if hasattr(a.type, "value") else a.type
        if t in ("depository", "investment", "real_estate"):
            assets += a.current_balance
        elif t in ("credit", "loan"):
            liabilities += a.current_balance

    today = date.today()
    existing = session.exec(
        select(NetWorthSnapshot).where(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.date == today,
        )
    ).first()

    if existing:
        existing.assets = assets
        existing.liabilities = liabilities
        existing.net_worth = assets - liabilities
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    snapshot = NetWorthSnapshot(
        user_id=user_id,
        date=today,
        assets=assets,
        liabilities=liabilities,
        net_worth=assets - liabilities,
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return snapshot


def recompute_snapshot_for_date(
    session: Session, user_id: int, target_date: date
) -> NetWorthSnapshot:
    """Recompute net worth for a historical date using AccountBalanceSnapshot data."""
    accounts = session.exec(
        select(Account).where(
            Account.user_id == user_id,
            or_(
                Account.is_linked == True,  # noqa: E712
                Account.plaid_account_id.startswith("manual-"),  # type: ignore[union-attr]
            ),
        )
    ).all()

    assets = Decimal("0")
    liabilities = Decimal("0")
    for acct in accounts:
        snap = session.exec(
            select(AccountBalanceSnapshot)
            .where(
                AccountBalanceSnapshot.account_id == acct.id,
                AccountBalanceSnapshot.date <= target_date,
            )
            .order_by(AccountBalanceSnapshot.date.desc())
            .limit(1)
        ).first()
        if not snap:
            continue
        t = acct.type.value if hasattr(acct.type, "value") else acct.type
        if t in ("depository", "investment", "real_estate"):
            assets += snap.balance
        elif t in ("credit", "loan"):
            liabilities += snap.balance

    existing = session.exec(
        select(NetWorthSnapshot).where(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.date == target_date,
        )
    ).first()

    if existing:
        existing.assets = assets
        existing.liabilities = liabilities
        existing.net_worth = assets - liabilities
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    nw = NetWorthSnapshot(
        user_id=user_id,
        date=target_date,
        assets=assets,
        liabilities=liabilities,
        net_worth=assets - liabilities,
    )
    session.add(nw)
    session.commit()
    session.refresh(nw)
    return nw


@router.get("/history")
def net_worth_history(
    months: int = Query(12, ge=1, le=60),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return net worth snapshots for the last N months."""
    from datetime import timedelta

    user_ids = get_scoped_user_ids(session, user, scope)
    cutoff = date.today() - timedelta(days=months * 31)
    snapshots = session.exec(
        select(NetWorthSnapshot)
        .where(
            NetWorthSnapshot.user_id.in_(user_ids),  # type: ignore[union-attr]
            NetWorthSnapshot.date >= cutoff,
        )
        .order_by(NetWorthSnapshot.date.asc())
    ).all()
    by_date: dict[date, dict[str, Decimal]] = defaultdict(
        lambda: {"assets": Decimal("0"), "liabilities": Decimal("0"), "net_worth": Decimal("0")}
    )
    for s in snapshots:
        entry = by_date[s.date]
        entry["assets"] += s.assets
        entry["liabilities"] += s.liabilities
        entry["net_worth"] += s.net_worth

    return [
        {
            "date": d.isoformat(),
            "assets": float(values["assets"]),
            "liabilities": float(values["liabilities"]),
            "net_worth": float(values["net_worth"]),
        }
        for d, values in sorted(by_date.items(), key=lambda x: x[0])
    ]


@router.post("/snapshot")
def create_snapshot(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Manually trigger a net worth snapshot."""
    snapshot = take_snapshot(session, user.id)
    return {
        "date": snapshot.date.isoformat(),
        "assets": float(snapshot.assets),
        "liabilities": float(snapshot.liabilities),
        "net_worth": float(snapshot.net_worth),
    }
