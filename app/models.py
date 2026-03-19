"""
Database models for the personal finance system.
Uses SQLModel (SQLAlchemy + Pydantic) for schema definition.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    """Authenticated user via Google OAuth."""

    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    google_id: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    name: str = ""
    picture: Optional[str] = None

    # Provider-synced values (updated on every Google login)
    google_name: Optional[str] = None
    google_picture: Optional[str] = None

    # User-managed profile overrides (take precedence when set)
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None

    # Admin & status
    is_admin: bool = Field(default=False)
    is_disabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class PlaidMode(str, Enum):
    """Whether a household uses the app's managed Plaid or brings their own keys."""

    MANAGED = "managed"
    BYOK = "byok"


class LLMMode(str, Enum):
    """Whether a household uses managed AI categorization or brings their own LLM API key."""

    MANAGED = "managed"
    BYOK = "byok"
    NONE = "none"


class AccountType(str, Enum):
    """Account type as defined by Plaid."""

    DEPOSITORY = "depository"
    INVESTMENT = "investment"
    CREDIT = "credit"
    LOAN = "loan"
    REAL_ESTATE = "real_estate"


class PlaidItem(SQLModel, table=True):
    """Stores Plaid Link items (bank connections)."""

    __tablename__ = "plaid_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    encrypted_access_token: str = Field(index=True)
    item_id: str = Field(unique=True, index=True)
    institution_name: Optional[str] = None
    status: str = Field(default="healthy")
    plaid_error_code: Optional[str] = None
    plaid_error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    accounts: list["Account"] = Relationship(back_populates="plaid_item")


class Account(SQLModel, table=True):
    """Bank/brokerage accounts linked via Plaid."""

    __tablename__ = "accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    official_name: Optional[str] = None
    type: AccountType = Field(sa_type=sa.String(20))
    subtype: Optional[str] = None
    current_balance: Decimal = Field(default=Decimal("0"), max_digits=15, decimal_places=2)
    available_balance: Optional[Decimal] = Field(default=None, max_digits=15, decimal_places=2)
    credit_limit: Optional[Decimal] = Field(default=None, max_digits=15, decimal_places=2)
    currency_code: Optional[str] = Field(default="CAD")
    plaid_account_id: str = Field(unique=True, index=True)
    plaid_item_id: Optional[int] = Field(default=None, foreign_key="plaid_items.id")
    is_linked: bool = Field(default=True)
    statement_available_day: Optional[int] = Field(default=None, ge=1, le=31)
    last_statement_reminder_sent: Optional[date] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    plaid_item: Optional[PlaidItem] = Relationship(back_populates="accounts")
    transactions: list["Transaction"] = Relationship(back_populates="account")


class Transaction(SQLModel, table=True):
    """Financial transactions synced from Plaid or added manually."""

    __tablename__ = "transactions"
    __table_args__ = (
        sa.Index("ix_transactions_date", "date"),
        sa.Index("ix_transactions_account_date", "account_id", "date"),
        sa.Index("ix_transactions_user_date", "user_id", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    plaid_transaction_id: str = Field(unique=True, index=True)
    date: date
    amount: Decimal = Field(max_digits=15, decimal_places=2)
    merchant_name: Optional[str] = None
    plaid_category_code: Optional[str] = None
    category: Optional[str] = None
    pending_status: bool = False
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id", index=True)
    is_manual: bool = Field(default=False)
    notes: Optional[str] = None
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    account: Optional[Account] = Relationship(back_populates="transactions")
    tag_links: list["TransactionTag"] = Relationship(back_populates="transaction")


class Category(SQLModel, table=True):
    """User-specific category list (seeded with defaults, fully customizable)."""

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class CategoryRule(SQLModel, table=True):
    """User-defined keyword rules for transaction categorization."""

    __tablename__ = "category_rules"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    keyword: str = Field(index=True)
    category: str
    case_sensitive: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class UserSettings(SQLModel, table=True):
    """Per-user preferences."""

    __tablename__ = "user_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)

    # Display
    currency: str = "CAD"
    date_format: str = "YYYY-MM-DD"
    locale: str = "en-CA"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)



# ── Budgets ────────────────────────────────────────────────────


class Budget(SQLModel, table=True):
    """Monthly category budget with optional rollover."""

    __tablename__ = "budgets"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    category: str
    amount: Decimal = Field(max_digits=15, decimal_places=2)
    month: str = Field(index=True)  # "YYYY-MM"
    rollover: bool = Field(default=False)
    household_id: Optional[int] = Field(default=None, foreign_key="households.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class SpendingPreference(SQLModel, table=True):
    """Per-user preference for routing category spending to personal or shared budget."""

    __tablename__ = "spending_preferences"
    __table_args__ = (UniqueConstraint("user_id", "category"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    category: str
    target: str = Field(default="personal")  # "personal" | "shared"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


# ── Financial Goals ────────────────────────────────────────────


class Goal(SQLModel, table=True):
    """Savings or financial goal with target amount and date."""

    __tablename__ = "goals"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    target_amount: Decimal = Field(max_digits=15, decimal_places=2)
    current_amount: Decimal = Field(default=Decimal("0"), max_digits=15, decimal_places=2)
    target_date: Optional[date] = None
    icon: str = Field(default="target")
    color: str = Field(default="#6d28d9")
    is_completed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)
    household_id: Optional[int] = Field(default=None, foreign_key="households.id", index=True)


class GoalAccountLink(SQLModel, table=True):
    """Links a goal to one or more accounts for auto-tracking progress."""

    __tablename__ = "goal_account_links"
    __table_args__ = (UniqueConstraint("goal_id", "account_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    goal_id: int = Field(foreign_key="goals.id", index=True)
    account_id: int = Field(foreign_key="accounts.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class GoalContribution(SQLModel, table=True):
    """Tracks individual contributions to a goal with attribution."""

    __tablename__ = "goal_contributions"

    id: Optional[int] = Field(default=None, primary_key=True)
    goal_id: int = Field(foreign_key="goals.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    amount: Decimal = Field(max_digits=15, decimal_places=2)
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


# ── Net Worth History ──────────────────────────────────────────


class NetWorthSnapshot(SQLModel, table=True):
    """Point-in-time snapshot of net worth for historical tracking."""

    __tablename__ = "net_worth_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    date: date
    assets: Decimal = Field(max_digits=15, decimal_places=2)
    liabilities: Decimal = Field(max_digits=15, decimal_places=2)
    net_worth: Decimal = Field(max_digits=15, decimal_places=2)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


# ── Account Balance History ────────────────────────────────────


class AccountBalanceSnapshot(SQLModel, table=True):
    """Per-account per-date balance for historical tracking."""

    __tablename__ = "account_balance_snapshots"
    __table_args__ = (UniqueConstraint("account_id", "date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="accounts.id", index=True)
    date: date
    balance: Decimal = Field(max_digits=15, decimal_places=2)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


# ── Tags ───────────────────────────────────────────────────────


class Tag(SQLModel, table=True):
    """User-defined label for transactions."""

    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    color: str = Field(default="#6d28d9")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    transaction_links: list["TransactionTag"] = Relationship(back_populates="tag")


class TransactionTag(SQLModel, table=True):
    """Junction table linking transactions to tags."""

    __tablename__ = "transaction_tags"
    __table_args__ = (UniqueConstraint("transaction_id", "tag_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    transaction_id: int = Field(foreign_key="transactions.id", index=True)
    tag_id: int = Field(foreign_key="tags.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    transaction: Optional[Transaction] = Relationship(back_populates="tag_links")
    tag: Optional[Tag] = Relationship(back_populates="transaction_links")


class Household(SQLModel, table=True):
    """A household linking two partners for shared financial views."""

    __tablename__ = "households"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = "Our Household"
    plaid_mode: Optional[str] = Field(default=None)
    llm_mode: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    members: list["HouseholdMember"] = Relationship(back_populates="household")


class HouseholdMember(SQLModel, table=True):
    """Membership linking a user to a household."""

    __tablename__ = "household_members"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id", index=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    role: str = Field(default="member")
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

    household: Optional[Household] = Relationship(back_populates="members")


class HouseholdPlaidConfig(SQLModel, table=True):
    """Per-household Plaid API credentials (encrypted at rest)."""

    __tablename__ = "household_plaid_configs"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id", unique=True, index=True)
    encrypted_client_id: str
    encrypted_secret: str
    plaid_env: str = Field(default="sandbox")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class AppPlaidConfig(SQLModel, table=True):
    """App-level Plaid API credentials for the managed integration (singleton)."""

    __tablename__ = "app_plaid_config"

    id: Optional[int] = Field(default=None, primary_key=True)
    encrypted_client_id: str
    encrypted_secret: str
    plaid_env: str = Field(default="sandbox")
    enabled: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class HouseholdLLMConfig(SQLModel, table=True):
    """Per-household LLM API credentials (API key encrypted at rest)."""

    __tablename__ = "household_llm_configs"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id", unique=True, index=True)
    llm_base_url: str = Field(default="https://api.openai.com/v1")
    encrypted_api_key: str
    llm_model: str = Field(default="gpt-4o-mini")
    batch_size: int = Field(default=10)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class AppLLMConfig(SQLModel, table=True):
    """App-level LLM credentials for managed AI categorization (singleton)."""

    __tablename__ = "app_llm_config"

    id: Optional[int] = Field(default=None, primary_key=True)
    llm_base_url: str = Field(default="https://api.openai.com/v1")
    encrypted_api_key: str
    llm_model: str = Field(default="gpt-4o-mini")
    enabled: bool = Field(default=False)
    batch_size: int = Field(default=10)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class HouseholdSyncConfig(SQLModel, table=True):
    """Per-household sync schedule configuration."""

    __tablename__ = "household_sync_configs"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id", unique=True, index=True)
    sync_enabled: bool = True
    sync_hour: int = 0
    sync_minute: int = 0
    sync_timezone: str = "America/Toronto"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


class HouseholdInvitation(SQLModel, table=True):
    """Pending invitation to join a household."""

    __tablename__ = "household_invitations"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id", index=True)
    invited_by_user_id: int = Field(foreign_key="users.id", index=True)
    invited_email: str = Field(index=True)
    token: str = Field(default_factory=lambda: uuid4().hex, unique=True, index=True)
    status: str = Field(default="pending")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)


# ── Admin / Analytics ─────────────────────────────────────────


class ActivityAction(str, Enum):
    """Tracked user actions for analytics."""

    LOGIN = "login"
    SYNC = "sync"
    IMPORT = "import"
    CREATE_TRANSACTION = "create_transaction"
    UPDATE_TRANSACTION = "update_transaction"
    CATEGORIZE = "categorize"
    CREATE_BUDGET = "create_budget"
    CREATE_GOAL = "create_goal"
    ACCOUNT_DISCOVERED = "account_discovered"


class ErrorType(str, Enum):
    """Tracked error categories."""

    PLAID_SYNC = "plaid_sync"
    PLAID_LINK = "plaid_link"
    API_4XX = "api_4xx"
    API_5XX = "api_5xx"


class ActivityLog(SQLModel, table=True):
    """Records user actions for DAU/WAU/MAU analytics."""

    __tablename__ = "activity_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    action: ActivityAction = Field(sa_type=sa.String(30), index=True)
    detail: Optional[str] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at: Optional[datetime] = Field(default=None)


class ErrorLog(SQLModel, table=True):
    """Records errors for admin monitoring."""

    __tablename__ = "error_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    error_type: ErrorType = Field(sa_type=sa.String(20), index=True)
    endpoint: str
    status_code: Optional[int] = None
    detail: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at: Optional[datetime] = Field(default=None)


# Sync-triggering webhook codes
PLAID_ITEM_STATUS_HEALTHY = "healthy"
PLAID_ITEM_STATUS_ERROR = "error"
PLAID_ITEM_STATUS_PENDING_DISCONNECT = "pending_disconnect"
PLAID_ITEM_STATUS_REVOKED = "revoked"

SYNC_TRIGGERING_CODES = frozenset({
    "SYNC_UPDATES_AVAILABLE",
    "DEFAULT_UPDATE",
    "INITIAL_UPDATE",
    "HISTORICAL_UPDATE",
})


class PlaidWebhookEvent(SQLModel, table=True):
    """Records incoming Plaid webhook events for admin visibility and auto-sync."""

    __tablename__ = "plaid_webhook_events"

    id: Optional[int] = Field(default=None, primary_key=True)
    webhook_type: str = Field(index=True)
    webhook_code: str = Field(index=True)
    item_id: Optional[str] = Field(default=None, index=True)
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    raw_payload: str
    processed: bool = Field(default=False)
    action_taken: Optional[str] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at: Optional[datetime] = Field(default=None)
