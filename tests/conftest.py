"""Shared fixtures and factories for the regression test suite."""

import os

os.environ.update({
    "DATABASE_URL": "sqlite://",
    "JWT_SECRET": "test-jwt-secret-for-testing-only",
    "GOOGLE_CLIENT_ID": "test-google-client-id",
    "ENCRYPTION_KEY": "AQpJnV4yTsaglW5yldixIzHQ3AOaztuAwbjN_4l0Dgw=",
    "DEBUG": "true",
    "RATE_LIMIT_ENABLED": "false",
    "RUN_SCHEDULER": "false",
    "RATE_LIMIT_BACKEND": "memory",
    "SECURE_COOKIES": "false",
})

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import uuid4

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from fastapi.testclient import TestClient

from app.config import get_settings

get_settings.cache_clear()

from app.main import app
from app.database import get_session
from app.auth import get_current_user
from app.models import (
    Account,
    AccountBalanceSnapshot,
    AccountType,
    ActivityLog,
    AppLLMConfig,
    AppPlaidConfig,
    Budget,
    Category,
    CategoryRule,
    Goal,
    GoalAccountLink,
    GoalContribution,
    Household,
    HouseholdInvitation,
    HouseholdMember,
    HouseholdLLMConfig,
    HouseholdPlaidConfig,
    HouseholdSyncConfig,
    LLMMode,
    NetWorthSnapshot,
    PlaidItem,
    PlaidMode,
    SpendingPreference,
    Tag,
    Transaction,
    TransactionTag,
    User,
    UserSettings,
)

_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@pytest.fixture()
def session():
    SQLModel.metadata.create_all(_test_engine)
    with Session(_test_engine) as sess:
        yield sess
    SQLModel.metadata.drop_all(_test_engine)


@pytest.fixture()
def client(session: Session):
    def _override_session():
        yield session

    app.dependency_overrides[get_session] = _override_session
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_client(client: TestClient, session: Session):
    """Authenticated client with a default test user."""
    user = make_user(session)

    app.dependency_overrides[get_current_user] = lambda: user
    yield client, user


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------

_user_counter = 0


def make_user(session: Session, **overrides) -> User:
    global _user_counter
    _user_counter += 1
    defaults = {
        "google_id": f"google-{_user_counter}-{uuid4().hex[:8]}",
        "email": f"user{_user_counter}@test.com",
        "name": f"Test User {_user_counter}",
    }
    defaults.update(overrides)
    user = User(**defaults)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def make_account(
    session: Session,
    user: User,
    *,
    name: str = "Checking",
    type: AccountType = AccountType.DEPOSITORY,
    balance: Decimal = Decimal("1000.00"),
    **overrides,
) -> Account:
    defaults = {
        "user_id": user.id,
        "name": name,
        "type": type,
        "current_balance": balance,
        "plaid_account_id": f"plaid-acct-{uuid4().hex[:12]}",
    }
    defaults.update(overrides)
    account = Account(**defaults)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


def make_transaction(
    session: Session,
    user: User,
    *,
    amount: Decimal = Decimal("42.50"),
    merchant: str = "Test Merchant",
    category: Optional[str] = "Food & Dining",
    txn_date: Optional[date] = None,
    account: Optional[Account] = None,
    is_manual: bool = True,
    **overrides,
) -> Transaction:
    defaults = {
        "plaid_transaction_id": f"manual-{uuid4().hex}",
        "date": txn_date or date.today(),
        "amount": amount,
        "merchant_name": merchant,
        "category": category,
        "account_id": account.id if account else None,
        "is_manual": is_manual,
        "user_id": user.id,
    }
    defaults.update(overrides)
    txn = Transaction(**defaults)
    session.add(txn)
    session.commit()
    session.refresh(txn)
    return txn


def make_household(session: Session, owner: User, name: str = "Our Household") -> Household:
    household = Household(name=name)
    session.add(household)
    session.commit()
    session.refresh(household)
    member = HouseholdMember(household_id=household.id, user_id=owner.id, role="owner")
    session.add(member)
    session.commit()
    return household


def make_invitation(
    session: Session,
    household: Household,
    inviter: User,
    email: str,
) -> HouseholdInvitation:
    inv = HouseholdInvitation(
        household_id=household.id,
        invited_by_user_id=inviter.id,
        invited_email=email.lower(),
    )
    session.add(inv)
    session.commit()
    session.refresh(inv)
    return inv


def make_budget(
    session: Session,
    user: User,
    category: str = "Food & Dining",
    amount: Decimal = Decimal("500.00"),
    month: Optional[str] = None,
    rollover: bool = False,
    household_id: Optional[int] = None,
) -> Budget:
    budget = Budget(
        user_id=user.id,
        category=category,
        amount=amount,
        month=month or date.today().strftime("%Y-%m"),
        rollover=rollover,
        household_id=household_id,
    )
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return budget


def make_goal(
    session: Session,
    user: User,
    name: str = "Emergency Fund",
    target: Decimal = Decimal("10000.00"),
    current: Decimal = Decimal("0"),
    household_id: Optional[int] = None,
) -> Goal:
    goal = Goal(
        user_id=user.id,
        name=name,
        target_amount=target,
        current_amount=current,
        household_id=household_id,
    )
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def link_goal_to_account(session: Session, goal: Goal, account: Account) -> GoalAccountLink:
    link = GoalAccountLink(goal_id=goal.id, account_id=account.id)
    session.add(link)
    session.commit()
    session.refresh(link)
    return link


def add_household_member(session: Session, household: Household, user: User, role: str = "member") -> HouseholdMember:
    member = HouseholdMember(household_id=household.id, user_id=user.id, role=role)
    session.add(member)
    session.commit()
    return member


def make_tag(session: Session, user: User, name: str = "important", color: str = "#ff0000") -> Tag:
    tag = Tag(user_id=user.id, name=name, color=color)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


def make_contribution(
    session: Session,
    goal: Goal,
    user: User,
    amount: Decimal = Decimal("100.00"),
    note: Optional[str] = None,
) -> GoalContribution:
    c = GoalContribution(goal_id=goal.id, user_id=user.id, amount=amount, note=note)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def make_spending_preference(
    session: Session,
    user: User,
    category: str = "Food & Dining",
    target: str = "personal",
) -> SpendingPreference:
    pref = SpendingPreference(user_id=user.id, category=category, target=target)
    session.add(pref)
    session.commit()
    session.refresh(pref)
    return pref


def make_category(session: Session, user: User, name: str = "Food & Dining") -> Category:
    cat = Category(user_id=user.id, name=name)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return cat


def make_net_worth_snapshot(
    session: Session,
    user: User,
    snapshot_date: Optional[date] = None,
    assets: Decimal = Decimal("10000.00"),
    liabilities: Decimal = Decimal("2000.00"),
) -> NetWorthSnapshot:
    snap = NetWorthSnapshot(
        user_id=user.id,
        date=snapshot_date or date.today(),
        assets=assets,
        liabilities=liabilities,
        net_worth=assets - liabilities,
    )
    session.add(snap)
    session.commit()
    session.refresh(snap)
    return snap


def make_settings(session: Session, user: User, **overrides) -> UserSettings:
    defaults = {"user_id": user.id}
    defaults.update(overrides)
    settings = UserSettings(**defaults)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings


def make_llm_config(
    session: Session,
    household: Household,
    base_url: str = "https://api.openai.com/v1",
    api_key: str = "test_api_key",
    model: str = "gpt-4o-mini",
) -> HouseholdLLMConfig:
    from app.crypto import encrypt_token

    config = HouseholdLLMConfig(
        household_id=household.id,
        llm_base_url=base_url,
        encrypted_api_key=encrypt_token(api_key),
        llm_model=model,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return config


def make_sync_config(
    session: Session,
    household: Household,
    sync_enabled: bool = True,
    sync_hour: int = 6,
    sync_minute: int = 30,
    sync_timezone: str = "America/Toronto",
) -> HouseholdSyncConfig:
    config = HouseholdSyncConfig(
        household_id=household.id,
        sync_enabled=sync_enabled,
        sync_hour=sync_hour,
        sync_minute=sync_minute,
        sync_timezone=sync_timezone,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return config


def make_plaid_config(
    session: Session,
    household: Household,
    client_id: str = "test_client_id",
    secret: str = "test_secret",
    plaid_env: str = "sandbox",
) -> HouseholdPlaidConfig:
    from app.crypto import encrypt_token

    config = HouseholdPlaidConfig(
        household_id=household.id,
        encrypted_client_id=encrypt_token(client_id),
        encrypted_secret=encrypt_token(secret),
        plaid_env=plaid_env,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return config


def make_app_llm_config(
    session: Session,
    base_url: str = "https://api.openai.com/v1",
    api_key: str = "app_llm_key_1234",
    model: str = "gpt-4o-mini",
    enabled: bool = True,
) -> AppLLMConfig:
    from app.crypto import encrypt_token

    config = AppLLMConfig(
        llm_base_url=base_url,
        encrypted_api_key=encrypt_token(api_key),
        llm_model=model,
        enabled=enabled,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return config
