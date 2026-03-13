"""Budget endpoints – category-based monthly budgets with rollover."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_household_for_user, get_scoped_user_ids
from app.models import Account, Budget, HouseholdMember, SpendingPreference, Transaction, User

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _validate_month(month: str) -> str:
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", month):
        raise HTTPException(status_code=400, detail="Month must be in YYYY-MM format")
    return month


class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: Optional[str] = None
    rollover: bool = False
    household_id: Optional[int] = None


class BudgetUpdate(BaseModel):
    amount: Optional[float] = None
    rollover: Optional[bool] = None


class SpendingPreferenceBody(BaseModel):
    category: str
    target: str  # "personal" | "shared"


def _budget_to_dict(b: Budget) -> dict:
    return {
        "id": b.id,
        "category": b.category,
        "amount": float(b.amount),
        "month": b.month,
        "rollover": b.rollover,
        "household_id": b.household_id,
    }


def _can_edit_budget(budget: Budget, user: User, session: Session) -> bool:
    """Shared budgets editable by any household member; personal only by owner."""
    if budget.household_id:
        member = get_household_for_user(session, user.id)
        return member is not None and member.household_id == budget.household_id
    return budget.user_id == user.id


@router.get("")
def list_budgets(
    month: Optional[str] = Query(None),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = _validate_month(month) if month else _current_month()
    user_ids = get_scoped_user_ids(session, user, scope)

    personal = session.exec(
        select(Budget).where(
            Budget.user_id.in_(user_ids),  # type: ignore[union-attr]
            Budget.month == m,
            Budget.household_id == None,  # noqa: E711
        )
    ).all()

    shared: list[Budget] = []
    member = get_household_for_user(session, user.id)
    if member and scope in ("household", "partner"):
        shared = list(session.exec(
            select(Budget).where(
                Budget.household_id == member.household_id,
                Budget.month == m,
            )
        ).all())

    return [_budget_to_dict(b) for b in list(personal) + shared]


@router.post("", status_code=201)
def create_budget(
    body: BudgetCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    m = _validate_month(body.month) if body.month else _current_month()

    if body.household_id:
        member = get_household_for_user(session, user.id)
        if not member or member.household_id != body.household_id:
            raise HTTPException(status_code=403, detail="Not a member of this household")
        existing = session.exec(
            select(Budget).where(
                Budget.household_id == body.household_id,
                Budget.category == body.category,
                Budget.month == m,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Shared budget already exists for this category/month")
    else:
        existing = session.exec(
            select(Budget).where(
                Budget.user_id == user.id,
                Budget.category == body.category,
                Budget.month == m,
                Budget.household_id == None,  # noqa: E711
            )
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Budget already exists for this category/month")

    budget = Budget(
        user_id=user.id,
        category=body.category,
        amount=Decimal(str(body.amount)),
        month=m,
        rollover=body.rollover,
        household_id=body.household_id,
    )
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _budget_to_dict(budget)


@router.patch("/{budget_id}")
def update_budget(
    budget_id: int,
    body: BudgetUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    budget = session.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    if not _can_edit_budget(budget, user, session):
        raise HTTPException(status_code=403, detail="Not authorized to edit this budget")
    if body.amount is not None:
        budget.amount = Decimal(str(body.amount))
    if body.rollover is not None:
        budget.rollover = body.rollover
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return _budget_to_dict(budget)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    budget = session.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    if not _can_edit_budget(budget, user, session):
        raise HTTPException(status_code=403, detail="Not authorized to delete this budget")
    session.delete(budget)
    session.commit()


@router.post("/copy")
def copy_budgets(
    source_month: str = Query(...),
    target_month: str = Query(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Copy personal budgets from one month to another."""
    source_month = _validate_month(source_month)
    target_month = _validate_month(target_month)
    source = session.exec(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.month == source_month,
            Budget.household_id == None,  # noqa: E711
        )
    ).all()
    if not source:
        raise HTTPException(status_code=404, detail="No budgets found for source month")

    created = 0
    for b in source:
        existing = session.exec(
            select(Budget).where(
                Budget.user_id == user.id,
                Budget.category == b.category,
                Budget.month == target_month,
                Budget.household_id == None,  # noqa: E711
            )
        ).first()
        if existing:
            continue
        new_budget = Budget(
            user_id=user.id,
            category=b.category,
            amount=b.amount,
            month=target_month,
            rollover=b.rollover,
        )
        session.add(new_budget)
        created += 1
    session.commit()
    return {"copied": created, "target_month": target_month}


# ── Spending Preferences ──────────────────────────────────────


@router.get("/preferences")
def get_spending_preferences(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    prefs = session.exec(
        select(SpendingPreference).where(SpendingPreference.user_id == user.id)
    ).all()
    return [{"category": p.category, "target": p.target} for p in prefs]


@router.put("/preferences")
def set_spending_preference(
    body: SpendingPreferenceBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if body.target not in ("personal", "shared"):
        raise HTTPException(status_code=400, detail="Target must be 'personal' or 'shared'")
    existing = session.exec(
        select(SpendingPreference).where(
            SpendingPreference.user_id == user.id,
            SpendingPreference.category == body.category,
        )
    ).first()
    if existing:
        existing.target = body.target
        session.add(existing)
    else:
        session.add(SpendingPreference(user_id=user.id, category=body.category, target=body.target))
    session.commit()
    return {"category": body.category, "target": body.target}


@router.get("/conflicts")
def get_budget_conflicts(
    month: Optional[str] = Query(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Return categories where both personal and shared budgets exist for the current user."""
    m = _validate_month(month) if month else _current_month()
    member = get_household_for_user(session, user.id)
    if not member:
        return []

    personal_cats = set(
        b.category for b in session.exec(
            select(Budget).where(
                Budget.user_id == user.id,
                Budget.month == m,
                Budget.household_id == None,  # noqa: E711
            )
        ).all()
    )
    shared_cats = set(
        b.category for b in session.exec(
            select(Budget).where(
                Budget.household_id == member.household_id,
                Budget.month == m,
            )
        ).all()
    )
    conflicts = sorted(personal_cats & shared_cats)

    prefs = {
        p.category: p.target for p in session.exec(
            select(SpendingPreference).where(
                SpendingPreference.user_id == user.id,
                SpendingPreference.category.in_(conflicts),  # type: ignore[union-attr]
            )
        ).all()
    }

    return [
        {"category": c, "current_preference": prefs.get(c)}
        for c in conflicts
    ]


# ── Summary ───────────────────────────────────────────────────


def _get_spending_by_category(
    session: Session,
    user_account_ids: list[int],
    user_ids: list[int],
    month_start: date,
    month_end: date,
) -> dict[str, float]:
    """Compute category->spent mapping from transactions."""
    txns = session.exec(
        select(Transaction).where(
            Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
            Transaction.date >= month_start,
            Transaction.date < month_end,
        )
    ).all()
    manual_txns = session.exec(
        select(Transaction).where(
            Transaction.user_id.in_(user_ids),  # type: ignore[union-attr]
            Transaction.is_manual == True,  # noqa: E712
            Transaction.date >= month_start,
            Transaction.date < month_end,
        )
    ).all()
    seen_ids = {t.id for t in txns}
    all_txns = list(txns) + [t for t in manual_txns if t.id not in seen_ids]

    spent: dict[str, float] = {}
    for t in all_txns:
        if t.category and t.amount > 0:
            spent[t.category] = spent.get(t.category, 0) + float(t.amount)
    return spent


def _get_spending_per_user(
    session: Session,
    user_ids: list[int],
    month_start: date,
    month_end: date,
) -> dict[int, dict[str, float]]:
    """Compute per-user category->spent mapping."""
    result: dict[int, dict[str, float]] = {uid: {} for uid in user_ids}
    for uid in user_ids:
        acct_ids = list(session.exec(
            select(Account.id).where(Account.user_id == uid)
        ).all())
        spent = _get_spending_by_category(session, acct_ids, [uid], month_start, month_end)
        result[uid] = spent
    return result


def _compute_rollover(
    session: Session,
    budget: Budget,
    user_account_ids: list[int],
    year: int,
    mo: int,
    user_ids: list[int] | None = None,
) -> float:
    """Compute rollover for a single budget from previous month."""
    if not budget.rollover:
        return 0.0
    if mo == 1:
        prev_month = f"{year - 1}-12"
    else:
        prev_month = f"{year}-{mo - 1:02d}"

    if budget.household_id:
        prev_budget = session.exec(
            select(Budget).where(
                Budget.household_id == budget.household_id,
                Budget.category == budget.category,
                Budget.month == prev_month,
            )
        ).first()
    else:
        prev_budget = session.exec(
            select(Budget).where(
                Budget.user_id == budget.user_id,
                Budget.category == budget.category,
                Budget.month == prev_month,
                Budget.household_id == None,  # noqa: E711
            )
        ).first()

    if not prev_budget:
        return 0.0

    from datetime import date as date_type
    prev_year, prev_mo = int(prev_month[:4]), int(prev_month[5:7])
    prev_start = date_type(prev_year, prev_mo, 1)
    prev_end = date_type(year, mo, 1)
    prev_txns = session.exec(
        select(Transaction).where(
            Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
            Transaction.date >= prev_start,
            Transaction.date < prev_end,
            Transaction.category == budget.category,
        )
    ).all()
    seen_ids = {t.id for t in prev_txns}
    if user_ids:
        manual_txns = session.exec(
            select(Transaction).where(
                Transaction.user_id.in_(user_ids),  # type: ignore[union-attr]
                Transaction.is_manual == True,  # noqa: E712
                Transaction.date >= prev_start,
                Transaction.date < prev_end,
                Transaction.category == budget.category,
            )
        ).all()
        prev_txns = list(prev_txns) + [t for t in manual_txns if t.id not in seen_ids]
    prev_spent = sum(float(t.amount) for t in prev_txns if t.amount > 0)
    leftover = float(prev_budget.amount) - prev_spent
    return max(0.0, leftover)


def _build_section_items(
    budgets: list[Budget],
    spent_by_cat: dict[str, float],
    session: Session,
    user_account_ids: list[int],
    year: int,
    mo: int,
    breakdown: dict[str, dict[str, float]] | None = None,
    user_ids: list[int] | None = None,
) -> tuple[list[dict], float, float]:
    """Build summary items from budgets, returns (items, total_budgeted, total_spent)."""
    budgeted_by_cat: dict[str, float] = {}
    category_ids: dict[str, int] = {}
    rollover_by_cat: dict[str, float] = {}
    budget_by_cat: dict[str, Budget] = {}

    for b in budgets:
        budgeted_by_cat[b.category] = budgeted_by_cat.get(b.category, 0.0) + float(b.amount)
        if b.id is not None and b.category not in category_ids:
            category_ids[b.category] = b.id
        budget_by_cat[b.category] = b

    for cat, b in budget_by_cat.items():
        rollover_by_cat[cat] = _compute_rollover(session, b, user_account_ids, year, mo, user_ids)

    items = []
    total_budgeted = 0.0
    total_spent = 0.0
    for category, budgeted in sorted(budgeted_by_cat.items()):
        spent = spent_by_cat.get(category, 0)
        rollover = rollover_by_cat.get(category, 0)
        effective = budgeted + rollover
        total_budgeted += effective
        total_spent += spent
        item: dict = {
            "id": category_ids.get(category, 0),
            "category": category,
            "budgeted": budgeted,
            "rollover": rollover,
            "effective_budget": effective,
            "spent": spent,
            "remaining": effective - spent,
            "percent_used": round(spent / effective * 100, 1) if effective > 0 else 0,
        }
        if breakdown and category in breakdown:
            item["breakdown"] = breakdown[category]
        items.append(item)

    return items, total_budgeted, total_spent


@router.get("/summary")
def budget_summary(
    month: Optional[str] = Query(None),
    scope: str = Query("personal"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Budget vs actual spending for each category in a given month."""
    m = _validate_month(month) if month else _current_month()
    year, mo = int(m[:4]), int(m[5:7])
    user_ids = get_scoped_user_ids(session, user, scope)

    from datetime import date as date_type
    month_start = date_type(year, mo, 1)
    month_end = date_type(year + 1, 1, 1) if mo == 12 else date_type(year, mo + 1, 1)

    member = get_household_for_user(session, user.id)

    if scope == "household" and member:
        household_user_ids = [
            m2.user_id for m2 in session.exec(
                select(HouseholdMember).where(
                    HouseholdMember.household_id == member.household_id
                )
            ).all()
        ]
        partner_ids = [uid for uid in household_user_ids if uid != user.id]

        prefs = {
            p.category: p.target for p in session.exec(
                select(SpendingPreference).where(SpendingPreference.user_id == user.id)
            ).all()
        }
        partner_prefs: dict[int, dict[str, str]] = {}
        for pid in partner_ids:
            partner_prefs[pid] = {
                p.category: p.target for p in session.exec(
                    select(SpendingPreference).where(SpendingPreference.user_id == pid)
                ).all()
            }

        my_budgets = list(session.exec(
            select(Budget).where(
                Budget.user_id == user.id,
                Budget.month == m,
                Budget.household_id == None,  # noqa: E711
            )
        ).all())
        partner_budgets = list(session.exec(
            select(Budget).where(
                Budget.user_id.in_(partner_ids),  # type: ignore[union-attr]
                Budget.month == m,
                Budget.household_id == None,  # noqa: E711
            )
        ).all()) if partner_ids else []
        shared_budgets = list(session.exec(
            select(Budget).where(
                Budget.household_id == member.household_id,
                Budget.month == m,
            )
        ).all())

        shared_cats = {b.category for b in shared_budgets}
        per_user = _get_spending_per_user(session, household_user_ids, month_start, month_end)

        my_spent: dict[str, float] = {}
        partner_spent: dict[str, float] = {}
        shared_spent: dict[str, float] = {}
        shared_breakdown: dict[str, dict[str, float]] = {}

        my_name = ""
        partner_name = ""
        u = session.get(User, user.id)
        if u:
            my_name = (u.display_name or u.name or "").split(" ")[0]
        if partner_ids:
            pu = session.get(User, partner_ids[0])
            if pu:
                partner_name = (pu.display_name or pu.name or "").split(" ")[0]

        for cat, amt in per_user.get(user.id, {}).items():
            pref = prefs.get(cat, "shared" if cat in shared_cats else "personal")
            if cat in shared_cats and pref == "shared":
                shared_spent[cat] = shared_spent.get(cat, 0) + amt
                bd = shared_breakdown.setdefault(cat, {})
                bd[my_name or "You"] = bd.get(my_name or "You", 0) + amt
            else:
                my_spent[cat] = my_spent.get(cat, 0) + amt

        for pid in partner_ids:
            p_prefs = partner_prefs.get(pid, {})
            for cat, amt in per_user.get(pid, {}).items():
                pref = p_prefs.get(cat, "shared" if cat in shared_cats else "personal")
                if cat in shared_cats and pref == "shared":
                    shared_spent[cat] = shared_spent.get(cat, 0) + amt
                    bd = shared_breakdown.setdefault(cat, {})
                    bd[partner_name or "Partner"] = bd.get(partner_name or "Partner", 0) + amt
                else:
                    partner_spent[cat] = partner_spent.get(cat, 0) + amt

        all_acct_ids = list(session.exec(
            select(Account.id).where(Account.user_id.in_(household_user_ids))  # type: ignore[union-attr]
        ).all())
        my_acct_ids = list(session.exec(
            select(Account.id).where(Account.user_id == user.id)
        ).all())
        partner_acct_ids = list(session.exec(
            select(Account.id).where(Account.user_id.in_(partner_ids))  # type: ignore[union-attr]
        ).all()) if partner_ids else []

        pi, pb, ps = _build_section_items(my_budgets, my_spent, session, my_acct_ids, year, mo, user_ids=[user.id])
        pai, pab, pas_ = _build_section_items(partner_budgets, partner_spent, session, partner_acct_ids, year, mo, user_ids=partner_ids)
        si, sb, ss = _build_section_items(shared_budgets, shared_spent, session, all_acct_ids, year, mo, shared_breakdown, user_ids=household_user_ids)

        return {
            "month": m,
            "sections": {
                "personal": {"items": pi, "total_budgeted": pb, "total_spent": ps, "total_remaining": pb - ps},
                "partner": {"items": pai, "total_budgeted": pab, "total_spent": pas_, "total_remaining": pab - pas_},
                "shared": {"items": si, "total_budgeted": sb, "total_spent": ss, "total_remaining": sb - ss},
            },
            "items": pi + pai + si,
            "total_budgeted": pb + pab + sb,
            "total_spent": ps + pas_ + ss,
            "total_remaining": (pb + pab + sb) - (ps + pas_ + ss),
        }

    # Personal or partner scope, or no household
    user_account_ids = list(session.exec(
        select(Account.id).where(Account.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all())
    spent_by_cat = _get_spending_by_category(session, user_account_ids, user_ids, month_start, month_end)

    budgets = list(session.exec(
        select(Budget).where(
            Budget.user_id.in_(user_ids),  # type: ignore[union-attr]
            Budget.month == m,
            Budget.household_id == None,  # noqa: E711
        )
    ).all())

    # Include shared budgets for personal scope summary
    shared_budgets: list[Budget] = []
    if member:
        shared_budgets = list(session.exec(
            select(Budget).where(
                Budget.household_id == member.household_id,
                Budget.month == m,
            )
        ).all())

    items, total_budgeted, total_spent = _build_section_items(
        budgets, spent_by_cat, session, user_account_ids, year, mo, user_ids=user_ids
    )

    result: dict = {
        "month": m,
        "items": items,
        "total_budgeted": total_budgeted,
        "total_spent": total_spent,
        "total_remaining": total_budgeted - total_spent,
    }

    if shared_budgets:
        all_household_ids = [
            m2.user_id for m2 in session.exec(
                select(HouseholdMember).where(
                    HouseholdMember.household_id == member.household_id  # type: ignore[union-attr]
                )
            ).all()
        ]
        all_acct_ids = list(session.exec(
            select(Account.id).where(Account.user_id.in_(all_household_ids))  # type: ignore[union-attr]
        ).all())
        shared_spent = _get_spending_by_category(session, all_acct_ids, all_household_ids, month_start, month_end)
        si, sb, ss = _build_section_items(shared_budgets, shared_spent, session, all_acct_ids, year, mo, user_ids=all_household_ids)
        result["shared_summary"] = {
            "items": si,
            "total_budgeted": sb,
            "total_spent": ss,
            "total_remaining": sb - ss,
        }

    return result
