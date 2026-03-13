"""Reports endpoint tests (spending by category, trends, top merchants)."""

from datetime import date, timedelta
from decimal import Decimal

from tests.conftest import make_transaction


# -- Spending by category --------------------------------------------------

def test_spending_by_category_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/reports/spending-by-category")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_expenses"] == 0
    assert data["categories"] == []


def test_spending_by_category(auth_client, session):
    client, user = auth_client
    today = date.today()
    make_transaction(session, user, category="Groceries", amount=Decimal("50"), txn_date=today)
    make_transaction(session, user, category="Groceries", amount=Decimal("30"), txn_date=today)
    make_transaction(session, user, category="Entertainment", amount=Decimal("20"), txn_date=today)

    resp = client.get("/api/v1/reports/spending-by-category", params={"months": 1})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_expenses"] == 100.0

    cats = {c["category"]: c["amount"] for c in data["categories"]}
    assert cats["Groceries"] == 80.0
    assert cats["Entertainment"] == 20.0


def test_spending_income_tracked(auth_client, session):
    client, user = auth_client
    today = date.today()
    make_transaction(session, user, category="Income", amount=Decimal("-2000"), txn_date=today)
    make_transaction(session, user, category="Groceries", amount=Decimal("100"), txn_date=today)

    resp = client.get("/api/v1/reports/spending-by-category", params={"months": 1})
    data = resp.json()
    assert data["total_income"] == 2000.0
    assert data["total_expenses"] == 100.0


# -- Monthly trends --------------------------------------------------------

def test_monthly_trends_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/reports/monthly-trends")
    assert resp.status_code == 200
    assert resp.json() == []


def test_monthly_trends(auth_client, session):
    client, user = auth_client
    today = date.today()
    make_transaction(session, user, amount=Decimal("200"), txn_date=today)
    make_transaction(session, user, amount=Decimal("-3000"), txn_date=today)

    resp = client.get("/api/v1/reports/monthly-trends", params={"months": 1})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    month_key = today.strftime("%Y-%m")
    entry = next((d for d in data if d["month"] == month_key), None)
    assert entry is not None
    assert entry["expenses"] == 200.0
    assert entry["income"] == 3000.0
    assert entry["net"] == 2800.0


# -- Category trends -------------------------------------------------------

def test_category_trends(auth_client, session):
    client, user = auth_client
    today = date.today()
    make_transaction(session, user, category="Groceries", amount=Decimal("100"), txn_date=today)

    resp = client.get(
        "/api/v1/reports/category-trends",
        params={"category": "Groceries", "months": 1},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] == "Groceries"
    assert len(data["months"]) >= 1
    assert data["average"] > 0


# -- Top merchants ---------------------------------------------------------

def test_top_merchants_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/reports/top-merchants")
    assert resp.status_code == 200
    assert resp.json() == []


def test_top_merchants(auth_client, session):
    client, user = auth_client
    today = date.today()
    make_transaction(session, user, merchant="BigMart", amount=Decimal("200"), txn_date=today)
    make_transaction(session, user, merchant="BigMart", amount=Decimal("150"), txn_date=today)
    make_transaction(session, user, merchant="CoffeeShop", amount=Decimal("50"), txn_date=today)

    resp = client.get("/api/v1/reports/top-merchants", params={"months": 1})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["merchant"] == "BigMart"
    assert data[0]["total"] == 350.0
    assert data[0]["count"] == 2
    assert data[1]["merchant"] == "CoffeeShop"
