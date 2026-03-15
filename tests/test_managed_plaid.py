"""Tests for managed Plaid integration: PlaidMode enum, AppPlaidConfig model,
Household.plaid_mode field, and plaid client resolution (managed vs BYOK)."""

from unittest.mock import patch, MagicMock

from sqlmodel import select

from app.crypto import encrypt_token, decrypt_token
from app.models import (
    AppPlaidConfig,
    Household,
    HouseholdPlaidConfig,
    PlaidMode,
)
from tests.conftest import (
    add_household_member,
    make_household,
    make_plaid_config,
    make_user,
)


# ── PlaidMode enum ──────────────────────────────────────────────


class TestPlaidModeEnum:
    def test_managed_value(self):
        assert PlaidMode.MANAGED == "managed"

    def test_byok_value(self):
        assert PlaidMode.BYOK == "byok"

    def test_is_string_enum(self):
        assert isinstance(PlaidMode.MANAGED, str)
        assert isinstance(PlaidMode.BYOK, str)


# ── AppPlaidConfig model ────────────────────────────────────────


class TestAppPlaidConfigModel:
    def test_create_app_plaid_config(self, session):
        config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("app_client_id"),
            encrypted_secret=encrypt_token("app_secret"),
            plaid_env="sandbox",
            enabled=True,
        )
        session.add(config)
        session.commit()
        session.refresh(config)

        assert config.id is not None
        assert decrypt_token(config.encrypted_client_id) == "app_client_id"
        assert decrypt_token(config.encrypted_secret) == "app_secret"
        assert config.plaid_env == "sandbox"
        assert config.enabled is True

    def test_default_enabled_is_false(self, session):
        config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
        )
        session.add(config)
        session.commit()
        session.refresh(config)

        assert config.enabled is False

    def test_default_plaid_env_is_sandbox(self, session):
        config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
        )
        session.add(config)
        session.commit()
        session.refresh(config)

        assert config.plaid_env == "sandbox"


# ── Household.plaid_mode field ──────────────────────────────────


class TestHouseholdPlaidMode:
    def test_default_plaid_mode_is_none(self, session):
        user = make_user(session)
        hh = make_household(session, user)
        loaded = session.get(Household, hh.id)
        assert loaded.plaid_mode is None

    def test_set_plaid_mode_managed(self, session):
        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.MANAGED
        session.add(hh)
        session.commit()
        session.refresh(hh)
        assert hh.plaid_mode == PlaidMode.MANAGED

    def test_set_plaid_mode_byok(self, session):
        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)
        session.commit()
        session.refresh(hh)
        assert hh.plaid_mode == PlaidMode.BYOK


# ── Plaid client resolution ────────────────────────────────────


class TestPlaidClientResolution:
    """Test that get_household_plaid_client resolves managed vs BYOK correctly."""

    def test_byok_uses_household_config(self, session):
        """BYOK mode should use the household's own Plaid credentials."""
        from app.plaid_client import get_household_plaid_client

        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)
        session.commit()

        make_plaid_config(session, hh, client_id="byok_cid", secret="byok_sec")

        with patch("app.plaid_client.get_plaid_client") as mock_get:
            mock_get.return_value = MagicMock()
            get_household_plaid_client(session, user)
            mock_get.assert_called_once_with(
                client_id="byok_cid", secret="byok_sec", env="sandbox"
            )

    def test_managed_uses_app_config(self, session):
        """Managed mode should use the app-level Plaid credentials."""
        from app.plaid_client import get_household_plaid_client

        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.MANAGED
        session.add(hh)
        session.commit()

        app_config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("app_cid"),
            encrypted_secret=encrypt_token("app_sec"),
            plaid_env="production",
            enabled=True,
        )
        session.add(app_config)
        session.commit()

        with patch("app.plaid_client.get_plaid_client") as mock_get:
            mock_get.return_value = MagicMock()
            get_household_plaid_client(session, user)
            mock_get.assert_called_once_with(
                client_id="app_cid", secret="app_sec", env="production"
            )

    def test_managed_raises_when_disabled(self, session):
        """Managed mode should fail when app config is disabled."""
        from app.plaid_client import get_household_plaid_client
        from fastapi import HTTPException
        import pytest

        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.MANAGED
        session.add(hh)
        session.commit()

        app_config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("cid"),
            encrypted_secret=encrypt_token("sec"),
            enabled=False,
        )
        session.add(app_config)
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            get_household_plaid_client(session, user)
        assert exc_info.value.status_code == 400
        assert "not available" in exc_info.value.detail.lower()

    def test_managed_raises_when_no_app_config(self, session):
        """Managed mode should fail when no AppPlaidConfig exists."""
        from app.plaid_client import get_household_plaid_client
        from fastapi import HTTPException
        import pytest

        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.MANAGED
        session.add(hh)
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            get_household_plaid_client(session, user)
        assert exc_info.value.status_code == 400

    def test_none_mode_raises(self, session):
        """When plaid_mode is None (not yet chosen), raise an error."""
        from app.plaid_client import get_household_plaid_client
        from fastapi import HTTPException
        import pytest

        user = make_user(session)
        hh = make_household(session, user)
        assert hh.plaid_mode is None

        with pytest.raises(HTTPException) as exc_info:
            get_household_plaid_client(session, user)
        assert exc_info.value.status_code == 400

    def test_for_user_id_managed(self, session):
        """get_household_plaid_client_for_user_id also supports managed mode."""
        from app.plaid_client import get_household_plaid_client_for_user_id

        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.MANAGED
        session.add(hh)
        session.commit()

        app_config = AppPlaidConfig(
            encrypted_client_id=encrypt_token("app_cid_2"),
            encrypted_secret=encrypt_token("app_sec_2"),
            plaid_env="sandbox",
            enabled=True,
        )
        session.add(app_config)
        session.commit()

        with patch("app.plaid_client.get_plaid_client") as mock_get:
            mock_get.return_value = MagicMock()
            get_household_plaid_client_for_user_id(session, user.id)
            mock_get.assert_called_once_with(
                client_id="app_cid_2", secret="app_sec_2", env="sandbox"
            )

    def test_for_user_id_byok(self, session):
        """get_household_plaid_client_for_user_id works with BYOK mode."""
        from app.plaid_client import get_household_plaid_client_for_user_id

        user = make_user(session)
        hh = make_household(session, user)
        hh.plaid_mode = PlaidMode.BYOK
        session.add(hh)
        session.commit()

        make_plaid_config(session, hh, client_id="byok_uid_cid", secret="byok_uid_sec")

        with patch("app.plaid_client.get_plaid_client") as mock_get:
            mock_get.return_value = MagicMock()
            get_household_plaid_client_for_user_id(session, user.id)
            mock_get.assert_called_once_with(
                client_id="byok_uid_cid", secret="byok_uid_sec", env="sandbox"
            )
