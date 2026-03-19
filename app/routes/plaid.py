"""Plaid Link and sync endpoints."""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from starlette.responses import StreamingResponse
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
from app.categorizer import categorize_batch_llm, load_rules, match_rules
from app.crypto import decrypt_token, encrypt_token
from app.database import get_session
from app.household import get_scoped_user_ids
from sqlalchemy import delete as sa_delete

from app.models import (
    Account,
    AccountType,
    PlaidItem,
    PlaidWebhookEvent,
    PLAID_ITEM_STATUS_ERROR,
    PLAID_ITEM_STATUS_HEALTHY,
    PLAID_ITEM_STATUS_NEW_ACCOUNTS,
    PLAID_ITEM_STATUS_PENDING_DISCONNECT,
    PLAID_ITEM_STATUS_REVOKED,
    SYNC_TRIGGERING_CODES,
    Transaction,
    User,
)
from app.plaid_client import get_app_plaid_client, get_household_plaid_client, get_household_plaid_client_for_user_id
from app.webhook_verify import verify_plaid_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plaid", tags=["plaid"])


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: str | None = None
    institution_id: str | None = None


class ExchangeTokenResponse(BaseModel):
    item_id: str
    accounts_synced: int


@router.post("/link-token", response_model=LinkTokenResponse)
def create_link_token(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Generate a Plaid Link token to initialize the Link flow."""
    from app.config import get_settings

    settings = get_settings()
    client = get_household_plaid_client(session, user)

    webhook_url = f"{settings.app_url}/api/v1/plaid/webhook"
    request = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=str(user.id)),
        client_name="Personal Finance",
        products=[Products("transactions"), Products("liabilities")],
        country_codes=[CountryCode("US"), CountryCode("CA")],
        language="en",
        webhook=webhook_url,
    )
    response = client.link_token_create(request)
    return LinkTokenResponse(link_token=response.link_token)


@router.post("/link-token/update/{plaid_item_id}", response_model=LinkTokenResponse)
def create_update_link_token(
    plaid_item_id: int,
    account_selection: bool = Query(False),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Generate a Plaid Link token for update mode (re-authentication or account selection)."""
    from app.config import get_settings
    from plaid.model.link_token_create_request_update import LinkTokenCreateRequestUpdate

    item = session.exec(
        select(PlaidItem).where(
            PlaidItem.id == plaid_item_id,
            PlaidItem.user_id == user.id,
        )
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Plaid item not found")

    settings = get_settings()
    client = get_household_plaid_client(session, user)
    access_token = decrypt_token(item.encrypted_access_token)

    webhook_url = f"{settings.app_url}/api/v1/plaid/webhook"
    kwargs: dict = {
        "user": LinkTokenCreateRequestUser(client_user_id=str(user.id)),
        "client_name": "Personal Finance",
        "country_codes": [CountryCode("US"), CountryCode("CA")],
        "language": "en",
        "webhook": webhook_url,
        "access_token": access_token,
    }
    if account_selection:
        kwargs["update"] = LinkTokenCreateRequestUpdate(account_selection_enabled=True)

    request = LinkTokenCreateRequest(**kwargs)
    response = client.link_token_create(request)
    return LinkTokenResponse(link_token=response.link_token)


@router.post("/items/{plaid_item_id}/repair")
def repair_plaid_item(
    plaid_item_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Mark a PlaidItem as healthy after successful update mode and trigger sync."""
    item = session.exec(
        select(PlaidItem).where(
            PlaidItem.id == plaid_item_id,
            PlaidItem.user_id == user.id,
        )
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Plaid item not found")

    item.status = PLAID_ITEM_STATUS_HEALTHY
    item.plaid_error_code = None
    item.plaid_error_message = None
    session.add(item)
    session.commit()

    background_tasks.add_task(sync_transactions, item.id)

    return {"status": "repaired"}


@router.post("/exchange-token", response_model=ExchangeTokenResponse)
def exchange_public_token(
    body: ExchangeTokenRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Exchange a public token for an access token and persist the Plaid item."""
    if body.institution_id:
        user_scope_ids = set(get_scoped_user_ids(session, user, "household"))
        existing_item = session.exec(
            select(PlaidItem).where(
                PlaidItem.institution_id == body.institution_id,
                PlaidItem.user_id.in_(user_scope_ids),  # type: ignore[union-attr]
            )
        ).first()
        if existing_item:
            raise HTTPException(
                status_code=409,
                detail=f"{existing_item.institution_name or 'This institution'} is already linked. "
                       "Use the Connections page to manage your existing connection.",
            )

    client = get_household_plaid_client(session, user)

    exchange_request = ItemPublicTokenExchangeRequest(public_token=body.public_token)
    exchange_response = client.item_public_token_exchange(exchange_request)

    access_token = exchange_response.access_token
    item_id = exchange_response.item_id

    plaid_item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token(access_token),
        item_id=item_id,
        institution_name=body.institution_name,
        institution_id=body.institution_id,
    )
    session.add(plaid_item)
    session.flush()

    accounts_request = AccountsGetRequest(access_token=access_token)
    accounts_response = client.accounts_get(accounts_request)

    synced = 0
    user_scope_ids = set(get_scoped_user_ids(session, user, "household"))
    for acct in accounts_response.accounts:
        existing = session.exec(
            select(Account).where(Account.plaid_account_id == acct.account_id)
        ).first()
        if existing:
            if existing.user_id not in user_scope_ids:
                raise HTTPException(
                    status_code=409,
                    detail="Account is already linked to another user",
                )
            existing.plaid_item_id = plaid_item.id
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
    session.refresh(plaid_item)

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


@router.post("/sync-all-stream")
def sync_all_stream(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Sync all Plaid items with streaming NDJSON progress events."""
    items = session.exec(
        select(PlaidItem).where(PlaidItem.user_id == user.id)
    ).all()
    if not items:
        raise HTTPException(status_code=404, detail="No Plaid items linked")
    get_household_plaid_client(session, user)
    return StreamingResponse(
        _sync_all_stream_generator(items, user.id, session),
        media_type="application/x-ndjson",
    )


def _build_account_map(session: Session, user_id: int) -> dict[str, Account]:
    """Preload all accounts for a user into {plaid_account_id: Account}."""
    accounts = session.exec(
        select(Account).where(Account.user_id == user_id)
    ).all()
    return {a.plaid_account_id: a for a in accounts if a.plaid_account_id}


def _extract_plaid_category(txn) -> str | None:
    """Extract category string from a Plaid transaction object."""
    if hasattr(txn, "personal_finance_category") and txn.personal_finance_category:
        return getattr(txn.personal_finance_category, "primary", None)
    elif txn.category:
        return " > ".join(txn.category)
    return None


def _upsert_plaid_page(
    session: Session,
    plaid_transactions: list,
    user_id: int,
    account_map: dict[str, Account],
    client,
    plaid_item_id: int,
) -> tuple[int, list[str]]:
    """Upsert a page of Plaid transactions using batch lookups.

    Returns (new_txn_count, discovered_account_names).
    """
    if not plaid_transactions:
        return 0, []

    plaid_ids = [t.transaction_id for t in plaid_transactions]
    existing_rows = session.exec(
        select(Transaction).where(
            Transaction.plaid_transaction_id.in_(plaid_ids)  # type: ignore[union-attr]
        )
    ).all()
    existing_map = {t.plaid_transaction_id: t for t in existing_rows}

    new_count = 0
    discovered: list[str] = []
    for txn in plaid_transactions:
        existing = existing_map.get(txn.transaction_id)
        account = account_map.get(txn.account_id)
        plaid_cat = _extract_plaid_category(txn)

        if not account and txn.account_id:
            account = _discover_account(
                session, txn.account_id, user_id, client, plaid_item_id,
                account_map, discovered,
            )

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
                account_id=account.id if account else None,
                user_id=user_id,
            )
            session.add(new_txn)
            new_count += 1

    return new_count, discovered


def _discover_account(
    session: Session,
    plaid_account_id: str,
    user_id: int,
    client,
    plaid_item_id: int,
    account_map: dict[str, Account],
    discovered: list[str],
) -> Account | None:
    """Fetch a missing account from Plaid, create it locally, and log the event."""
    import logging

    logger = logging.getLogger(__name__)

    if plaid_account_id in account_map:
        return account_map[plaid_account_id]

    try:
        access_token = decrypt_token(
            session.get(PlaidItem, plaid_item_id).encrypted_access_token  # type: ignore[union-attr]
        )
        resp = client.accounts_get(AccountsGetRequest(access_token=access_token))
    except Exception:
        logger.warning("Failed to fetch account %s from Plaid", plaid_account_id)
        return None

    for acct in resp.accounts:
        if acct.account_id == plaid_account_id:
            db_account = _plaid_account_to_db(acct, plaid_item_id, user_id)
            session.add(db_account)
            session.flush()
            account_map[plaid_account_id] = db_account
            discovered.append(db_account.name)

            logger.warning(
                "Auto-created account %s (plaid_id=%s) for user %d during sync",
                db_account.name, plaid_account_id, user_id,
            )

            from app.models import ActivityAction, ActivityLog
            session.add(ActivityLog(
                user_id=user_id,
                action=ActivityAction.ACCOUNT_DISCOVERED,
                detail=f"Auto-created account: {db_account.name}",
            ))

            return db_account

    logger.warning("Account %s not found in Plaid response", plaid_account_id)
    return None


def _sync_single_item(
    session: Session,
    item: PlaidItem,
    user_id: int,
    client,
    account_map: dict[str, Account],
) -> tuple[int, list[str]]:
    """Paginate through Plaid transactions for one item and upsert.

    Returns (new_txn_count, discovered_account_names).
    """
    access_token = decrypt_token(item.encrypted_access_token)
    end_date = date.today()
    start_date = end_date - timedelta(days=30)

    total_synced = 0
    all_discovered: list[str] = []
    offset = 0
    page_total = 1
    while offset < page_total:
        txn_request = TransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date,
            options=TransactionsGetRequestOptions(offset=offset, count=100),
        )
        txn_response = client.transactions_get(txn_request)
        page_total = txn_response.total_transactions

        new_count, discovered = _upsert_plaid_page(
            session, txn_response.transactions, user_id, account_map,
            client, item.id,
        )
        total_synced += new_count
        all_discovered.extend(discovered)
        session.commit()

        batch_size = len(txn_response.transactions)
        if batch_size == 0:
            break
        offset += batch_size

    return total_synced, all_discovered


def _categorize_uncategorized(
    session: Session, user_id: int,
) -> tuple[int, int, list[dict]]:
    """Batch-categorize uncategorized transactions. Returns (categorized, skipped, events)."""
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id == user_id)
    ).all()
    pending = session.exec(
        select(Transaction).where(
            Transaction.category == None,  # noqa: E711
            Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
        )
    ).all()

    if not pending:
        return 0, 0, []

    rules = load_rules(session, user_id)
    llm_pending: list[Transaction] = []
    rule_results: dict[int, str] = {}

    for t in pending:
        cat = match_rules(t.merchant_name or "", rules)
        if cat:
            t.category = cat
            session.add(t)
            rule_results[t.id] = cat
        else:
            llm_pending.append(t)

    llm_results = categorize_batch_llm(llm_pending, user_id) if llm_pending else {}
    for t in llm_pending:
        cat = llm_results.get(t.id)
        if cat:
            t.category = cat
            session.add(t)

    session.commit()

    categorized = 0
    events: list[dict] = []
    for idx, t in enumerate(pending, 1):
        cat = rule_results.get(t.id) or llm_results.get(t.id)
        status = "categorized" if cat else "skipped"
        if cat:
            categorized += 1
        events.append({
            "status": status,
            "current": idx,
            "total": len(pending),
            "merchant_name": t.merchant_name,
            "category": cat,
        })

    return categorized, len(pending) - categorized, events


def _sync_all_stream_generator(
    items: list[PlaidItem], user_id: int, session: Session,
):
    """Generator that syncs Plaid items and yields NDJSON progress events."""
    total_items = len(items)
    total_synced = 0

    account_map = _build_account_map(session, user_id)
    client = get_household_plaid_client_for_user_id(session, user_id)

    for idx, item in enumerate(items, 1):
        if not item:
            continue

        institution = item.institution_name or "Unknown Bank"
        yield json.dumps({
            "status": "syncing",
            "institution": institution,
            "current": idx,
            "total": total_items,
        }) + "\n"

        synced, discovered = _sync_single_item(session, item, user_id, client, account_map)
        total_synced += synced

        if discovered:
            yield json.dumps({
                "status": "account_discovered",
                "accounts": discovered,
            }) + "\n"

        try:
            access_token = decrypt_token(item.encrypted_access_token)
            _update_balances(session, access_token, item.id, user_id, client=client)
        except Exception:
            pass

    categorized, skipped, events = _categorize_uncategorized(session, user_id)
    for event in events:
        yield json.dumps(event) + "\n"

    _refresh_linked_goal_balances(session, user_id)

    from app.routes.net_worth import take_snapshot
    try:
        take_snapshot(session, user_id)
    except Exception:
        pass

    yield json.dumps({
        "status": "complete",
        "synced": total_synced,
        "categorized": categorized,
        "skipped": skipped,
    }) + "\n"


@router.get("/items")
def list_plaid_items(
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """List all Plaid items (institution connections) with their accounts."""
    user_ids = get_scoped_user_ids(session, user, scope)
    items = session.exec(
        select(PlaidItem).where(PlaidItem.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all()
    item_ids = [item.id for item in items if item.id is not None]
    accounts_by_item: dict[int, list[Account]] = {i: [] for i in item_ids}
    if item_ids:
        all_accounts = session.exec(
            select(Account).where(Account.plaid_item_id.in_(item_ids))  # type: ignore[union-attr]
        ).all()
        for account in all_accounts:
            if account.plaid_item_id is not None:
                accounts_by_item.setdefault(account.plaid_item_id, []).append(account)

    owner_cache: dict[int, dict] = {}
    for item in items:
        uid = item.user_id
        if uid and uid not in owner_cache:
            u = session.get(User, uid)
            if u:
                owner_cache[uid] = {
                    "name": u.display_name or u.name,
                    "picture": u.avatar_url or u.picture,
                }

    result = []
    for item in items:
        accounts = accounts_by_item.get(item.id or -1, [])
        owner = owner_cache.get(item.user_id or -1, {})
        result.append({
            "id": item.id,
            "item_id": item.item_id,
            "institution_name": item.institution_name,
            "institution_id": item.institution_id,
            "status": item.status,
            "plaid_error_code": item.plaid_error_code,
            "plaid_error_message": item.plaid_error_message,
            "owner_name": owner.get("name", ""),
            "owner_picture": owner.get("picture"),
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
        client = get_household_plaid_client(session, user)
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


# ── Webhook handler functions ────────────────────────────────────


def _lookup_plaid_item(session: Session, item_id: str | None) -> PlaidItem | None:
    if not item_id:
        return None
    return session.exec(
        select(PlaidItem).where(PlaidItem.item_id == item_id)
    ).first()


def _handle_transaction_sync(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        background_tasks.add_task(sync_transactions, plaid_item.id)
        event.processed = True
        event.action_taken = "sync_triggered"
        logger.info("Webhook triggered sync for PlaidItem %s", plaid_item.id)
    else:
        logger.warning("Webhook received for unknown item_id: %s", payload.get("item_id"))


def _handle_transactions_removed(session, payload, event, background_tasks):
    removed_ids = payload.get("removed_transactions", [])
    if removed_ids:
        stmt = sa_delete(Transaction).where(
            Transaction.plaid_transaction_id.in_(removed_ids)  # type: ignore[union-attr]
        )
        result = session.execute(stmt)
        count = result.rowcount
        event.action_taken = f"transactions_removed:{count}"
        logger.info("Removed %d transactions via webhook", count)
    event.processed = True


def _handle_item_error(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        error = payload.get("error") or {}
        plaid_item.status = PLAID_ITEM_STATUS_ERROR
        plaid_item.plaid_error_code = error.get("error_code") if isinstance(error, dict) else None
        plaid_item.plaid_error_message = error.get("error_message") if isinstance(error, dict) else None
        session.add(plaid_item)
        event.action_taken = f"item_status:error:{plaid_item.plaid_error_code}"
    event.processed = True


def _handle_item_login_repaired(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        plaid_item.status = PLAID_ITEM_STATUS_HEALTHY
        plaid_item.plaid_error_code = None
        plaid_item.plaid_error_message = None
        session.add(plaid_item)
        background_tasks.add_task(sync_transactions, plaid_item.id)
        event.action_taken = "item_status:healthy:sync_triggered"
        logger.info("Login repaired for PlaidItem %s, triggering sync", plaid_item.id)
    event.processed = True


def _handle_item_new_accounts(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        plaid_item.status = PLAID_ITEM_STATUS_NEW_ACCOUNTS
        session.add(plaid_item)
        background_tasks.add_task(sync_transactions, plaid_item.id)
        event.action_taken = "item_status:new_accounts:sync_triggered"
        logger.info("New accounts available for PlaidItem %s, setting status and triggering sync", plaid_item.id)
    event.processed = True


def _handle_item_pending_disconnect(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        plaid_item.status = PLAID_ITEM_STATUS_PENDING_DISCONNECT
        session.add(plaid_item)
        event.action_taken = "item_status:pending_disconnect"
        logger.info("Pending disconnect for PlaidItem %s", plaid_item.id)
    event.processed = True


def _handle_item_revoked(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        plaid_item.status = PLAID_ITEM_STATUS_REVOKED
        session.add(plaid_item)
        event.action_taken = "item_status:revoked"
        logger.info("Permission revoked for PlaidItem %s", plaid_item.id)
    event.processed = True


def _handle_liabilities_update(session, payload, event, background_tasks):
    plaid_item = _lookup_plaid_item(session, payload.get("item_id"))
    if plaid_item:
        background_tasks.add_task(sync_transactions, plaid_item.id)
        event.action_taken = "sync_triggered:liabilities"
        logger.info("Liabilities update for PlaidItem %s, triggering sync", plaid_item.id)
    event.processed = True


_WEBHOOK_HANDLERS = {
    **{("TRANSACTIONS", code): _handle_transaction_sync for code in SYNC_TRIGGERING_CODES},
    ("TRANSACTIONS", "TRANSACTIONS_REMOVED"): _handle_transactions_removed,
    ("ITEM", "ERROR"): _handle_item_error,
    ("ITEM", "LOGIN_REPAIRED"): _handle_item_login_repaired,
    ("ITEM", "NEW_ACCOUNTS_AVAILABLE"): _handle_item_new_accounts,
    ("ITEM", "PENDING_DISCONNECT"): _handle_item_pending_disconnect,
    ("ITEM", "PENDING_EXPIRATION"): _handle_item_pending_disconnect,
    ("ITEM", "USER_PERMISSION_REVOKED"): _handle_item_revoked,
    ("LIABILITIES", "DEFAULT_UPDATE"): _handle_liabilities_update,
}


@router.post("/webhook")
async def plaid_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Receive and process Plaid webhook events.

    This endpoint is called by Plaid directly — no user authentication.
    Verification is done via the Plaid-Verification JWS header.
    """
    body = await request.body()
    verification_header = request.headers.get("Plaid-Verification")

    if not verification_header:
        raise HTTPException(status_code=400, detail="Missing Plaid-Verification header")

    try:
        plaid_client = get_app_plaid_client(session)
        verify_plaid_webhook(body, verification_header, plaid_client)
    except ValueError as exc:
        logger.warning("Webhook verification failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise HTTPException(
            status_code=503, detail="Plaid configuration unavailable for webhook verification"
        )

    payload = json.loads(body)
    webhook_type = payload.get("webhook_type", "")
    webhook_code = payload.get("webhook_code", "")
    item_id = payload.get("item_id")

    error_info = payload.get("error") or {}
    error_code = error_info.get("error_code") if isinstance(error_info, dict) else None
    error_message = error_info.get("error_message") if isinstance(error_info, dict) else None

    event = PlaidWebhookEvent(
        webhook_type=webhook_type,
        webhook_code=webhook_code,
        item_id=item_id,
        error_code=error_code,
        error_message=error_message,
        raw_payload=json.dumps(payload),
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    handler = _WEBHOOK_HANDLERS.get((webhook_type, webhook_code))
    if handler:
        handler(session, payload, event, background_tasks)
        session.add(event)
        session.commit()

    return {"status": "received"}


def sync_transactions(plaid_item_id: int) -> None:
    """Fetch the last 30 days of transactions from Plaid and upsert them."""
    from app.database import engine

    with Session(engine) as session:
        item = session.get(PlaidItem, plaid_item_id)
        if not item:
            return

        user_id = item.user_id
        account_map = _build_account_map(session, user_id)
        client = get_household_plaid_client_for_user_id(session, user_id)

        _sync_single_item(session, item, user_id, client, account_map)  # ignore returned tuple
        _categorize_uncategorized(session, user_id)

        access_token = decrypt_token(item.encrypted_access_token)
        _update_balances(session, access_token, plaid_item_id, user_id, client=client)

        _refresh_linked_goal_balances(session, user_id)

        from app.routes.net_worth import take_snapshot
        try:
            take_snapshot(session, user_id)
        except Exception:
            pass


def _refresh_linked_goal_balances(session: Session, user_id: int) -> None:
    """Update current_amount on account-linked goals whose linked accounts belong to this user."""
    from app.models import Goal, GoalAccountLink

    user_account_ids = list(session.exec(
        select(Account.id).where(Account.user_id == user_id)
    ).all())
    if not user_account_ids:
        return

    linked_goal_ids = set(session.exec(
        select(GoalAccountLink.goal_id).where(
            GoalAccountLink.account_id.in_(user_account_ids)  # type: ignore[union-attr]
        )
    ).all())

    for gid in linked_goal_ids:
        goal = session.get(Goal, gid)
        if not goal or goal.is_completed:
            continue
        all_linked = list(session.exec(
            select(GoalAccountLink.account_id).where(GoalAccountLink.goal_id == gid)
        ).all())
        accounts = session.exec(
            select(Account).where(Account.id.in_(all_linked))  # type: ignore[union-attr]
        ).all()
        total = sum(a.current_balance for a in accounts)
        goal.current_amount = total
        if goal.current_amount >= goal.target_amount:
            goal.is_completed = True
        session.add(goal)

    session.commit()


def _update_balances(session: Session, access_token: str, plaid_item_id: int, user_id: int, client=None) -> None:
    """Refresh account balances and metadata after a sync."""
    if client is None:
        client = get_household_plaid_client_for_user_id(session, user_id)
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
