"""Household scope resolution helpers."""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import HouseholdMember, User


def get_scoped_user_ids(session: Session, user: User, scope: str) -> list[int]:
    """Return the user IDs to query based on the requested scope.

    Scopes:
        personal  - current user only (default)
        partner   - household partner(s) only
        household - all members of the household
    """
    if scope not in {"personal", "partner", "household"}:
        raise HTTPException(status_code=400, detail="Invalid scope")

    if scope == "personal":
        return [user.id]

    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        return [user.id]

    household_members = session.exec(
        select(HouseholdMember).where(
            HouseholdMember.household_id == member.household_id
        )
    ).all()

    if scope == "partner":
        partner_ids = [m.user_id for m in household_members if m.user_id != user.id]
        return partner_ids if partner_ids else [user.id]

    # scope == "household"
    return [m.user_id for m in household_members]


def get_household_for_user(session: Session, user_id: int) -> HouseholdMember | None:
    """Return the HouseholdMember row for a user, or None."""
    return session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user_id)
    ).first()
