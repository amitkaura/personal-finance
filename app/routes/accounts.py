"""Account endpoints."""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from sqlalchemy import delete as sa_delete, func
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, or_, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, AccountBalanceSnapshot, AccountType, GoalAccountLink, Transaction, TransactionTag, User

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def list_accounts(
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    user_ids = get_scoped_user_ids(session, user, scope)
    accounts = session.exec(
        select(Account)
        .where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
        .order_by(func.lower(Account.name), Account.id)
    ).all()
    owner_info = _build_owner_info(session, user_ids)
    return [_acct_to_dict(a, owner_info) for a in accounts]


def _build_owner_info(session: Session, user_ids: list[int]) -> dict[int, dict]:
    """Map user_id -> {name, picture} for badge display."""
    owners: dict[int, dict] = {}
    for uid in user_ids:
        u = session.get(User, uid)
        if u:
            owners[uid] = {
                "name": u.display_name or u.name,
                "picture": u.avatar_url or u.picture,
            }
    return owners


def _acct_to_dict(a: Account, owner_names: dict[int, dict] | None = None) -> dict:
    d = {
        "id": a.id,
        "user_id": a.user_id,
        "name": a.name,
        "official_name": a.official_name,
        "type": a.type.value if hasattr(a.type, "value") else a.type,
        "subtype": a.subtype,
        "current_balance": float(a.current_balance),
        "available_balance": float(a.available_balance) if a.available_balance is not None else None,
        "credit_limit": float(a.credit_limit) if a.credit_limit is not None else None,
        "currency_code": a.currency_code,
        "plaid_account_id": a.plaid_account_id,
        "plaid_item_id": a.plaid_item_id,
        "is_linked": a.is_linked,
        "statement_available_day": a.statement_available_day,
    }
    if owner_names:
        info = owner_names.get(a.user_id, {})
        d["owner_name"] = info.get("name", "")
        d["owner_picture"] = info.get("picture")
    return d


@router.get("/statement-reminders")
def statement_reminders(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return accounts whose statement day matches today (with last-day-of-month fallback)."""
    today = date.today()
    last_day = calendar.monthrange(today.year, today.month)[1]

    accounts = session.exec(
        select(Account).where(
            Account.user_id == user.id,
            Account.statement_available_day.is_not(None),  # type: ignore[union-attr]
        )
    ).all()

    results = []
    for a in accounts:
        day = a.statement_available_day
        if day == today.day or (day > last_day and today.day == last_day):
            results.append({
                "id": a.id,
                "name": a.name,
                "statement_available_day": day,
            })
    return results


class AccountCreate(BaseModel):
    name: str = Field(max_length=200)
    type: str = "depository"
    subtype: Optional[str] = None
    current_balance: float = 0
    statement_available_day: Optional[int] = Field(default=None, ge=1, le=31)


@router.post("")
def create_account(
    body: AccountCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Create a manual (non-Plaid) account."""
    valid_types = {t.value for t in AccountType}
    if body.type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Must be one of: {', '.join(valid_types)}",
        )

    acct = Account(
        user_id=user.id,
        name=body.name,
        type=AccountType(body.type),
        subtype=body.subtype,
        current_balance=Decimal(str(body.current_balance)),
        plaid_account_id=f"manual-{uuid4().hex}",
        plaid_item_id=None,
        is_linked=False,
        statement_available_day=body.statement_available_day,
    )
    session.add(acct)
    session.commit()
    session.refresh(acct)

    from app.routes.net_worth import take_snapshot
    try:
        take_snapshot(session, user.id)
    except Exception:
        pass

    return _acct_to_dict(acct)


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Delete a manual or unlinked account and its transactions."""
    # #region agent log
    _pfx = "[DEBUG-ff3a38]"
    # #endregion
    acct = session.get(Account, account_id)
    # #region agent log
    print(f"{_pfx} account_lookup: account_id={account_id} found={acct is not None} acct_user_id={acct.user_id if acct else None} current_user_id={user.id}")
    # #endregion
    if not acct or acct.user_id != user.id:
        # #region agent log
        print(f"{_pfx} 404_raised: reason={'not_found' if not acct else 'user_mismatch'} acct_user_id={acct.user_id if acct else None} current_user_id={user.id}")
        # #endregion
        raise HTTPException(status_code=404, detail="Account not found")
    if acct.is_linked:
        raise HTTPException(status_code=400, detail="Unlink the account before deleting it")

    txn_subq = select(Transaction.id).where(Transaction.account_id == account_id)

    # #region agent log
    import time as _t; _t0 = _t.monotonic()
    # #endregion

    session.exec(sa_delete(TransactionTag).where(TransactionTag.transaction_id.in_(txn_subq)))  # type: ignore[arg-type]
    session.exec(sa_delete(Transaction).where(Transaction.account_id == account_id))  # type: ignore[arg-type]
    session.exec(sa_delete(GoalAccountLink).where(GoalAccountLink.account_id == account_id))  # type: ignore[arg-type]
    session.exec(sa_delete(AccountBalanceSnapshot).where(AccountBalanceSnapshot.account_id == account_id))  # type: ignore[arg-type]

    session.delete(acct)
    # #region agent log
    print(f"{_pfx} before_commit: bulk deletes done in {(_t.monotonic()-_t0)*1000:.0f}ms")
    # #endregion
    try:
        session.commit()
    except Exception as e:
        # #region agent log
        print(f"{_pfx} commit_error: {type(e).__name__}: {e}")
        # #endregion
        raise
    # #region agent log
    print(f"{_pfx} delete_success: account_id={account_id} elapsed={(_t.monotonic()-_t0)*1000:.0f}ms")
    # #endregion
    return {"ok": True}


class AccountUpdate(BaseModel):
    type: Optional[str] = None
    subtype: Optional[str] = None
    name: Optional[str] = None
    current_balance: Optional[float] = None
    statement_available_day: Optional[int] = Field(default=None, ge=1, le=31)


@router.patch("/{account_id}")
def update_account(
    account_id: int,
    body: AccountUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    acct = session.get(Account, account_id)
    if not acct or acct.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    balance_changed = False
    if body.current_balance is not None:
        if not acct.plaid_account_id or not acct.plaid_account_id.startswith("manual-"):
            raise HTTPException(status_code=400, detail="Balance can only be edited on manual accounts")
        acct.current_balance = Decimal(str(body.current_balance))
        balance_changed = True
    if body.type is not None:
        valid_types = {t.value for t in AccountType}
        if body.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")
        acct.type = AccountType(body.type)
    if body.subtype is not None:
        acct.subtype = body.subtype
    if body.name is not None:
        acct.name = body.name
    raw = body.model_dump(exclude_unset=True)
    if "statement_available_day" in raw:
        acct.statement_available_day = raw["statement_available_day"]
    session.add(acct)
    session.commit()
    session.refresh(acct)

    if balance_changed:
        from app.routes.net_worth import take_snapshot
        try:
            take_snapshot(session, user.id)
        except Exception:
            pass

    return _acct_to_dict(acct)


@router.post("/{account_id}/unlink")
def unlink_account(
    account_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Unlink a single account: zero balances, mark unlinked, revoke Plaid item if last account."""
    from app.models import PlaidItem

    acct = session.get(Account, account_id)
    if not acct or acct.user_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    if not acct.is_linked:
        raise HTTPException(status_code=400, detail="Account is already unlinked")

    acct.current_balance = Decimal("0")
    acct.available_balance = None
    acct.credit_limit = None
    acct.is_linked = False

    plaid_item_id = acct.plaid_item_id
    acct.plaid_item_id = None
    session.add(acct)
    session.commit()

    if plaid_item_id:
        remaining = session.exec(
            select(Account).where(
                Account.plaid_item_id == plaid_item_id,
                Account.is_linked == True,
            )
        ).all()
        if not remaining:
            _revoke_and_delete_item(session, plaid_item_id)

    session.refresh(acct)
    return _acct_to_dict(acct)


def _revoke_and_delete_item(session: Session, plaid_item_id: int) -> None:
    """Revoke the Plaid access token and delete the PlaidItem record."""
    from app.crypto import decrypt_token
    from app.models import PlaidItem
    from app.plaid_client import get_household_plaid_client_for_user_id

    item = session.get(PlaidItem, plaid_item_id)
    if not item:
        return

    try:
        from plaid.model.item_remove_request import ItemRemoveRequest
        client = get_household_plaid_client_for_user_id(session, item.user_id)
        access_token = decrypt_token(item.encrypted_access_token)
        client.item_remove(ItemRemoveRequest(access_token=access_token))
    except Exception:
        pass

    session.delete(item)
    session.commit()


@router.get("/summary")
def accounts_summary(
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Aggregated balance info for the dashboard."""
    user_ids = get_scoped_user_ids(session, user, scope)
    accounts = session.exec(
        select(Account).where(
            Account.user_id.in_(user_ids),  # type: ignore[union-attr]
            or_(
                Account.is_linked == True,  # noqa: E712
                Account.plaid_account_id.startswith("manual-"),  # type: ignore[union-attr]
            ),
        )
    ).all()
    by_type: dict[str, list] = {}
    for a in accounts:
        t = a.type.value if hasattr(a.type, "value") else a.type
        by_type.setdefault(t, []).append(a)

    def total(accts: list) -> float:
        return float(sum(a.current_balance for a in accts))

    dep = by_type.get("depository", [])
    inv = by_type.get("investment", [])
    cred = by_type.get("credit", [])
    loan = by_type.get("loan", [])
    re = by_type.get("real_estate", [])

    assets = total(dep) + total(inv) + total(re)
    liabilities = total(cred) + total(loan)

    return {
        "net_worth": assets - liabilities,
        "total_balance": float(sum(a.current_balance for a in accounts)),
        "depository_balance": total(dep),
        "investment_balance": total(inv),
        "credit_balance": total(cred),
        "loan_balance": total(loan),
        "real_estate_balance": total(re),
        "credit_accounts": [
            {
                "id": a.id, "name": a.name, "official_name": a.official_name,
                "subtype": a.subtype,
                "current_balance": float(a.current_balance),
                "available_balance": float(a.available_balance) if a.available_balance is not None else None,
                "credit_limit": float(a.credit_limit) if a.credit_limit is not None else None,
            }
            for a in cred
        ],
        "loan_accounts": [
            {
                "id": a.id, "name": a.name, "official_name": a.official_name,
                "subtype": a.subtype,
                "current_balance": float(a.current_balance),
            }
            for a in loan
        ],
        "account_count": len(accounts),
    }
