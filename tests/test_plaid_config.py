"""Tests for Plaid config CRUD endpoints (owner-only, encrypted storage)."""

from app.crypto import decrypt_token
from app.main import app
from app.auth import get_current_user
from app.models import HouseholdPlaidConfig
from sqlmodel import select
from tests.conftest import (
    add_household_member,
    make_household,
    make_plaid_config,
    make_user,
)


# -- GET -------------------------------------------------------------------

def test_get_plaid_config_not_configured(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.get("/api/v1/settings/plaid-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["plaid_env"] is None
    assert data["client_id_last4"] is None
    assert data["secret_last4"] is None


def test_get_plaid_config_configured(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_plaid_config(session, hh, client_id="abcd1234", secret="wxyz5678")
    resp = client.get("/api/v1/settings/plaid-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["plaid_env"] == "sandbox"
    assert data["client_id_last4"] == "1234"
    assert data["secret_last4"] == "5678"


def test_get_plaid_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/plaid-config")
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


def test_get_plaid_config_member_can_read(auth_client, session):
    """Non-owner household members can still read Plaid config status."""
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)
    make_plaid_config(session, hh, client_id="abcd1234", secret="wxyz5678")

    resp = client.get("/api/v1/settings/plaid-config")
    assert resp.status_code == 200
    assert resp.json()["configured"] is True


# -- PUT -------------------------------------------------------------------

def test_put_plaid_config_create(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.put("/api/v1/settings/plaid-config", json={
        "client_id": "my_client_id",
        "secret": "my_secret",
        "plaid_env": "production",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["plaid_env"] == "production"
    assert data["client_id_last4"] == "t_id"
    assert data["secret_last4"] == "cret"

    config = session.exec(select(HouseholdPlaidConfig)).first()
    assert decrypt_token(config.encrypted_client_id) == "my_client_id"
    assert decrypt_token(config.encrypted_secret) == "my_secret"


def test_put_plaid_config_update(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_plaid_config(session, hh, client_id="old_id", secret="old_secret")

    resp = client.put("/api/v1/settings/plaid-config", json={
        "client_id": "new_client",
        "secret": "new_secret",
        "plaid_env": "sandbox",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["client_id_last4"] == "ient"

    session.expire_all()
    config = session.exec(select(HouseholdPlaidConfig)).first()
    assert decrypt_token(config.encrypted_client_id) == "new_client"


def test_put_plaid_config_non_owner_rejected(auth_client, session):
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)

    resp = client.put("/api/v1/settings/plaid-config", json={
        "client_id": "test", "secret": "test", "plaid_env": "sandbox",
    })
    assert resp.status_code == 403


def test_put_plaid_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/plaid-config", json={
        "client_id": "test", "secret": "test", "plaid_env": "sandbox",
    })
    assert resp.status_code == 404


def test_put_plaid_config_invalid_env_rejected(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.put("/api/v1/settings/plaid-config", json={
        "client_id": "test", "secret": "test", "plaid_env": "invalid",
    })
    assert resp.status_code == 400


# -- DELETE ----------------------------------------------------------------

def test_delete_plaid_config(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_plaid_config(session, hh)

    resp = client.delete("/api/v1/settings/plaid-config")
    assert resp.status_code == 204

    config = session.exec(select(HouseholdPlaidConfig)).first()
    assert config is None


def test_delete_plaid_config_non_owner_rejected(auth_client, session):
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)
    make_plaid_config(session, hh)

    resp = client.delete("/api/v1/settings/plaid-config")
    assert resp.status_code == 403


def test_delete_plaid_config_not_configured(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.delete("/api/v1/settings/plaid-config")
    assert resp.status_code == 404


def test_delete_plaid_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/settings/plaid-config")
    assert resp.status_code == 404
