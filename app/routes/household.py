"""Household management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from fastapi import BackgroundTasks

from app.auth import get_current_user
from app.database import get_session
from app.email import send_invitation_email
from app.models import (
    Account,
    Budget,
    Goal,
    GoalAccountLink,
    GoalContribution,
    Household,
    HouseholdInvitation,
    HouseholdMember,
    HouseholdLLMConfig,
    HouseholdPlaidConfig,
    HouseholdSyncConfig,
    PlaidItem,
    SpendingPreference,
    User,
)

router = APIRouter(prefix="/household", tags=["household"])


def _member_to_dict(member: HouseholdMember, user: User) -> dict:
    return {
        "id": member.id,
        "user_id": user.id,
        "name": user.display_name or user.name,
        "email": user.email,
        "picture": user.avatar_url or user.picture,
        "role": member.role,
    }


@router.get("")
def get_household(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return the current user's household with members, or null."""
    # #region agent log
    import json as _json, time as _time
    _lp = "/Users/fds45740/dev/personal-finance/.cursor/debug-711b60.log"
    def _d(m, d=None, h=""):
        print(f"[DEBUG-711b60] {m} | {d}")
        try:
            with open(_lp,"a") as f: f.write(_json.dumps({"sessionId":"711b60","location":"household.py:get_household","message":m,"data":d or {},"timestamp":int(_time.time()*1000),"hypothesisId":h})+"\n")
        except Exception: pass
    _d("get_household called", {"user_id": user.id}, h="H7")
    # #endregion
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        # #region agent log
        _d("no member found, returning None", h="H7")
        # #endregion
        return None

    # #region agent log
    _d("member found, fetching household", {"household_id": member.household_id}, h="H7")
    # #endregion
    household = session.get(Household, member.household_id)
    # #region agent log
    _d("household fetched", {"found": household is not None}, h="H7")
    # #endregion
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
                "token": inv.token,
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
    background_tasks: BackgroundTasks,
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

    background_tasks.add_task(
        send_invitation_email,
        to_email=invitation.invited_email,
        inviter_name=user.display_name or user.name,
        inviter_email=user.email,
        household_name=household.name,
    )

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
            "invited_by_name": (inviter.display_name or inviter.name) if inviter else "Someone",
            "invited_by_picture": (inviter.avatar_url or inviter.picture) if inviter else None,
            "status": inv.status,
        })

    return result


@router.delete("/invitations/{token}")
def cancel_invitation(
    token: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Cancel a pending invitation (only the inviter can cancel)."""
    invitation = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.token == token,
            HouseholdInvitation.status == "pending",
        )
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.invited_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the inviter can cancel")

    invitation.status = "cancelled"
    session.add(invitation)
    session.commit()

    return {"status": "cancelled"}


class HouseholdNameUpdate(BaseModel):
    name: str


@router.patch("")
def update_household(
    body: HouseholdNameUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Update the household name."""
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")

    name = body.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(status_code=400, detail="Name must be 1-100 characters")

    household = session.get(Household, member.household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")

    household.name = name
    session.add(household)
    session.commit()
    session.refresh(household)

    return {"id": household.id, "name": household.name}


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
        other_members = session.exec(
            select(HouseholdMember).where(
                HouseholdMember.household_id == existing_member.household_id,
                HouseholdMember.user_id != user.id,
            )
        ).all()
        if other_members:
            raise HTTPException(
                status_code=400,
                detail="You already belong to a household with a partner. Leave first, then accept.",
            )
        old_hh_id = existing_member.household_id
        session.delete(existing_member)
        session.flush()
        _destroy_household(session, old_hh_id)

    has_plaid_items = session.exec(
        select(PlaidItem).where(PlaidItem.user_id == user.id)
    ).first() is not None

    new_member = HouseholdMember(
        household_id=invitation.household_id,
        user_id=user.id,
        role="member",
    )
    session.add(new_member)

    invitation.status = "accepted"
    session.add(invitation)
    session.commit()

    return {
        "status": "accepted",
        "household_id": invitation.household_id,
        "plaid_items_warning": has_plaid_items,
    }


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
    """Leave the current household.

    When another member remains, shared budgets and goals are cloned to
    personal copies for both members (contributions recalculated), spending
    preferences reset, and pending invitations cancelled.  The household
    itself is kept so the remaining member can re-invite someone.

    When the last member leaves, the household and all associated data are
    deleted outright.
    """
    member = session.exec(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Not in a household")

    household_id = member.household_id

    other_members = session.exec(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id != user.id,
        )
    ).all()

    if other_members:
        all_user_ids = [user.id] + [m.user_id for m in other_members]
        _clone_shared_budgets(session, household_id, all_user_ids)
        _clone_shared_goals(session, household_id, all_user_ids)
        _reset_spending_preferences(session, all_user_ids)
        _cancel_pending_invitations(session, household_id)
        session.delete(member)
        session.commit()
    else:
        session.delete(member)
        session.commit()
        _destroy_household(session, household_id)

    return {"status": "left"}


def _clone_shared_budgets(
    session: Session, household_id: int, user_ids: list[int],
) -> None:
    """Clone each shared budget to a personal copy for every member."""
    shared = session.exec(
        select(Budget).where(Budget.household_id == household_id)
    ).all()
    for b in shared:
        for uid in user_ids:
            clone = Budget(
                user_id=uid,
                category=b.category,
                amount=b.amount,
                month=b.month,
                rollover=b.rollover,
                household_id=None,
            )
            session.add(clone)
        session.delete(b)


def _clone_shared_goals(
    session: Session, household_id: int, user_ids: list[int],
) -> None:
    """Clone each shared goal to a personal copy for every member.

    GoalAccountLinks are assigned to the copy whose owner matches the
    account owner.  GoalContributions are moved to the matching copy
    based on ``user_id``, and each copy's ``current_amount`` is
    recalculated from its contributions.
    """
    from decimal import Decimal

    shared = session.exec(
        select(Goal).where(Goal.household_id == household_id)
    ).all()

    for g in shared:
        copies: dict[int, Goal] = {}
        for uid in user_ids:
            clone = Goal(
                user_id=uid,
                name=g.name,
                target_amount=g.target_amount,
                current_amount=Decimal("0"),
                target_date=g.target_date,
                icon=g.icon,
                color=g.color,
                is_completed=g.is_completed,
                household_id=None,
            )
            session.add(clone)
            session.flush()
            copies[uid] = clone

        links = session.exec(
            select(GoalAccountLink).where(GoalAccountLink.goal_id == g.id)
        ).all()
        for link in links:
            acct = session.get(Account, link.account_id)
            if acct and acct.user_id in copies:
                new_link = GoalAccountLink(
                    goal_id=copies[acct.user_id].id,
                    account_id=link.account_id,
                )
                session.add(new_link)
            session.delete(link)

        contribs = session.exec(
            select(GoalContribution).where(GoalContribution.goal_id == g.id)
        ).all()
        for c in contribs:
            if c.user_id in copies:
                c.goal_id = copies[c.user_id].id
            session.add(c)

        for uid, clone in copies.items():
            total = sum(
                (c.amount for c in contribs if c.user_id == uid),
                Decimal("0"),
            )
            clone.current_amount = total
            session.add(clone)

        session.delete(g)


def _reset_spending_preferences(
    session: Session, user_ids: list[int],
) -> None:
    """Set any 'shared' spending preferences back to 'personal'."""
    for uid in user_ids:
        prefs = session.exec(
            select(SpendingPreference).where(
                SpendingPreference.user_id == uid,
                SpendingPreference.target == "shared",
            )
        ).all()
        for p in prefs:
            p.target = "personal"
            session.add(p)


def _cancel_pending_invitations(session: Session, household_id: int) -> None:
    pending = session.exec(
        select(HouseholdInvitation).where(
            HouseholdInvitation.household_id == household_id,
            HouseholdInvitation.status == "pending",
        )
    ).all()
    for inv in pending:
        inv.status = "cancelled"
        session.add(inv)


def _destroy_household(session: Session, household_id: int) -> None:
    """Delete a household and all its associated data (no members remain)."""
    goals = list(session.exec(select(Goal).where(Goal.household_id == household_id)).all())
    goal_ids = [g.id for g in goals if g.id is not None]
    if goal_ids:
        links = session.exec(
            select(GoalAccountLink).where(GoalAccountLink.goal_id.in_(goal_ids))  # type: ignore[union-attr]
        ).all()
        for link in links:
            session.delete(link)
        contribs = session.exec(
            select(GoalContribution).where(GoalContribution.goal_id.in_(goal_ids))  # type: ignore[union-attr]
        ).all()
        for c in contribs:
            session.delete(c)
    for g in goals:
        session.delete(g)

    for b in session.exec(select(Budget).where(Budget.household_id == household_id)).all():
        session.delete(b)

    for inv in session.exec(select(HouseholdInvitation).where(HouseholdInvitation.household_id == household_id)).all():
        session.delete(inv)

    plaid_config = session.exec(
        select(HouseholdPlaidConfig).where(HouseholdPlaidConfig.household_id == household_id)
    ).first()
    if plaid_config:
        session.delete(plaid_config)

    llm_config = session.exec(
        select(HouseholdLLMConfig).where(HouseholdLLMConfig.household_id == household_id)
    ).first()
    if llm_config:
        session.delete(llm_config)

    sync_config = session.exec(
        select(HouseholdSyncConfig).where(HouseholdSyncConfig.household_id == household_id)
    ).first()
    if sync_config:
        session.delete(sync_config)

    household = session.get(Household, household_id)
    if household:
        session.delete(household)
    session.commit()
