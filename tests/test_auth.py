"""Auth endpoint tests (Google login, /me, logout)."""

from unittest.mock import patch

from sqlmodel import select

from app.models import Household, HouseholdMember
from tests.conftest import make_user


GOOGLE_PAYLOAD = {
    "sub": "google-auth-12345",
    "email": "auth@example.com",
    "name": "Auth User",
    "picture": "https://example.com/pic.jpg",
}


def test_google_login_creates_user(client, session):
    with patch("app.routes.auth.google_id_token.verify_oauth2_token", return_value=GOOGLE_PAYLOAD):
        resp = client.post("/api/v1/auth/google", json={"id_token": "fake-token"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "auth@example.com"
    assert data["name"] == "Auth User"
    assert "session" in resp.cookies


def test_google_login_creates_auto_household(client, session):
    """New user signup auto-creates a personal household with owner role."""
    with patch("app.routes.auth.google_id_token.verify_oauth2_token", return_value=GOOGLE_PAYLOAD):
        resp = client.post("/api/v1/auth/google", json={"id_token": "fake-token"})

    assert resp.status_code == 200
    user_id = resp.json()["id"]

    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user_id)
    ).first()
    assert member is not None
    assert member.role == "owner"

    household = session.get(Household, member.household_id)
    assert household is not None
    assert "Auth User" in household.name


def test_google_login_existing_user_no_duplicate_household(client, session):
    """Returning user login does not create a second household."""
    with patch("app.routes.auth.google_id_token.verify_oauth2_token", return_value=GOOGLE_PAYLOAD):
        client.post("/api/v1/auth/google", json={"id_token": "tok1"})
        client.post("/api/v1/auth/google", json={"id_token": "tok2"})

    members = session.exec(select(HouseholdMember)).all()
    assert len(members) == 1


def test_google_login_is_idempotent(client, session):
    with patch("app.routes.auth.google_id_token.verify_oauth2_token", return_value=GOOGLE_PAYLOAD):
        resp1 = client.post("/api/v1/auth/google", json={"id_token": "tok1"})
        resp2 = client.post("/api/v1/auth/google", json={"id_token": "tok2"})

    assert resp1.json()["id"] == resp2.json()["id"]


def test_google_login_invalid_token(client, session):
    with patch(
        "app.routes.auth.google_id_token.verify_oauth2_token",
        side_effect=ValueError("bad token"),
    ):
        resp = client.post("/api/v1/auth/google", json={"id_token": "bad"})
    assert resp.status_code == 401


def test_me_authenticated(auth_client):
    client, user = auth_client
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == user.email


def test_me_unauthenticated(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_logout(auth_client):
    client, _user = auth_client
    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
