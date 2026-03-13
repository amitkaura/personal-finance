"""CRUD, auto-seeding, rename cascading, and delete reassignment tests for categories."""

from app.main import app
from app.auth import get_current_user
from tests.conftest import (
    make_category,
    make_transaction,
    make_user,
)
from app.models import CategoryRule


# -- List / Auto-seed --------------------------------------------------------

def test_list_categories_auto_seeds(auth_client, session):
    """First GET for a new user should create the 16 default categories."""
    client, _ = auth_client
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    cats = resp.json()
    assert len(cats) == 16
    names = [c["name"] for c in cats]
    assert "Food & Dining" in names
    assert "Other" in names


def test_list_categories_returns_existing(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Custom A")
    make_category(session, user, "Custom B")
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert names == ["Custom A", "Custom B"]


# -- Create -------------------------------------------------------------------

def test_create_category(auth_client, session):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "Pets"})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Pets"
    assert "id" in resp.json()


def test_create_category_duplicate(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Groceries")
    resp = client.post("/api/v1/categories", json={"name": "Groceries"})
    assert resp.status_code == 409


def test_create_category_empty_name(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "  "})
    assert resp.status_code == 400


# -- Update (rename) ---------------------------------------------------------

def test_rename_category(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining Out")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Restaurants"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Restaurants"


def test_rename_cascades_to_transactions(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining Out")
    make_transaction(session, user, category="Dining Out")
    make_transaction(session, user, category="Dining Out")

    client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Restaurants"})

    txns = client.get("/api/v1/transactions").json()
    for t in txns:
        assert t["category"] == "Restaurants"


def test_rename_cascades_to_rules(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining Out")
    rule = CategoryRule(user_id=user.id, keyword="sushi", category="Dining Out")
    session.add(rule)
    session.commit()

    client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Restaurants"})

    rules = client.get("/api/v1/settings/rules").json()
    assert rules[0]["category"] == "Restaurants"


def test_rename_duplicate_rejected(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Alpha")
    cat_b = make_category(session, user, "Beta")
    resp = client.patch(f"/api/v1/categories/{cat_b.id}", json={"name": "Alpha"})
    assert resp.status_code == 409


def test_rename_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/categories/99999", json={"name": "X"})
    assert resp.status_code == 404


# -- Delete -------------------------------------------------------------------

def test_delete_category_uncategorize(auth_client, session):
    """Delete without reassignment sets transactions to NULL."""
    client, user = auth_client
    cat = make_category(session, user, "Temp")
    make_transaction(session, user, category="Temp")

    resp = client.delete(f"/api/v1/categories/{cat.id}")
    assert resp.status_code == 204

    txns = client.get("/api/v1/transactions").json()
    assert txns[0]["category"] is None


def test_delete_category_reassign(auth_client, session):
    """Delete with reassignment moves transactions to the target category."""
    client, user = auth_client
    old = make_category(session, user, "Old Cat")
    new = make_category(session, user, "New Cat")
    make_transaction(session, user, category="Old Cat")

    resp = client.delete(f"/api/v1/categories/{old.id}?reassign_to={new.id}")
    assert resp.status_code == 204

    txns = client.get("/api/v1/transactions").json()
    assert txns[0]["category"] == "New Cat"


def test_delete_removes_rules(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Temp")
    rule = CategoryRule(user_id=user.id, keyword="test", category="Temp")
    session.add(rule)
    session.commit()

    client.delete(f"/api/v1/categories/{cat.id}")

    rules = client.get("/api/v1/settings/rules").json()
    assert len(rules) == 0


def test_delete_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/categories/99999")
    assert resp.status_code == 404


def test_delete_reassign_invalid_target(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Temp")
    resp = client.delete(f"/api/v1/categories/{cat.id}?reassign_to=99999")
    assert resp.status_code == 404


# -- Isolation ----------------------------------------------------------------

def test_categories_isolated_per_user(auth_client, session):
    """User A's categories are not visible to user B."""
    client, user_a = auth_client
    make_category(session, user_a, "Only Mine")

    user_b = make_user(session)
    app.dependency_overrides[get_current_user] = lambda: user_b

    resp = client.get("/api/v1/categories")
    names = [c["name"] for c in resp.json()]
    assert "Only Mine" not in names
