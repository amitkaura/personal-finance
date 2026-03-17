"""Admin panel endpoints – overview, user management, analytics."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from app.auth import get_current_user
from app.config import get_settings
from app.database import get_session
from app.models import (
    Account,
    AccountBalanceSnapshot,
    AccountType,
    ActivityAction,
    ActivityLog,
    Budget,
    Category,
    CategoryRule,
    ErrorLog,
    ErrorType,
    Goal,
    GoalAccountLink,
    GoalContribution,
    Household,
    HouseholdInvitation,
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

router = APIRouter(prefix="/admin", tags=["admin"])


def _is_admin(user: User) -> bool:
    settings = get_settings()
    return user.is_admin or bool(
        settings.admin_email and user.email == settings.admin_email
    )


def _require_admin(user: User) -> None:
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")


# ── Overview ────────────────────────────────────────────────────


@router.get("/overview")
def admin_overview(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    now = datetime.now(timezone.utc)

    total_users = session.exec(select(func.count(User.id))).one()
    total_accounts = session.exec(select(func.count(Account.id))).one()
    linked_accounts = session.exec(
        select(func.count(Account.id)).where(Account.is_linked == True)  # noqa: E712
    ).one()
    manual_accounts = total_accounts - linked_accounts
    total_transactions = session.exec(select(func.count(Transaction.id))).one()
    total_households = session.exec(select(func.count(Household.id))).one()

    active_7d_cutoff = now - timedelta(days=7)
    active_7d = session.exec(
        select(func.count(func.distinct(ActivityLog.user_id))).where(
            ActivityLog.created_at >= active_7d_cutoff
        )
    ).one()

    active_30d_cutoff = now - timedelta(days=30)
    active_30d = session.exec(
        select(func.count(func.distinct(ActivityLog.user_id))).where(
            ActivityLog.created_at >= active_30d_cutoff
        )
    ).one()

    recent_errors = session.exec(
        select(func.count(ErrorLog.id)).where(
            ErrorLog.created_at >= now - timedelta(days=7)
        )
    ).one()

    return {
        "total_users": total_users,
        "active_7d": active_7d,
        "active_30d": active_30d,
        "total_accounts": total_accounts,
        "linked_accounts": linked_accounts,
        "manual_accounts": manual_accounts,
        "total_transactions": total_transactions,
        "total_households": total_households,
        "recent_errors": recent_errors,
    }


# ── Users ───────────────────────────────────────────────────────


class UserUpdateBody(BaseModel):
    is_admin: Optional[bool] = None
    is_disabled: Optional[bool] = None


@router.get("/users")
def admin_users(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    search: Optional[str] = None,
    active_days: Optional[int] = None,
    has_linked: Optional[bool] = None,
    has_manual: Optional[bool] = None,
    sort: Optional[str] = None,
):
    _require_admin(user)

    query = select(User)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            col(User.email).ilike(pattern) | col(User.name).ilike(pattern)
        )

    if active_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=active_days)
        active_ids = select(ActivityLog.user_id).where(
            ActivityLog.created_at >= cutoff
        ).distinct()
        query = query.where(col(User.id).in_(active_ids))

    if has_linked is True:
        linked_ids = select(Account.user_id).where(Account.is_linked == True).distinct()  # noqa: E712
        query = query.where(col(User.id).in_(linked_ids))

    if has_manual is True:
        manual_ids = select(Account.user_id).where(Account.is_linked == False).distinct()  # noqa: E712
        query = query.where(col(User.id).in_(manual_ids))

    total = session.exec(
        select(func.count()).select_from(query.subquery())
    ).one()

    users = session.exec(query.offset(offset).limit(limit)).all()

    items = []
    for u in users:
        acct_count = session.exec(
            select(func.count(Account.id)).where(Account.user_id == u.id)
        ).one()
        txn_count = session.exec(
            select(func.count(Transaction.id)).where(Transaction.user_id == u.id)
        ).one()
        last_activity = session.exec(
            select(ActivityLog.created_at)
            .where(ActivityLog.user_id == u.id)
            .order_by(col(ActivityLog.created_at).desc())
            .limit(1)
        ).first()

        items.append({
            "id": u.id,
            "email": u.email,
            "name": u.display_name or u.name,
            "picture": u.avatar_url or u.picture,
            "is_admin": u.is_admin,
            "is_disabled": u.is_disabled,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "account_count": acct_count,
            "transaction_count": txn_count,
            "last_active": last_activity.isoformat() if last_activity else None,
        })

    if sort == "account_count_desc":
        items.sort(key=lambda x: x["account_count"], reverse=True)

    return {"items": items, "total": total}


@router.patch("/users/{user_id}")
def admin_update_user(
    user_id: int,
    body: UserUpdateBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.is_admin is not None:
        target.is_admin = body.is_admin
    if body.is_disabled is not None:
        target.is_disabled = body.is_disabled

    session.add(target)
    session.commit()
    session.refresh(target)

    return {
        "id": target.id,
        "email": target.email,
        "name": target.display_name or target.name,
        "is_admin": target.is_admin,
        "is_disabled": target.is_disabled,
    }


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Walk the FK dependency chain from deepest to shallowest
    # 1. Activity + error logs
    session.exec(select(ActivityLog).where(ActivityLog.user_id == user_id)).all()
    for row in session.exec(select(ActivityLog).where(ActivityLog.user_id == user_id)).all():
        session.delete(row)

    for row in session.exec(select(ErrorLog).where(ErrorLog.user_id == user_id)).all():
        session.delete(row)

    # 2. TransactionTags (via transactions)
    txn_ids = [
        t.id for t in session.exec(
            select(Transaction).where(Transaction.user_id == user_id)
        ).all()
    ]
    if txn_ids:
        for row in session.exec(
            select(TransactionTag).where(col(TransactionTag.transaction_id).in_(txn_ids))
        ).all():
            session.delete(row)

    # 3. Transactions
    for row in session.exec(select(Transaction).where(Transaction.user_id == user_id)).all():
        session.delete(row)

    # 4. AccountBalanceSnapshots (via accounts)
    acct_ids = [
        a.id for a in session.exec(
            select(Account).where(Account.user_id == user_id)
        ).all()
    ]
    if acct_ids:
        for row in session.exec(
            select(AccountBalanceSnapshot).where(col(AccountBalanceSnapshot.account_id).in_(acct_ids))
        ).all():
            session.delete(row)

    # 5. GoalAccountLinks (via accounts AND goals)
    goal_ids = [
        g.id for g in session.exec(
            select(Goal).where(Goal.user_id == user_id)
        ).all()
    ]
    if acct_ids:
        for row in session.exec(
            select(GoalAccountLink).where(col(GoalAccountLink.account_id).in_(acct_ids))
        ).all():
            session.delete(row)
    if goal_ids:
        for row in session.exec(
            select(GoalAccountLink).where(col(GoalAccountLink.goal_id).in_(goal_ids))
        ).all():
            session.delete(row)

    # 6. Accounts
    for row in session.exec(select(Account).where(Account.user_id == user_id)).all():
        session.delete(row)

    # 7. GoalContributions
    for row in session.exec(select(GoalContribution).where(GoalContribution.user_id == user_id)).all():
        session.delete(row)

    # 8. Goals
    for row in session.exec(select(Goal).where(Goal.user_id == user_id)).all():
        session.delete(row)

    # 9. NetWorthSnapshots
    for row in session.exec(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id)).all():
        session.delete(row)

    # 10. Tags (TransactionTags already deleted above)
    for row in session.exec(select(Tag).where(Tag.user_id == user_id)).all():
        session.delete(row)

    # 11. Categories, rules, settings
    for row in session.exec(select(Category).where(Category.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(CategoryRule).where(CategoryRule.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(UserSettings).where(UserSettings.user_id == user_id)).all():
        session.delete(row)

    # 12. Budgets, spending preferences
    for row in session.exec(select(Budget).where(Budget.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(SpendingPreference).where(SpendingPreference.user_id == user_id)).all():
        session.delete(row)

    # 13. Household invitations (as inviter)
    for row in session.exec(select(HouseholdInvitation).where(HouseholdInvitation.invited_by_user_id == user_id)).all():
        session.delete(row)

    # 14. Household membership
    for row in session.exec(select(HouseholdMember).where(HouseholdMember.user_id == user_id)).all():
        session.delete(row)

    # 15. Plaid items (accounts already deleted)
    for row in session.exec(select(PlaidItem).where(PlaidItem.user_id == user_id)).all():
        session.delete(row)

    # 16. Finally delete the user
    session.delete(target)
    session.commit()

    return {"ok": True}


# ── Plaid Health ────────────────────────────────────────────────


@router.get("/plaid-health")
def admin_plaid_health(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    plaid_types = [ErrorType.PLAID_SYNC, ErrorType.PLAID_LINK]
    total = session.exec(
        select(func.count(ErrorLog.id)).where(
            col(ErrorLog.error_type).in_([t.value for t in plaid_types])
        )
    ).one()

    recent = session.exec(
        select(ErrorLog)
        .where(col(ErrorLog.error_type).in_([t.value for t in plaid_types]))
        .order_by(col(ErrorLog.created_at).desc())
        .limit(20)
    ).all()

    return {
        "total_plaid_errors": total,
        "recent_errors": [
            {
                "id": e.id,
                "user_id": e.user_id,
                "error_type": e.error_type if isinstance(e.error_type, str) else e.error_type.value,
                "endpoint": e.endpoint,
                "status_code": e.status_code,
                "detail": e.detail,
                "created_at": e.created_at.isoformat(),
            }
            for e in recent
        ],
    }


# ── Error Log ───────────────────────────────────────────────────


@router.get("/errors")
def admin_errors(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: Optional[int] = None,
    error_type: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    _require_admin(user)

    query = select(ErrorLog)
    if user_id is not None:
        query = query.where(ErrorLog.user_id == user_id)
    if error_type:
        query = query.where(ErrorLog.error_type == error_type)
    if start:
        query = query.where(ErrorLog.created_at >= datetime.fromisoformat(start))
    if end:
        query = query.where(ErrorLog.created_at <= datetime.fromisoformat(end))

    total = session.exec(
        select(func.count()).select_from(query.subquery())
    ).one()

    rows = session.exec(
        query.order_by(col(ErrorLog.created_at).desc()).offset(offset).limit(limit)
    ).all()

    return {
        "items": [
            {
                "id": e.id,
                "user_id": e.user_id,
                "error_type": e.error_type if isinstance(e.error_type, str) else e.error_type.value,
                "endpoint": e.endpoint,
                "status_code": e.status_code,
                "detail": e.detail,
                "created_at": e.created_at.isoformat(),
            }
            for e in rows
        ],
        "total": total,
    }


# ── Analytics: Active Users ────────────────────────────────────


@router.get("/analytics/active-users")
def admin_active_users(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    days: int = Query(default=90, le=365),
):
    _require_admin(user)

    today = date.today()
    start = today - timedelta(days=days)
    result = []

    for i in range(days + 1):
        d = start + timedelta(days=i)
        day_start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        dau = session.exec(
            select(func.count(func.distinct(ActivityLog.user_id))).where(
                ActivityLog.created_at >= day_start,
                ActivityLog.created_at < day_end,
            )
        ).one()

        week_start = day_start - timedelta(days=6)
        wau = session.exec(
            select(func.count(func.distinct(ActivityLog.user_id))).where(
                ActivityLog.created_at >= week_start,
                ActivityLog.created_at < day_end,
            )
        ).one()

        month_start = day_start - timedelta(days=29)
        mau = session.exec(
            select(func.count(func.distinct(ActivityLog.user_id))).where(
                ActivityLog.created_at >= month_start,
                ActivityLog.created_at < day_end,
            )
        ).one()

        result.append({
            "date": d.isoformat(),
            "dau": dau,
            "wau": wau,
            "mau": mau,
        })

    return result


# ── Analytics: Feature Adoption ─────────────────────────────────


@router.get("/analytics/feature-adoption")
def admin_feature_adoption(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    total_users = session.exec(select(func.count(User.id))).one() or 1

    features = [
        ("budgets", select(func.count(func.distinct(Budget.user_id)))),
        ("goals", select(func.count(func.distinct(Goal.user_id)))),
        ("tags", select(func.count(func.distinct(Tag.user_id)))),
        ("categories", select(func.count(func.distinct(Category.user_id)))),
        ("category_rules", select(func.count(func.distinct(CategoryRule.user_id)))),
        ("linked_accounts", select(func.count(func.distinct(Account.user_id))).where(Account.is_linked == True)),  # noqa: E712
    ]

    result = []
    for name, query in features:
        count = session.exec(query).one()
        result.append({
            "feature": name,
            "user_count": count,
            "percentage": round(count / total_users * 100, 1),
        })

    return result


# ── Analytics: Transaction Volume ───────────────────────────────


@router.get("/analytics/transaction-volume")
def admin_transaction_volume(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    days: int = Query(default=90, le=365),
):
    _require_admin(user)

    today = date.today()
    start = today - timedelta(days=days)
    result = []

    for i in range(days + 1):
        d = start + timedelta(days=i)
        count = session.exec(
            select(func.count(Transaction.id)).where(Transaction.date == d)
        ).one()
        result.append({"date": d.isoformat(), "count": count})

    return result


# ── Analytics: Storage ──────────────────────────────────────────


_STORAGE_TABLES = [
    ("users", User),
    ("accounts", Account),
    ("transactions", Transaction),
    ("categories", Category),
    ("category_rules", CategoryRule),
    ("budgets", Budget),
    ("goals", Goal),
    ("tags", Tag),
    ("transaction_tags", TransactionTag),
    ("plaid_items", PlaidItem),
    ("households", Household),
    ("household_members", HouseholdMember),
    ("net_worth_snapshots", NetWorthSnapshot),
    ("account_balance_snapshots", AccountBalanceSnapshot),
    ("activity_log", ActivityLog),
    ("error_log", ErrorLog),
]


@router.get("/analytics/storage")
def admin_storage(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    result = []
    for name, model in _STORAGE_TABLES:
        count = session.exec(select(func.count(model.id))).one()
        result.append({"table_name": name, "row_count": count})

    return result


# ── User Detail ──────────────────────────────────────────────────


@router.get("/users/{user_id}/detail")
def admin_user_detail(
    user_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _require_admin(user)

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    acct_count = session.exec(
        select(func.count(Account.id)).where(Account.user_id == user_id)
    ).one()
    txn_count = session.exec(
        select(func.count(Transaction.id)).where(Transaction.user_id == user_id)
    ).one()
    last_activity = session.exec(
        select(ActivityLog.created_at)
        .where(ActivityLog.user_id == user_id)
        .order_by(col(ActivityLog.created_at).desc())
        .limit(1)
    ).first()

    user_summary = {
        "id": target.id,
        "email": target.email,
        "name": target.display_name or target.name,
        "picture": target.avatar_url or target.picture,
        "is_admin": target.is_admin,
        "is_disabled": target.is_disabled,
        "created_at": target.created_at.isoformat() if target.created_at else None,
        "account_count": acct_count,
        "transaction_count": txn_count,
        "last_active": last_activity.isoformat() if last_activity else None,
    }

    accounts = session.exec(
        select(Account).where(Account.user_id == user_id)
    ).all()
    accounts_out = [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type.value if isinstance(a.type, AccountType) else a.type,
            "subtype": a.subtype,
            "current_balance": float(a.current_balance),
            "is_linked": a.is_linked,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in accounts
    ]

    recent_txns = session.exec(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(col(Transaction.date).desc())
        .limit(20)
    ).all()
    txns_out = []
    for t in recent_txns:
        acct_name = None
        if t.account_id:
            acct = session.get(Account, t.account_id)
            acct_name = acct.name if acct else None
        txns_out.append({
            "id": t.id,
            "date": t.date.isoformat(),
            "merchant_name": t.merchant_name,
            "amount": float(t.amount),
            "category": t.category,
            "account_name": acct_name,
        })

    recent_activity = session.exec(
        select(ActivityLog)
        .where(ActivityLog.user_id == user_id)
        .order_by(col(ActivityLog.created_at).desc())
        .limit(20)
    ).all()
    activity_out = [
        {
            "action": a.action.value if isinstance(a.action, ActivityAction) else a.action,
            "detail": a.detail,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in recent_activity
    ]

    total_transactions = session.exec(
        select(func.count(Transaction.id)).where(Transaction.user_id == user_id)
    ).one()
    first_txn_date = session.exec(
        select(func.min(Transaction.date)).where(Transaction.user_id == user_id)
    ).first()
    categories_used = session.exec(
        select(func.count(func.distinct(Transaction.category)))
        .where(Transaction.user_id == user_id)
        .where(Transaction.category.isnot(None))  # type: ignore[union-attr]
    ).one()
    rules_created = session.exec(
        select(func.count(CategoryRule.id)).where(CategoryRule.user_id == user_id)
    ).one()
    tags_created = session.exec(
        select(func.count(Tag.id)).where(Tag.user_id == user_id)
    ).one()

    stats = {
        "total_transactions": total_transactions,
        "first_transaction_date": first_txn_date.isoformat() if first_txn_date else None,
        "categories_used": categories_used,
        "rules_created": rules_created,
        "tags_created": tags_created,
    }

    return {
        "user": user_summary,
        "accounts": accounts_out,
        "recent_transactions": txns_out,
        "recent_activity": activity_out,
        "stats": stats,
    }
