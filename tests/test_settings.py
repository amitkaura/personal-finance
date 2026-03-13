"""Profile, user settings, category rules, export, and clear tests."""

from unittest.mock import patch

from tests.conftest import make_settings, make_transaction


# -- Profile ---------------------------------------------------------------

def test_get_profile(auth_client):
    client, user = auth_client
    resp = client.get("/api/v1/settings/profile")
    assert resp.status_code == 200
    assert resp.json()["email"] == user.email


def test_update_profile_display_name(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"display_name": "Fancy Name"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Fancy Name"
    assert resp.json()["name"] == "Fancy Name"


def test_update_profile_avatar_url(auth_client):
    client, _ = auth_client
    resp = client.put(
        "/api/v1/settings/profile",
        json={"avatar_url": "https://example.com/avatar.png"},
    )
    assert resp.status_code == 200
    assert resp.json()["avatar_url"] == "https://example.com/avatar.png"


def test_update_profile_avatar_invalid_url(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"avatar_url": "not-a-url"})
    assert resp.status_code == 400


def test_update_profile_bio(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"bio": "Hello world!"})
    assert resp.status_code == 200
    assert resp.json()["bio"] == "Hello world!"


def test_update_profile_display_name_too_long(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"display_name": "A" * 101})
    assert resp.status_code == 400


def test_update_profile_clear_display_name(auth_client):
    client, _ = auth_client
    client.put("/api/v1/settings/profile", json={"display_name": "Custom"})
    resp = client.put("/api/v1/settings/profile", json={"display_name": ""})
    assert resp.status_code == 200
    assert resp.json()["display_name"] is None


# -- Settings --------------------------------------------------------------

def test_get_settings(auth_client, session):
    client, user = auth_client
    make_settings(session, user)
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency"] == "CAD"
    assert data["locale"] == "en-CA"


def test_get_settings_auto_creates(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    assert resp.json()["currency"] == "CAD"


def test_update_settings(auth_client, session):
    client, user = auth_client
    make_settings(session, user)
    with patch("app.scheduler.restart_scheduler"):
        resp = client.put("/api/v1/settings", json={
            "currency": "USD",
            "sync_enabled": False,
        })
    assert resp.status_code == 200
    assert resp.json()["currency"] == "USD"
    assert resp.json()["sync_enabled"] is False


# -- Category Rules --------------------------------------------------------

def test_list_rules_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/rules")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_rule(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/settings/rules", json={
        "keyword": "starbucks",
        "category": "Food & Dining",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["keyword"] == "starbucks"
    assert data["category"] == "Food & Dining"
    assert data["case_sensitive"] is False


def test_update_rule(auth_client):
    client, _ = auth_client
    create = client.post("/api/v1/settings/rules", json={
        "keyword": "old", "category": "Other",
    })
    rule_id = create.json()["id"]
    resp = client.put(f"/api/v1/settings/rules/{rule_id}", json={
        "keyword": "new",
        "category": "Groceries",
    })
    assert resp.status_code == 200
    assert resp.json()["keyword"] == "new"
    assert resp.json()["category"] == "Groceries"


def test_update_rule_not_found(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/rules/99999", json={"keyword": "x"})
    assert resp.status_code == 404


def test_delete_rule(auth_client):
    client, _ = auth_client
    create = client.post("/api/v1/settings/rules", json={
        "keyword": "del", "category": "Other",
    })
    rule_id = create.json()["id"]
    resp = client.delete(f"/api/v1/settings/rules/{rule_id}")
    assert resp.status_code == 204


def test_delete_rule_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/settings/rules/99999")
    assert resp.status_code == 404


# -- Export ----------------------------------------------------------------

def test_export_transactions(auth_client, session):
    client, user = auth_client
    make_transaction(session, user, merchant="CSV Corp")
    resp = client.get("/api/v1/settings/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    content = resp.text
    assert "CSV Corp" in content
    assert "Date" in content


def test_export_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/export")
    assert resp.status_code == 200
    lines = resp.text.strip().split("\n")
    assert len(lines) == 1  # header only


# -- Clear transactions ----------------------------------------------------

def test_clear_transactions(auth_client, session):
    client, user = auth_client
    make_transaction(session, user)
    make_transaction(session, user)

    resp = client.delete("/api/v1/settings/transactions")
    assert resp.status_code == 204

    check = client.get("/api/v1/transactions")
    assert check.json() == []
