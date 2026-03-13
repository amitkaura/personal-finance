"""Household invite, accept, decline, cancel, rename, leave, and scope tests."""

from app.main import app
from app.auth import get_current_user
from tests.conftest import (
    make_account,
    make_household,
    make_invitation,
    make_transaction,
    make_user,
)
from app.models import HouseholdMember


# -- Get household ---------------------------------------------------------

def test_get_household_none(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/household")
    assert resp.status_code == 200
    assert resp.json() is None


def test_get_household_with_members(auth_client, session):
    client, user = auth_client
    make_household(session, user, name="Family")
    resp = client.get("/api/v1/household")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Family"
    assert len(data["members"]) == 1


# -- Invite ----------------------------------------------------------------

def test_invite_partner(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["invited_email"] == "partner@test.com"
    assert data["status"] == "pending"
    assert "token" in data


def test_invite_creates_household(auth_client, session):
    client, user = auth_client
    client.post("/api/v1/household/invite", json={"email": "partner@test.com"})

    resp = client.get("/api/v1/household")
    data = resp.json()
    assert data is not None
    assert len(data["members"]) == 1
    assert len(data["pending_invitations"]) == 1


def test_invite_self_rejected(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/household/invite", json={"email": user.email})
    assert resp.status_code == 400


def test_invite_duplicate_rejected(auth_client, session):
    client, user = auth_client
    client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
    resp = client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
    assert resp.status_code == 400


# -- Accept ----------------------------------------------------------------

def test_accept_invitation(auth_client, session):
    client, user = auth_client
    partner = make_user(session, email="partner@test.com")
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "partner@test.com")

    app.dependency_overrides[get_current_user] = lambda: partner
    resp = client.post(f"/api/v1/household/invitations/{inv.token}/accept")
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"

    app.dependency_overrides[get_current_user] = lambda: user


def test_accept_wrong_email_rejected(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "other@test.com")

    resp = client.post(f"/api/v1/household/invitations/{inv.token}/accept")
    assert resp.status_code == 403


def test_accept_nonexistent_token(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/household/invitations/fakefake/accept")
    assert resp.status_code == 404


# -- Decline ---------------------------------------------------------------

def test_decline_invitation(auth_client, session):
    client, user = auth_client
    partner = make_user(session, email="decliner@test.com")
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "decliner@test.com")

    app.dependency_overrides[get_current_user] = lambda: partner
    resp = client.post(f"/api/v1/household/invitations/{inv.token}/decline")
    assert resp.status_code == 200
    assert resp.json()["status"] == "declined"

    app.dependency_overrides[get_current_user] = lambda: user


# -- Cancel ----------------------------------------------------------------

def test_cancel_invitation(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "cancel@test.com")

    resp = client.delete(f"/api/v1/household/invitations/{inv.token}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_cancel_by_non_inviter_rejected(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    inv = make_invitation(session, household, other, "someone@test.com")

    resp = client.delete(f"/api/v1/household/invitations/{inv.token}")
    assert resp.status_code == 403


# -- Rename ----------------------------------------------------------------

def test_rename_household(auth_client, session):
    client, user = auth_client
    make_household(session, user, name="Old Name")

    resp = client.patch("/api/v1/household", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_rename_empty_rejected(auth_client, session):
    client, user = auth_client
    make_household(session, user)

    resp = client.patch("/api/v1/household", json={"name": "   "})
    assert resp.status_code == 400


def test_rename_too_long_rejected(auth_client, session):
    client, user = auth_client
    make_household(session, user)

    resp = client.patch("/api/v1/household", json={"name": "X" * 101})
    assert resp.status_code == 400


def test_rename_not_in_household(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/household", json={"name": "Foo"})
    assert resp.status_code == 404


# -- Leave -----------------------------------------------------------------

def test_leave_household(auth_client, session):
    client, user = auth_client
    make_household(session, user)

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200
    assert resp.json()["status"] == "left"

    resp2 = client.get("/api/v1/household")
    assert resp2.json() is None


def test_leave_not_in_household(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 404


# -- Pending invitations ---------------------------------------------------

def test_get_pending_invitations(auth_client, session):
    client, user = auth_client
    inviter = make_user(session)
    household = make_household(session, inviter)
    make_invitation(session, household, inviter, user.email)

    resp = client.get("/api/v1/household/invitations/pending")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "pending"


def test_pending_invitation_prefers_display_name(auth_client, session):
    """Inviter's display_name and avatar_url should be shown when set."""
    client, user = auth_client
    inviter = make_user(
        session,
        display_name="Charlie",
        avatar_url="https://example.com/custom-avatar.png",
    )
    household = make_household(session, inviter)
    make_invitation(session, household, inviter, user.email)

    resp = client.get("/api/v1/household/invitations/pending")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["invited_by_name"] == "Charlie"
    assert data[0]["invited_by_picture"] == "https://example.com/custom-avatar.png"


def test_get_pending_invitations_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/household/invitations/pending")
    assert resp.status_code == 200
    assert resp.json() == []


# -- Scope (household data visibility) ------------------------------------

def test_household_scope_transactions(auth_client, session):
    client, user = auth_client
    partner = make_user(session, email="scopepartner@test.com")

    household = make_household(session, user)
    member = HouseholdMember(household_id=household.id, user_id=partner.id, role="member")
    session.add(member)
    session.commit()

    make_transaction(session, user, merchant="My Store")
    make_transaction(session, partner, merchant="Partner Store")

    resp_personal = client.get("/api/v1/transactions", params={"scope": "personal"})
    assert len(resp_personal.json()) == 1

    resp_household = client.get("/api/v1/transactions", params={"scope": "household"})
    assert len(resp_household.json()) == 2

    resp_partner = client.get("/api/v1/transactions", params={"scope": "partner"})
    assert len(resp_partner.json()) == 1
    assert resp_partner.json()[0]["merchant_name"] == "Partner Store"
