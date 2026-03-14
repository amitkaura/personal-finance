"""Tests for LLM config CRUD endpoints (owner-only, encrypted storage)."""

from app.crypto import decrypt_token
from app.main import app
from app.auth import get_current_user
from app.models import HouseholdLLMConfig
from sqlmodel import select
from tests.conftest import (
    add_household_member,
    make_household,
    make_llm_config,
    make_user,
)


# -- GET -------------------------------------------------------------------

def test_get_llm_config_not_configured(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.get("/api/v1/settings/llm-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["llm_base_url"] is None
    assert data["llm_model"] is None
    assert data["api_key_last4"] is None


def test_get_llm_config_configured(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_llm_config(session, hh, base_url="https://api.openai.com/v1",
                    api_key="sk-test1234abcd", model="gpt-4o")
    resp = client.get("/api/v1/settings/llm-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["llm_base_url"] == "https://api.openai.com/v1"
    assert data["llm_model"] == "gpt-4o"
    assert data["api_key_last4"] == "abcd"


def test_get_llm_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/llm-config")
    assert resp.status_code == 200
    assert resp.json()["configured"] is False


def test_get_llm_config_member_can_read(auth_client, session):
    """Non-owner household members can still read LLM config status."""
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)
    make_llm_config(session, hh)

    resp = client.get("/api/v1/settings/llm-config")
    assert resp.status_code == 200
    assert resp.json()["configured"] is True


# -- PUT -------------------------------------------------------------------

def test_put_llm_config_create(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.put("/api/v1/settings/llm-config", json={
        "llm_base_url": "https://api.openai.com/v1",
        "llm_api_key": "sk-mykey1234",
        "llm_model": "gpt-4o-mini",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["llm_base_url"] == "https://api.openai.com/v1"
    assert data["llm_model"] == "gpt-4o-mini"
    assert data["api_key_last4"] == "1234"

    config = session.exec(select(HouseholdLLMConfig)).first()
    assert decrypt_token(config.encrypted_api_key) == "sk-mykey1234"


def test_put_llm_config_update(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_llm_config(session, hh, api_key="old_key")

    resp = client.put("/api/v1/settings/llm-config", json={
        "llm_base_url": "http://localhost:11434/v1",
        "llm_api_key": "new_key_5678",
        "llm_model": "llama3",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["llm_model"] == "llama3"
    assert data["api_key_last4"] == "5678"

    session.expire_all()
    config = session.exec(select(HouseholdLLMConfig)).first()
    assert decrypt_token(config.encrypted_api_key) == "new_key_5678"


def test_put_llm_config_non_owner_rejected(auth_client, session):
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)

    resp = client.put("/api/v1/settings/llm-config", json={
        "llm_base_url": "https://api.openai.com/v1",
        "llm_api_key": "test",
        "llm_model": "gpt-4o-mini",
    })
    assert resp.status_code == 403


def test_put_llm_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/llm-config", json={
        "llm_base_url": "https://api.openai.com/v1",
        "llm_api_key": "test",
        "llm_model": "gpt-4o-mini",
    })
    assert resp.status_code == 404


def test_put_llm_config_ssrf_base_url_rejected(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.put("/api/v1/settings/llm-config", json={
        "llm_base_url": "https://evil.example.com/v1",
        "llm_api_key": "test",
        "llm_model": "gpt-4o-mini",
    })
    assert resp.status_code == 400


# -- DELETE ----------------------------------------------------------------

def test_delete_llm_config(auth_client, session):
    client, user = auth_client
    hh = make_household(session, user)
    make_llm_config(session, hh)

    resp = client.delete("/api/v1/settings/llm-config")
    assert resp.status_code == 204

    config = session.exec(select(HouseholdLLMConfig)).first()
    assert config is None


def test_delete_llm_config_non_owner_rejected(auth_client, session):
    client, user = auth_client
    owner = make_user(session)
    hh = make_household(session, owner)
    add_household_member(session, hh, user)
    make_llm_config(session, hh)

    resp = client.delete("/api/v1/settings/llm-config")
    assert resp.status_code == 403


def test_delete_llm_config_not_configured(auth_client, session):
    client, user = auth_client
    make_household(session, user)
    resp = client.delete("/api/v1/settings/llm-config")
    assert resp.status_code == 404


def test_delete_llm_config_no_household(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/settings/llm-config")
    assert resp.status_code == 404
