"""Plaid endpoint tests (mocked Plaid client)."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from sqlmodel import select

from app.models import Account, AccountType, ActivityAction, ActivityLog, CategoryRule, PlaidItem, Transaction
from app.crypto import encrypt_token
from tests.conftest import (
    add_household_member,
    make_account,
    make_household,
    make_plaid_config,
    make_user,
)

MOCK_HH_CLIENT = "app.routes.plaid.get_household_plaid_client"
MOCK_HH_CLIENT_UID = "app.routes.plaid.get_household_plaid_client_for_user_id"


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

    mock_plaid = MagicMock()
    mock_plaid.link_token_create.return_value = mock_response

    with patch(MOCK_HH_CLIENT, return_value=mock_plaid):
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

    with patch(MOCK_HH_CLIENT, return_value=MagicMock()):
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

    with patch(MOCK_HH_CLIENT, return_value=mock_client):
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

    with patch(MOCK_HH_CLIENT, return_value=mock_client):
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
    with patch(MOCK_HH_CLIENT, return_value=mock_client):
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
    with patch(MOCK_HH_CLIENT, return_value=mock_client):
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
    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
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


# -- Batch DB lookups (streaming) ------------------------------------------


def _make_mock_txn(txn_id, account_id, amount=10.0, merchant="Store", txn_date=None):
    """Build a mock Plaid transaction object."""
    txn = MagicMock()
    txn.transaction_id = txn_id
    txn.date = txn_date or date(2026, 3, 1)
    txn.amount = amount
    txn.merchant_name = merchant
    txn.pending = False
    txn.account_id = account_id
    txn.personal_finance_category = None
    txn.category = None
    return txn


def test_sync_stream_multi_txn_correct_accounts(auth_client, session):
    """Batch account lookup maps each transaction to the correct account."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)
    acct_a = make_account(session, user, name="Checking", plaid_account_id="acct-A", plaid_item_id=item.id)
    acct_b = make_account(session, user, name="Savings", plaid_account_id="acct-B", plaid_item_id=item.id)

    txns = [
        _make_mock_txn("txn-1", "acct-A", 10.0, "Amazon"),
        _make_mock_txn("txn-2", "acct-B", 20.0, "Costco"),
        _make_mock_txn("txn-3", "acct-A", 30.0, "Target"),
    ]
    mock_client = _mock_plaid_transactions(transactions=txns, total=3)

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200

    saved = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    by_plaid_id = {t.plaid_transaction_id: t for t in saved}
    assert by_plaid_id["txn-1"].account_id == acct_a.id
    assert by_plaid_id["txn-2"].account_id == acct_b.id
    assert by_plaid_id["txn-3"].account_id == acct_a.id


def test_sync_stream_updates_existing_txn(auth_client, session):
    """Existing transaction is updated (not duplicated) via batch lookup."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)
    acct = make_account(session, user, name="Checking", plaid_account_id="acct-X", plaid_item_id=item.id)

    existing = Transaction(
        plaid_transaction_id="txn-existing",
        date=date(2026, 2, 1),
        amount=Decimal("50.00"),
        merchant_name="Old Merchant",
        account_id=acct.id,
        user_id=user.id,
    )
    session.add(existing)
    session.commit()

    txns = [_make_mock_txn("txn-existing", "acct-X", 99.99, "New Merchant")]
    mock_client = _mock_plaid_transactions(transactions=txns, total=1)

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200

    all_txns = session.exec(
        select(Transaction).where(Transaction.plaid_transaction_id == "txn-existing")
    ).all()
    assert len(all_txns) == 1
    assert float(all_txns[0].amount) == 99.99
    assert all_txns[0].merchant_name == "New Merchant"


# -- Batch categorization (streaming) -------------------------------------


def test_sync_stream_batch_llm_called(auth_client, session):
    """Categorization uses batch LLM, not per-transaction single LLM."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)
    make_account(session, user, name="Checking", plaid_account_id="acct-cat", plaid_item_id=item.id)

    txns = [
        _make_mock_txn("txn-c1", "acct-cat", 10.0, "Store A"),
        _make_mock_txn("txn-c2", "acct-cat", 20.0, "Store B"),
        _make_mock_txn("txn-c3", "acct-cat", 30.0, "Store C"),
    ]
    mock_client = _mock_plaid_transactions(transactions=txns, total=3)

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)), \
         patch("app.routes.plaid.categorize_batch_llm", return_value={}) as mock_batch:
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200
    mock_batch.assert_called()

    events = [_json.loads(l) for l in resp.text.strip().split("\n") if l]
    cat_events = [e for e in events if e["status"] in ("categorized", "skipped")]
    assert len(cat_events) == 3


def test_sync_stream_rules_before_llm(auth_client, session):
    """Rule-matched txns skip LLM; only unmatched go to batch LLM."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)
    make_account(session, user, name="Checking", plaid_account_id="acct-rule", plaid_item_id=item.id)

    rule = CategoryRule(user_id=user.id, keyword="Walmart", category="Shopping")
    session.add(rule)
    session.commit()

    txns = [
        _make_mock_txn("txn-r1", "acct-rule", 10.0, "Walmart"),
        _make_mock_txn("txn-r2", "acct-rule", 20.0, "Unknown Vendor"),
    ]
    mock_client = _mock_plaid_transactions(transactions=txns, total=2)

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)), \
         patch("app.routes.plaid.categorize_batch_llm", return_value={}) as mock_batch:
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200
    assert mock_batch.call_count == 1
    batch_arg = mock_batch.call_args[0][0]
    assert len(batch_arg) == 1
    assert batch_arg[0].merchant_name == "Unknown Vendor"

    session.expire_all()
    walmart_txn = session.exec(
        select(Transaction).where(Transaction.plaid_transaction_id == "txn-r1")
    ).first()
    assert walmart_txn.category == "Shopping"


# -- Background sync parity -----------------------------------------------


def test_sync_transactions_batch_lookups(session):
    """Background sync_transactions uses batch account lookups."""
    user = make_user(session)
    item = _make_plaid_item(session, user)
    acct_a = make_account(session, user, name="Checking", plaid_account_id="bg-acct-A", plaid_item_id=item.id)
    acct_b = make_account(session, user, name="Savings", plaid_account_id="bg-acct-B", plaid_item_id=item.id)

    txns = [
        _make_mock_txn("bg-txn-1", "bg-acct-A", 10.0, "Amazon"),
        _make_mock_txn("bg-txn-2", "bg-acct-B", 20.0, "Costco"),
        _make_mock_txn("bg-txn-3", "bg-acct-A", 30.0, "Target"),
    ]
    mock_client = _mock_plaid_transactions(transactions=txns, total=3)

    from tests.conftest import _test_engine
    from app.routes.plaid import sync_transactions

    with patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)), \
         patch("app.database.engine", _test_engine):
        sync_transactions(item.id)

    session.expire_all()
    saved = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    by_plaid_id = {t.plaid_transaction_id: t for t in saved}
    assert by_plaid_id["bg-txn-1"].account_id == acct_a.id
    assert by_plaid_id["bg-txn-2"].account_id == acct_b.id
    assert by_plaid_id["bg-txn-3"].account_id == acct_a.id


def test_sync_transactions_batch_llm(session):
    """Background sync_transactions uses batch LLM, not single LLM."""
    user = make_user(session)
    item = _make_plaid_item(session, user)
    make_account(session, user, name="Checking", plaid_account_id="bg-acct-llm", plaid_item_id=item.id)

    txns = [
        _make_mock_txn("bg-llm-1", "bg-acct-llm", 10.0, "Store A"),
        _make_mock_txn("bg-llm-2", "bg-acct-llm", 20.0, "Store B"),
    ]
    mock_client = _mock_plaid_transactions(transactions=txns, total=2)

    from tests.conftest import _test_engine
    from app.routes.plaid import sync_transactions

    with patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)), \
         patch("app.routes.plaid.categorize_batch_llm", return_value={}) as mock_batch, \
         patch("app.database.engine", _test_engine):
        sync_transactions(item.id)

    mock_batch.assert_called()


# -- Duplicate item prevention ---------------------------------------------


def test_exchange_token_stores_institution_id(auth_client, session):
    """institution_id from the request body is persisted on the PlaidItem."""
    client, user = auth_client
    mock_client = _mock_plaid_exchange()

    with patch(MOCK_HH_CLIENT, return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Wells Fargo",
            "institution_id": "ins_4",
        })

    assert resp.status_code == 200
    item = session.exec(
        select(PlaidItem).where(PlaidItem.user_id == user.id)
    ).first()
    assert item.institution_id == "ins_4"


def test_exchange_token_duplicate_institution_rejected(auth_client, session):
    """A 409 is returned when the user already has an item at the same institution."""
    client, user = auth_client

    existing = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token("access-existing"),
        item_id="item-existing-001",
        institution_name="Wells Fargo",
        institution_id="ins_4",
    )
    session.add(existing)
    session.commit()

    mock_client = _mock_plaid_exchange()
    with patch(MOCK_HH_CLIENT, return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Wells Fargo",
            "institution_id": "ins_4",
        })

    assert resp.status_code == 409
    assert "already linked" in resp.json()["detail"].lower()


def test_exchange_token_duplicate_different_user_allowed(auth_client, session):
    """Different users can link the same institution without conflict."""
    client, user = auth_client
    other = make_user(session)

    existing = PlaidItem(
        user_id=other.id,
        encrypted_access_token=encrypt_token("access-other"),
        item_id="item-other-001",
        institution_name="Wells Fargo",
        institution_id="ins_4",
    )
    session.add(existing)
    session.commit()

    mock_client = _mock_plaid_exchange()
    with patch(MOCK_HH_CLIENT, return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Wells Fargo",
            "institution_id": "ins_4",
        })

    assert resp.status_code == 200


def test_exchange_token_no_institution_id_skips_duplicate_check(auth_client, session):
    """When institution_id is not provided, the duplicate check is skipped."""
    client, user = auth_client
    mock_client = _mock_plaid_exchange()

    with patch(MOCK_HH_CLIENT, return_value=mock_client):
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Wells Fargo",
        })

    assert resp.status_code == 200


def test_list_items_includes_institution_id(auth_client, session):
    """list_plaid_items response includes institution_id."""
    client, user = auth_client
    item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token("access-test"),
        item_id="item-inst-id-test",
        institution_name="Chase",
        institution_id="ins_3",
    )
    session.add(item)
    session.commit()

    resp = client.get("/api/v1/plaid/items")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["institution_id"] == "ins_3"


# -- Exchange-token no background sync ------------------------------------


def test_exchange_token_no_background_sync(auth_client, session):
    """exchange-token should NOT trigger sync_transactions as a background task."""
    client, user = auth_client
    mock_client = _mock_plaid_exchange()

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch("app.routes.plaid.sync_transactions") as mock_sync:
        resp = client.post("/api/v1/plaid/exchange-token", json={
            "public_token": "public-sandbox-abc",
            "institution_name": "Test Bank",
        })

    assert resp.status_code == 200
    mock_sync.assert_not_called()


# -- Auto-create missing accounts during sync ------------------------------


def _make_mock_plaid_account(account_id, name="New Account", acct_type="depository"):
    """Build a mock Plaid account object for accounts_get responses."""
    acct = MagicMock()
    acct.account_id = account_id
    acct.name = name
    acct.official_name = f"Official {name}"
    acct.type.value = acct_type
    acct.subtype = MagicMock()
    acct.subtype.value = "checking"
    acct.balances.current = 2500.00
    acct.balances.available = 2400.00
    acct.balances.limit = None
    acct.balances.iso_currency_code = "USD"
    return acct


def test_upsert_auto_creates_missing_account(auth_client, session):
    """When a Plaid txn references an unknown account, it is auto-created."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)
    make_account(session, user, name="Existing", plaid_account_id="known-acct", plaid_item_id=item.id)

    txns = [
        _make_mock_txn("txn-new-acct-1", "unknown-acct-xyz", 55.0, "Coffee Shop"),
    ]
    mock_acct = _make_mock_plaid_account("unknown-acct-xyz", name="New Savings")
    mock_client = _mock_plaid_transactions(transactions=txns, total=1)
    acct_resp = MagicMock()
    acct_resp.accounts = [mock_acct]
    mock_client.accounts_get.return_value = acct_resp

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200

    created_acct = session.exec(
        select(Account).where(Account.plaid_account_id == "unknown-acct-xyz")
    ).first()
    assert created_acct is not None
    assert created_acct.name == "New Savings"
    assert created_acct.user_id == user.id

    txn = session.exec(
        select(Transaction).where(Transaction.plaid_transaction_id == "txn-new-acct-1")
    ).first()
    assert txn.account_id == created_acct.id


def test_upsert_logs_activity_on_discovery(auth_client, session):
    """Auto-creating an account logs an ACCOUNT_DISCOVERED ActivityLog entry."""
    client, user = auth_client
    item = _make_plaid_item(session, user)

    txns = [_make_mock_txn("txn-log-1", "discover-acct-1", 10.0, "Store")]
    mock_acct = _make_mock_plaid_account("discover-acct-1", name="Discovered Checking")
    mock_client = _mock_plaid_transactions(transactions=txns, total=1)
    acct_resp = MagicMock()
    acct_resp.accounts = [mock_acct]
    mock_client.accounts_get.return_value = acct_resp

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200

    log_entry = session.exec(
        select(ActivityLog).where(
            ActivityLog.user_id == user.id,
            ActivityLog.action == ActivityAction.ACCOUNT_DISCOVERED,
        )
    ).first()
    assert log_entry is not None
    assert "Discovered Checking" in (log_entry.detail or "")


def test_upsert_reuses_discovered_account(auth_client, session):
    """Two txns for the same unknown account create only one Account record."""
    client, user = auth_client
    item = _make_plaid_item(session, user)

    txns = [
        _make_mock_txn("txn-reuse-1", "shared-new-acct", 10.0, "Store A"),
        _make_mock_txn("txn-reuse-2", "shared-new-acct", 20.0, "Store B"),
    ]
    mock_acct = _make_mock_plaid_account("shared-new-acct", name="Shared New")
    mock_client = _mock_plaid_transactions(transactions=txns, total=2)
    acct_resp = MagicMock()
    acct_resp.accounts = [mock_acct]
    mock_client.accounts_get.return_value = acct_resp

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200

    accounts = session.exec(
        select(Account).where(Account.plaid_account_id == "shared-new-acct")
    ).all()
    assert len(accounts) == 1

    saved_txns = session.exec(
        select(Transaction).where(
            Transaction.plaid_transaction_id.in_(["txn-reuse-1", "txn-reuse-2"])
        )
    ).all()
    assert all(t.account_id == accounts[0].id for t in saved_txns)


def test_stream_emits_account_discovered_event(auth_client, session):
    """Streaming sync emits an account_discovered NDJSON event for new accounts."""
    import json as _json

    client, user = auth_client
    item = _make_plaid_item(session, user)

    txns = [_make_mock_txn("txn-evt-1", "evt-new-acct", 15.0, "Cafe")]
    mock_acct = _make_mock_plaid_account("evt-new-acct", name="Event Account")
    mock_client = _mock_plaid_transactions(transactions=txns, total=1)
    acct_resp = MagicMock()
    acct_resp.accounts = [mock_acct]
    mock_client.accounts_get.return_value = acct_resp

    with patch(MOCK_HH_CLIENT, return_value=mock_client), \
         patch(MOCK_HH_CLIENT_UID, return_value=mock_client), \
         patch("app.routes.plaid.decrypt_token", return_value="access-test"), \
         patch("app.categorizer._get_llm_config", return_value=("", "", "", 10)):
        resp = client.post("/api/v1/plaid/sync-all-stream")

    assert resp.status_code == 200
    events = [_json.loads(l) for l in resp.text.strip().split("\n") if l]
    discovered_events = [e for e in events if e.get("status") == "account_discovered"]
    assert len(discovered_events) >= 1
    assert "Event Account" in discovered_events[0]["accounts"]
