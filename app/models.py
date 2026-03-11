"""
Database models for the personal finance system.
Uses SQLModel (SQLAlchemy + Pydantic) for schema definition.
"""

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class AccountType(str, Enum):
    """Account type as defined by Plaid."""

    DEPOSITORY = "depository"
    INVESTMENT = "investment"


class PlaidItem(SQLModel, table=True):
    """Stores Plaid Link items (bank connections)."""

    __tablename__ = "plaid_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    encrypted_access_token: str = Field(index=True)
    item_id: str = Field(unique=True, index=True)
    institution_name: Optional[str] = None

    accounts: list["Account"] = Relationship(back_populates="plaid_item")


class Account(SQLModel, table=True):
    """Bank/brokerage accounts linked via Plaid."""

    __tablename__ = "accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    official_name: Optional[str] = None
    type: AccountType
    current_balance: Decimal = Field(default=Decimal("0"), max_digits=15, decimal_places=2)
    plaid_account_id: str = Field(unique=True, index=True)
    plaid_item_id: Optional[int] = Field(default=None, foreign_key="plaid_items.id")

    plaid_item: Optional[PlaidItem] = Relationship(back_populates="accounts")
    transactions: list["Transaction"] = Relationship(back_populates="account")


class Transaction(SQLModel, table=True):
    """Financial transactions synced from Plaid."""

    __tablename__ = "transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    plaid_transaction_id: str = Field(unique=True, index=True)
    date: date
    amount: Decimal = Field(max_digits=15, decimal_places=2)
    merchant_name: Optional[str] = None
    category: Optional[str] = None
    pending_status: bool = False
    needs_review: bool = Field(default=True)
    account_id: Optional[int] = Field(default=None, foreign_key="accounts.id")

    account: Optional[Account] = Relationship(back_populates="transactions")


class CategoryRule(SQLModel, table=True):
    """User-defined keyword rules for transaction categorization."""

    __tablename__ = "category_rules"

    id: Optional[int] = Field(default=None, primary_key=True)
    keyword: str = Field(index=True)
    category: str
    case_sensitive: bool = False
