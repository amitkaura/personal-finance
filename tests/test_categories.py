"""Category CRUD endpoint tests."""

from tests.conftest import make_category, make_transaction, make_user
from app.models import CategoryRule


# -- List ------------------------------------------------------------------

def test_list_auto_seeds_defaults(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    cats = resp.json()
    assert len(cats) == 16
    names = [c["name"] for c in cats]
    assert "Food & Dining" in names
    assert "Income" in names
    assert "Other" in names


def test_list_returns_existing(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Custom A")
    make_category(session, user, "Custom B")

    resp = client.get("/api/v1/categories")
    assert resp.status_code == 200
    cats = resp.json()
    assert len(cats) == 2
    assert cats[0]["name"] == "Custom A"
    assert cats[1]["name"] == "Custom B"


def test_list_separate_per_user(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Mine")

    other = make_user(session)
    make_category(session, other, "Theirs")

    resp = client.get("/api/v1/categories")
    names = [c["name"] for c in resp.json()]
    assert "Mine" in names
    assert "Theirs" not in names


# -- Create ----------------------------------------------------------------

def test_create_category(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "Custom Cat"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Custom Cat"
    assert "id" in data


def test_create_category_empty_name(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/categories", json={"name": "   "})
    assert resp.status_code == 400


def test_create_category_duplicate(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Groceries")
    resp = client.post("/api/v1/categories", json={"name": "Groceries"})
    assert resp.status_code == 409


# -- Update ----------------------------------------------------------------

def test_update_category_rename(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Old Name")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_update_category_cascades_transactions(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining")
    make_transaction(session, user, category="Dining")

    client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Restaurants"})

    from sqlmodel import select
    from app.models import Transaction
    txns = session.exec(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    assert txns[0].category == "Restaurants"


def test_update_category_cascades_rules(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining")
    rule = CategoryRule(user_id=user.id, keyword="cafe", category="Dining")
    session.add(rule)
    session.commit()

    client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Restaurants"})

    from sqlmodel import select
    session.expire_all()
    rules = session.exec(
        select(CategoryRule).where(CategoryRule.user_id == user.id)
    ).all()
    assert rules[0].category == "Restaurants"


def test_update_category_empty_name(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Food")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "  "})
    assert resp.status_code == 400


def test_update_category_duplicate_name(auth_client, session):
    client, user = auth_client
    make_category(session, user, "Food")
    cat = make_category(session, user, "Dining")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Food"})
    assert resp.status_code == 409


def test_update_category_same_name_noop(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Food")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Food"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Food"


def test_update_category_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/categories/99999", json={"name": "Nope"})
    assert resp.status_code == 404


def test_update_other_users_category(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    cat = make_category(session, other, "Private")
    resp = client.patch(f"/api/v1/categories/{cat.id}", json={"name": "Hacked"})
    assert resp.status_code == 404


# -- Delete ----------------------------------------------------------------

def test_delete_category(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Temp")
    resp = client.delete(f"/api/v1/categories/{cat.id}")
    assert resp.status_code == 204


def test_delete_category_nullifies_transactions(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining")
    make_transaction(session, user, category="Dining")

    client.delete(f"/api/v1/categories/{cat.id}")

    from sqlmodel import select
    from app.models import Transaction
    session.expire_all()
    txns = session.exec(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    assert txns[0].category is None


def test_delete_category_with_reassign(auth_client, session):
    client, user = auth_client
    old_cat = make_category(session, user, "Dining")
    new_cat = make_category(session, user, "Restaurants")
    make_transaction(session, user, category="Dining")

    resp = client.delete(
        f"/api/v1/categories/{old_cat.id}",
        params={"reassign_to": new_cat.id},
    )
    assert resp.status_code == 204

    from sqlmodel import select
    from app.models import Transaction
    session.expire_all()
    txns = session.exec(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    assert txns[0].category == "Restaurants"


def test_delete_category_reassign_invalid_target(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Temp")
    resp = client.delete(
        f"/api/v1/categories/{cat.id}",
        params={"reassign_to": 99999},
    )
    assert resp.status_code == 404


def test_delete_category_deletes_rules(auth_client, session):
    client, user = auth_client
    cat = make_category(session, user, "Dining")
    rule = CategoryRule(user_id=user.id, keyword="cafe", category="Dining")
    session.add(rule)
    session.commit()

    client.delete(f"/api/v1/categories/{cat.id}")

    from sqlmodel import select
    session.expire_all()
    rules = session.exec(
        select(CategoryRule).where(CategoryRule.user_id == user.id)
    ).all()
    assert len(rules) == 0


def test_delete_category_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/categories/99999")
    assert resp.status_code == 404
