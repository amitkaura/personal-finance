"""Net worth snapshot and history tests."""

from datetime import date, timedelta
from decimal import Decimal

from app.models import NetWorthSnapshot, AccountType
from tests.conftest import make_account


# -- Snapshot --------------------------------------------------------------

def test_create_snapshot_empty(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/net-worth/snapshot")
    assert resp.status_code == 200
    data = resp.json()
    assert data["assets"] == 0.0
    assert data["liabilities"] == 0.0
    assert data["net_worth"] == 0.0
    assert data["date"] == date.today().isoformat()


def test_create_snapshot_with_accounts(auth_client, session):
    client, user = auth_client
    make_account(session, user, type=AccountType.DEPOSITORY, balance=Decimal("5000"))
    make_account(session, user, type=AccountType.CREDIT, balance=Decimal("1200"))

    resp = client.post("/api/v1/net-worth/snapshot")
    assert resp.status_code == 200
    data = resp.json()
    assert data["assets"] == 5000.0
    assert data["liabilities"] == 1200.0
    assert data["net_worth"] == 3800.0


def test_create_snapshot_idempotent(auth_client, session):
    client, user = auth_client
    make_account(session, user, type=AccountType.DEPOSITORY, balance=Decimal("1000"))

    client.post("/api/v1/net-worth/snapshot")
    resp = client.post("/api/v1/net-worth/snapshot")
    assert resp.status_code == 200

    history = client.get("/api/v1/net-worth/history")
    today_entries = [e for e in history.json() if e["date"] == date.today().isoformat()]
    assert len(today_entries) == 1


# -- History ---------------------------------------------------------------

def test_history_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/net-worth/history")
    assert resp.status_code == 200
    assert resp.json() == []


def test_history_returns_snapshots(auth_client, session):
    client, user = auth_client
    today = date.today()
    for i in range(3):
        snap = NetWorthSnapshot(
            user_id=user.id,
            date=today - timedelta(days=30 * i),
            assets=Decimal("10000") - Decimal(str(i * 1000)),
            liabilities=Decimal("2000"),
            net_worth=Decimal("8000") - Decimal(str(i * 1000)),
        )
        session.add(snap)
    session.commit()

    resp = client.get("/api/v1/net-worth/history", params={"months": 6})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert data[0]["date"] < data[-1]["date"]  # ascending order
