"""Household management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Household, HouseholdInvitation, HouseholdMember, User

router = APIRouter(prefix="/household", tags=["household"])


def _member_to_dict(member: HouseholdMember, user: User) -> dict:
    return {
        "id": member.id,
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "picture": user.picture,
        "role": member.role,
    }


@router.get("")
def get_household(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return the current user's household with members, or null."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        return None

    household = session.get(Household, member.household_id)
    if not household:
        return None

    members = session.exec(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household.id
        )
    ).all()

    member_dicts = []
    for m in members:
        u = session.get(User, m.user_id)
        if u:
            member_dicts.append(_member_to_dict(m, u))

    pending_invitations = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.household_id == household.id,
            HouseholdInvitation.status == "pending",
        )
    ).all()

    return {
        "id": household.id,
        "name": household.name,
        "members": member_dicts,
        "pending_invitations": [
            {
                "id": inv.id,
                "invited_email": inv.invited_email,
                "status": inv.status,
            }
            for inv in pending_invitations
        ],
    }


class InviteRequest(BaseModel):
    email: str


@router.post("/invite")
def invite_partner(
    body: InviteRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Invite a partner by email. Creates a household if the user doesn't have one."""
    if body.email.lower() == user.email.lower():
        raise HTTPException(status_code=400, detail="Cannot invite yourself")

    existing_member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()

    if existing_member:
        household = session.get(Household, existing_member.household_id)
        member_count = len(
            session.exec(
                select(HouseholdMember).where(
                    HouseholdMember.household_id == existing_member.household_id
                )
            ).all()
        )
        if member_count >= 2:
            raise HTTPException(
                status_code=400, detail="Household already has two members"
            )
    else:
        household = Household()
        session.add(household)
        session.commit()
        session.refresh(household)

        owner_member = HouseholdMember(
            household_id=household.id,
            user_id=user.id,
            role="owner",
        )
        session.add(owner_member)
        session.commit()

    existing_invite = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.household_id == household.id,
            HouseholdInvitation.invited_email == body.email.lower(),
            HouseholdInvitation.status == "pending",
        )
    ).first()
    if existing_invite:
        raise HTTPException(
            status_code=400, detail="An invitation is already pending for this email"
        )

    invitation = HouseholdInvitation(
        household_id=household.id,
        invited_by_user_id=user.id,
        invited_email=body.email.lower(),
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    return {
        "id": invitation.id,
        "token": invitation.token,
        "invited_email": invitation.invited_email,
        "status": invitation.status,
    }


@router.get("/invitations/pending")
def get_pending_invitations(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return pending invitations for the current user's email."""
    invitations = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.invited_email == user.email.lower(),
            HouseholdInvitation.status == "pending",
        )
    ).all()

    result = []
    for inv in invitations:
        household = session.get(Household, inv.household_id)
        inviter = session.get(User, inv.invited_by_user_id)
        result.append({
            "id": inv.id,
            "token": inv.token,
            "household_name": household.name if household else "Household",
            "invited_by_name": inviter.name if inviter else "Someone",
            "invited_by_picture": inviter.picture if inviter else None,
            "status": inv.status,
        })

    return result


@router.post("/invitations/{token}/accept")
def accept_invitation(
    token: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Accept a household invitation."""
    invitation = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.token == token,
            HouseholdInvitation.status == "pending",
        )
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invited_email != user.email.lower():
        raise HTTPException(status_code=403, detail="This invitation is not for you")

    existing_member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if existing_member:
        raise HTTPException(
            status_code=400, detail="You already belong to a household"
        )

    new_member = HouseholdMember(
        household_id=invitation.household_id,
        user_id=user.id,
        role="member",
    )
    session.add(new_member)

    invitation.status = "accepted"
    session.add(invitation)
    session.commit()

    return {"status": "accepted", "household_id": invitation.household_id}


@router.post("/invitations/{token}/decline")
def decline_invitation(
    token: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Decline a household invitation."""
    invitation = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.token == token,
            HouseholdInvitation.status == "pending",
        )
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invited_email != user.email.lower():
        raise HTTPException(status_code=403, detail="This invitation is not for you")

    invitation.status = "declined"
    session.add(invitation)
    session.commit()

    return {"status": "declined"}


@router.delete("/leave")
def leave_household(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Leave the current household. If you're the last member, the household is deleted."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")

    household_id = member.household_id
    session.delete(member)
    session.commit()

    remaining = session.exec(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id
        )
    ).all()

    if not remaining:
        # Cancel pending invitations and delete the household
        pending = session.exec(
            select(HouseholdInvitation).where(
                HouseholdInvitation.household_id == household_id,
                HouseholdInvitation.status == "pending",
            )
        ).all()
        for inv in pending:
            inv.status = "declined"
            session.add(inv)

        household = session.get(Household, household_id)
        if household:
            session.delete(household)
        session.commit()

    return {"status": "left"}
