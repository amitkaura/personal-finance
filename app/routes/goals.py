"""Financial goal endpoints – savings targets with progress tracking."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Goal, User

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0
    target_date: Optional[str] = None
    icon: str = "target"
    color: str = "#6d28d9"


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    target_date: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_completed: Optional[bool] = None


def _goal_to_dict(g: Goal) -> dict:
    progress = (
        round(float(g.current_amount) / float(g.target_amount) * 100, 1)
        if g.target_amount > 0
        else 0
    )
    remaining = float(g.target_amount) - float(g.current_amount)

    months_left = None
    if g.target_date:
        from datetime import date

        days = (g.target_date - date.today()).days
        months_left = max(0, round(days / 30.44, 1))

    monthly_needed = None
    if months_left and months_left > 0 and remaining > 0:
        monthly_needed = round(remaining / months_left, 2)

    return {
        "id": g.id,
        "name": g.name,
        "target_amount": float(g.target_amount),
        "current_amount": float(g.current_amount),
        "target_date": g.target_date.isoformat() if g.target_date else None,
        "icon": g.icon,
        "color": g.color,
        "is_completed": g.is_completed,
        "progress": progress,
        "remaining": remaining,
        "months_left": months_left,
        "monthly_needed": monthly_needed,
        "created_at": g.created_at.isoformat(),
    }


@router.get("")
def list_goals(
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    user_ids = get_scoped_user_ids(session, user, scope)
    goals = session.exec(
        select(Goal)
        .where(Goal.user_id.in_(user_ids))  # type: ignore[union-attr]
        .order_by(Goal.created_at.desc())
    ).all()
    return [_goal_to_dict(g) for g in goals]


@router.post("", status_code=201)
def create_goal(
    body: GoalCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    from datetime import date

    goal = Goal(
        user_id=user.id,
        name=body.name,
        target_amount=Decimal(str(body.target_amount)),
        current_amount=Decimal(str(body.current_amount)),
        target_date=date.fromisoformat(body.target_date) if body.target_date else None,
        icon=body.icon,
        color=body.color,
    )
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return _goal_to_dict(goal)


@router.patch("/{goal_id}")
def update_goal(
    goal_id: int,
    body: GoalUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    from datetime import date

    goal = session.get(Goal, goal_id)
    if not goal or goal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Goal not found")

    data = body.model_dump(exclude_unset=True)
    if "target_amount" in data and data["target_amount"] is not None:
        goal.target_amount = Decimal(str(data["target_amount"]))
    if "current_amount" in data and data["current_amount"] is not None:
        goal.current_amount = Decimal(str(data["current_amount"]))
        if goal.current_amount >= goal.target_amount:
            goal.is_completed = True
    if "target_date" in data:
        goal.target_date = date.fromisoformat(data["target_date"]) if data["target_date"] else None
    if "name" in data and data["name"] is not None:
        goal.name = data["name"]
    if "icon" in data and data["icon"] is not None:
        goal.icon = data["icon"]
    if "color" in data and data["color"] is not None:
        goal.color = data["color"]
    if "is_completed" in data and data["is_completed"] is not None:
        goal.is_completed = data["is_completed"]

    session.add(goal)
    session.commit()
    session.refresh(goal)
    return _goal_to_dict(goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    goal = session.get(Goal, goal_id)
    if not goal or goal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Goal not found")
    session.delete(goal)
    session.commit()
