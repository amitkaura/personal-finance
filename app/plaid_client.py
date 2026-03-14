"""Plaid API client setup."""

import plaid
from plaid.api import plaid_api

from fastapi import HTTPException
from sqlmodel import Session, select

from app.crypto import decrypt_token
from app.models import HouseholdMember, HouseholdPlaidConfig, User


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


def get_household_plaid_client(session: Session, user: User) -> plaid_api.PlaidApi:
    """Build a Plaid client using the user's household-level credentials."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="Plaid not configured")

    config = session.exec(
        select(HouseholdPlaidConfig).where(
            HouseholdPlaidConfig.household_id == member.household_id
        )
    ).first()
    if not config:
        raise HTTPException(status_code=400, detail="Plaid not configured")

    return get_plaid_client(
        client_id=decrypt_token(config.encrypted_client_id),
        secret=decrypt_token(config.encrypted_secret),
        env=config.plaid_env,
    )


def get_household_plaid_client_for_user_id(session: Session, user_id: int) -> plaid_api.PlaidApi:
    """Build a Plaid client given a user_id (for background tasks without a User object)."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user_id)
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail="Plaid not configured")

    config = session.exec(
        select(HouseholdPlaidConfig).where(
            HouseholdPlaidConfig.household_id == member.household_id
        )
    ).first()
    if not config:
        raise HTTPException(status_code=400, detail="Plaid not configured")

    return get_plaid_client(
        client_id=decrypt_token(config.encrypted_client_id),
        secret=decrypt_token(config.encrypted_secret),
        env=config.plaid_env,
    )
