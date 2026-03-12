"""Plaid API client setup."""

import plaid
from plaid.api import plaid_api

from app.config import get_settings


def get_plaid_client() -> plaid_api.PlaidApi:
    settings = get_settings()
    env_map = {
        "sandbox": plaid.Environment.Sandbox,
        "development": plaid.Environment.Development,
        "production": plaid.Environment.Production,
    }
    configuration = plaid.Configuration(
        host=env_map.get(settings.plaid_env, plaid.Environment.Sandbox),
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    api_client = plaid.ApiClient(configuration)
    # Avoid indefinite network hangs on upstream requests.
    api_client.rest_client.pool_manager.connection_pool_kw["timeout"] = 60
    return plaid_api.PlaidApi(api_client)
