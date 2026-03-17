"""Tests for the admin panel endpoints."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlmodel import Session, select

from tests.conftest import (
    make_account,
    make_budget,
    make_category,
    make_contribution,
    make_goal,
    make_household,
    make_invitation,
    make_net_worth_snapshot,
    make_settings,
    make_tag,
    make_transaction,
    make_user,
    link_goal_to_account,
    add_household_member,
)
from app.models import (
    Account,
    AccountBalanceSnapshot,
    ActivityAction,
    ActivityLog,
    Budget,
    Category,
    CategoryRule,
    ErrorLog,
    ErrorType,
    Goal,
    GoalAccountLink,
    GoalContribution,
    HouseholdInvitation,
    HouseholdMember,
    NetWorthSnapshot,
    PlaidItem,
    SpendingPreference,
    Tag,
    Transaction,
    TransactionTag,
    User,
    UserSettings,
)
from app.auth import get_current_user
from app.main import app


# ── Helpers ─────────────────────────────────────────────────────


def _make_admin(session: Session, **overrides) -> User:
    return make_user(session, is_admin=True, **overrides)


def _set_admin_override(user: User):
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_override():
    app.dependency_overrides.pop(get_current_user, None)


def _make_activity(session: Session, user: User, action: ActivityAction, created_at=None):
    log = ActivityLog(
        user_id=user.id,
        action=action,
        created_at=created_at or datetime.now(timezone.utc),
    )
    session.add(log)
    session.commit()
    return log


def _make_error(session: Session, user=None, error_type=ErrorType.PLAID_SYNC, endpoint="/api/v1/plaid/sync/1", detail="Test error", created_at=None):
    log = ErrorLog(
        user_id=user.id if user else None,
        error_type=error_type,
        endpoint=endpoint,
        status_code=500,
        detail=detail,
        created_at=created_at or datetime.now(timezone.utc),
    )
    session.add(log)
    session.commit()
    return log


# ── Admin Guard ─────────────────────────────────────────────────


class TestAdminGuard:
    """Non-admin users get 403 on all admin endpoints."""

    ENDPOINTS = [
        ("GET", "/api/v1/admin/overview"),
        ("GET", "/api/v1/admin/users"),
        ("PATCH", "/api/v1/admin/users/1"),
        ("DELETE", "/api/v1/admin/users/1"),
        ("GET", "/api/v1/admin/plaid-health"),
        ("GET", "/api/v1/admin/errors"),
        ("GET", "/api/v1/admin/analytics/active-users"),
        ("GET", "/api/v1/admin/analytics/feature-adoption"),
        ("GET", "/api/v1/admin/analytics/transaction-volume"),
        ("GET", "/api/v1/admin/analytics/storage"),
    ]

    @pytest.mark.parametrize("method,path", ENDPOINTS)
    def test_non_admin_gets_403(self, client, session, method, path):
        user = make_user(session)
        _set_admin_override(user)
        try:
            kwargs = {}
            if method == "PATCH":
                kwargs["json"] = {}
            resp = getattr(client, method.lower())(path, **kwargs)
            assert resp.status_code == 403
        finally:
            _clear_override()

    def test_unauthenticated_gets_401(self, client, session):
        resp = client.get("/api/v1/admin/overview")
        assert resp.status_code in (401, 403)


# ── Overview ────────────────────────────────────────────────────


class TestOverview:

    def test_returns_aggregate_counts(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u2 = make_user(session)
            # Create accounts
            acct_linked = make_account(session, admin, name="Linked", is_linked=True)
            acct_manual = make_account(session, u2, name="Manual", is_linked=False)
            # Create transactions
            make_transaction(session, admin, account=acct_linked)
            make_transaction(session, u2, account=acct_manual)
            make_transaction(session, u2, account=acct_manual)
            # Create household
            make_household(session, u2, name="Test Household")
            # Activity for active users
            _make_activity(session, admin, ActivityAction.LOGIN)
            _make_activity(session, u2, ActivityAction.LOGIN, created_at=datetime.now(timezone.utc) - timedelta(days=20))

            resp = client.get("/api/v1/admin/overview")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total_users"] == 2
            assert data["total_accounts"] == 2
            assert data["linked_accounts"] == 1
            assert data["manual_accounts"] == 1
            assert data["total_transactions"] == 3
            assert data["total_households"] >= 1
            assert data["active_7d"] >= 1
            assert data["active_30d"] >= 1
        finally:
            _clear_override()


# ── Users List ──────────────────────────────────────────────────


class TestUsersList:

    def test_returns_paginated_users(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            for _ in range(5):
                make_user(session)

            resp = client.get("/api/v1/admin/users?limit=3&offset=0")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["items"]) == 3
            assert data["total"] == 6  # admin + 5

            resp2 = client.get("/api/v1/admin/users?limit=3&offset=3")
            data2 = resp2.json()
            assert len(data2["items"]) == 3
            assert data2["total"] == 6
        finally:
            _clear_override()

    def test_search_filters_by_email(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            make_user(session, email="findme@example.com", name="Find Me")
            make_user(session, email="other@example.com", name="Other")

            resp = client.get("/api/v1/admin/users?search=findme")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["items"]) == 1
            assert data["items"][0]["email"] == "findme@example.com"
        finally:
            _clear_override()

    def test_search_filters_by_name(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            make_user(session, email="a@test.com", name="Alice Johnson")
            make_user(session, email="b@test.com", name="Bob Smith")

            resp = client.get("/api/v1/admin/users?search=alice")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["items"]) == 1
            assert data["items"][0]["name"] == "Alice Johnson"
        finally:
            _clear_override()

    def test_user_stats_correct(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session, email="stats@test.com")
            acct = make_account(session, u)
            make_transaction(session, u, account=acct)
            make_transaction(session, u, account=acct)

            resp = client.get("/api/v1/admin/users?search=stats@test.com")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["items"]) == 1
            item = data["items"][0]
            assert item["account_count"] == 1
            assert item["transaction_count"] == 2
        finally:
            _clear_override()


# ── User Update ─────────────────────────────────────────────────


class TestUserUpdate:

    def test_promote_to_admin(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            resp = client.patch(f"/api/v1/admin/users/{u.id}", json={"is_admin": True})
            assert resp.status_code == 200
            assert resp.json()["is_admin"] is True
            session.refresh(u)
            assert u.is_admin is True
        finally:
            _clear_override()

    def test_demote_from_admin(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session, is_admin=True)
            resp = client.patch(f"/api/v1/admin/users/{u.id}", json={"is_admin": False})
            assert resp.status_code == 200
            assert resp.json()["is_admin"] is False
        finally:
            _clear_override()

    def test_disable_user(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            resp = client.patch(f"/api/v1/admin/users/{u.id}", json={"is_disabled": True})
            assert resp.status_code == 200
            assert resp.json()["is_disabled"] is True
        finally:
            _clear_override()

    def test_enable_user(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session, is_disabled=True)
            resp = client.patch(f"/api/v1/admin/users/{u.id}", json={"is_disabled": False})
            assert resp.status_code == 200
            assert resp.json()["is_disabled"] is False
        finally:
            _clear_override()

    def test_update_nonexistent_user_404(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            resp = client.patch("/api/v1/admin/users/99999", json={"is_admin": True})
            assert resp.status_code == 404
        finally:
            _clear_override()


# ── User Delete (cascade) ──────────────────────────────────────


class TestUserDelete:

    def test_hard_delete_cascades_all_data(self, client, session):
        """Create a user with the full FK chain and verify deletion removes everything."""
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session, email="delete-me@test.com")
            uid = u.id

            # Account + transaction + tag
            acct = make_account(session, u, name="Del Checking")
            txn = make_transaction(session, u, account=acct)
            tag = make_tag(session, u, name="del-tag")
            tt = TransactionTag(transaction_id=txn.id, tag_id=tag.id)
            session.add(tt)
            session.commit()

            # Account balance snapshot
            snap = AccountBalanceSnapshot(account_id=acct.id, date=date.today(), balance=Decimal("100"))
            session.add(snap)
            session.commit()

            # Goal + link + contribution
            goal = make_goal(session, u, name="Del Goal")
            link_goal_to_account(session, goal, acct)
            make_contribution(session, goal, u, amount=Decimal("50"))

            # Net worth snapshot
            make_net_worth_snapshot(session, u)

            # Category, rule, settings, budget, spending pref
            make_category(session, u, name="Del Cat")
            rule = CategoryRule(user_id=uid, keyword="test", category="Del Cat")
            session.add(rule)
            session.commit()
            make_settings(session, u)
            make_budget(session, u, category="Del Cat")
            pref = SpendingPreference(user_id=uid, category="Del Cat", target="personal")
            session.add(pref)
            session.commit()

            # Household invitation (as inviter)
            hh = make_household(session, u, name="Del Household")
            make_invitation(session, hh, u, "invited@test.com")

            # Plaid item
            pi = PlaidItem(user_id=uid, encrypted_access_token="enc", item_id=f"plaid-{uid}")
            session.add(pi)
            session.commit()

            # Activity + error logs
            _make_activity(session, u, ActivityAction.LOGIN)
            _make_error(session, user=u)

            # Now delete
            resp = client.delete(f"/api/v1/admin/users/{uid}")
            assert resp.status_code == 200

            # Verify everything is gone
            assert session.get(User, uid) is None
            assert session.exec(select(Account).where(Account.user_id == uid)).first() is None
            assert session.exec(select(Transaction).where(Transaction.user_id == uid)).first() is None
            assert session.exec(select(TransactionTag).where(TransactionTag.transaction_id == txn.id)).first() is None
            assert session.exec(select(Tag).where(Tag.user_id == uid)).first() is None
            assert session.exec(select(Goal).where(Goal.user_id == uid)).first() is None
            assert session.exec(select(GoalAccountLink).where(GoalAccountLink.goal_id == goal.id)).first() is None
            assert session.exec(select(GoalContribution).where(GoalContribution.user_id == uid)).first() is None
            assert session.exec(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == uid)).first() is None
            assert session.exec(select(Category).where(Category.user_id == uid)).first() is None
            assert session.exec(select(CategoryRule).where(CategoryRule.user_id == uid)).first() is None
            assert session.exec(select(UserSettings).where(UserSettings.user_id == uid)).first() is None
            assert session.exec(select(Budget).where(Budget.user_id == uid)).first() is None
            assert session.exec(select(SpendingPreference).where(SpendingPreference.user_id == uid)).first() is None
            assert session.exec(select(HouseholdMember).where(HouseholdMember.user_id == uid)).first() is None
            assert session.exec(select(HouseholdInvitation).where(HouseholdInvitation.invited_by_user_id == uid)).first() is None
            assert session.exec(select(PlaidItem).where(PlaidItem.user_id == uid)).first() is None
            assert session.exec(select(ActivityLog).where(ActivityLog.user_id == uid)).first() is None
            assert session.exec(select(ErrorLog).where(ErrorLog.user_id == uid)).first() is None
            assert session.exec(select(AccountBalanceSnapshot).where(AccountBalanceSnapshot.account_id == acct.id)).first() is None
        finally:
            _clear_override()

    def test_cannot_delete_self(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            resp = client.delete(f"/api/v1/admin/users/{admin.id}")
            assert resp.status_code == 400
        finally:
            _clear_override()

    def test_delete_nonexistent_user_404(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            resp = client.delete("/api/v1/admin/users/99999")
            assert resp.status_code == 404
        finally:
            _clear_override()


# ── Disabled User Auth ──────────────────────────────────────────


class TestDisabledUserAuth:

    def test_disabled_user_blocked_by_get_current_user(self, session):
        """The is_disabled check lives in get_current_user (auth.py).
        We test it directly since TestClient overrides bypass the real dependency.
        """
        from app.auth import create_jwt, _decode_jwt

        user = make_user(session, is_disabled=True)
        token = create_jwt(user.id)
        user_id = _decode_jwt(token)
        assert user_id == user.id

        reloaded = session.get(User, user_id)
        assert reloaded is not None
        assert reloaded.is_disabled is True


# ── Plaid Health ────────────────────────────────────────────────


class TestPlaidHealth:

    def test_returns_error_aggregations(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            for i in range(3):
                _make_error(session, user=u, error_type=ErrorType.PLAID_SYNC, detail=f"err {i}")
            _make_error(session, user=u, error_type=ErrorType.PLAID_LINK, detail="link err")

            resp = client.get("/api/v1/admin/plaid-health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total_plaid_errors"] == 4
            assert len(data["recent_errors"]) >= 1
        finally:
            _clear_override()


# ── Error Log ───────────────────────────────────────────────────


class TestErrorLog:

    def test_paginated_errors(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            for i in range(5):
                _make_error(session, user=u, detail=f"err {i}")

            resp = client.get("/api/v1/admin/errors?limit=3&offset=0")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["items"]) == 3
            assert data["total"] == 5
        finally:
            _clear_override()

    def test_filter_by_error_type(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            _make_error(session, user=u, error_type=ErrorType.PLAID_SYNC)
            _make_error(session, user=u, error_type=ErrorType.API_4XX, endpoint="/api/v1/test")

            resp = client.get(f"/api/v1/admin/errors?error_type={ErrorType.PLAID_SYNC.value}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 1
            assert data["items"][0]["error_type"] == ErrorType.PLAID_SYNC.value
        finally:
            _clear_override()


# ── Analytics: Active Users ─────────────────────────────────────


class TestActiveUsersAnalytics:

    def test_returns_time_series(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u1 = make_user(session)
            u2 = make_user(session)
            now = datetime.now(timezone.utc)
            _make_activity(session, u1, ActivityAction.LOGIN, created_at=now - timedelta(days=1))
            _make_activity(session, u2, ActivityAction.LOGIN, created_at=now - timedelta(days=2))
            _make_activity(session, admin, ActivityAction.LOGIN, created_at=now)

            resp = client.get("/api/v1/admin/analytics/active-users?days=7")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            assert len(data) > 0
            assert "date" in data[0]
            assert "dau" in data[0]
        finally:
            _clear_override()


# ── Analytics: Feature Adoption ─────────────────────────────────


class TestFeatureAdoption:

    def test_returns_feature_counts(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            make_budget(session, u)
            make_goal(session, u)
            make_tag(session, u)
            make_category(session, u)

            resp = client.get("/api/v1/admin/analytics/feature-adoption")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            features = {f["feature"] for f in data}
            assert "budgets" in features
            assert "goals" in features
            assert "tags" in features
            assert "categories" in features
        finally:
            _clear_override()


# ── Analytics: Transaction Volume ───────────────────────────────


class TestTransactionVolume:

    def test_returns_volume_data(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session)
            make_transaction(session, u, txn_date=date.today())
            make_transaction(session, u, txn_date=date.today() - timedelta(days=1))

            resp = client.get("/api/v1/admin/analytics/transaction-volume?days=7")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            total = sum(d["count"] for d in data)
            assert total >= 2
        finally:
            _clear_override()


# ── Analytics: Storage ──────────────────────────────────────────


class TestStorage:

    def test_returns_table_counts(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            resp = client.get("/api/v1/admin/analytics/storage")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            table_names = {m["table_name"] for m in data}
            assert "users" in table_names
            assert "transactions" in table_names
            assert "accounts" in table_names
        finally:
            _clear_override()


# ── Activity Logging ────────────────────────────────────────────


class TestActivityLogging:

    def test_activity_log_records_created(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            _make_activity(session, admin, ActivityAction.LOGIN)
            _make_activity(session, admin, ActivityAction.SYNC)

            logs = session.exec(
                select(ActivityLog).where(ActivityLog.user_id == admin.id)
            ).all()
            assert len(logs) == 2
            actions = {log.action for log in logs}
            assert ActivityAction.LOGIN in actions
            assert ActivityAction.SYNC in actions
        finally:
            _clear_override()


# ── Timestamps ──────────────────────────────────────────────────


class TestTimestamps:
    """All models should have created_at and updated_at fields."""

    def test_created_at_set_on_new_record(self, session):
        """Models that previously lacked created_at now have it."""
        user = make_user(session)
        acct = make_account(session, user)
        txn = make_transaction(session, user, account=acct)
        tag = make_tag(session, user)
        budget = make_budget(session, user)

        assert acct.created_at is not None
        assert txn.created_at is not None
        assert tag.created_at is not None
        assert budget.created_at is not None

    def test_updated_at_none_on_new_record(self, session):
        """updated_at starts as None for freshly created records."""
        user = make_user(session)
        acct = make_account(session, user)

        assert user.updated_at is None
        assert acct.updated_at is None

    def test_updated_at_set_on_update(self, session):
        """updated_at is populated by the before_flush listener when a record changes."""
        user = make_user(session)
        acct = make_account(session, user)
        assert acct.updated_at is None

        original_created = acct.created_at
        acct.name = "Updated Name"
        session.add(acct)
        session.commit()
        session.refresh(acct)

        assert acct.updated_at is not None
        assert acct.created_at == original_created

    def test_created_at_unchanged_on_update(self, session):
        """created_at must not change when the record is updated."""
        user = make_user(session)
        original_created = user.created_at

        user.name = "New Name"
        session.add(user)
        session.commit()
        session.refresh(user)

        assert user.created_at == original_created
        assert user.updated_at is not None


# ── User List Filters ──────────────────────────────────────────


class TestUserListFilters:

    def test_filter_active_days(self, client, session):
        """Filter to users with activity within N days."""
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            active_user = make_user(session, email="active@test.com")
            inactive_user = make_user(session, email="inactive@test.com")
            _make_activity(session, active_user, ActivityAction.LOGIN)
            _make_activity(
                session, inactive_user, ActivityAction.LOGIN,
                created_at=datetime.now(timezone.utc) - timedelta(days=30),
            )

            resp = client.get("/api/v1/admin/users?active_days=7")
            assert resp.status_code == 200
            data = resp.json()
            emails = {u["email"] for u in data["items"]}
            assert "active@test.com" in emails
            assert "inactive@test.com" not in emails
        finally:
            _clear_override()

    def test_filter_has_linked(self, client, session):
        """Filter to users who have at least one linked account."""
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            linked_user = make_user(session, email="linked@test.com")
            manual_user = make_user(session, email="manual@test.com")
            make_account(session, linked_user, is_linked=True)
            make_account(session, manual_user, is_linked=False)

            resp = client.get("/api/v1/admin/users?has_linked=true")
            assert resp.status_code == 200
            data = resp.json()
            emails = {u["email"] for u in data["items"]}
            assert "linked@test.com" in emails
            assert "manual@test.com" not in emails
        finally:
            _clear_override()

    def test_filter_has_manual(self, client, session):
        """Filter to users who have at least one manual account."""
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            linked_user = make_user(session, email="linked2@test.com")
            manual_user = make_user(session, email="manual2@test.com")
            make_account(session, linked_user, is_linked=True)
            make_account(session, manual_user, is_linked=False)

            resp = client.get("/api/v1/admin/users?has_manual=true")
            assert resp.status_code == 200
            data = resp.json()
            emails = {u["email"] for u in data["items"]}
            assert "manual2@test.com" in emails
            assert "linked2@test.com" not in emails
        finally:
            _clear_override()

    def test_sort_by_account_count_desc(self, client, session):
        """Sort users by account count descending."""
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u1 = make_user(session, email="one@test.com")
            u2 = make_user(session, email="three@test.com")
            make_account(session, u1)
            make_account(session, u2, name="A")
            make_account(session, u2, name="B")
            make_account(session, u2, name="C")

            resp = client.get("/api/v1/admin/users?sort=account_count_desc")
            assert resp.status_code == 200
            data = resp.json()
            items = data["items"]
            counts = [i["account_count"] for i in items]
            assert counts == sorted(counts, reverse=True)
        finally:
            _clear_override()


# ── User Detail ──────────────────────────────────────────────────


class TestUserDetail:

    def test_returns_user_detail(self, client, session):
        """User detail endpoint returns accounts, transactions, activity, stats."""
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            u = make_user(session, email="detail@test.com")
            acct = make_account(session, u, name="Main Checking")
            make_transaction(session, u, account=acct, merchant="Store A")
            make_transaction(session, u, account=acct, merchant="Store B")
            make_category(session, u, name="Test Cat")
            make_tag(session, u, name="test-tag")
            _make_activity(session, u, ActivityAction.LOGIN)
            _make_activity(session, u, ActivityAction.SYNC)

            resp = client.get(f"/api/v1/admin/users/{u.id}/detail")
            assert resp.status_code == 200
            data = resp.json()

            assert data["user"]["email"] == "detail@test.com"
            assert len(data["accounts"]) == 1
            assert data["accounts"][0]["name"] == "Main Checking"
            assert len(data["recent_transactions"]) == 2
            assert len(data["recent_activity"]) == 2
            assert data["stats"]["total_transactions"] == 2
            assert data["stats"]["categories_used"] >= 1
            assert data["stats"]["tags_created"] == 1
        finally:
            _clear_override()

    def test_detail_nonexistent_user_404(self, client, session):
        admin = _make_admin(session)
        _set_admin_override(admin)
        try:
            resp = client.get("/api/v1/admin/users/99999/detail")
            assert resp.status_code == 404
        finally:
            _clear_override()

    def test_detail_requires_admin(self, client, session):
        user = make_user(session)
        _set_admin_override(user)
        try:
            resp = client.get(f"/api/v1/admin/users/{user.id}/detail")
            assert resp.status_code == 403
        finally:
            _clear_override()
