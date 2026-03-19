"""Tests for Plaid webhook endpoint and admin webhook-events listing."""

from __future__ import annotations

import hashlib
import json
import time
from unittest.mock import MagicMock, patch

import pytest
from sqlmodel import Session, select

from app.auth import get_current_user
from app.main import app
from app.models import (
    PlaidItem,
    PlaidWebhookEvent,
    SYNC_TRIGGERING_CODES,
    PLAID_ITEM_STATUS_HEALTHY,
    PLAID_ITEM_STATUS_ERROR,
    PLAID_ITEM_STATUS_PENDING_DISCONNECT,
    PLAID_ITEM_STATUS_REVOKED,
    Transaction,
)
from tests.conftest import make_account, make_household, make_transaction, make_user


# ── Helpers ──────────────────────────────────────────────────────


def _make_plaid_item(session: Session, user, item_id: str = "test_item_abc") -> PlaidItem:
    from app.crypto import encrypt_token

    item = PlaidItem(
        user_id=user.id,
        encrypted_access_token=encrypt_token("access-sandbox-token"),
        item_id=item_id,
        institution_name="Test Bank",
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _build_webhook_payload(
    webhook_type: str = "TRANSACTIONS",
    webhook_code: str = "SYNC_UPDATES_AVAILABLE",
    item_id: str = "test_item_abc",
    **extra,
) -> dict:
    payload = {
        "webhook_type": webhook_type,
        "webhook_code": webhook_code,
        "item_id": item_id,
        **extra,
    }
    return payload


def _make_webhook_event(
    session: Session,
    webhook_type: str = "TRANSACTIONS",
    webhook_code: str = "SYNC_UPDATES_AVAILABLE",
    item_id: str = "test_item_abc",
    processed: bool = False,
) -> PlaidWebhookEvent:
    event = PlaidWebhookEvent(
        webhook_type=webhook_type,
        webhook_code=webhook_code,
        item_id=item_id,
        raw_payload=json.dumps({"webhook_type": webhook_type, "webhook_code": webhook_code}),
        processed=processed,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def _make_admin(session: Session, **overrides):
    return make_user(session, is_admin=True, **overrides)


def _set_admin_override(user):
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_override():
    app.dependency_overrides.pop(get_current_user, None)


# ── Webhook endpoint tests ──────────────────────────────────────


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_stores_event(mock_verify, mock_client, client, session):
    """A valid webhook payload is stored as a PlaidWebhookEvent."""
    payload = _build_webhook_payload()
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    events = session.exec(select(PlaidWebhookEvent)).all()
    assert len(events) == 1
    assert events[0].webhook_type == "TRANSACTIONS"
    assert events[0].webhook_code == "SYNC_UPDATES_AVAILABLE"
    assert events[0].item_id == "test_item_abc"


def test_webhook_rejects_missing_verification(client):
    """Requests without Plaid-Verification header are rejected."""
    payload = _build_webhook_payload()
    resp = client.post("/api/v1/plaid/webhook", json=payload)
    assert resp.status_code == 400


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook", side_effect=ValueError("bad sig"))
def test_webhook_rejects_invalid_signature(mock_verify, mock_client, client):
    """Requests with invalid signature are rejected."""
    payload = _build_webhook_payload()
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "invalid-token"},
    )
    assert resp.status_code == 400


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
@patch("app.routes.plaid.sync_transactions")
def test_webhook_triggers_sync_for_transactions(mock_sync, mock_verify, mock_client, client, session):
    """TRANSACTIONS webhooks with sync-triggering codes trigger sync_transactions."""
    user = make_user(session)
    household = make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(item_id=item.item_id)
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True

    mock_sync.assert_called_once_with(item.id)


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
@patch("app.routes.plaid.sync_transactions")
def test_webhook_skips_sync_for_unknown_item(mock_sync, mock_verify, mock_client, client, session):
    """Event is stored but no sync triggered when item_id is not in our database."""
    payload = _build_webhook_payload(item_id="unknown_item_xyz")
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event is not None
    assert event.processed is False
    mock_sync.assert_not_called()


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_handles_item_error(mock_verify, mock_client, client, session):
    """ITEM.ERROR webhooks store error details."""
    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="ERROR",
        error={"error_code": "ITEM_LOGIN_REQUIRED", "error_message": "Login required"},
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.webhook_type == "ITEM"
    assert event.webhook_code == "ERROR"
    assert event.error_code == "ITEM_LOGIN_REQUIRED"
    assert event.error_message == "Login required"


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
@patch("app.routes.plaid.sync_transactions")
def test_webhook_recurring_not_processed(mock_sync, mock_verify, mock_client, client, session):
    """RECURRING_TRANSACTIONS_UPDATE webhooks are stored but not processed."""
    payload = _build_webhook_payload(webhook_code="RECURRING_TRANSACTIONS_UPDATE")
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is False
    mock_sync.assert_not_called()


# ── TRANSACTIONS_REMOVED handler tests ──────────────────────────


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_transactions_removed_deletes_matching(mock_verify, mock_client, client, session):
    """TRANSACTIONS_REMOVED deletes transactions matching removed_transactions IDs."""
    user = make_user(session)
    acct = make_account(session, user)
    txn1 = make_transaction(session, user, account=acct, is_manual=False,
                            plaid_transaction_id="plaid-rm-1")
    txn2 = make_transaction(session, user, account=acct, is_manual=False,
                            plaid_transaction_id="plaid-rm-2")
    txn_keep = make_transaction(session, user, account=acct, is_manual=False,
                                plaid_transaction_id="plaid-keep")

    payload = _build_webhook_payload(
        webhook_code="TRANSACTIONS_REMOVED",
        removed_transactions=["plaid-rm-1", "plaid-rm-2"],
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True
    assert "transactions_removed:2" in (event.action_taken or "")

    remaining = session.exec(select(Transaction)).all()
    remaining_ids = {t.plaid_transaction_id for t in remaining}
    assert "plaid-keep" in remaining_ids
    assert "plaid-rm-1" not in remaining_ids
    assert "plaid-rm-2" not in remaining_ids


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_transactions_removed_empty_list(mock_verify, mock_client, client, session):
    """TRANSACTIONS_REMOVED with empty list is processed but does nothing."""
    payload = _build_webhook_payload(
        webhook_code="TRANSACTIONS_REMOVED",
        removed_transactions=[],
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True


# ── ITEM webhook handler tests ──────────────────────────────────


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_item_error_sets_status(mock_verify, mock_client, client, session):
    """ITEM.ERROR sets PlaidItem status to error and stores error details."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="ERROR",
        item_id=item.item_id,
        error={"error_code": "ITEM_LOGIN_REQUIRED", "error_message": "Login required"},
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    session.refresh(item)
    assert item.status == PLAID_ITEM_STATUS_ERROR
    assert item.plaid_error_code == "ITEM_LOGIN_REQUIRED"
    assert item.plaid_error_message == "Login required"

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True
    assert "item_status:error" in (event.action_taken or "")


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
@patch("app.routes.plaid.sync_transactions")
def test_webhook_login_repaired_clears_error(mock_sync, mock_verify, mock_client, client, session):
    """ITEM.LOGIN_REPAIRED clears error state and triggers sync."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)
    item.status = PLAID_ITEM_STATUS_ERROR
    item.plaid_error_code = "ITEM_LOGIN_REQUIRED"
    item.plaid_error_message = "Login required"
    session.add(item)
    session.commit()

    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="LOGIN_REPAIRED",
        item_id=item.item_id,
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    session.refresh(item)
    assert item.status == PLAID_ITEM_STATUS_HEALTHY
    assert item.plaid_error_code is None
    assert item.plaid_error_message is None

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True
    mock_sync.assert_called_once_with(item.id)


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
@patch("app.routes.plaid.sync_transactions")
def test_webhook_new_accounts_triggers_sync(mock_sync, mock_verify, mock_client, client, session):
    """ITEM.NEW_ACCOUNTS_AVAILABLE triggers a sync."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="NEW_ACCOUNTS_AVAILABLE",
        item_id=item.item_id,
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True
    mock_sync.assert_called_once_with(item.id)


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_pending_disconnect_sets_status(mock_verify, mock_client, client, session):
    """ITEM.PENDING_DISCONNECT sets PlaidItem status."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="PENDING_DISCONNECT",
        item_id=item.item_id,
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    session.refresh(item)
    assert item.status == PLAID_ITEM_STATUS_PENDING_DISCONNECT

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_pending_expiration_sets_status(mock_verify, mock_client, client, session):
    """ITEM.PENDING_EXPIRATION also sets pending_disconnect status."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="PENDING_EXPIRATION",
        item_id=item.item_id,
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    session.refresh(item)
    assert item.status == PLAID_ITEM_STATUS_PENDING_DISCONNECT


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_user_permission_revoked_sets_status(mock_verify, mock_client, client, session):
    """ITEM.USER_PERMISSION_REVOKED sets PlaidItem status to revoked."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="USER_PERMISSION_REVOKED",
        item_id=item.item_id,
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    session.refresh(item)
    assert item.status == PLAID_ITEM_STATUS_REVOKED

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
@patch("app.routes.plaid.sync_transactions")
def test_webhook_liabilities_default_update_triggers_sync(mock_sync, mock_verify, mock_client, client, session):
    """LIABILITIES.DEFAULT_UPDATE triggers a sync."""
    user = make_user(session)
    make_household(session, user)
    item = _make_plaid_item(session, user)

    payload = _build_webhook_payload(
        webhook_type="LIABILITIES",
        webhook_code="DEFAULT_UPDATE",
        item_id=item.item_id,
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True
    mock_sync.assert_called_once_with(item.id)


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_item_error_unknown_item(mock_verify, mock_client, client, session):
    """ITEM.ERROR for unknown item_id stores event but no PlaidItem is updated."""
    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="ERROR",
        item_id="nonexistent_item",
        error={"error_code": "ITEM_LOGIN_REQUIRED", "error_message": "Login required"},
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is True


@patch("app.routes.plaid.get_app_plaid_client")
@patch("app.routes.plaid.verify_plaid_webhook")
def test_webhook_update_acknowledged_log_only(mock_verify, mock_client, client, session):
    """ITEM.WEBHOOK_UPDATE_ACKNOWLEDGED is stored but not processed."""
    payload = _build_webhook_payload(
        webhook_type="ITEM",
        webhook_code="WEBHOOK_UPDATE_ACKNOWLEDGED",
    )
    resp = client.post(
        "/api/v1/plaid/webhook",
        json=payload,
        headers={"Plaid-Verification": "fake-token"},
    )
    assert resp.status_code == 200

    event = session.exec(select(PlaidWebhookEvent)).first()
    assert event.processed is False


# ── Admin webhook-events endpoint tests ─────────────────────────


def test_admin_webhook_events_list(client, session):
    """Admin can list webhook events."""
    admin = _make_admin(session)
    _set_admin_override(admin)

    _make_webhook_event(session, webhook_type="TRANSACTIONS", webhook_code="DEFAULT_UPDATE")
    _make_webhook_event(session, webhook_type="ITEM", webhook_code="ERROR")

    try:
        resp = client.get("/api/v1/admin/webhook-events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["events"]) == 2
        assert data["events"][0]["webhook_type"] in ("TRANSACTIONS", "ITEM")
    finally:
        _clear_override()


def test_admin_webhook_events_requires_admin(client, session):
    """Non-admin users get 403."""
    user = make_user(session)
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        resp = client.get("/api/v1/admin/webhook-events")
        assert resp.status_code == 403
    finally:
        _clear_override()


def test_admin_webhook_events_pagination(client, session):
    """Webhook events support limit/offset pagination."""
    admin = _make_admin(session)
    _set_admin_override(admin)

    for i in range(5):
        _make_webhook_event(session, webhook_code=f"CODE_{i}")

    try:
        resp = client.get("/api/v1/admin/webhook-events?limit=2&offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["events"]) == 2
    finally:
        _clear_override()


def test_admin_webhook_events_filter_by_type(client, session):
    """Webhook events can be filtered by webhook_type."""
    admin = _make_admin(session)
    _set_admin_override(admin)

    _make_webhook_event(session, webhook_type="TRANSACTIONS")
    _make_webhook_event(session, webhook_type="ITEM")

    try:
        resp = client.get("/api/v1/admin/webhook-events?webhook_type=ITEM")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["events"][0]["webhook_type"] == "ITEM"
    finally:
        _clear_override()
