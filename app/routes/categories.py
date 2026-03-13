"""Category CRUD endpoints with auto-seeding, rename cascading, and delete reassignment."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select, or_

from app.auth import get_current_user
from app.database import get_session
from app.models import Account, Category, CategoryRule, Transaction, User

router = APIRouter(prefix="/categories", tags=["categories"])

DEFAULT_CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transportation",
    "Utilities",
    "Entertainment",
    "Shopping",
    "Health & Fitness",
    "Travel",
    "Education",
    "Subscriptions",
    "Income",
    "Transfer",
    "Rent & Mortgage",
    "Insurance",
    "Investments",
    "Other",
]


def _seed_defaults(session: Session, user_id: int) -> list[Category]:
    """Populate the default category set for a new user."""
    cats = []
    for name in DEFAULT_CATEGORIES:
        cat = Category(user_id=user_id, name=name)
        session.add(cat)
        cats.append(cat)
    session.commit()
    for cat in cats:
        session.refresh(cat)
    return cats


@router.get("")
def list_categories(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cats = session.exec(
        select(Category).where(Category.user_id == user.id).order_by(Category.id)
    ).all()
    if not cats:
        cats = _seed_defaults(session, user.id)
    return [{"id": c.id, "name": c.name} for c in cats]


class CategoryCreate(BaseModel):
    name: str = Field(max_length=100)


@router.post("", status_code=201)
def create_category(
    body: CategoryCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")

    existing = session.exec(
        select(Category).where(Category.user_id == user.id, Category.name == name)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")

    cat = Category(user_id=user.id, name=name)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"id": cat.id, "name": cat.name}


class CategoryUpdate(BaseModel):
    name: str


@router.patch("/{category_id}")
def update_category(
    category_id: int,
    body: CategoryUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cat = session.get(Category, category_id)
    if not cat or cat.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")

    if new_name == cat.name:
        return {"id": cat.id, "name": cat.name}

    dup = session.exec(
        select(Category).where(Category.user_id == user.id, Category.name == new_name)
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Category already exists")

    old_name = cat.name
    cat.name = new_name
    session.add(cat)

    # Cascade rename to transactions (user-owned or in user's accounts)
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id == user.id)
    ).all()
    txn_conditions = [Transaction.user_id == user.id]
    if user_account_ids:
        txn_conditions.append(Transaction.account_id.in_(user_account_ids))
    txns = session.exec(
        select(Transaction).where(
            Transaction.category == old_name,
            or_(*txn_conditions),
        )
    ).all()
    for txn in txns:
        txn.category = new_name
        session.add(txn)

    # Cascade rename to category rules
    rules = session.exec(
        select(CategoryRule).where(
            CategoryRule.user_id == user.id, CategoryRule.category == old_name
        )
    ).all()
    for rule in rules:
        rule.category = new_name
        session.add(rule)

    session.commit()
    session.refresh(cat)
    return {"id": cat.id, "name": cat.name}


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    reassign_to: Optional[int] = Query(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    cat = session.get(Category, category_id)
    if not cat or cat.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    new_category_name: str | None = None
    if reassign_to is not None:
        target = session.get(Category, reassign_to)
        if not target or target.user_id != user.id:
            raise HTTPException(status_code=404, detail="Reassignment category not found")
        new_category_name = target.name

    # Update transactions: reassign or set to NULL
    txns = session.exec(
        select(Transaction).where(
            Transaction.user_id == user.id, Transaction.category == cat.name
        )
    ).all()
    for txn in txns:
        txn.category = new_category_name
        session.add(txn)

    # Delete category rules that reference this category
    rules = session.exec(
        select(CategoryRule).where(
            CategoryRule.user_id == user.id, CategoryRule.category == cat.name
        )
    ).all()
    for rule in rules:
        session.delete(rule)

    session.delete(cat)
    session.commit()
