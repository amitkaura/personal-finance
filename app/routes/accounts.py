"""Account endpoints."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Account, AccountType

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def list_accounts(session: Session = Depends(get_session)):
    accounts = session.exec(select(Account)).all()
    return [_acct_to_dict(a) for a in accounts]


def _acct_to_dict(a: Account) -> dict:
    return {
        "id": a.id,
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


class AccountUpdate(BaseModel):
    type: Optional[str] = None
    subtype: Optional[str] = None
    name: Optional[str] = None


@router.patch("/{account_id}")
def update_account(
    account_id: int,
    body: AccountUpdate,
    session: Session = Depends(get_session),
):
    acct = session.get(Account, account_id)
    if not acct:
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
):
    """Unlink a single account: zero balances, mark unlinked, revoke Plaid item if last account."""
    from app.models import PlaidItem

    acct = session.get(Account, account_id)
    if not acct:
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
def accounts_summary(session: Session = Depends(get_session)):
    """Aggregated balance info for the dashboard."""
    accounts = session.exec(select(Account)).all()
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
