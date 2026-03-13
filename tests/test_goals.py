"""Goal CRUD, shared goals, linked accounts, and contributions tests."""

from decimal import Decimal

from app.main import app
from app.auth import get_current_user
from tests.conftest import (
    add_household_member,
    link_goal_to_account,
    make_account,
    make_goal,
    make_household,
    make_user,
)


# -- List ------------------------------------------------------------------

def test_list_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/goals")
    assert resp.status_code == 200
    data = resp.json()
    assert data["goals"] == []
    assert data["shared_goals_summary"] is None


def test_list_returns_goals(auth_client, session):
    client, user = auth_client
    make_goal(session, user, name="Emergency Fund")
    make_goal(session, user, name="Vacation")

    resp = client.get("/api/v1/goals")
    assert resp.status_code == 200
    assert len(resp.json()["goals"]) == 2


# -- Create ----------------------------------------------------------------

def test_create_goal(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/goals", json={
        "name": "New Car",
        "target_amount": 25000,
        "current_amount": 5000,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "New Car"
    assert data["target_amount"] == 25000.0
    assert data["current_amount"] == 5000.0
    assert data["progress"] == 20.0
    assert data["is_completed"] is False
    assert data["household_id"] is None
    assert data["linked_account_ids"] == []
    assert data["is_account_linked"] is False


def test_create_goal_with_target_date(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/goals", json={
        "name": "House",
        "target_amount": 100000,
        "target_date": "2028-06-01",
    })
    assert resp.status_code == 201
    assert resp.json()["target_date"] == "2028-06-01"


# -- Update ----------------------------------------------------------------

def test_update_goal_name(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user)
    resp = client.patch(f"/api/v1/goals/{goal.id}", json={"name": "Rainy Day Fund"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Rainy Day Fund"


def test_update_goal_current_amount(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user, target=Decimal("1000"))
    resp = client.patch(f"/api/v1/goals/{goal.id}", json={"current_amount": 500})
    assert resp.status_code == 200
    assert resp.json()["current_amount"] == 500.0
    assert resp.json()["progress"] == 50.0


def test_update_goal_auto_completes(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user, target=Decimal("1000"))
    resp = client.patch(f"/api/v1/goals/{goal.id}", json={"current_amount": 1000})
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is True


def test_update_goal_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/goals/99999", json={"name": "X"})
    assert resp.status_code == 404


# -- Delete ----------------------------------------------------------------

def test_delete_goal(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user)
    resp = client.delete(f"/api/v1/goals/{goal.id}")
    assert resp.status_code == 204


def test_delete_goal_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/goals/99999")
    assert resp.status_code == 404


# -- Ownership -------------------------------------------------------------

def test_cannot_update_other_users_goal(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    goal = make_goal(session, other)
    resp = client.patch(f"/api/v1/goals/{goal.id}", json={"name": "Stolen"})
    assert resp.status_code == 403


def test_cannot_delete_other_users_goal(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    goal = make_goal(session, other)
    resp = client.delete(f"/api/v1/goals/{goal.id}")
    assert resp.status_code == 403


# -- Shared goals ----------------------------------------------------------

def test_create_shared_goal(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)

    resp = client.post("/api/v1/goals", json={
        "name": "Family Vacation",
        "target_amount": 5000,
        "household_id": household.id,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["household_id"] == household.id
    assert data["name"] == "Family Vacation"


def test_create_shared_goal_not_member(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    household = make_household(session, other)

    resp = client.post("/api/v1/goals", json={
        "name": "Shared",
        "target_amount": 1000,
        "household_id": household.id,
    })
    assert resp.status_code == 403


def test_household_member_can_edit_shared_goal(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    add_household_member(session, household, user)
    goal = make_goal(session, other, household_id=household.id)

    resp = client.patch(f"/api/v1/goals/{goal.id}", json={"name": "Updated by Partner"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated by Partner"


def test_household_member_can_delete_shared_goal(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    add_household_member(session, household, user)
    goal = make_goal(session, other, household_id=household.id)

    resp = client.delete(f"/api/v1/goals/{goal.id}")
    assert resp.status_code == 204


def test_list_shared_goals_household_scope(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, user)
    add_household_member(session, household, other)

    make_goal(session, user, name="My Goal")
    make_goal(session, other, name="Partner Goal")
    make_goal(session, user, name="Shared Goal", household_id=household.id)

    resp = client.get("/api/v1/goals", params={"scope": "household"})
    assert resp.status_code == 200
    names = [g["name"] for g in resp.json()["goals"]]
    assert "My Goal" in names
    assert "Partner Goal" in names
    assert "Shared Goal" in names


def test_shared_goals_summary_in_personal_scope(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    make_goal(session, user, name="Shared", target=Decimal("1000"), current=Decimal("500"), household_id=household.id)

    resp = client.get("/api/v1/goals", params={"scope": "personal"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["shared_goals_summary"] is not None
    assert data["shared_goals_summary"]["count"] == 1
    assert data["shared_goals_summary"]["total_progress_pct"] == 50.0


# -- Account-linked goals -------------------------------------------------

def test_create_goal_with_linked_accounts(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, balance=Decimal("2500"))

    resp = client.post("/api/v1/goals", json={
        "name": "Savings Tracker",
        "target_amount": 10000,
        "linked_account_ids": [acct.id],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["is_account_linked"] is True
    assert acct.id in data["linked_account_ids"]
    assert data["current_amount"] == 2500.0


def test_create_goal_linked_account_not_found(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/goals", json={
        "name": "Bad Link",
        "target_amount": 1000,
        "linked_account_ids": [99999],
    })
    assert resp.status_code == 404


def test_update_linked_accounts(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user)
    acct = make_account(session, user, balance=Decimal("3000"))

    resp = client.patch(f"/api/v1/goals/{goal.id}", json={
        "linked_account_ids": [acct.id],
    })
    assert resp.status_code == 200
    assert resp.json()["is_account_linked"] is True
    assert resp.json()["current_amount"] == 3000.0


def test_delete_goal_cascades_links(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user)
    acct = make_account(session, user)
    link_goal_to_account(session, goal, acct)

    resp = client.delete(f"/api/v1/goals/{goal.id}")
    assert resp.status_code == 204


# -- Contributions ---------------------------------------------------------

def test_add_contribution(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user, target=Decimal("1000"), current=Decimal("0"))

    resp = client.post(f"/api/v1/goals/{goal.id}/contributions", json={
        "amount": 250,
        "note": "Birthday money",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount"] == 250.0
    assert data["note"] == "Birthday money"
    assert data["goal"]["current_amount"] == 250.0


def test_add_contribution_auto_completes(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user, target=Decimal("500"), current=Decimal("400"))

    resp = client.post(f"/api/v1/goals/{goal.id}/contributions", json={"amount": 100})
    assert resp.status_code == 201
    assert resp.json()["goal"]["is_completed"] is True


def test_contribution_rejected_for_linked_goal(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user)
    acct = make_account(session, user)
    link_goal_to_account(session, goal, acct)

    resp = client.post(f"/api/v1/goals/{goal.id}/contributions", json={"amount": 100})
    assert resp.status_code == 400


def test_contribution_negative_amount(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user)

    resp = client.post(f"/api/v1/goals/{goal.id}/contributions", json={"amount": -50})
    assert resp.status_code == 400


def test_list_contributions(auth_client, session):
    client, user = auth_client
    goal = make_goal(session, user, target=Decimal("5000"))

    client.post(f"/api/v1/goals/{goal.id}/contributions", json={"amount": 100, "note": "First"})
    client.post(f"/api/v1/goals/{goal.id}/contributions", json={"amount": 200, "note": "Second"})

    resp = client.get(f"/api/v1/goals/{goal.id}/contributions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["user_id"] == user.id


def test_contribution_not_authorized(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    goal = make_goal(session, other)

    resp = client.post(f"/api/v1/goals/{goal.id}/contributions", json={"amount": 50})
    assert resp.status_code == 403


def test_view_contributions_not_authorized(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    goal = make_goal(session, other)

    resp = client.get(f"/api/v1/goals/{goal.id}/contributions")
    assert resp.status_code == 403


def test_household_member_can_contribute(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    add_household_member(session, household, user)
    goal = make_goal(session, other, target=Decimal("5000"), household_id=household.id)

    resp = client.post(f"/api/v1/goals/{goal.id}/contributions", json={
        "amount": 300,
        "note": "My share",
    })
    assert resp.status_code == 201
    assert resp.json()["amount"] == 300.0
