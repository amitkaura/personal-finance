"""Plaid endpoint tests (mocked Plaid client)."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.models import AccountType, PlaidItem
from app.crypto import encrypt_token
from tests.conftest import make_account, make_user


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
