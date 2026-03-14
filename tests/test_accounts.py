"""Account list, create, update, delete, unlink, and summary tests."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from app.main import app
from app.auth import get_current_user
from app.models import AccountType, GoalAccountLink, TransactionTag
from tests.conftest import make_account, make_goal, make_tag, make_transaction, make_user, link_goal_to_account


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


# -- Create ----------------------------------------------------------------

def test_create_manual_account(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={"name": "My Savings"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "My Savings"
    assert data["type"] == "depository"
    assert data["current_balance"] == 0.0
    assert data["is_linked"] is False
    assert data["plaid_account_id"].startswith("manual-")


def test_create_manual_account_all_fields(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={
        "name": "Visa Card",
        "type": "credit",
        "current_balance": 1500.50,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Visa Card"
    assert data["type"] == "credit"
    assert data["current_balance"] == 1500.50


def test_create_manual_account_with_subtype(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={
        "name": "Savings",
        "type": "depository",
        "subtype": "savings",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["subtype"] == "savings"


def test_create_manual_account_invalid_type(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={"name": "Bad", "type": "magic"})
    assert resp.status_code == 400


# -- Delete ----------------------------------------------------------------

def test_delete_manual_account(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, plaid_account_id=f"manual-{uuid4().hex}", is_linked=False)
    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_delete_manual_account_cascades_transactions(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, plaid_account_id=f"manual-{uuid4().hex}", is_linked=False)
    make_transaction(session, user, account=acct)
    make_transaction(session, user, account=acct)

    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 200

    from sqlmodel import select
    from app.models import Transaction
    remaining = session.exec(
        select(Transaction).where(Transaction.account_id == acct.id)
    ).all()
    assert len(remaining) == 0


def test_delete_manual_account_cascades_transaction_tags(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, plaid_account_id=f"manual-{uuid4().hex}", is_linked=False)
    txn = make_transaction(session, user, account=acct)
    tag = make_tag(session, user, name="vacation")
    link = TransactionTag(transaction_id=txn.id, tag_id=tag.id)
    session.add(link)
    session.commit()

    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 200

    from sqlmodel import select
    remaining = session.exec(
        select(TransactionTag).where(TransactionTag.tag_id == tag.id)
    ).all()
    assert len(remaining) == 0


def test_delete_manual_account_cascades_goal_links(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, plaid_account_id=f"manual-{uuid4().hex}", is_linked=False)
    goal = make_goal(session, user)
    link_goal_to_account(session, goal, acct)

    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 200

    from sqlmodel import select
    remaining = session.exec(
        select(GoalAccountLink).where(GoalAccountLink.account_id == acct.id)
    ).all()
    assert len(remaining) == 0


def test_delete_linked_account_rejected(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, is_linked=True)
    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 400
    assert "Unlink" in resp.json()["detail"]


def test_delete_unlinked_plaid_account(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, plaid_account_id="plaid-real-abc123", is_linked=False)
    make_transaction(session, user, account=acct)

    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    from sqlmodel import select
    from app.models import Transaction
    remaining = session.exec(
        select(Transaction).where(Transaction.account_id == acct.id)
    ).all()
    assert len(remaining) == 0


def test_delete_account_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/accounts/99999")
    assert resp.status_code == 404


def test_delete_other_users_account(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    acct = make_account(session, other, plaid_account_id=f"manual-{uuid4().hex}", is_linked=False)
    resp = client.delete(f"/api/v1/accounts/{acct.id}")
    assert resp.status_code == 404


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


def test_update_manual_account_current_balance(auth_client, session):
    client, user = auth_client
    acct = make_account(
        session, user,
        plaid_account_id=f"manual-{uuid4().hex}",
        is_linked=False,
        balance=Decimal("100.00"),
    )
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"current_balance": 250.75})
    assert resp.status_code == 200
    assert resp.json()["current_balance"] == 250.75


def test_update_non_manual_account_current_balance_rejected(auth_client, session):
    client, user = auth_client
    acct = make_account(
        session, user,
        plaid_account_id="plaid-acct-abc123",
        is_linked=True,
        balance=Decimal("500.00"),
    )
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"current_balance": 1000.00})
    assert resp.status_code == 400
    assert "manual" in resp.json()["detail"].lower()


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


# -- Statement available day -- Create -------------------------------------

def test_create_account_with_statement_day(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={
        "name": "Savings",
        "statement_available_day": 15,
    })
    assert resp.status_code == 200
    assert resp.json()["statement_available_day"] == 15


def test_create_account_without_statement_day(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={"name": "Savings"})
    assert resp.status_code == 200
    assert resp.json()["statement_available_day"] is None


def test_create_account_invalid_statement_day_zero(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={
        "name": "Bad",
        "statement_available_day": 0,
    })
    assert resp.status_code == 422


def test_create_account_invalid_statement_day_32(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/accounts", json={
        "name": "Bad",
        "statement_available_day": 32,
    })
    assert resp.status_code == 422


# -- Statement available day -- Update -------------------------------------

def test_update_statement_day_manual_account(auth_client, session):
    client, user = auth_client
    acct = make_account(
        session, user,
        plaid_account_id=f"manual-{uuid4().hex}",
        is_linked=False,
    )
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"statement_available_day": 20})
    assert resp.status_code == 200
    assert resp.json()["statement_available_day"] == 20


def test_update_statement_day_plaid_account(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, is_linked=True)
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"statement_available_day": 5})
    assert resp.status_code == 200
    assert resp.json()["statement_available_day"] == 5


def test_clear_statement_day(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, statement_available_day=15)
    resp = client.patch(f"/api/v1/accounts/{acct.id}", json={"statement_available_day": None})
    assert resp.status_code == 200
    assert resp.json()["statement_available_day"] is None


# -- Statement reminders endpoint ------------------------------------------

def test_statement_reminders_match(auth_client, session):
    client, user = auth_client
    make_account(session, user, name="Visa", statement_available_day=15)
    with patch("app.routes.accounts.date") as mock_date:
        mock_date.today.return_value = date(2026, 3, 15)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        resp = client.get("/api/v1/accounts/statement-reminders")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Visa"


def test_statement_reminders_no_match(auth_client, session):
    client, user = auth_client
    make_account(session, user, name="Visa", statement_available_day=15)
    with patch("app.routes.accounts.date") as mock_date:
        mock_date.today.return_value = date(2026, 3, 16)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        resp = client.get("/api/v1/accounts/statement-reminders")
    assert resp.status_code == 200
    assert resp.json() == []


def test_statement_reminders_last_day_fallback(auth_client, session):
    """Day 31 should trigger on Feb 28 (last day of month)."""
    client, user = auth_client
    make_account(session, user, name="Amex", statement_available_day=31)
    with patch("app.routes.accounts.date") as mock_date:
        mock_date.today.return_value = date(2026, 2, 28)
        mock_date.side_effect = lambda *a, **kw: date(*a, **kw)
        resp = client.get("/api/v1/accounts/statement-reminders")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Amex"


def test_statement_reminders_auth_required(client):
    resp = client.get("/api/v1/accounts/statement-reminders")
    assert resp.status_code == 401
