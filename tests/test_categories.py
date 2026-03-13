"""Category CRUD API tests."""

from fastapi import HTTPException

from app.auth import get_current_user
from app.main import app
from app.models import CategoryRule, Transaction
from sqlmodel import select
from tests.conftest import make_category, make_transaction, make_user


# -- Auth required ----------------------------------------------------------

def test_list_categories_requires_auth(client):
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 401


def test_create_category_requires_auth(client):
    resp = client.post("/api/v1/categories", json={"name": "Test"})
    assert resp.status_code == 401


def test_update_category_requires_auth(client, session):
    def _raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = make_user(session)
    cat = make_category(session, user, name="ToUpdate")
    app.dependency_overrides[get_current_user] = _raise_401
    try:
        resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Updated"})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_delete_category_requires_auth(client, session):
    def _raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = make_user(session)
    cat = make_category(session, user, name="ToDelete")
    app.dependency_overrides[get_current_user] = _raise_401
    try:
        resp = client.delete(f"/api/v1/categories/{cat.id}")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_current_user, None)


# -- GET list ---------------------------------------------------------------

def test_list_categories_auto_seeds_when_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for item in data:
        assert "id" in item
        assert "name" in item
    names = [c["name"] for c in data]
    assert "Food & Dining" in names
    assert "Groceries" in names
    assert "Other" in names


def test_list_categories_returns_existing(auth_client):
    client, _ = auth_client
    # First call seeds defaults
    client.get("/api/v1/categories")
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert all("id" in c and "name" in c for c in data)


def test_list_categories_does_not_show_other_users(auth_client, session):
    client, user = auth_client
    # Seed for current user
    client.get("/api/v1/categories")
    other = make_user(session)
    from tests.conftest import make_category
    make_category(session, other, name="Other User Category")
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert "Other User Category" not in names


# -- POST create ------------------------------------------------------------

def test_create_category(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "Custom Category"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Custom Category"
    assert "id" in data
    assert isinstance(data["id"], int)


def test_create_category_strips_whitespace(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "  Trimmed  "})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Trimmed"


def test_create_category_rejects_empty_name(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": ""})
    assert resp.status_code == 400
    assert "empty" in resp.json()["detail"].lower()


def test_create_category_rejects_whitespace_only_name(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "   "})
    assert resp.status_code == 400


def test_create_category_rejects_duplicate(auth_client):
    client, _ = auth_client
    client.post("/api/v1/categories", json={"name": "Unique Name"})
    resp = client.post("/api/v1/categories", json={"name": "Unique Name"})
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


# -- PATCH update -----------------------------------------------------------

def test_update_category_renames(auth_client):
    client, _ = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Original"})
    cat_id = create_resp.json()["id"]
    resp = client.patch(f"/api/v1/categories/{cat_id}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


def test_update_category_cascades_to_transactions(auth_client, session):
    client, user = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Old Category"})
    cat_id = create_resp.json()["id"]
    cat_name = "Old Category"
    make_transaction(session, user, category=cat_name)
    make_transaction(session, user, category=cat_name)

    resp = client.patch(f"/api/v1/categories/{cat_id}", json={"name": "New Category"})
    assert resp.status_code == 200

    txns = session.exec(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    for txn in txns:
        assert txn.category == "New Category"


def test_update_category_cascades_to_category_rules(auth_client, session):
    client, user = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Rules Category"})
    cat_id = create_resp.json()["id"]
    rule = CategoryRule(user_id=user.id, keyword="test", category="Rules Category")
    session.add(rule)
    session.commit()

    resp = client.patch(f"/api/v1/categories/{cat_id}", json={"name": "Rules Category Renamed"})
    assert resp.status_code == 200

    session.refresh(rule)
    assert rule.category == "Rules Category Renamed"


def test_update_category_rejects_empty_name(auth_client):
    client, _ = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Valid"})
    cat_id = create_resp.json()["id"]
    resp = client.patch(f"/api/v1/categories/{cat_id}", json={"name": ""})
    assert resp.status_code == 400


def test_update_category_rejects_duplicate_name(auth_client):
    client, _ = auth_client
    client.post("/api/v1/categories", json={"name": "Existing"})
    create_resp = client.post("/api/v1/categories", json={"name": "ToRename"})
    cat_id = create_resp.json()["id"]
    resp = client.patch(f"/api/v1/categories/{cat_id}", json={"name": "Existing"})
    assert resp.status_code == 409


def test_update_category_idempotent_same_name(auth_client):
    client, _ = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Same"})
    cat_id = create_resp.json()["id"]
    resp = client.patch(f"/api/v1/categories/{cat_id}", json={"name": "Same"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Same"


def test_update_category_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/categories/99999", json={"name": "Hack"})
    assert resp.status_code == 404


def test_update_other_users_category(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    from tests.conftest import make_category
    cat = make_category(session, other, name="Theirs")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Hack"})
    assert resp.status_code == 404


# -- DELETE -----------------------------------------------------------------

def test_delete_category(auth_client):
    client, _ = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "ToDelete"})
    cat_id = create_resp.json()["id"]
    resp = client.delete(f"/api/v1/categories/{cat_id}")
    assert resp.status_code == 204
    assert resp.content == b""

    list_resp = client.get("/api/v1/categories")
    names = [c["name"] for c in list_resp.json()]
    assert "ToDelete" not in names


def test_delete_category_reassigns_transactions(auth_client, session):
    client, user = auth_client
    create_a = client.post("/api/v1/categories", json={"name": "Category A"})
    create_b = client.post("/api/v1/categories", json={"name": "Category B"})
    cat_a_id = create_a.json()["id"]
    cat_b_id = create_b.json()["id"]

    make_transaction(session, user, category="Category A")
    make_transaction(session, user, category="Category A")

    resp = client.delete(f"/api/v1/categories/{cat_a_id}", params={"reassign_to": cat_b_id})
    assert resp.status_code == 204

    txns = session.exec(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    for txn in txns:
        assert txn.category == "Category B"


def test_delete_category_without_reassign_sets_null(auth_client, session):
    client, user = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Orphan Cat"})
    cat_id = create_resp.json()["id"]
    make_transaction(session, user, category="Orphan Cat")

    resp = client.delete(f"/api/v1/categories/{cat_id}")
    assert resp.status_code == 204

    txns = session.exec(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    for txn in txns:
        assert txn.category is None


def test_delete_category_deletes_rules(auth_client, session):
    client, user = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "Rule Cat"})
    cat_id = create_resp.json()["id"]
    rule = CategoryRule(user_id=user.id, keyword="rule", category="Rule Cat")
    session.add(rule)
    session.commit()
    rule_id = rule.id

    resp = client.delete(f"/api/v1/categories/{cat_id}")
    assert resp.status_code == 204

    deleted = session.get(CategoryRule, rule_id)
    assert deleted is None


def test_delete_category_reassign_not_found(auth_client):
    client, _ = auth_client
    create_resp = client.post("/api/v1/categories", json={"name": "ToDelete"})
    cat_id = create_resp.json()["id"]
    resp = client.delete(f"/api/v1/categories/{cat_id}", params={"reassign_to": 99999})
    assert resp.status_code == 404
    assert "Reassignment" in resp.json()["detail"]


def test_delete_category_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/categories/99999")
    assert resp.status_code == 404


def test_delete_other_users_category(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    from tests.conftest import make_category
    cat = make_category(session, other, name="Theirs")
    resp = client.delete(f"/api/v1/categories/{cat.id}")
    assert resp.status_code == 404
