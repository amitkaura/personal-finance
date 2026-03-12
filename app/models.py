"""
Database models for the personal finance system.
Uses SQLModel (SQLAlchemy + Pydantic) for schema definition.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import uuid4

import sqlalchemy as sa
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


class AccountType(str, Enum):
    """Account type as defined by Plaid."""

    DEPOSITORY = "depository"
    INVESTMENT = "investment"
    CREDIT = "credit"
    LOAN = "loan"


class PlaidItem(SQLModel, table=True):
    """Stores Plaid Link items (bank connections)."""

    __tablename__ = "plaid_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    encrypted_access_token: str = Field(index=True)
    item_id: str = Field(unique=True, index=True)
    institution_name: Optional[str] = None

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

    plaid_item: Optional[PlaidItem] = Relationship(back_populates="accounts")
    transactions: list["Transaction"] = Relationship(back_populates="account")


class Transaction(SQLModel, table=True):
    """Financial transactions synced from Plaid or added manually."""

    __tablename__ = "transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    plaid_transaction_id: str = Field(unique=True, index=True)
    date: date
    amount: Decimal = Field(max_digits=15, decimal_places=2)
    merchant_name: Optional[str] = None
    plaid_category_code: Optional[str] = None
    category: Optional[str] = None
    pending_status: bool = False
    needs_review: bool = Field(default=True)
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")
    is_manual: bool = Field(default=False)
    notes: Optional[str] = None
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)

    account: Optional[Account] = Relationship(back_populates="transactions")
    tag_links: list["TransactionTag"] = Relationship(back_populates="transaction")


class CategoryRule(SQLModel, table=True):
    """User-defined keyword rules for transaction categorization."""

    __tablename__ = "category_rules"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    keyword: str = Field(index=True)
    category: str
    case_sensitive: bool = False


class UserSettings(SQLModel, table=True):
    """Per-user preferences."""

    __tablename__ = "user_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)

    # Display
    currency: str = "CAD"
    date_format: str = "YYYY-MM-DD"
    locale: str = "en-CA"

    # Sync schedule
    sync_enabled: bool = True
    sync_hour: int = 0
    sync_minute: int = 0
    sync_timezone: str = "America/Toronto"

    # LLM categorization
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"


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
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Net Worth History ──────────────────────────────────────────


class NetWorthSnapshot(SQLModel, table=True):
    """Point-in-time snapshot of net worth for historical tracking."""

    __tablename__ = "net_worth_snapshots"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    date: date
    assets: Decimal = Field(max_digits=15, decimal_places=2)
    liabilities: Decimal = Field(max_digits=15, decimal_places=2)
    net_worth: Decimal = Field(max_digits=15, decimal_places=2)


# ── Tags ───────────────────────────────────────────────────────


class Tag(SQLModel, table=True):
    """User-defined label for transactions."""

    __tablename__ = "tags"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    color: str = Field(default="#6d28d9")

    transaction_links: list["TransactionTag"] = Relationship(back_populates="tag")


class TransactionTag(SQLModel, table=True):
    """Junction table linking transactions to tags."""

    __tablename__ = "transaction_tags"

    id: Optional[int] = Field(default=None, primary_key=True)
    transaction_id: int = Field(foreign_key="transactions.id", index=True)
    tag_id: int = Field(foreign_key="tags.id", index=True)

    transaction: Optional[Transaction] = Relationship(back_populates="tag_links")
    tag: Optional[Tag] = Relationship(back_populates="transaction_links")


class Household(SQLModel, table=True):
    """A household linking two partners for shared financial views."""

    __tablename__ = "households"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = "Our Household"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    members: list["HouseholdMember"] = Relationship(back_populates="household")


class HouseholdMember(SQLModel, table=True):
    """Membership linking a user to a household."""

    __tablename__ = "household_members"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id", index=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    role: str = Field(default="member")
    joined_at: datetime = Field(default_factory=datetime.utcnow)

    household: Optional[Household] = Relationship(back_populates="members")


class HouseholdInvitation(SQLModel, table=True):
    """Pending invitation to join a household."""

    __tablename__ = "household_invitations"

    id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="households.id")
    invited_by_user_id: int = Field(foreign_key="users.id")
    invited_email: str = Field(index=True)
    token: str = Field(default_factory=lambda: uuid4().hex, unique=True, index=True)
    status: str = Field(default="pending")
    created_at: datetime = Field(default_factory=datetime.utcnow)
