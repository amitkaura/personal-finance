"""Tests for Plaid Link update mode: link-token/update, repair, status in items list."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from sqlmodel import Session, select

from app.auth import get_current_user
from app.main import app
from app.models import (
    PlaidItem,
    PLAID_ITEM_STATUS_ERROR,
    PLAID_ITEM_STATUS_HEALTHY,
    PLAID_ITEM_STATUS_PENDING_DISCONNECT,
)
from tests.conftest import make_account, make_user


def _make_plaid_item(
    session: Session,
    user,
    item_id: str = "test_item_abc",
    status: str = PLAID_ITEM_STATUS_HEALTHY,
    error_code: str | None = None,
    error_message: str | None = None,
) -> PlaidItem:
    from app.crypto import encrypt_token

    item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token("access-sandbox-token"),
        item_id=item_id,
        institution_name="Test Bank",
        status=status,
        plaid_error_code=error_code,
        plaid_error_message=error_message,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


# ── GET /plaid/items includes status fields ────────────────────


def test_list_plaid_items_includes_status(auth_client, session):
    """list_plaid_items response includes status, plaid_error_code, plaid_error_message."""
    client, user = auth_client
    _make_plaid_item(
        session, user,
        status=PLAID_ITEM_STATUS_ERROR,
        error_code="ITEM_LOGIN_REQUIRED",
        error_message="the login details have changed",
    )
    make_account(session, user, plaid_item_id=1)

    resp = client.get("/api/v1/plaid/items")
    assert resp.status_code == 200

    items = resp.json()
    assert len(items) == 1
    assert items[0]["status"] == PLAID_ITEM_STATUS_ERROR
    assert items[0]["plaid_error_code"] == "ITEM_LOGIN_REQUIRED"
    assert items[0]["plaid_error_message"] == "the login details have changed"


def test_list_plaid_items_healthy_has_null_errors(auth_client, session):
    """Healthy items have null error fields."""
    client, user = auth_client
    _make_plaid_item(session, user)

    resp = client.get("/api/v1/plaid/items")
    assert resp.status_code == 200

    items = resp.json()
    assert items[0]["status"] == PLAID_ITEM_STATUS_HEALTHY
    assert items[0]["plaid_error_code"] is None
    assert items[0]["plaid_error_message"] is None


# ── POST /plaid/link-token/update/{id} ─────────────────────────


@patch("app.routes.plaid.get_household_plaid_client")
def test_create_update_link_token_success(mock_get_client, auth_client, session):
    """Returns a link_token for a valid PlaidItem owned by the current user."""
    client, user = auth_client
    item = _make_plaid_item(
        session, user,
        status=PLAID_ITEM_STATUS_ERROR,
        error_code="ITEM_LOGIN_REQUIRED",
    )

    mock_plaid = MagicMock()
    mock_plaid.link_token_create.return_value = MagicMock(link_token="link-sandbox-update-123")
    mock_get_client.return_value = mock_plaid

    resp = client.post(f"/api/v1/plaid/link-token/update/{item.id}")
    assert resp.status_code == 200
    assert resp.json()["link_token"] == "link-sandbox-update-123"

    call_args = mock_plaid.link_token_create.call_args[0][0]
    assert call_args.access_token is not None


@patch("app.routes.plaid.get_household_plaid_client")
def test_create_update_link_token_missing_item(mock_get_client, auth_client, session):
    """404 when the PlaidItem does not exist."""
    client, user = auth_client
    mock_get_client.return_value = MagicMock()

    resp = client.post("/api/v1/plaid/link-token/update/99999")
    assert resp.status_code == 404


@patch("app.routes.plaid.get_household_plaid_client")
def test_create_update_link_token_wrong_user(mock_get_client, auth_client, session):
    """404 when the PlaidItem belongs to a different user."""
    client, user = auth_client
    other_user = make_user(session)
    item = _make_plaid_item(session, other_user, item_id="other_item")
    mock_get_client.return_value = MagicMock()

    resp = client.post(f"/api/v1/plaid/link-token/update/{item.id}")
    assert resp.status_code == 404


# ── POST /plaid/items/{id}/repair ──────────────────────────────


def test_repair_plaid_item_success(auth_client, session):
    """Repair sets status=healthy and clears error fields."""
    client, user = auth_client
    item = _make_plaid_item(
        session, user,
        status=PLAID_ITEM_STATUS_ERROR,
        error_code="ITEM_LOGIN_REQUIRED",
        error_message="login changed",
    )

    resp = client.post(f"/api/v1/plaid/items/{item.id}/repair")
    assert resp.status_code == 200
    assert resp.json()["status"] == "repaired"

    session.refresh(item)
    assert item.status == PLAID_ITEM_STATUS_HEALTHY
    assert item.plaid_error_code is None
    assert item.plaid_error_message is None


@patch("app.routes.plaid.sync_transactions")
def test_repair_plaid_item_triggers_sync(mock_sync, auth_client, session):
    """Repair triggers background sync."""
    client, user = auth_client
    item = _make_plaid_item(
        session, user,
        status=PLAID_ITEM_STATUS_PENDING_DISCONNECT,
    )

    resp = client.post(f"/api/v1/plaid/items/{item.id}/repair")
    assert resp.status_code == 200

    mock_sync.assert_called_once_with(item.id)


def test_repair_plaid_item_missing(auth_client, session):
    """404 when item does not exist."""
    client, user = auth_client
    resp = client.post("/api/v1/plaid/items/99999/repair")
    assert resp.status_code == 404


def test_repair_plaid_item_wrong_user(auth_client, session):
    """404 when item belongs to another user."""
    client, user = auth_client
    other_user = make_user(session)
    item = _make_plaid_item(session, other_user, item_id="other_item_2")

    resp = client.post(f"/api/v1/plaid/items/{item.id}/repair")
    assert resp.status_code == 404
