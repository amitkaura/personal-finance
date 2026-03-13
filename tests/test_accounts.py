"""Account list, update, unlink, and summary tests."""

from decimal import Decimal

from app.main import app
from app.auth import get_current_user
from app.models import AccountType
from tests.conftest import make_account, make_user


# -- List ------------------------------------------------------------------

def test_list_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/accounts")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_returns_accounts(auth_client, session):
    client, user = auth_client
    make_account(session, user, name="Checking")
    make_account(session, user, name="Savings")
    resp = client.get("/api/v1/accounts")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_does_not_show_other_users(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    make_account(session, user, name="Mine")
    make_account(session, other, name="Theirs")
    resp = client.get("/api/v1/accounts")
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Mine"


# -- Update ----------------------------------------------------------------

def test_update_account_name(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Old Name")
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_update_account_type(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, type=AccountType.DEPOSITORY)
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"type": "credit"})
    assert resp.status_code == 200
    assert resp.json()["type"] == "credit"


def test_update_account_invalid_type(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user)
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"type": "magic"})
    assert resp.status_code == 400


def test_update_other_users_account(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    acct = make_account(session, other)
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"name": "Hack"})
    assert resp.status_code == 404


# -- Unlink ----------------------------------------------------------------

def test_unlink_account(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, balance=Decimal("500.00"))
    resp = client.post(f"/api/v1/accounts/{acct.id}/unlink")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_linked"] is False
    assert data["current_balance"] == 0.0


def test_unlink_already_unlinked(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, is_linked=False)
    resp = client.post(f"/api/v1/accounts/{acct.id}/unlink")
    assert resp.status_code == 400


# -- Summary ---------------------------------------------------------------

def test_summary_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/accounts/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["net_worth"] == 0.0
    assert data["account_count"] == 0


def test_summary_aggregates(auth_client, session):
    client, user = auth_client
    make_account(session, user, type=AccountType.DEPOSITORY, balance=Decimal("5000"))
    make_account(session, user, type=AccountType.CREDIT, balance=Decimal("1200"))
    make_account(session, user, type=AccountType.INVESTMENT, balance=Decimal("3000"))

    resp = client.get("/api/v1/accounts/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["depository_balance"] == 5000.0
    assert data["credit_balance"] == 1200.0
    assert data["investment_balance"] == 3000.0
    assert data["net_worth"] == 5000.0 + 3000.0 - 1200.0
    assert data["account_count"] == 3
