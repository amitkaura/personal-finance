"""Transaction CRUD, categories, filtering, pagination, recurring, and validation tests."""

from datetime import date, timedelta
from decimal import Decimal

from app.main import app
from app.auth import get_current_user
from tests.conftest import make_account, make_transaction, make_user, make_settings


# -- List ------------------------------------------------------------------

def test_list_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/transactions")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_returns_transactions(auth_client, session):
    client, user = auth_client
    make_transaction(session, user, merchant="Coffee Shop")
    make_transaction(session, user, merchant="Grocery Store")
    resp = client.get("/api/v1/transactions")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_filter_needs_review(auth_client, session):
    client, user = auth_client
    make_transaction(session, user, needs_review=True)
    make_transaction(session, user, needs_review=False)

    resp = client.get("/api/v1/transactions", params={"needs_review": True})
    assert len(resp.json()) == 1
    assert resp.json()[0]["needs_review"] is True


def test_list_filter_category(auth_client, session):
    client, user = auth_client
    make_transaction(session, user, category="Groceries")
    make_transaction(session, user, category="Entertainment")

    resp = client.get("/api/v1/transactions", params={"category": "Groceries"})
    assert len(resp.json()) == 1
    assert resp.json()[0]["category"] == "Groceries"


def test_list_pagination(auth_client, session):
    client, user = auth_client
    for i in range(5):
        make_transaction(session, user, merchant=f"M{i}")

    page1 = client.get("/api/v1/transactions", params={"limit": 2, "offset": 0})
    page2 = client.get("/api/v1/transactions", params={"limit": 2, "offset": 2})
    assert len(page1.json()) == 2
    assert len(page2.json()) == 2


# -- Create ----------------------------------------------------------------

def test_create_manual_transaction(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/transactions", json={
        "date": date.today().isoformat(),
        "amount": 15.99,
        "merchant_name": "Cafe",
        "category": "Food & Dining",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["merchant_name"] == "Cafe"
    assert data["is_manual"] is True
    assert data["needs_review"] is False


def test_create_transaction_invalid_category(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/transactions", json={
        "date": date.today().isoformat(),
        "amount": 10,
        "merchant_name": "X",
        "category": "FakeCategory",
    })
    assert resp.status_code == 400


def test_create_transaction_with_account(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user)
    resp = client.post("/api/v1/transactions", json={
        "date": date.today().isoformat(),
        "amount": 50,
        "merchant_name": "Store",
        "account_id": acct.id,
    })
    assert resp.status_code == 201
    assert resp.json()["account_id"] == acct.id


def test_create_transaction_other_users_account(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    acct = make_account(session, other)
    resp = client.post("/api/v1/transactions", json={
        "date": date.today().isoformat(),
        "amount": 50,
        "merchant_name": "Store",
        "account_id": acct.id,
    })
    assert resp.status_code == 404


# -- Update ----------------------------------------------------------------

def test_update_transaction_category(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user)
    resp = client.patch(f"/api/v1/transactions/{txn.id}", json={"category": "Groceries"})
    assert resp.status_code == 200
    assert resp.json()["category"] == "Groceries"


def test_update_transaction_toggle_review(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user, needs_review=True)
    resp = client.patch(f"/api/v1/transactions/{txn.id}", json={"needs_review": False})
    assert resp.status_code == 200
    assert resp.json()["needs_review"] is False


def test_update_transaction_invalid_category(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user)
    resp = client.patch(f"/api/v1/transactions/{txn.id}", json={"category": "Nope"})
    assert resp.status_code == 400


def test_update_transaction_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/transactions/99999", json={"category": "Groceries"})
    assert resp.status_code == 404


def test_update_other_users_transaction(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    txn = make_transaction(session, other)
    resp = client.patch(f"/api/v1/transactions/{txn.id}", json={"category": "Groceries"})
    assert resp.status_code == 404


# -- Delete ----------------------------------------------------------------

def test_delete_manual_transaction(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user, is_manual=True)
    resp = client.delete(f"/api/v1/transactions/{txn.id}")
    assert resp.status_code == 204


def test_delete_non_manual_transaction_rejected(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user, is_manual=False)
    resp = client.delete(f"/api/v1/transactions/{txn.id}")
    assert resp.status_code == 400


def test_delete_transaction_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/transactions/99999")
    assert resp.status_code == 404


# -- Categories ------------------------------------------------------------

def test_get_categories(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/transactions/categories")
    assert resp.status_code == 200
    cats = resp.json()
    assert "Food & Dining" in cats
    assert "Groceries" in cats
    assert len(cats) > 5


# -- Date validation -------------------------------------------------------

def test_create_transaction_invalid_date(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/transactions", json={
        "date": "not-a-date",
        "amount": 10,
        "merchant_name": "X",
    })
    assert resp.status_code == 400
    assert "date" in resp.json()["detail"].lower()


def test_update_transaction_invalid_date(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user)
    resp = client.patch(f"/api/v1/transactions/{txn.id}", json={"date": "2024-13-45"})
    assert resp.status_code == 400


# -- Auto-categorize -------------------------------------------------------

def test_auto_categorize_no_pending(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/transactions/auto-categorize")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["categorized"] == 0


def test_auto_categorize_with_rules(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user)
    make_transaction(session, user, merchant="Starbucks Coffee", category=None,
                     needs_review=True, account=acct, is_manual=False)
    from app.models import CategoryRule
    rule = CategoryRule(user_id=user.id, keyword="starbucks", category="Food & Dining")
    session.add(rule)
    session.commit()

    resp = client.post("/api/v1/transactions/auto-categorize")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["categorized"] == 1


# -- Recurring -------------------------------------------------------------

def test_recurring_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/transactions/recurring")
    assert resp.status_code == 200
    assert resp.json() == []


def test_recurring_detects_pattern(auth_client, session):
    client, user = auth_client
    today = date.today()
    for i in range(3):
        make_transaction(session, user, merchant="Netflix", amount=Decimal("15.99"),
                         txn_date=today - timedelta(days=30 * i))

    resp = client.get("/api/v1/transactions/recurring")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    assert items[0]["merchant_name"] == "Netflix"
    assert items[0]["frequency"] == "monthly"
