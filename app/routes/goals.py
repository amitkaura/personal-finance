"""Financial goal endpoints – savings targets with progress tracking."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_household_for_user, get_scoped_user_ids
from app.models import Account, Goal, GoalAccountLink, GoalContribution, HouseholdMember, User

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    name: str = Field(max_length=200)
    target_amount: float = Field(gt=0)
    current_amount: float = Field(default=0, ge=0)
    target_date: Optional[str] = None
    icon: str = "target"
    color: str = "#6d28d9"
    household_id: Optional[int] = None
    linked_account_ids: Optional[list[int]] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    target_amount: Optional[float] = Field(default=None, gt=0)
    current_amount: Optional[float] = Field(default=None, ge=0)
    target_date: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_completed: Optional[bool] = None
    linked_account_ids: Optional[list[int]] = None


class ContributionCreate(BaseModel):
    amount: float
    note: Optional[str] = None


def _get_linked_account_ids(session: Session, goal_id: int) -> list[int]:
    links = session.exec(
        select(GoalAccountLink.account_id).where(GoalAccountLink.goal_id == goal_id)
    ).all()
    return list(links)


def _compute_linked_balance(session: Session, goal_id: int) -> Decimal | None:
    """Sum current_balance of all linked accounts. Returns None if no links."""
    account_ids = _get_linked_account_ids(session, goal_id)
    if not account_ids:
        return None
    accounts = session.exec(
        select(Account).where(Account.id.in_(account_ids))  # type: ignore[union-attr]
    ).all()
    return sum((a.current_balance for a in accounts), Decimal("0"))


def _goal_to_dict(g: Goal, session: Session) -> dict:
    linked_ids = _get_linked_account_ids(session, g.id) if g.id else []
    is_linked = len(linked_ids) > 0

    current = float(g.current_amount)
    if is_linked:
        bal = _compute_linked_balance(session, g.id)  # type: ignore[arg-type]
        if bal is not None:
            current = float(bal)

    progress = round(current / float(g.target_amount) * 100, 1) if g.target_amount > 0 else 0
    remaining = float(g.target_amount) - current

    months_left = None
    if g.target_date:
        days = (g.target_date - date.today()).days
        months_left = max(0, round(days / 30.44, 1))

    monthly_needed = None
    if months_left and months_left > 0 and remaining > 0:
        monthly_needed = round(remaining / months_left, 2)

    return {
        "id": g.id,
        "name": g.name,
        "target_amount": float(g.target_amount),
        "current_amount": current,
        "target_date": g.target_date.isoformat() if g.target_date else None,
        "icon": g.icon,
        "color": g.color,
        "is_completed": g.is_completed,
        "progress": progress,
        "remaining": remaining,
        "months_left": months_left,
        "monthly_needed": monthly_needed,
        "created_at": g.created_at.isoformat(),
        "household_id": g.household_id,
        "linked_account_ids": linked_ids,
        "is_account_linked": is_linked,
    }


def _can_edit_goal(goal: Goal, user: User, session: Session) -> bool:
    """Shared goals editable by any household member; personal only by owner."""
    if goal.household_id:
        member = get_household_for_user(session, user.id)
        return member is not None and member.household_id == goal.household_id
    return goal.user_id == user.id


def _set_linked_accounts(session: Session, goal_id: int, account_ids: list[int]) -> None:
    """Replace linked accounts for a goal."""
    existing = session.exec(
        select(GoalAccountLink).where(GoalAccountLink.goal_id == goal_id)
    ).all()
    for link in existing:
        session.delete(link)
    for aid in account_ids:
        session.add(GoalAccountLink(goal_id=goal_id, account_id=aid))


@router.get("")
def list_goals(
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    user_ids = get_scoped_user_ids(session, user, scope)

    personal_goals = list(session.exec(
        select(Goal)
        .where(
            Goal.user_id.in_(user_ids),  # type: ignore[union-attr]
            Goal.household_id == None,  # noqa: E711
        )
        .order_by(Goal.created_at.desc())
    ).all())

    shared_goals: list[Goal] = []
    member = get_household_for_user(session, user.id)
    if member and scope in ("household", "partner"):
        shared_goals = list(session.exec(
            select(Goal)
            .where(Goal.household_id == member.household_id)
            .order_by(Goal.created_at.desc())
        ).all())

    all_goals = personal_goals + [g for g in shared_goals if g not in personal_goals]
    result = [_goal_to_dict(g, session) for g in all_goals]

    if scope == "personal" and member:
        household_goals = session.exec(
            select(Goal).where(
                Goal.household_id == member.household_id,
                Goal.is_completed == False,  # noqa: E712
            )
        ).all()
        if household_goals:
            avg_progress = sum(
                _goal_to_dict(g, session)["progress"] for g in household_goals
            ) / len(household_goals)
            return {
                "goals": result,
                "shared_goals_summary": {
                    "count": len(household_goals),
                    "total_progress_pct": round(avg_progress, 1),
                },
            }

    return {"goals": result, "shared_goals_summary": None}


@router.post("", status_code=201)
def create_goal(
    body: GoalCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.household_id:
        member = get_household_for_user(session, user.id)
        if not member or member.household_id != body.household_id:
            raise HTTPException(status_code=403, detail="Not a member of this household")

    if body.linked_account_ids:
        allowed_user_ids = [user.id]
        if body.household_id:
            hh_members = session.exec(
                select(HouseholdMember.user_id).where(
                    HouseholdMember.household_id == body.household_id
                )
            ).all()
            allowed_user_ids = list(hh_members)
        for aid in body.linked_account_ids:
            acct = session.get(Account, aid)
            if not acct:
                raise HTTPException(status_code=404, detail=f"Account {aid} not found")
            if acct.user_id not in allowed_user_ids:
                raise HTTPException(status_code=403, detail=f"Account {aid} does not belong to you or your household")

    parsed_target_date = None
    if body.target_date:
        try:
            parsed_target_date = date.fromisoformat(body.target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid target_date format, expected YYYY-MM-DD")
    goal = Goal(
        user_id=user.id,
        name=body.name,
        target_amount=Decimal(str(body.target_amount)),
        current_amount=Decimal(str(body.current_amount)),
        target_date=parsed_target_date,
        icon=body.icon,
        color=body.color,
        household_id=body.household_id,
    )
    session.add(goal)
    session.flush()

    if body.linked_account_ids:
        _set_linked_accounts(session, goal.id, body.linked_account_ids)  # type: ignore[arg-type]

    session.commit()
    session.refresh(goal)
    return _goal_to_dict(goal, session)


@router.patch("/{goal_id}")
def update_goal(
    goal_id: int,
    body: GoalUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if not _can_edit_goal(goal, user, session):
        raise HTTPException(status_code=403, detail="Not authorized to edit this goal")

    data = body.model_dump(exclude_unset=True)
    if "target_amount" in data and data["target_amount"] is not None:
        goal.target_amount = Decimal(str(data["target_amount"]))
    if "current_amount" in data and data["current_amount"] is not None:
        goal.current_amount = Decimal(str(data["current_amount"]))
        if goal.current_amount >= goal.target_amount:
            goal.is_completed = True
    if "target_date" in data:
        if data["target_date"]:
            try:
                goal.target_date = date.fromisoformat(data["target_date"])
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid target_date format, expected YYYY-MM-DD")
        else:
            goal.target_date = None
    if "name" in data and data["name"] is not None:
        goal.name = data["name"]
    if "icon" in data and data["icon"] is not None:
        goal.icon = data["icon"]
    if "color" in data and data["color"] is not None:
        goal.color = data["color"]
    if "is_completed" in data and data["is_completed"] is not None:
        goal.is_completed = data["is_completed"]
    if "linked_account_ids" in data and data["linked_account_ids"] is not None:
        allowed_user_ids = [user.id]
        if goal.household_id:
            hh_members = session.exec(
                select(HouseholdMember.user_id).where(
                    HouseholdMember.household_id == goal.household_id
                )
            ).all()
            allowed_user_ids = list(hh_members)
        for aid in data["linked_account_ids"]:
            acct = session.get(Account, aid)
            if not acct:
                raise HTTPException(status_code=404, detail=f"Account {aid} not found")
            if acct.user_id not in allowed_user_ids:
                raise HTTPException(status_code=403, detail=f"Account {aid} does not belong to you or your household")
        _set_linked_accounts(session, goal_id, data["linked_account_ids"])

    session.add(goal)
    session.commit()
    session.refresh(goal)
    return _goal_to_dict(goal, session)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if not _can_edit_goal(goal, user, session):
        raise HTTPException(status_code=403, detail="Not authorized to delete this goal")

    links = session.exec(
        select(GoalAccountLink).where(GoalAccountLink.goal_id == goal_id)
    ).all()
    for link in links:
        session.delete(link)
    contribs = session.exec(
        select(GoalContribution).where(GoalContribution.goal_id == goal_id)
    ).all()
    for c in contribs:
        session.delete(c)

    session.delete(goal)
    session.commit()


# ── Contributions ─────────────────────────────────────────────


@router.post("/{goal_id}/contributions", status_code=201)
def add_contribution(
    goal_id: int,
    body: ContributionCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if not _can_edit_goal(goal, user, session):
        raise HTTPException(status_code=403, detail="Not authorized")

    linked = _get_linked_account_ids(session, goal_id)
    if linked:
        raise HTTPException(status_code=400, detail="Cannot add manual contributions to account-linked goals")

    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    contribution = GoalContribution(
        goal_id=goal_id,
        user_id=user.id,
        amount=Decimal(str(body.amount)),
        note=body.note,
    )
    session.add(contribution)

    goal.current_amount += Decimal(str(body.amount))
    if goal.current_amount >= goal.target_amount:
        goal.is_completed = True
    session.add(goal)

    session.commit()
    session.refresh(contribution)
    session.refresh(goal)

    u = session.get(User, contribution.user_id)
    return {
        "id": contribution.id,
        "goal_id": contribution.goal_id,
        "user_id": contribution.user_id,
        "user_name": (u.display_name or u.name) if u else "",
        "user_picture": (u.avatar_url or u.picture) if u else None,
        "amount": float(contribution.amount),
        "note": contribution.note,
        "created_at": contribution.created_at.isoformat(),
        "goal": _goal_to_dict(goal, session),
    }


@router.get("/{goal_id}/contributions")
def get_contributions(
    goal_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    goal = session.get(Goal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    can_view = goal.user_id == user.id
    if not can_view and goal.household_id:
        member = get_household_for_user(session, user.id)
        can_view = member is not None and member.household_id == goal.household_id
    if not can_view:
        raise HTTPException(status_code=403, detail="Not authorized")

    contribs = session.exec(
        select(GoalContribution)
        .where(GoalContribution.goal_id == goal_id)
        .order_by(GoalContribution.created_at.desc())
    ).all()

    result = []
    for c in contribs:
        u = session.get(User, c.user_id)
        result.append({
            "id": c.id,
            "goal_id": c.goal_id,
            "user_id": c.user_id,
            "user_name": (u.display_name or u.name) if u else "",
            "user_picture": (u.avatar_url or u.picture) if u else None,
            "amount": float(c.amount),
            "note": c.note,
            "created_at": c.created_at.isoformat(),
        })
    return result
