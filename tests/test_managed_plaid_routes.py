"""Tests for managed Plaid admin routes and plaid-mode routes."""

import os

from app.auth import get_current_user
from app.config import get_settings
from app.crypto import decrypt_token, encrypt_token
from app.main import app
from app.models import AppPlaidConfig, HouseholdPlaidConfig, Household, PlaidItem, PlaidMode
from sqlmodel import select
from tests.conftest import (
    add_household_member,
    make_household,
    make_plaid_config,
    make_user,
)


def _set_admin_email(email: str):
    """Set the ADMIN_EMAIL env var and clear the settings cache."""
    os.environ["ADMIN_EMAIL"] = email
    get_settings.cache_clear()


def _clear_admin_email():
    os.environ.pop("ADMIN_EMAIL", None)
    get_settings.cache_clear()


# ── GET /settings/plaid-mode ────────────────────────────────────


class TestGetPlaidMode:
    def test_returns_none_for_new_household(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] is None
        assert "managed_available" in data

    def test_returns_byok(self, auth_client, session):
        client, user = auth_client
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)
        session.commit()

        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] == PlaidMode.BYOK

    def test_returns_managed(self, auth_client, session):
        client, user = auth_client
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.MANAGED
        session.add(hh)
        session.commit()

        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] == PlaidMode.MANAGED

    def test_managed_available_when_app_config_enabled(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        from app.crypto import encrypt_token

        config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=True,
        )
        session.add(config)
        session.commit()

        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.json()["managed_available"] is True

    def test_managed_not_available_when_no_app_config(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.json()["managed_available"] is False

    def test_managed_not_available_when_disabled(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        from app.crypto import encrypt_token

        config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=False,
        )
        session.add(config)
        session.commit()

        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.json()["managed_available"] is False

    def test_no_household_returns_null(self, auth_client):
        client, _ = auth_client
        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] is None

    def test_has_linked_accounts_false_when_none(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.status_code == 200
        assert resp.json()["has_linked_accounts"] is False

    def test_has_linked_accounts_true_with_plaid_items(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        item = PlaidItem(
            user_id=user.id,
            encrypted_access_token=encrypt_token("access-token"),
            item_id="item-linked-test",
        )
        session.add(item)
        session.commit()

        resp = client.get("/api/v1/settings/plaid-mode")
        assert resp.status_code == 200
        assert resp.json()["has_linked_accounts"] is True


# ── PUT /settings/plaid-mode ────────────────────────────────────


class TestSetPlaidMode:
    def test_set_byok(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.BYOK})
        assert resp.status_code == 200
        assert resp.json()["mode"] == PlaidMode.BYOK

    def test_set_managed(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        from app.crypto import encrypt_token

        config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=True,
        )
        session.add(config)
        session.commit()

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.MANAGED})
        assert resp.status_code == 200
        assert resp.json()["mode"] == PlaidMode.MANAGED

    def test_switch_allowed_without_linked_accounts(self, auth_client, session):
        """Switching plaid_mode is allowed when no PlaidItems exist."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)

        app_config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=True,
        )
        session.add(app_config)
        session.commit()

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.MANAGED})
        assert resp.status_code == 200
        assert resp.json()["mode"] == PlaidMode.MANAGED

    def test_switch_blocked_with_linked_accounts(self, auth_client, session):
        """Cannot switch plaid_mode when PlaidItems exist for household members."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)

        app_config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=True,
        )
        session.add(app_config)

        item = PlaidItem(
            user_id=user.id,
            encrypted_access_token=encrypt_token("access-token"),
            item_id="item-block-switch",
        )
        session.add(item)
        session.commit()

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.MANAGED})
        assert resp.status_code == 409
        assert "unlink" in resp.json()["detail"].lower()

    def test_switch_clears_byok_config(self, auth_client, session):
        """Switching from BYOK to managed clears HouseholdPlaidConfig."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)
        make_plaid_config(session, hh)

        app_config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=True,
        )
        session.add(app_config)
        session.commit()

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.MANAGED})
        assert resp.status_code == 200

        session.expire_all()
        byok_config = session.exec(
            select(HouseholdPlaidConfig).where(
                HouseholdPlaidConfig.household_id == hh.id
            )
        ).first()
        assert byok_config is None

    def test_set_same_mode_is_noop(self, auth_client, session):
        """Setting the same mode that's already set succeeds without error."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)
        session.commit()

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.BYOK})
        assert resp.status_code == 200
        assert resp.json()["mode"] == PlaidMode.BYOK

    def test_invalid_mode_rejected(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": "invalid"})
        assert resp.status_code == 422

    def test_managed_rejected_when_not_available(self, auth_client, session):
        """Cannot choose managed when no app config exists or is disabled."""
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.MANAGED})
        assert resp.status_code == 400

    def test_no_household_returns_404(self, auth_client):
        client, _ = auth_client
        resp = client.put("/api/v1/settings/plaid-mode", json={"mode": PlaidMode.BYOK})
        assert resp.status_code == 404


# ── GET /settings/admin/plaid-config ────────────────────────────


class TestAdminGetPlaidConfig:
    def test_non_admin_forbidden(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("admin@test.com")
        try:
            resp = client.get("/api/v1/settings/admin/plaid-config")
            assert resp.status_code == 403
        finally:
            _clear_admin_email()

    def test_admin_no_config_returns_not_configured(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.get("/api/v1/settings/admin/plaid-config")
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is False
            assert data["enabled"] is False
        finally:
            _clear_admin_email()

    def test_admin_with_config(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            from app.crypto import encrypt_token

            config = AppPlaidConfig(
                encrypted_client_id=encrypt_token("admin_cid_1234"),
                encrypted_secret=encrypt_token("admin_sec_5678"),
                plaid_env="production",
                enabled=True,
            )
            session.add(config)
            session.commit()

            resp = client.get("/api/v1/settings/admin/plaid-config")
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is True
            assert data["enabled"] is True
            assert data["plaid_env"] == "production"
            assert data["client_id_last4"] == "1234"
            assert data["secret_last4"] == "5678"
        finally:
            _clear_admin_email()

    def test_admin_sees_managed_household_count(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            from app.crypto import encrypt_token

            config = AppPlaidConfig(
                encrypted_client_id=encrypt_token("cid"),
                encrypted_secret=encrypt_token("sec"),
                enabled=True,
            )
            session.add(config)

            hh = make_household(session, user)
            hh.plaid_mode = PlaidMode.MANAGED
            session.add(hh)

            other = make_user(session)
            hh2 = make_household(session, other)
            hh2.plaid_mode = PlaidMode.MANAGED
            session.add(hh2)

            session.commit()

            resp = client.get("/api/v1/settings/admin/plaid-config")
            data = resp.json()
            assert data["managed_household_count"] == 2
        finally:
            _clear_admin_email()


# ── PUT /settings/admin/plaid-config ────────────────────────────


class TestAdminUpdatePlaidConfig:
    def test_non_admin_forbidden(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("admin@test.com")
        try:
            resp = client.put("/api/v1/settings/admin/plaid-config", json={
                "client_id": "cid", "secret": "sec", "plaid_env": "sandbox", "enabled": True,
            })
            assert resp.status_code == 403
        finally:
            _clear_admin_email()

    def test_admin_creates_config(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.put("/api/v1/settings/admin/plaid-config", json={
                "client_id": "new_cid", "secret": "new_sec",
                "plaid_env": "production", "enabled": True,
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is True
            assert data["enabled"] is True
            assert data["plaid_env"] == "production"

            db_config = session.exec(select(AppPlaidConfig)).first()
            assert decrypt_token(db_config.encrypted_client_id) == "new_cid"
        finally:
            _clear_admin_email()

    def test_admin_updates_existing(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            from app.crypto import encrypt_token

            config = AppPlaidConfig(
                encrypted_client_id=encrypt_token("old_cid"),
                encrypted_secret=encrypt_token("old_sec"),
                enabled=False,
            )
            session.add(config)
            session.commit()

            resp = client.put("/api/v1/settings/admin/plaid-config", json={
                "client_id": "updated_cid", "secret": "updated_sec",
                "plaid_env": "sandbox", "enabled": True,
            })
            assert resp.status_code == 200
            assert resp.json()["enabled"] is True

            session.refresh(config)
            assert decrypt_token(config.encrypted_client_id) == "updated_cid"
        finally:
            _clear_admin_email()


# ── DELETE /settings/admin/plaid-config ─────────────────────────


class TestAdminDeletePlaidConfig:
    def test_non_admin_forbidden(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("admin@test.com")
        try:
            resp = client.delete("/api/v1/settings/admin/plaid-config")
            assert resp.status_code == 403
        finally:
            _clear_admin_email()

    def test_admin_deletes_config(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            from app.crypto import encrypt_token

            config = AppPlaidConfig(
                encrypted_client_id=encrypt_token("cid"),
                encrypted_secret=encrypt_token("sec"),
                enabled=True,
            )
            session.add(config)
            session.commit()

            resp = client.delete("/api/v1/settings/admin/plaid-config")
            assert resp.status_code == 204

            assert session.exec(select(AppPlaidConfig)).first() is None
        finally:
            _clear_admin_email()

    def test_delete_no_config_returns_404(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.delete("/api/v1/settings/admin/plaid-config")
            assert resp.status_code == 404
        finally:
            _clear_admin_email()


# ── GET /auth/me (is_admin field) ───────────────────────────────


class TestAuthMeIsAdmin:
    def test_is_admin_true(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.get("/api/v1/auth/me")
            assert resp.status_code == 200
            assert resp.json()["is_admin"] is True
        finally:
            _clear_admin_email()

    def test_is_admin_false(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("other@test.com")
        try:
            resp = client.get("/api/v1/auth/me")
            assert resp.status_code == 200
            assert resp.json()["is_admin"] is False
        finally:
            _clear_admin_email()

    def test_is_admin_false_when_not_set(self, auth_client, session):
        client, user = auth_client
        _clear_admin_email()
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 200
        assert resp.json()["is_admin"] is False
