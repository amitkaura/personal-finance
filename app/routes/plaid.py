"""Plaid Link and sync endpoints."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.item_remove_request import ItemRemoveRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.categorizer import categorize_by_rules, categorize_batch_llm
from app.crypto import decrypt_token, encrypt_token
from app.database import get_session
from app.models import Account, AccountType, PlaidItem, Transaction, User
from app.plaid_client import get_plaid_client

router = APIRouter(prefix="/plaid", tags=["plaid"])


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: str | None = None


class ExchangeTokenResponse(BaseModel):
    item_id: str
    accounts_synced: int


@router.post("/link-token", response_model=LinkTokenResponse)
def create_link_token(user: User = Depends(get_current_user)):
    """Generate a Plaid Link token to initialize the Link flow."""
    client = get_plaid_client()
    request = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=str(user.id)),
        client_name="Personal Finance",
        products=[Products("transactions"), Products("liabilities")],
        country_codes=[CountryCode("US"), CountryCode("CA")],
        language="en",
    )
    response = client.link_token_create(request)
    return LinkTokenResponse(link_token=response.link_token)


@router.post("/exchange-token", response_model=ExchangeTokenResponse)
def exchange_public_token(
    body: ExchangeTokenRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Exchange a public token for an access token and persist the Plaid item."""
    client = get_plaid_client()

    exchange_request = ItemPublicTokenExchangeRequest(public_token=body.public_token)
    exchange_response = client.item_public_token_exchange(exchange_request)

    access_token = exchange_response.access_token
    item_id = exchange_response.item_id

    plaid_item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token(access_token),
        item_id=item_id,
        institution_name=body.institution_name,
    )
    session.add(plaid_item)
    session.commit()
    session.refresh(plaid_item)

    accounts_request = AccountsGetRequest(access_token=access_token)
    accounts_response = client.accounts_get(accounts_request)

    synced = 0
    for acct in accounts_response.accounts:
        existing = session.exec(
            select(Account).where(Account.plaid_account_id == acct.account_id)
        ).first()
        if existing:
            existing.plaid_item_id = plaid_item.id
            existing.user_id = user.id
            existing.is_linked = True
            existing.current_balance = Decimal(str(acct.balances.current or 0))
            if acct.balances.available is not None:
                existing.available_balance = Decimal(str(acct.balances.available))
            if acct.balances.limit is not None:
                existing.credit_limit = Decimal(str(acct.balances.limit))
            existing.currency_code = acct.balances.iso_currency_code or existing.currency_code
            if acct.official_name:
                existing.official_name = acct.official_name
            session.add(existing)
        else:
            db_account = _plaid_account_to_db(acct, plaid_item.id, user.id)
            session.add(db_account)
        synced += 1

    session.commit()

    background_tasks.add_task(sync_transactions, plaid_item.id)

    return ExchangeTokenResponse(item_id=item_id, accounts_synced=synced)


@router.post("/sync/{plaid_item_id}")
def trigger_sync(
    plaid_item_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Manually trigger a transaction sync for a specific Plaid item."""
    item = session.get(PlaidItem, plaid_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plaid item not found")
    background_tasks.add_task(sync_transactions, plaid_item_id)
    return {"status": "sync_started", "plaid_item_id": plaid_item_id}


@router.post("/sync-all")
def trigger_sync_all(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Sync transactions for all linked Plaid items belonging to the current user."""
    items = session.exec(
        select(PlaidItem).where(PlaidItem.user_id == user.id)
    ).all()
    if not items:
        raise HTTPException(status_code=404, detail="No Plaid items linked")
    for item in items:
        background_tasks.add_task(sync_transactions, item.id)
    return {"status": "sync_started", "items_queued": len(items)}


@router.get("/items")
def list_plaid_items(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """List all Plaid items (institution connections) with their accounts."""
    items = session.exec(
        select(PlaidItem).where(PlaidItem.user_id == user.id)
    ).all()
    result = []
    for item in items:
        accounts = session.exec(
            select(Account).where(Account.plaid_item_id == item.id)
        ).all()
        result.append({
            "id": item.id,
            "item_id": item.item_id,
            "institution_name": item.institution_name,
            "accounts": [
                {
                    "id": a.id,
                    "name": a.name,
                    "type": a.type.value if hasattr(a.type, "value") else a.type,
                    "subtype": a.subtype,
                    "current_balance": float(a.current_balance),
                    "is_linked": a.is_linked,
                }
                for a in accounts
            ],
        })
    return result


@router.post("/items/{plaid_item_id}/unlink")
def unlink_plaid_item(
    plaid_item_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Unlink all accounts under a Plaid item, revoke token, delete the item."""
    item = session.get(PlaidItem, plaid_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Plaid item not found")

    accounts = session.exec(
        select(Account).where(Account.plaid_item_id == item.id)
    ).all()

    for acct in accounts:
        acct.current_balance = Decimal("0")
        acct.available_balance = None
        acct.credit_limit = None
        acct.is_linked = False
        acct.plaid_item_id = None
        session.add(acct)

    try:
        client = get_plaid_client()
        access_token = decrypt_token(item.encrypted_access_token)
        client.item_remove(ItemRemoveRequest(access_token=access_token))
    except Exception:
        pass

    session.delete(item)
    session.commit()

    return {
        "status": "unlinked",
        "institution_name": item.institution_name,
        "accounts_unlinked": len(accounts),
    }


def sync_transactions(plaid_item_id: int) -> None:
    """Fetch the last 30 days of transactions from Plaid and upsert them."""
    from app.database import engine

    with Session(engine) as session:
        item = session.get(PlaidItem, plaid_item_id)
        if not item:
            return

        user_id = item.user_id
        access_token = decrypt_token(item.encrypted_access_token)
        client = get_plaid_client()

        end_date = date.today()
        start_date = end_date - timedelta(days=30)

        offset = 0
        total = 1
        while offset < total:
            txn_request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date,
                options=TransactionsGetRequestOptions(offset=offset, count=100),
            )
            txn_response = client.transactions_get(txn_request)
            total = txn_response.total_transactions

            for txn in txn_response.transactions:
                existing = session.exec(
                    select(Transaction).where(
                        Transaction.plaid_transaction_id == txn.transaction_id
                    )
                ).first()

                account = session.exec(
                    select(Account).where(
                        Account.plaid_account_id == txn.account_id
                    )
                ).first()

                plaid_cat = None
                if hasattr(txn, "personal_finance_category") and txn.personal_finance_category:
                    plaid_cat = getattr(txn.personal_finance_category, "primary", None)
                elif txn.category:
                    plaid_cat = " > ".join(txn.category)

                if existing:
                    existing.amount = Decimal(str(txn.amount))
                    existing.merchant_name = txn.merchant_name
                    existing.plaid_category_code = plaid_cat
                    existing.pending_status = txn.pending
                    existing.date = txn.date
                    session.add(existing)
                else:
                    new_txn = Transaction(
                        plaid_transaction_id=txn.transaction_id,
                        date=txn.date,
                        amount=Decimal(str(txn.amount)),
                        merchant_name=txn.merchant_name,
                        plaid_category_code=plaid_cat,
                        category=None,
                        pending_status=txn.pending,
                        needs_review=True,
                        account_id=account.id if account else None,
                    )
                    session.add(new_txn)

            session.commit()

            batch_size = len(txn_response.transactions)
            if batch_size == 0:
                break
            offset += batch_size

        # Batch auto-categorize all uncategorized transactions for this user
        user_account_ids = session.exec(
            select(Account.id).where(Account.user_id == user_id)
        ).all()
        pending = session.exec(
            select(Transaction).where(
                Transaction.needs_review == True,
                Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
            )
        ).all()

        llm_candidates = []
        for t in pending:
            cat = categorize_by_rules(t.merchant_name or "", session, user_id)
            if cat:
                t.category = cat
                t.needs_review = False
                session.add(t)
            else:
                llm_candidates.append(t)

        if llm_candidates:
            llm_results = categorize_batch_llm(llm_candidates, user_id)
            for t in llm_candidates:
                cat = llm_results.get(t.id)
                if cat:
                    t.category = cat
                    t.needs_review = False
                    session.add(t)

        session.commit()

        _update_balances(session, access_token, plaid_item_id, user_id)


def _update_balances(session: Session, access_token: str, plaid_item_id: int, user_id: int) -> None:
    """Refresh account balances and metadata after a sync."""
    client = get_plaid_client()
    accounts_response = client.accounts_get(
        AccountsGetRequest(access_token=access_token)
    )
    for acct in accounts_response.accounts:
        db_account = session.exec(
            select(Account).where(Account.plaid_account_id == acct.account_id)
        ).first()
        if db_account:
            db_account.current_balance = Decimal(str(acct.balances.current or 0))
            if acct.balances.available is not None:
                db_account.available_balance = Decimal(str(acct.balances.available))
            if acct.balances.limit is not None:
                db_account.credit_limit = Decimal(str(acct.balances.limit))
            db_account.currency_code = acct.balances.iso_currency_code or db_account.currency_code
            if acct.official_name:
                db_account.official_name = acct.official_name
            if hasattr(acct, "subtype") and acct.subtype and not db_account.subtype:
                db_account.subtype = acct.subtype.value if hasattr(acct.subtype, "value") else str(acct.subtype)
            acct_type = acct.type.value if acct.type else None
            if acct_type and acct_type in {t.value for t in AccountType}:
                db_account.type = AccountType(acct_type)

    session.commit()


def _plaid_account_to_db(acct, plaid_item_id: int, user_id: int) -> Account:
    """Map a Plaid account object to our Account model."""
    acct_type = acct.type.value if acct.type else "depository"
    valid_types = {t.value for t in AccountType}
    if acct_type not in valid_types:
        acct_type = "depository"

    acct_subtype = None
    if hasattr(acct, "subtype") and acct.subtype:
        acct_subtype = acct.subtype.value if hasattr(acct.subtype, "value") else str(acct.subtype)

    return Account(
        user_id=user_id,
        name=acct.name,
        official_name=acct.official_name,
        type=AccountType(acct_type),
        subtype=acct_subtype,
        current_balance=Decimal(str(acct.balances.current or 0)),
        available_balance=Decimal(str(acct.balances.available)) if acct.balances.available is not None else None,
        credit_limit=Decimal(str(acct.balances.limit)) if acct.balances.limit is not None else None,
        currency_code=acct.balances.iso_currency_code or "CAD",
        plaid_account_id=acct.account_id,
        plaid_item_id=plaid_item_id,
    )
