"""Plaid endpoint tests (mocked Plaid client)."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.models import AccountType, PlaidItem
from app.crypto import encrypt_token
from tests.conftest import (
    add_household_member,
    make_account,
    make_household,
    make_user,
)


def _make_plaid_item(session, user, item_id="item-abc-123"):
    item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token("access-sandbox-test"),
        item_id=item_id,
        institution_name="Test Bank",
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


# -- Link token ------------------------------------------------------------

def test_create_link_token(auth_client):
    client, _ = auth_client
    mock_response = MagicMock()
    mock_response.link_token = "link-sandbox-test-token"

    with patch("app.routes.plaid.get_plaid_client") as mock_client:
        mock_client.return_value.link_token_create.return_value = mock_response
        resp = client.post("/api/v1/plaid/link-token")

    assert resp.status_code == 200
    assert resp.json()["link_token"] == "link-sandbox-test-token"


# -- List items ------------------------------------------------------------

def test_list_items_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/plaid/items")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_items_with_accounts(auth_client, session):
    client, user = auth_client
    item = _make_plaid_item(session, user)
    make_account(session, user, name="Checking", plaid_item_id=item.id)

    resp = client.get("/api/v1/plaid/items")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["institution_name"] == "Test Bank"
    assert len(data[0]["accounts"]) == 1


# -- Trigger sync ----------------------------------------------------------

def test_trigger_sync(auth_client, session):
    client, user = auth_client
    item = _make_plaid_item(session, user)

    resp = client.post(f"/api/v1/plaid/sync/{item.id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "sync_started"


def test_trigger_sync_not_found(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/plaid/sync/99999")
    assert resp.status_code == 404


def test_trigger_sync_other_user(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    item = _make_plaid_item(session, other)

    resp = client.post(f"/api/v1/plaid/sync/{item.id}")
    assert resp.status_code == 404


# -- Sync all --------------------------------------------------------------

def test_sync_all(auth_client, session):
    client, user = auth_client
    _make_plaid_item(session, user, item_id="item-1")

    resp = client.post("/api/v1/plaid/sync-all")
    assert resp.status_code == 200
    assert resp.json()["items_queued"] == 1


def test_sync_all_no_items(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/plaid/sync-all")
    assert resp.status_code == 404


# -- Unlink item -----------------------------------------------------------

def test_unlink_item(auth_client, session):
    client, user = auth_client
    item = _make_plaid_item(session, user)
    make_account(session, user, name="Linked", balance=Decimal("500"), plaid_item_id=item.id)

    with patch("app.routes.plaid.get_plaid_client") as mock_client:
        with patch("app.routes.plaid.decrypt_token", return_value="access-test"):
            resp = client.post(f"/api/v1/plaid/items/{item.id}/unlink")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "unlinked"
    assert data["accounts_unlinked"] == 1


def test_unlink_item_not_found(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/plaid/items/99999/unlink")
    assert resp.status_code == 404


# -- Exchange token --------------------------------------------------------

def _mock_plaid_exchange(item_id="item-new-123", access_token="access-new-tok",
                         accounts=None):
    """Return a configured mock Plaid client for exchange-token tests."""
    mock_client = MagicMock()

    exchange_resp = MagicMock()
    exchange_resp.access_token = access_token
    exchange_resp.item_id = item_id
    mock_client.item_public_token_exchange.return_value = exchange_resp

    if accounts is None:
        acct = MagicMock()
        acct.account_id = "plaid-acct-new-001"
        acct.name = "Checking"
        acct.official_name = "Primary Checking"
        acct.type.value = "depository"
        acct.subtype = MagicMock()
        acct.subtype.value = "checking"
        acct.balances.current = 1500.00
        acct.balances.available = 1400.00
        acct.balances.limit = None
        acct.balances.iso_currency_code = "USD"
        acct.mask = "1234"
        accounts = [acct]

    accounts_resp = MagicMock()
    accounts_resp.accounts = accounts
    mock_client.accounts_get.return_value = accounts_resp

    return mock_client


def test_exchange_token_success(auth_client, session):
    client, user = auth_client
    mock_client = _mock_plaid_exchange()

    with patch("app.routes.plaid.get_plaid_client", return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Test Bank",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["item_id"] == "item-new-123"
    assert data["accounts_synced"] == 1


def test_exchange_token_stores_institution_name(auth_client, session):
    client, user = auth_client
    mock_client = _mock_plaid_exchange()

    with patch("app.routes.plaid.get_plaid_client", return_value=mock_client):
        client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Chase",
        })

    from sqlmodel import select
    item = session.exec(
        select(PlaidItem).where(PlaidItem.user_id == user.id)
    ).first()
    assert item.institution_name == "Chase"


def test_exchange_token_relink_existing(auth_client, session):
    client, user = auth_client
    existing_acct = make_account(
        session, user, name="Old Checking",
        plaid_account_id="plaid-acct-new-001",
        balance=Decimal("500"),
        is_linked=False,
    )

    mock_client = _mock_plaid_exchange()
    with patch("app.routes.plaid.get_plaid_client", return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
        })

    assert resp.status_code == 200
    assert resp.json()["accounts_synced"] == 1

    session.expire_all()
    from app.models import Account
    acct = session.get(Account, existing_acct.id)
    assert acct.is_linked is True
    assert float(acct.current_balance) == 1500.00


def test_exchange_token_conflict_other_user(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    make_account(
        session, other, name="Their Account",
        plaid_account_id="plaid-acct-new-001",
    )

    mock_client = _mock_plaid_exchange()
    with patch("app.routes.plaid.get_plaid_client", return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
        })

    assert resp.status_code == 409


# -- Sync-all stream -------------------------------------------------------


def _mock_plaid_transactions(transactions=None, total=None):
    """Return a mock Plaid client that returns canned transactions."""
    mock_client = MagicMock()
    if transactions is None:
        txn = MagicMock()
        txn.transaction_id = "txn-stream-001"
        txn.date = date(2026, 3, 1)
        txn.amount = 29.99
        txn.merchant_name = "Target"
        txn.pending = False
        txn.account_id = "plaid-acct-stream-001"
        txn.personal_finance_category = None
        txn.category = None
        transactions = [txn]
    resp = MagicMock()
    resp.total_transactions = total if total is not None else len(transactions)
    resp.transactions = transactions
    mock_client.transactions_get.return_value = resp
    accounts_resp = MagicMock()
    accounts_resp.accounts = []
    mock_client.accounts_get.return_value = accounts_resp
    return mock_client


def test_sync_all_stream_success(auth_client, session):
    """Streaming sync returns NDJSON events for sync + categorization phases."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)
    make_account(
        session, user, name="Checking",
        plaid_account_id="plaid-acct-stream-001",
        plaid_item_id=item.id,
    )

    mock_client = _mock_plaid_transactions()
    with patch("app.routes.plaid.get_plaid_client", return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "")):
        resp = client.post(
            "/api/v1/plaid/sync-all-stream",
            headers={"Accept": "application/x-ndjson"},
        )

    assert resp.status_code == 200
    lines = [l for l in resp.text.strip().split("\n") if l]
    assert len(lines) >= 2  # at least one syncing + one complete event

    events = [_json.loads(l) for l in lines]
    statuses = [e["status"] for e in events]
    assert "syncing" in statuses
    assert "complete" in statuses

    complete = events[-1]
    assert complete["status"] == "complete"
    assert complete["synced"] >= 1


def test_sync_all_stream_no_items(auth_client):
    """Streaming sync returns 404 when user has no Plaid items."""
    client, _ = auth_client
    resp = client.post("/api/v1/plaid/sync-all-stream")
    assert resp.status_code == 404


def test_sync_all_stream_requires_auth(client):
    """Streaming sync requires authentication."""
    resp = client.post("/api/v1/plaid/sync-all-stream")
    assert resp.status_code == 401
