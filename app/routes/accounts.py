"""Account endpoints."""

from __future__ import annotations

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
