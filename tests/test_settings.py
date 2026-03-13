"""Profile, user settings, category rules, export, clear, CSV import, and factory reset tests."""

from decimal import Decimal
from datetime import date
from unittest.mock import patch

from app.models import (
    Account,
    Budget,
    Category,
    CategoryRule,
    Goal,
    GoalAccountLink,
    GoalContribution,
    NetWorthSnapshot,
    SpendingPreference,
    Tag,
    Transaction,
    TransactionTag,
    User,
    UserSettings,
)
from sqlmodel import select
from tests.conftest import (
    add_household_member,
    link_goal_to_account,
    make_account,
    make_budget,
    make_category,
    make_contribution,
    make_goal,
    make_household,
    make_invitation,
    make_settings,
    make_spending_preference,
    make_tag,
    make_transaction,
    make_user,
)


# -- Profile ---------------------------------------------------------------

def test_get_profile(auth_client):
    client, user = auth_client
    resp = client.get("/api/v1/settings/profile")
    assert resp.status_code == 200
    assert resp.json()["email"] == user.email


def test_update_profile_display_name(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"display_name": "Fancy Name"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Fancy Name"
    assert resp.json()["name"] == "Fancy Name"


def test_update_profile_avatar_url(auth_client):
    client, _ = auth_client
    resp = client.put(
        "/api/v1/settings/profile",
        json={"avatar_url": "https://example.com/avatar.png"},
    )
    assert resp.status_code == 200
    assert resp.json()["avatar_url"] == "https://example.com/avatar.png"


def test_update_profile_avatar_invalid_url(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"avatar_url": "not-a-url"})
    assert resp.status_code == 400


def test_update_profile_bio(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"bio": "Hello world!"})
    assert resp.status_code == 200
    assert resp.json()["bio"] == "Hello world!"


def test_update_profile_display_name_too_long(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/profile", json={"display_name": "A" * 101})
    assert resp.status_code == 400


def test_update_profile_clear_display_name(auth_client):
    client, _ = auth_client
    client.put("/api/v1/settings/profile", json={"display_name": "Custom"})
    resp = client.put("/api/v1/settings/profile", json={"display_name": ""})
    assert resp.status_code == 200
    assert resp.json()["display_name"] is None


# -- Settings --------------------------------------------------------------

def test_get_settings(auth_client, session):
    client, user = auth_client
    make_settings(session, user)
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency"] == "CAD"
    assert data["locale"] == "en-CA"


def test_get_settings_auto_creates(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings")
    assert resp.status_code == 200
    assert resp.json()["currency"] == "CAD"


def test_update_settings(auth_client, session):
    client, user = auth_client
    make_settings(session, user)
    with patch("app.scheduler.restart_scheduler"):
        resp = client.put("/api/v1/settings", json={
            "currency": "USD",
            "sync_enabled": False,
        })
    assert resp.status_code == 200
    assert resp.json()["currency"] == "USD"
    assert resp.json()["sync_enabled"] is False


# -- Category Rules --------------------------------------------------------

def test_list_rules_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/rules")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_rule(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/settings/rules", json={
        "keyword": "starbucks",
        "category": "Food & Dining",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["keyword"] == "starbucks"
    assert data["category"] == "Food & Dining"
    assert data["case_sensitive"] is False


def test_update_rule(auth_client):
    client, _ = auth_client
    create = client.post("/api/v1/settings/rules", json={
        "keyword": "old", "category": "Other",
    })
    rule_id = create.json()["id"]
    resp = client.put(f"/api/v1/settings/rules/{rule_id}", json={
        "keyword": "new",
        "category": "Groceries",
    })
    assert resp.status_code == 200
    assert resp.json()["keyword"] == "new"
    assert resp.json()["category"] == "Groceries"


def test_update_rule_not_found(auth_client):
    client, _ = auth_client
    resp = client.put("/api/v1/settings/rules/99999", json={"keyword": "x"})
    assert resp.status_code == 404


def test_delete_rule(auth_client):
    client, _ = auth_client
    create = client.post("/api/v1/settings/rules", json={
        "keyword": "del", "category": "Other",
    })
    rule_id = create.json()["id"]
    resp = client.delete(f"/api/v1/settings/rules/{rule_id}")
    assert resp.status_code == 204


def test_delete_rule_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/settings/rules/99999")
    assert resp.status_code == 404


# -- Export ----------------------------------------------------------------

def test_export_transactions(auth_client, session):
    client, user = auth_client
    make_transaction(session, user, merchant="CSV Corp")
    resp = client.get("/api/v1/settings/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    content = resp.text
    assert "CSV Corp" in content
    assert "Date" in content


def test_export_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/settings/export")
    assert resp.status_code == 200
    lines = resp.text.strip().split("\n")
    assert len(lines) == 1  # header only


# -- Clear transactions ----------------------------------------------------

def test_clear_transactions(auth_client, session):
    client, user = auth_client
    make_transaction(session, user)
    make_transaction(session, user)

    resp = client.delete("/api/v1/settings/transactions")
    assert resp.status_code == 204

    check = client.get("/api/v1/transactions")
    assert check.json() == []


def test_clear_transactions_with_tags(auth_client, session):
    client, user = auth_client
    txn = make_transaction(session, user)
    tag = make_tag(session, user, name="test-tag")
    client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")

    resp = client.delete("/api/v1/settings/transactions")
    assert resp.status_code == 204

    check = client.get("/api/v1/transactions")
    assert check.json() == []


# -- Sync validation -------------------------------------------------------

def test_update_settings_invalid_sync_hour(auth_client, session):
    client, user = auth_client
    make_settings(session, user)
    resp = client.put("/api/v1/settings", json={"sync_hour": 25})
    assert resp.status_code == 400
    assert "sync_hour" in resp.json()["detail"]


def test_update_settings_invalid_sync_minute(auth_client, session):
    client, user = auth_client
    make_settings(session, user)
    resp = client.put("/api/v1/settings", json={"sync_minute": -1})
    assert resp.status_code == 400
    assert "sync_minute" in resp.json()["detail"]


# -- Per-account CSV import ------------------------------------------------

def test_import_creates_transactions(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Checking")
    resp = client.post(
        f"/api/v1/settings/import/{acct.id}",
        json={"transactions": [
            {"date": "2026-01-15", "amount": 4.50, "merchant_name": "Coffee"},
            {"date": "2026-01-16", "amount": 20.00, "merchant_name": "Grocery"},
        ]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["imported"] == 2
    assert data["skipped"] == 0


def test_import_skips_duplicates(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Checking")
    payload = {"transactions": [
        {"date": "2026-01-15", "amount": 4.50, "merchant_name": "Coffee"},
    ]}
    client.post(f"/api/v1/settings/import/{acct.id}", json=payload)
    resp = client.post(f"/api/v1/settings/import/{acct.id}", json=payload)
    assert resp.json()["skipped"] == 1
    assert resp.json()["imported"] == 0


def test_import_invalid_date(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Checking")
    resp = client.post(
        f"/api/v1/settings/import/{acct.id}",
        json={"transactions": [
            {"date": "bad-date", "amount": 4.50, "merchant_name": "Coffee"},
        ]},
    )
    assert resp.json()["imported"] == 0
    assert len(resp.json()["errors"]) == 1


def test_import_wrong_account(auth_client, session):
    client, _ = auth_client
    resp = client.post(
        "/api/v1/settings/import/99999",
        json={"transactions": []},
    )
    assert resp.status_code == 404


def test_import_applies_category_rules(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Checking")
    rule = CategoryRule(user_id=user.id, keyword="starbucks", category="Food & Dining")
    session.add(rule)
    session.commit()

    resp = client.post(
        f"/api/v1/settings/import/{acct.id}",
        json={"transactions": [
            {"date": "2026-01-15", "amount": 5.75, "merchant_name": "Starbucks Reserve"},
        ]},
    )
    data = resp.json()
    assert data["categorized"] == 1
    txns = session.exec(select(Transaction).where(Transaction.account_id == acct.id)).all()
    assert txns[0].category == "Food & Dining"


def test_import_preserves_csv_category(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Checking")
    resp = client.post(
        f"/api/v1/settings/import/{acct.id}",
        json={"transactions": [
            {"date": "2026-01-15", "amount": 5.75, "merchant_name": "Shop", "category": "Shopping"},
        ]},
    )
    assert resp.json()["imported"] == 1
    txns = session.exec(select(Transaction).where(Transaction.account_id == acct.id)).all()
    assert txns[0].category == "Shopping"


def test_import_ndjson_streaming(auth_client, session):
    client, user = auth_client
    acct = make_account(session, user, name="Checking")
    resp = client.post(
        f"/api/v1/settings/import/{acct.id}",
        json={"transactions": [
            {"date": "2026-01-15", "amount": 4.50, "merchant_name": "Coffee"},
        ]},
        headers={"Accept": "application/x-ndjson"},
    )
    assert resp.status_code == 200
    lines = [l for l in resp.text.strip().split("\n") if l]
    assert len(lines) == 2
    import json
    progress = json.loads(lines[0])
    assert progress["type"] == "progress"
    assert progress["merchant"] == "Coffee"
    complete = json.loads(lines[1])
    assert complete["type"] == "complete"
    assert complete["imported"] == 1


# -- Import LLM fallback ---------------------------------------------------

def test_import_categorizes_via_llm_fallback(auth_client, session):
    """When no rule matches, the import falls back to LLM per transaction."""
    from unittest.mock import MagicMock
    import json as _json

    client, user = auth_client
    acct = make_account(session, user, name="Checking")

    def fake_llm_response(url, **kwargs):
        body = kwargs.get("json", {})
        user_msg = body["messages"][1]["content"]
        input_txns = _json.loads(user_msg)
        result = [{"id": t["id"], "category": "Entertainment"} for t in input_txns]
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "choices": [{"message": {"content": _json.dumps(result)}}]
        }
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.categorizer._get_llm_config", return_value=(
        "http://fake-llm", "fake-key", "test-model",
    )), patch("httpx.post", side_effect=fake_llm_response):
        resp = client.post(
            f"/api/v1/settings/import/{acct.id}",
            json={"transactions": [
                {"date": "2026-01-15", "amount": 12.99, "merchant_name": "Regal Cinemas"},
            ]},
        )

    data = resp.json()
    assert data["categorized"] == 1
    txns = session.exec(select(Transaction).where(Transaction.account_id == acct.id)).all()
    assert txns[0].category == "Entertainment"


def test_import_streaming_shows_llm_category(auth_client, session):
    """NDJSON streaming progress includes category from LLM fallback."""
    from unittest.mock import MagicMock
    import json as _json

    client, user = auth_client
    acct = make_account(session, user, name="Checking")

    def fake_llm_response(url, **kwargs):
        body = kwargs.get("json", {})
        user_msg = body["messages"][1]["content"]
        input_txns = _json.loads(user_msg)
        result = [{"id": t["id"], "category": "Shopping"} for t in input_txns]
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "choices": [{"message": {"content": _json.dumps(result)}}]
        }
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.categorizer._get_llm_config", return_value=(
        "http://fake-llm", "fake-key", "test-model",
    )), patch("httpx.post", side_effect=fake_llm_response):
        resp = client.post(
            f"/api/v1/settings/import/{acct.id}",
            json={"transactions": [
                {"date": "2026-01-15", "amount": 29.99, "merchant_name": "Target"},
            ]},
            headers={"Accept": "application/x-ndjson"},
        )

    lines = [l for l in resp.text.strip().split("\n") if l]
    progress = _json.loads(lines[0])
    assert progress["status"] == "categorized"
    assert progress["category"] == "Shopping"
    complete = _json.loads(lines[1])
    assert complete["categorized"] == 1


def test_bulk_import_categorizes_via_llm_fallback(auth_client, session):
    """Bulk import also falls back to LLM when rules don't match."""
    from unittest.mock import MagicMock
    import json as _json

    client, user = auth_client

    def fake_llm_response(url, **kwargs):
        body = kwargs.get("json", {})
        user_msg = body["messages"][1]["content"]
        input_txns = _json.loads(user_msg)
        result = [{"id": t["id"], "category": "Groceries"} for t in input_txns]
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {
            "choices": [{"message": {"content": _json.dumps(result)}}]
        }
        resp.raise_for_status = MagicMock()
        return resp

    with patch("app.categorizer._get_llm_config", return_value=(
        "http://fake-llm", "fake-key", "test-model",
    )), patch("httpx.post", side_effect=fake_llm_response):
        resp = client.post("/api/v1/settings/bulk-import", json={
            "accounts": [],
            "transactions": [
                {"date": "2026-01-15", "amount": 45.00, "merchant_name": "Whole Foods"},
            ],
        })

    data = resp.json()
    assert data["categorized"] == 1
    txns = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert txns[0].category == "Groceries"


# -- Bulk CSV import -------------------------------------------------------

def test_bulk_import_creates_accounts_and_transactions(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [{"name": "New Visa", "type": "credit"}],
        "transactions": [
            {"date": "2026-01-15", "amount": 50.00, "merchant_name": "Amazon",
             "account_name": "New Visa"},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["imported"] == 1
    acct = session.exec(select(Account).where(Account.name == "New Visa")).first()
    assert acct is not None
    assert str(acct.type) == "credit" or acct.type == "credit"


def test_bulk_import_reuses_existing_accounts(auth_client, session):
    client, user = auth_client
    make_account(session, user, name="Checking")
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "account_name": "Checking"},
        ],
    })
    assert resp.json()["imported"] == 1
    accts = session.exec(select(Account).where(Account.user_id == user.id)).all()
    checking_accts = [a for a in accts if a.name == "Checking"]
    assert len(checking_accts) == 1


def test_bulk_import_skips_duplicates(auth_client, session):
    client, user = auth_client
    payload = {
        "accounts": [{"name": "Visa", "type": "credit"}],
        "transactions": [
            {"date": "2026-01-15", "amount": 50.00, "merchant_name": "Amazon",
             "account_name": "Visa"},
        ],
    }
    client.post("/api/v1/settings/bulk-import", json=payload)
    resp = client.post("/api/v1/settings/bulk-import", json=payload)
    assert resp.json()["skipped"] == 1
    assert resp.json()["imported"] == 0


def test_bulk_import_case_insensitive_accounts(auth_client, session):
    client, user = auth_client
    make_account(session, user, name="Checking")
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "account_name": "checking"},
        ],
    })
    assert resp.json()["imported"] == 1


def test_bulk_import_without_account_name(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop"},
        ],
    })
    assert resp.json()["imported"] == 1


def test_bulk_import_with_notes(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "notes": "Some notes here"},
        ],
    })
    assert resp.json()["imported"] == 1
    txns = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert txns[0].notes == "Some notes here"


def test_bulk_import_applies_rules_not_llm(auth_client, session):
    client, user = auth_client
    rule = CategoryRule(user_id=user.id, keyword="coffee", category="Food & Dining")
    session.add(rule)
    session.commit()

    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 5.00, "merchant_name": "Coffee Shop"},
        ],
    })
    assert resp.json()["categorized"] == 1
    txns = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert txns[0].category == "Food & Dining"


def test_bulk_import_owner_mapping(auth_client, session):
    client, user = auth_client
    partner = make_user(session, name="Partner")
    household = make_household(session, user)
    add_household_member(session, household, partner)

    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "owner_name": "Partner"},
        ],
    })
    assert resp.json()["imported"] == 1
    txns = session.exec(select(Transaction).where(Transaction.merchant_name == "Shop")).all()
    assert txns[0].user_id == partner.id


def test_bulk_import_new_categories(auth_client, session):
    client, user = auth_client
    make_category(session, user, name="Food & Dining")

    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "category": "Custom Category"},
        ],
        "new_categories": ["Custom Category", "Another New"],
    })
    assert resp.json()["imported"] == 1
    cats = session.exec(select(Category).where(Category.user_id == user.id)).all()
    cat_names = {c.name for c in cats}
    assert "Custom Category" in cat_names
    assert "Another New" in cat_names
    assert "Food & Dining" in cat_names


def test_bulk_import_new_categories_skips_existing(auth_client, session):
    client, user = auth_client
    make_category(session, user, name="Groceries")

    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "category": "Groceries"},
        ],
        "new_categories": ["Groceries"],
    })
    assert resp.json()["imported"] == 1
    cats = session.exec(
        select(Category).where(Category.user_id == user.id, Category.name == "Groceries")
    ).all()
    assert len(cats) == 1


def test_bulk_import_ndjson_streaming(auth_client, session):
    client, user = auth_client
    resp = client.post(
        "/api/v1/settings/bulk-import",
        json={
            "accounts": [],
            "transactions": [
                {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop"},
                {"date": "2026-01-16", "amount": 20.00, "merchant_name": "Store"},
            ],
        },
        headers={"Accept": "application/x-ndjson"},
    )
    assert resp.status_code == 200
    import json
    lines = [l for l in resp.text.strip().split("\n") if l]
    assert len(lines) == 3  # 2 progress + 1 complete
    complete = json.loads(lines[-1])
    assert complete["type"] == "complete"
    assert complete["imported"] == 2


def test_bulk_import_invalid_date(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "not-a-date", "amount": 10.00, "merchant_name": "Shop"},
        ],
    })
    assert resp.json()["imported"] == 0
    assert len(resp.json()["errors"]) == 1
    assert "not-a-date" in resp.json()["errors"][0]


def test_bulk_import_preserves_csv_category(auth_client, session):
    client, user = auth_client
    rule = CategoryRule(user_id=user.id, keyword="shop", category="Shopping")
    session.add(rule)
    session.commit()

    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Shop",
             "category": "Groceries"},
        ],
    })
    assert resp.json()["imported"] == 1
    assert resp.json()["categorized"] == 0
    txns = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert txns[0].category == "Groceries"


def test_bulk_import_leaves_category_null_when_uncategorized(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/settings/bulk-import", json={
        "accounts": [],
        "transactions": [
            {"date": "2026-01-15", "amount": 10.00, "merchant_name": "Unknown Place"},
        ],
    })
    assert resp.json()["imported"] == 1
    assert resp.json()["categorized"] == 0
    txns = session.exec(select(Transaction).where(Transaction.user_id == user.id)).all()
    assert txns[0].category is None


# -- Factory Reset ---------------------------------------------------------

def test_factory_reset_clears_all_data(auth_client, session):
    from tests.conftest import make_net_worth_snapshot
    client, user = auth_client

    acct = make_account(session, user, name="Checking", is_linked=False)
    txn = make_transaction(session, user, account=acct)
    tag = make_tag(session, user, name="vacation")
    session.add(TransactionTag(transaction_id=txn.id, tag_id=tag.id))
    session.commit()

    budget = make_budget(session, user)
    goal = make_goal(session, user)
    link_goal_to_account(session, goal, acct)
    make_contribution(session, goal, user)
    make_spending_preference(session, user)
    make_net_worth_snapshot(session, user)
    cat = make_category(session, user, name="Groceries")
    rule = CategoryRule(user_id=user.id, keyword="store", category="Groceries")
    session.add(rule)
    session.commit()
    make_settings(session, user)

    resp = client.delete("/api/v1/settings/all-data")
    assert resp.status_code == 204

    assert session.exec(select(Transaction).where(Transaction.user_id == user.id)).all() == []
    assert session.exec(select(Account).where(Account.user_id == user.id)).all() == []
    assert session.exec(select(Budget).where(Budget.user_id == user.id)).all() == []
    assert session.exec(select(Goal).where(Goal.user_id == user.id)).all() == []
    assert session.exec(select(Tag).where(Tag.user_id == user.id)).all() == []
    assert session.exec(select(CategoryRule).where(CategoryRule.user_id == user.id)).all() == []
    assert session.exec(select(Category).where(Category.user_id == user.id)).all() == []
    assert session.exec(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user.id)).all() == []
    assert session.exec(select(SpendingPreference).where(SpendingPreference.user_id == user.id)).all() == []
    assert session.exec(select(UserSettings).where(UserSettings.user_id == user.id)).all() == []
    assert session.exec(select(TransactionTag)).all() == []
    assert session.exec(select(GoalAccountLink)).all() == []
    assert session.exec(select(GoalContribution)).all() == []

    assert session.get(User, user.id) is not None


def test_factory_reset_preserves_household(auth_client, session):
    from tests.conftest import make_net_worth_snapshot
    client, user = auth_client

    partner = make_user(session, name="Partner")
    household = make_household(session, user)
    add_household_member(session, household, partner)
    make_invitation(session, household, user, "someone@example.com")

    make_account(session, user, name="Checking", is_linked=False)
    make_transaction(session, user)

    resp = client.delete("/api/v1/settings/all-data")
    assert resp.status_code == 204

    from app.models import HouseholdMember, Household, HouseholdInvitation
    assert session.get(Household, household.id) is not None
    members = session.exec(
        select(HouseholdMember).where(HouseholdMember.household_id == household.id)
    ).all()
    assert len(members) == 2
    invitations = session.exec(
        select(HouseholdInvitation).where(HouseholdInvitation.household_id == household.id)
    ).all()
    assert len(invitations) == 1
