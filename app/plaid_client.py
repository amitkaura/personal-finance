"""Plaid API client setup."""

import plaid
from plaid.api import plaid_api

from fastapi import HTTPException
from sqlmodel import Session, select

from app.crypto import decrypt_token
from app.models import AppPlaidConfig, Household, HouseholdMember, HouseholdPlaidConfig, PlaidMode, User


_ENV_MAP = {
    "sandbox": plaid.Environment.Sandbox,
    "development": plaid.Environment.Production,
    "production": plaid.Environment.Production,
}


def get_plaid_client(client_id: str, secret: str, env: str = "sandbox") -> plaid_api.PlaidApi:
    configuration = plaid.Configuration(
        host=_ENV_MAP.get(env, plaid.Environment.Sandbox),
        api_key={
            "clientId": client_id,
            "secret": secret,
        },
    )
    api_client = plaid.ApiClient(configuration)
    api_client.rest_client.pool_manager.connection_pool_kw["timeout"] = 60
    return plaid_api.PlaidApi(api_client)


def _resolve_plaid_credentials(session: Session, member: HouseholdMember):
    """Return (client_id, secret, env) based on the household's plaid_mode."""
    household = session.get(Household, member.household_id)

    if household and household.plaid_mode == PlaidMode.MANAGED:
        app_config = session.exec(select(AppPlaidConfig)).first()
        if not app_config or not app_config.enabled:
            raise HTTPException(status_code=400, detail="Managed Plaid is not available")
        return (
            decrypt_token(app_config.encrypted_client_id),
            decrypt_token(app_config.encrypted_secret),
            app_config.plaid_env,
        )

    if household and household.plaid_mode == PlaidMode.BYOK:
        config = session.exec(
            select(HouseholdPlaidConfig).where(
                HouseholdPlaidConfig.household_id == member.household_id
            )
        ).first()
        if not config:
            raise HTTPException(status_code=400, detail="Plaid not configured")
        return (
            decrypt_token(config.encrypted_client_id),
            decrypt_token(config.encrypted_secret),
            config.plaid_env,
        )

    raise HTTPException(status_code=400, detail="Plaid not configured")


def get_household_plaid_client(session: Session, user: User) -> plaid_api.PlaidApi:
    """Build a Plaid client using the user's household-level credentials."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="Plaid not configured")

    client_id, secret, env = _resolve_plaid_credentials(session, member)
    return get_plaid_client(client_id=client_id, secret=secret, env=env)


def get_app_plaid_client(session: Session) -> plaid_api.PlaidApi:
    """Build a Plaid client using the app-level managed config (no user context)."""
    app_config = session.exec(select(AppPlaidConfig)).first()
    if not app_config or not app_config.enabled:
        raise HTTPException(status_code=400, detail="Managed Plaid is not available")
    return get_plaid_client(
        client_id=decrypt_token(app_config.encrypted_client_id),
        secret=decrypt_token(app_config.encrypted_secret),
        env=app_config.plaid_env,
    )


def get_household_plaid_client_for_user_id(session: Session, user_id: int) -> plaid_api.PlaidApi:
    """Build a Plaid client given a user_id (for background tasks without a User object)."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user_id)
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="Plaid not configured")

    client_id, secret, env = _resolve_plaid_credentials(session, member)
    return get_plaid_client(client_id=client_id, secret=secret, env=env)
