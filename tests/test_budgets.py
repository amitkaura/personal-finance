"""Budget CRUD, copy, summary, shared budgets, preferences, and conflicts tests."""

from datetime import date
from decimal import Decimal

from app.main import app
from app.auth import get_current_user
from tests.conftest import (
    add_household_member,
    make_account,
    make_budget,
    make_household,
    make_transaction,
    make_user,
)


# -- List ------------------------------------------------------------------

def test_list_empty(auth_client):
    client, _ = auth_client
    month = date.today().strftime("%Y-%m")
    resp = client.get("/api/v1/budgets", params={"month": month})
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_returns_budgets(auth_client, session):
    client, user = auth_client
    month = date.today().strftime("%Y-%m")
    make_budget(session, user, category="Groceries", month=month)
    make_budget(session, user, category="Entertainment", month=month)

    resp = client.get("/api/v1/budgets", params={"month": month})
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_invalid_month(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/budgets", params={"month": "not-a-month"})
    assert resp.status_code == 400


# -- Create ----------------------------------------------------------------

def test_create_budget(auth_client):
    client, _ = auth_client
    month = date.today().strftime("%Y-%m")
    resp = client.post("/api/v1/budgets", json={
        "category": "Food & Dining",
        "amount": 500,
        "month": month,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "Food & Dining"
    assert data["amount"] == 500.0
    assert data["month"] == month
    assert data["household_id"] is None


def test_create_duplicate_budget(auth_client, session):
    client, user = auth_client
    month = date.today().strftime("%Y-%m")
    make_budget(session, user, category="Groceries", month=month)

    resp = client.post("/api/v1/budgets", json={
        "category": "Groceries",
        "amount": 300,
        "month": month,
    })
    assert resp.status_code == 409


# -- Update ----------------------------------------------------------------

def test_update_budget_amount(auth_client, session):
    client, user = auth_client
    budget = make_budget(session, user)
    resp = client.patch(f"/api/v1/budgets/{budget.id}", json={"amount": 750})
    assert resp.status_code == 200
    assert resp.json()["amount"] == 750.0


def test_update_budget_rollover(auth_client, session):
    client, user = auth_client
    budget = make_budget(session, user, rollover=False)
    resp = client.patch(f"/api/v1/budgets/{budget.id}", json={"rollover": True})
    assert resp.status_code == 200
    assert resp.json()["rollover"] is True


def test_update_budget_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/budgets/99999", json={"amount": 100})
    assert resp.status_code == 404


# -- Delete ----------------------------------------------------------------

def test_delete_budget(auth_client, session):
    client, user = auth_client
    budget = make_budget(session, user)
    resp = client.delete(f"/api/v1/budgets/{budget.id}")
    assert resp.status_code == 204


def test_delete_budget_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/budgets/99999")
    assert resp.status_code == 404


# -- Copy ------------------------------------------------------------------

def test_copy_budgets(auth_client, session):
    client, user = auth_client
    make_budget(session, user, category="Groceries", month="2025-01", amount=Decimal("300"))
    make_budget(session, user, category="Rent & Mortgage", month="2025-01", amount=Decimal("1500"))

    resp = client.post(
        "/api/v1/budgets/copy",
        params={"source_month": "2025-01", "target_month": "2025-02"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["copied"] == 2
    assert data["target_month"] == "2025-02"

    check = client.get("/api/v1/budgets", params={"month": "2025-02"})
    assert len(check.json()) == 2


def test_copy_budgets_no_source(auth_client):
    client, _ = auth_client
    resp = client.post(
        "/api/v1/budgets/copy",
        params={"source_month": "2020-01", "target_month": "2020-02"},
    )
    assert resp.status_code == 404


def test_copy_skips_shared_budgets(auth_client, session):
    """Copy only copies personal budgets, not shared ones."""
    client, user = auth_client
    household = make_household(session, user)
    make_budget(session, user, category="Groceries", month="2025-03")
    make_budget(session, user, category="Rent", month="2025-03", household_id=household.id)

    resp = client.post(
        "/api/v1/budgets/copy",
        params={"source_month": "2025-03", "target_month": "2025-04"},
    )
    assert resp.status_code == 200
    assert resp.json()["copied"] == 1


# -- Summary ---------------------------------------------------------------

def test_budget_summary(auth_client, session):
    client, user = auth_client
    month = date.today().strftime("%Y-%m")
    make_budget(session, user, category="Groceries", amount=Decimal("400"), month=month)

    make_transaction(
        session, user,
        category="Groceries",
        amount=Decimal("120"),
        txn_date=date.today(),
    )

    resp = client.get("/api/v1/budgets/summary", params={"month": month})
    assert resp.status_code == 200
    data = resp.json()
    assert data["month"] == month
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["category"] == "Groceries"
    assert item["budgeted"] == 400.0
    assert item["spent"] == 120.0
    assert item["remaining"] == 280.0


# -- Shared budgets --------------------------------------------------------

def test_create_shared_budget(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")

    resp = client.post("/api/v1/budgets", json={
        "category": "Groceries",
        "amount": 800,
        "month": month,
        "household_id": household.id,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["household_id"] == household.id
    assert data["amount"] == 800.0


def test_create_shared_budget_not_member(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    household = make_household(session, other)

    resp = client.post("/api/v1/budgets", json={
        "category": "Groceries",
        "amount": 400,
        "household_id": household.id,
    })
    assert resp.status_code == 403


def test_create_duplicate_shared_budget(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")
    make_budget(session, user, category="Groceries", month=month, household_id=household.id)

    resp = client.post("/api/v1/budgets", json={
        "category": "Groceries",
        "amount": 300,
        "month": month,
        "household_id": household.id,
    })
    assert resp.status_code == 409


def test_list_includes_shared_budgets_household_scope(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")
    make_budget(session, user, category="Personal", month=month)
    make_budget(session, user, category="Shared", month=month, household_id=household.id)

    resp = client.get("/api/v1/budgets", params={"month": month, "scope": "household"})
    assert resp.status_code == 200
    cats = [b["category"] for b in resp.json()]
    assert "Personal" in cats
    assert "Shared" in cats


def test_list_personal_scope_excludes_shared(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")
    make_budget(session, user, category="Personal", month=month)
    make_budget(session, user, category="Shared", month=month, household_id=household.id)

    resp = client.get("/api/v1/budgets", params={"month": month, "scope": "personal"})
    assert resp.status_code == 200
    cats = [b["category"] for b in resp.json()]
    assert "Personal" in cats
    assert "Shared" not in cats


def test_household_member_can_edit_shared_budget(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    add_household_member(session, household, user)
    budget = make_budget(session, other, category="Groceries", household_id=household.id)

    resp = client.patch(f"/api/v1/budgets/{budget.id}", json={"amount": 999})
    assert resp.status_code == 200
    assert resp.json()["amount"] == 999.0


def test_household_member_can_delete_shared_budget(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    add_household_member(session, household, user)
    budget = make_budget(session, other, category="Groceries", household_id=household.id)

    resp = client.delete(f"/api/v1/budgets/{budget.id}")
    assert resp.status_code == 204


def test_cannot_edit_other_users_personal_budget(auth_client, session):
    client, _ = auth_client
    other = make_user(session)
    budget = make_budget(session, other)

    resp = client.patch(f"/api/v1/budgets/{budget.id}", json={"amount": 1})
    assert resp.status_code == 403


def test_personal_and_shared_same_category_allowed(auth_client, session):
    """A user can have both a personal and shared budget for the same category."""
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")

    resp1 = client.post("/api/v1/budgets", json={
        "category": "Groceries", "amount": 200, "month": month,
    })
    assert resp1.status_code == 201

    resp2 = client.post("/api/v1/budgets", json={
        "category": "Groceries", "amount": 600, "month": month,
        "household_id": household.id,
    })
    assert resp2.status_code == 201


# -- Spending Preferences -------------------------------------------------

def test_get_preferences_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/budgets/preferences")
    assert resp.status_code == 200
    assert resp.json() == []


def test_set_preference(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/budgets/preferences", json={
        "category": "Groceries",
        "target": "shared",
    })
    assert resp.status_code == 200
    assert resp.json() == {"category": "Groceries", "target": "shared"}


def test_set_preference_invalid_target(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/budgets/preferences", json={
        "category": "Groceries",
        "target": "invalid",
    })
    assert resp.status_code == 400


def test_set_preference_upserts(auth_client):
    client, _ = auth_client
    client.put("/api/v1/budgets/preferences", json={
        "category": "Groceries", "target": "shared",
    })
    resp = client.put("/api/v1/budgets/preferences", json={
        "category": "Groceries", "target": "personal",
    })
    assert resp.status_code == 200
    assert resp.json()["target"] == "personal"

    prefs = client.get("/api/v1/budgets/preferences").json()
    assert len(prefs) == 1
    assert prefs[0]["target"] == "personal"


def test_get_preferences_returns_saved(auth_client):
    client, _ = auth_client
    client.put("/api/v1/budgets/preferences", json={"category": "Groceries", "target": "shared"})
    client.put("/api/v1/budgets/preferences", json={"category": "Rent", "target": "personal"})

    resp = client.get("/api/v1/budgets/preferences")
    assert resp.status_code == 200
    cats = {p["category"]: p["target"] for p in resp.json()}
    assert cats["Groceries"] == "shared"
    assert cats["Rent"] == "personal"


# -- Budget Conflicts ------------------------------------------------------

def test_conflicts_empty_no_household(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/budgets/conflicts")
    assert resp.status_code == 200
    assert resp.json() == []


def test_conflicts_detects_overlap(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")

    make_budget(session, user, category="Groceries", month=month)
    make_budget(session, user, category="Groceries", month=month, household_id=household.id)

    resp = client.get("/api/v1/budgets/conflicts", params={"month": month})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["category"] == "Groceries"


def test_conflicts_no_overlap(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")

    make_budget(session, user, category="Groceries", month=month)
    make_budget(session, user, category="Rent", month=month, household_id=household.id)

    resp = client.get("/api/v1/budgets/conflicts", params={"month": month})
    assert resp.status_code == 200
    assert resp.json() == []


def test_conflicts_includes_preference(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    month = date.today().strftime("%Y-%m")

    make_budget(session, user, category="Groceries", month=month)
    make_budget(session, user, category="Groceries", month=month, household_id=household.id)
    client.put("/api/v1/budgets/preferences", json={"category": "Groceries", "target": "shared"})

    resp = client.get("/api/v1/budgets/conflicts", params={"month": month})
    data = resp.json()
    assert len(data) == 1
    assert data[0]["current_preference"] == "shared"
