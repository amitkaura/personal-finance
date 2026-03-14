"""Tests for sync config CRUD endpoints (owner-only, per-household)."""

from unittest.mock import patch, MagicMock

from app.models import HouseholdSyncConfig
from sqlmodel import select
from tests.conftest import (
    add_household_member,
    make_household,
    make_sync_config,
    make_user,
)


# -- GET -------------------------------------------------------------------

def test_get_sync_config_not_configured(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.get("/api/v1/settings/sync-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["sync_enabled"] is None
    assert data["sync_hour"] is None


def test_get_sync_config_configured(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_sync_config(session, hh, sync_hour=8, sync_minute=15, sync_timezone="US/Pacific")
    resp = client.get("/api/v1/settings/sync-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["sync_enabled"] is True
    assert data["sync_hour"] == 8
    assert data["sync_minute"] == 15
    assert data["sync_timezone"] == "US/Pacific"


def test_get_sync_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/sync-config")
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


def test_get_sync_config_member_can_read(auth_client, session):
    """Non-owner household members can read sync config."""
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)
    make_sync_config(session, hh, sync_hour=10)

    resp = client.get("/api/v1/settings/sync-config")
    assert resp.status_code == 200
    assert resp.json()["configured"] is True
    assert resp.json()["sync_hour"] == 10


# -- PUT -------------------------------------------------------------------

def test_put_sync_config_create(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    with patch("app.scheduler.restart_scheduler"):
        resp = client.put("/api/v1/settings/sync-config", json={
            "sync_enabled": True,
            "sync_hour": 14,
            "sync_minute": 30,
            "sync_timezone": "US/Eastern",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["sync_hour"] == 14
    assert data["sync_minute"] == 30
    assert data["sync_timezone"] == "US/Eastern"

    config = session.exec(select(HouseholdSyncConfig)).first()
    assert config.sync_hour == 14


def test_put_sync_config_update(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_sync_config(session, hh, sync_hour=6)

    with patch("app.scheduler.restart_scheduler"):
        resp = client.put("/api/v1/settings/sync-config", json={
            "sync_hour": 22,
        })
    assert resp.status_code == 200
    assert resp.json()["sync_hour"] == 22

    session.expire_all()
    config = session.exec(select(HouseholdSyncConfig)).first()
    assert config.sync_hour == 22


def test_put_sync_config_invalid_hour(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.put("/api/v1/settings/sync-config", json={"sync_hour": 25})
    assert resp.status_code == 400
    assert "sync_hour" in resp.json()["detail"]


def test_put_sync_config_invalid_minute(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.put("/api/v1/settings/sync-config", json={"sync_minute": -1})
    assert resp.status_code == 400
    assert "sync_minute" in resp.json()["detail"]


def test_put_sync_config_non_owner_rejected(auth_client, session):
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)

    resp = client.put("/api/v1/settings/sync-config", json={"sync_hour": 10})
    assert resp.status_code == 403


def test_put_sync_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/sync-config", json={"sync_hour": 10})
    assert resp.status_code == 404


# -- DELETE ----------------------------------------------------------------

def test_delete_sync_config(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_sync_config(session, hh)

    with patch("app.scheduler.restart_scheduler"):
        resp = client.delete("/api/v1/settings/sync-config")
    assert resp.status_code == 204

    config = session.exec(select(HouseholdSyncConfig)).first()
    assert config is None


def test_delete_sync_config_non_owner_rejected(auth_client, session):
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)
    make_sync_config(session, hh)

    resp = client.delete("/api/v1/settings/sync-config")
    assert resp.status_code == 403


def test_delete_sync_config_not_configured(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.delete("/api/v1/settings/sync-config")
    assert resp.status_code == 404


def test_delete_sync_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/settings/sync-config")
    assert resp.status_code == 404
