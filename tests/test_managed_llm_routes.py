"""Tests for managed LLM admin routes and llm-mode routes."""

import os

from app.auth import get_current_user
from app.config import get_settings
from app.crypto import decrypt_token
from app.main import app
from app.models import AppLLMConfig, Household, LLMMode
from sqlmodel import select
from tests.conftest import (
    add_household_member,
    make_app_llm_config,
    make_household,
    make_llm_config,
    make_user,
)


def _set_admin_email(email: str):
    os.environ["ADMIN_EMAIL"] = email
    get_settings.cache_clear()


def _clear_admin_email():
    os.environ.pop("ADMIN_EMAIL", None)
    get_settings.cache_clear()


# ── GET /settings/llm-mode ─────────────────────────────────────


class TestGetLLMMode:
    def test_returns_none_for_new_household(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] is None
        assert "managed_available" in data

    def test_returns_byok(self, auth_client, session):
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.BYOK
        session.add(hh)
        session.commit()

        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.BYOK

    def test_returns_managed(self, auth_client, session):
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.MANAGED
        session.add(hh)
        session.commit()

        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.MANAGED

    def test_returns_none_mode(self, auth_client, session):
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.NONE
        session.add(hh)
        session.commit()

        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.NONE

    def test_managed_available_when_app_config_enabled(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        make_app_llm_config(session, enabled=True)

        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.json()["managed_available"] is True

    def test_managed_not_available_when_no_config(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.json()["managed_available"] is False

    def test_managed_not_available_when_disabled(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        make_app_llm_config(session, enabled=False)

        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.json()["managed_available"] is False

    def test_no_household_returns_null(self, auth_client):
        client, _ = auth_client
        resp = client.get("/api/v1/settings/llm-mode")
        assert resp.status_code == 200
        assert resp.json()["mode"] is None


# ── PUT /settings/llm-mode ─────────────────────────────────────


class TestSetLLMMode:
    def test_set_byok(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/llm-mode", json={"mode": LLMMode.BYOK})
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.BYOK

    def test_set_managed(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)
        make_app_llm_config(session, enabled=True)

        resp = client.put("/api/v1/settings/llm-mode", json={"mode": LLMMode.MANAGED})
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.MANAGED

    def test_set_none(self, auth_client, session):
        """User can explicitly skip/opt out."""
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/llm-mode", json={"mode": LLMMode.NONE})
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.NONE

    def test_can_switch_modes(self, auth_client, session):
        """Unlike Plaid, LLM mode can be switched."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.BYOK
        session.add(hh)
        session.commit()

        make_app_llm_config(session, enabled=True)

        resp = client.put("/api/v1/settings/llm-mode", json={"mode": LLMMode.MANAGED})
        assert resp.status_code == 200
        assert resp.json()["mode"] == LLMMode.MANAGED

    def test_managed_rejected_when_not_available(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/llm-mode", json={"mode": LLMMode.MANAGED})
        assert resp.status_code == 400

    def test_invalid_mode_rejected(self, auth_client, session):
        client, user = auth_client
        make_household(session, user)

        resp = client.put("/api/v1/settings/llm-mode", json={"mode": "invalid"})
        assert resp.status_code == 422

    def test_no_household_returns_404(self, auth_client):
        client, _ = auth_client
        resp = client.put("/api/v1/settings/llm-mode", json={"mode": LLMMode.BYOK})
        assert resp.status_code == 404


# ── GET /settings/admin/llm-config ─────────────────────────────


class TestAdminGetLLMConfig:
    def test_non_admin_forbidden(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("admin@test.com")
        try:
            resp = client.get("/api/v1/settings/admin/llm-config")
            assert resp.status_code == 403
        finally:
            _clear_admin_email()

    def test_admin_no_config_returns_not_configured(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.get("/api/v1/settings/admin/llm-config")
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is False
            assert data["enabled"] is False
            assert data["llm_base_url"] is None
            assert data["llm_model"] is None
            assert data["api_key_last4"] is None
        finally:
            _clear_admin_email()

    def test_admin_with_config(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            make_app_llm_config(
                session,
                base_url="https://api.openai.com/v1",
                api_key="sk-admin-key-5678",
                model="gpt-4o",
                enabled=True,
            )

            resp = client.get("/api/v1/settings/admin/llm-config")
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is True
            assert data["enabled"] is True
            assert data["llm_base_url"] == "https://api.openai.com/v1"
            assert data["llm_model"] == "gpt-4o"
            assert data["api_key_last4"] == "5678"
            assert data["batch_size"] == 10  # default
        finally:
            _clear_admin_email()

    def test_admin_sees_managed_household_count(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            make_app_llm_config(session, enabled=True)

            hh = make_household(session, user)
            hh.llm_mode = LLMMode.MANAGED
            session.add(hh)

            other = make_user(session)
            hh2 = make_household(session, other)
            hh2.llm_mode = LLMMode.MANAGED
            session.add(hh2)

            session.commit()

            resp = client.get("/api/v1/settings/admin/llm-config")
            data = resp.json()
            assert data["managed_household_count"] == 2
        finally:
            _clear_admin_email()


# ── PUT /settings/admin/llm-config ─────────────────────────────


class TestAdminUpdateLLMConfig:
    def test_non_admin_forbidden(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("admin@test.com")
        try:
            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "key",
                "llm_model": "gpt-4o-mini",
                "enabled": True,
            })
            assert resp.status_code == 403
        finally:
            _clear_admin_email()

    def test_admin_creates_config(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "sk-new-key-1234",
                "llm_model": "gpt-4o",
                "enabled": True,
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["configured"] is True
            assert data["enabled"] is True
            assert data["llm_base_url"] == "https://api.openai.com/v1"
            assert data["llm_model"] == "gpt-4o"
            assert data["api_key_last4"] == "1234"

            db_config = session.exec(select(AppLLMConfig)).first()
            assert decrypt_token(db_config.encrypted_api_key) == "sk-new-key-1234"
        finally:
            _clear_admin_email()

    def test_admin_updates_existing(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            make_app_llm_config(session, api_key="old_key", enabled=False)

            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "updated_key_9999",
                "llm_model": "gpt-4o-mini",
                "enabled": True,
            })
            assert resp.status_code == 200
            assert resp.json()["enabled"] is True

            session.expire_all()
            config = session.exec(select(AppLLMConfig)).first()
            assert decrypt_token(config.encrypted_api_key) == "updated_key_9999"
        finally:
            _clear_admin_email()

    def test_unchanged_sentinel_preserves_key(self, auth_client, session):
        """Sending 'unchanged' as api_key should preserve existing key."""
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            make_app_llm_config(session, api_key="original_key")

            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "unchanged",
                "llm_model": "gpt-4o",
                "enabled": True,
            })
            assert resp.status_code == 200

            session.expire_all()
            config = session.exec(select(AppLLMConfig)).first()
            assert decrypt_token(config.encrypted_api_key) == "original_key"
        finally:
            _clear_admin_email()

    def test_admin_creates_config_with_batch_size(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "sk-batch-key-1234",
                "llm_model": "gpt-4o",
                "enabled": True,
                "batch_size": 25,
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["batch_size"] == 25

            db_config = session.exec(select(AppLLMConfig)).first()
            assert db_config.batch_size == 25
        finally:
            _clear_admin_email()

    def test_batch_size_validation(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "key",
                "llm_model": "gpt-4o",
                "enabled": True,
                "batch_size": 0,
            })
            assert resp.status_code == 422

            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://api.openai.com/v1",
                "llm_api_key": "key",
                "llm_model": "gpt-4o",
                "enabled": True,
                "batch_size": 51,
            })
            assert resp.status_code == 422
        finally:
            _clear_admin_email()

    def test_ssrf_base_url_rejected(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.put("/api/v1/settings/admin/llm-config", json={
                "llm_base_url": "https://evil.example.com/v1",
                "llm_api_key": "key",
                "llm_model": "gpt-4o-mini",
                "enabled": True,
            })
            assert resp.status_code == 400
        finally:
            _clear_admin_email()


# ── DELETE /settings/admin/llm-config ──────────────────────────


class TestAdminDeleteLLMConfig:
    def test_non_admin_forbidden(self, auth_client, session):
        client, user = auth_client
        _set_admin_email("admin@test.com")
        try:
            resp = client.delete("/api/v1/settings/admin/llm-config")
            assert resp.status_code == 403
        finally:
            _clear_admin_email()

    def test_admin_deletes_config(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            make_app_llm_config(session)

            resp = client.delete("/api/v1/settings/admin/llm-config")
            assert resp.status_code == 204

            assert session.exec(select(AppLLMConfig)).first() is None
        finally:
            _clear_admin_email()

    def test_delete_no_config_returns_404(self, auth_client, session):
        client, user = auth_client
        _set_admin_email(user.email)
        try:
            resp = client.delete("/api/v1/settings/admin/llm-config")
            assert resp.status_code == 404
        finally:
            _clear_admin_email()


# ── Categorizer resolution ─────────────────────────────────────


class TestCategorizerLLMResolution:
    """Test _get_llm_config resolution logic by patching the categorizer's engine
    to use the test engine (in-memory SQLite is per-connection, so categorizer's
    own Session(engine) can't see test data without this patch)."""

    def test_managed_mode_uses_app_config(self, auth_client, session, monkeypatch):
        """When llm_mode is managed, categorizer should use AppLLMConfig."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.MANAGED
        session.add(hh)
        session.commit()

        make_app_llm_config(
            session,
            base_url="https://api.openai.com/v1",
            api_key="app_managed_key",
            model="gpt-4o",
            enabled=True,
        )

        import app.categorizer as cat_module
        from tests.conftest import _test_engine
        monkeypatch.setattr(cat_module, "engine", _test_engine)

        base_url, api_key, model, batch_size = cat_module._get_llm_config(user.id)
        assert base_url == "https://api.openai.com/v1"
        assert api_key == "app_managed_key"
        assert model == "gpt-4o"
        assert batch_size == 10  # default

    def test_managed_mode_returns_custom_batch_size(self, auth_client, session, monkeypatch):
        """Managed config with custom batch_size propagates to _get_llm_config."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.MANAGED
        session.add(hh)
        session.commit()

        cfg = make_app_llm_config(
            session,
            base_url="https://api.openai.com/v1",
            api_key="managed_key",
            model="gpt-4o",
            enabled=True,
        )
        cfg.batch_size = 25
        session.add(cfg)
        session.commit()

        import app.categorizer as cat_module
        from tests.conftest import _test_engine
        monkeypatch.setattr(cat_module, "engine", _test_engine)

        _, _, _, batch_size = cat_module._get_llm_config(user.id)
        assert batch_size == 25

    def test_byok_mode_uses_household_config(self, auth_client, session, monkeypatch):
        """When llm_mode is byok, categorizer should use HouseholdLLMConfig."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.BYOK
        session.add(hh)
        session.commit()

        make_llm_config(
            session, hh,
            base_url="http://localhost:11434/v1",
            api_key="byok_key_here",
            model="llama3",
        )

        import app.categorizer as cat_module
        from tests.conftest import _test_engine
        monkeypatch.setattr(cat_module, "engine", _test_engine)

        base_url, api_key, model, batch_size = cat_module._get_llm_config(user.id)
        assert base_url == "http://localhost:11434/v1"
        assert api_key == "byok_key_here"
        assert model == "llama3"
        assert batch_size == 10  # default

    def test_none_mode_returns_empty(self, auth_client, session, monkeypatch):
        """When llm_mode is none, categorizer should skip LLM."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.NONE
        session.add(hh)
        session.commit()

        import app.categorizer as cat_module
        from tests.conftest import _test_engine
        monkeypatch.setattr(cat_module, "engine", _test_engine)

        base_url, api_key, model, batch_size = cat_module._get_llm_config(user.id)
        assert api_key == ""

    def test_null_mode_returns_empty(self, auth_client, session, monkeypatch):
        """When llm_mode is null (not yet set), categorizer should skip LLM."""
        client, user = auth_client
        make_household(session, user)

        import app.categorizer as cat_module
        from tests.conftest import _test_engine
        monkeypatch.setattr(cat_module, "engine", _test_engine)

        base_url, api_key, model, batch_size = cat_module._get_llm_config(user.id)
        assert api_key == ""

    def test_managed_mode_disabled_returns_empty(self, auth_client, session, monkeypatch):
        """Managed mode with disabled app config should skip LLM."""
        client, user = auth_client
        hh = make_household(session, user)
        hh.llm_mode = LLMMode.MANAGED
        session.add(hh)
        session.commit()

        make_app_llm_config(session, enabled=False)

        import app.categorizer as cat_module
        from tests.conftest import _test_engine
        monkeypatch.setattr(cat_module, "engine", _test_engine)

        base_url, api_key, model, batch_size = cat_module._get_llm_config(user.id)
        assert api_key == ""
