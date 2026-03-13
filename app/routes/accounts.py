"""Account endpoints."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, AccountType, User

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def list_accounts(
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    user_ids = get_scoped_user_ids(session, user, scope)
    accounts = session.exec(
        select(Account).where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
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
    }
    if owner_names:
        info = owner_names.get(a.user_id, {})
        d["owner_name"] = info.get("name", "")
        d["owner_picture"] = info.get("picture")
    return d


class AccountUpdate(BaseModel):
    type: Optional[str] = None
    subtype: Optional[str] = None
    name: Optional[str] = None


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
    if body.type is not None:
        valid_types = {t.value for t in AccountType}
        if body.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")
        acct.type = AccountType(body.type)
    if body.subtype is not None:
        acct.subtype = body.subtype
    if body.name is not None:
        acct.name = body.name
    session.add(acct)
    session.commit()
    session.refresh(acct)
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
    from app.plaid_client import get_plaid_client

    item = session.get(PlaidItem, plaid_item_id)
    if not item:
        return

    try:
        from plaid.model.item_remove_request import ItemRemoveRequest
        client = get_plaid_client()
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
            Account.is_linked == True,  # noqa: E712
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

    assets = total(dep) + total(inv)
    liabilities = total(cred) + total(loan)

    return {
        "net_worth": assets - liabilities,
        "total_balance": float(sum(a.current_balance for a in accounts)),
        "depository_balance": total(dep),
        "investment_balance": total(inv),
        "credit_balance": total(cred),
        "loan_balance": total(loan),
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
