"""Household invite, accept, decline, cancel, rename, leave, and scope tests."""

from decimal import Decimal
from unittest.mock import patch

from sqlmodel import select

from app.main import app
from app.auth import get_current_user
from app.models import (
    Budget,
    Goal,
    GoalAccountLink,
    GoalContribution,
    Household,
    HouseholdInvitation,
    HouseholdMember,
    SpendingPreference,
)
from tests.conftest import (
    add_household_member,
    link_goal_to_account,
    make_account,
    make_budget,
    make_contribution,
    make_goal,
    make_household,
    make_invitation,
    make_spending_preference,
    make_transaction,
    make_user,
)


# -- Get household ---------------------------------------------------------

def test_get_household_none(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/household")
    assert resp.status_code == 200
    assert resp.json() is None


def test_get_household_with_members(auth_client, session):
    client, user = auth_client
    make_household(session, user, name="Family")
    resp = client.get("/api/v1/household")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Family"
    assert len(data["members"]) == 1


# -- Invite ----------------------------------------------------------------

def test_invite_partner(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["invited_email"] == "partner@test.com"
    assert data["status"] == "pending"
    assert "token" in data


def test_invite_creates_household(auth_client, session):
    client, user = auth_client
    client.post("/api/v1/household/invite", json={"email": "partner@test.com"})

    resp = client.get("/api/v1/household")
    data = resp.json()
    assert data is not None
    assert len(data["members"]) == 1
    assert len(data["pending_invitations"]) == 1


def test_invite_self_rejected(auth_client, session):
    client, user = auth_client
    resp = client.post("/api/v1/household/invite", json={"email": user.email})
    assert resp.status_code == 400


def test_invite_duplicate_rejected(auth_client, session):
    client, user = auth_client
    client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
    resp = client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
    assert resp.status_code == 400


# -- Accept ----------------------------------------------------------------

def test_accept_invitation(auth_client, session):
    client, user = auth_client
    partner = make_user(session, email="partner@test.com")
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "partner@test.com")

    try:
        app.dependency_overrides[get_current_user] = lambda: partner
        resp = client.post(f"/api/v1/household/invitations/{inv.token}/accept")
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_accept_wrong_email_rejected(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "other@test.com")

    resp = client.post(f"/api/v1/household/invitations/{inv.token}/accept")
    assert resp.status_code == 403


def test_accept_nonexistent_token(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/household/invitations/fakefake/accept")
    assert resp.status_code == 404


# -- Decline ---------------------------------------------------------------

def test_decline_invitation(auth_client, session):
    client, user = auth_client
    partner = make_user(session, email="decliner@test.com")
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "decliner@test.com")

    try:
        app.dependency_overrides[get_current_user] = lambda: partner
        resp = client.post(f"/api/v1/household/invitations/{inv.token}/decline")
        assert resp.status_code == 200
        assert resp.json()["status"] == "declined"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


# -- Cancel ----------------------------------------------------------------

def test_cancel_invitation(auth_client, session):
    client, user = auth_client
    household = make_household(session, user)
    inv = make_invitation(session, household, user, "cancel@test.com")

    resp = client.delete(f"/api/v1/household/invitations/{inv.token}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_cancel_by_non_inviter_rejected(auth_client, session):
    client, user = auth_client
    other = make_user(session)
    household = make_household(session, other)
    inv = make_invitation(session, household, other, "someone@test.com")

    resp = client.delete(f"/api/v1/household/invitations/{inv.token}")
    assert resp.status_code == 403


# -- Rename ----------------------------------------------------------------

def test_rename_household(auth_client, session):
    client, user = auth_client
    make_household(session, user, name="Old Name")

    resp = client.patch("/api/v1/household", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_rename_empty_rejected(auth_client, session):
    client, user = auth_client
    make_household(session, user)

    resp = client.patch("/api/v1/household", json={"name": "   "})
    assert resp.status_code == 400


def test_rename_too_long_rejected(auth_client, session):
    client, user = auth_client
    make_household(session, user)

    resp = client.patch("/api/v1/household", json={"name": "X" * 101})
    assert resp.status_code == 400


def test_rename_not_in_household(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/household", json={"name": "Foo"})
    assert resp.status_code == 404


# -- Leave -----------------------------------------------------------------

def test_leave_household(auth_client, session):
    client, user = auth_client
    make_household(session, user)

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200
    assert resp.json()["status"] == "left"

    resp2 = client.get("/api/v1/household")
    assert resp2.json() is None


def test_leave_not_in_household(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 404


# -- Pending invitations ---------------------------------------------------

def test_get_pending_invitations(auth_client, session):
    client, user = auth_client
    inviter = make_user(session)
    household = make_household(session, inviter)
    make_invitation(session, household, inviter, user.email)

    resp = client.get("/api/v1/household/invitations/pending")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "pending"


def test_pending_invitation_prefers_display_name(auth_client, session):
    """Inviter's display_name and avatar_url should be shown when set."""
    client, user = auth_client
    inviter = make_user(
        session,
        display_name="Charlie",
        avatar_url="https://example.com/custom-avatar.png",
    )
    household = make_household(session, inviter)
    make_invitation(session, household, inviter, user.email)

    resp = client.get("/api/v1/household/invitations/pending")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["invited_by_name"] == "Charlie"
    assert data[0]["invited_by_picture"] == "https://example.com/custom-avatar.png"


def test_get_pending_invitations_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/household/invitations/pending")
    assert resp.status_code == 200
    assert resp.json() == []


# -- Scope (household data visibility) ------------------------------------

def test_household_scope_transactions(auth_client, session):
    client, user = auth_client
    partner = make_user(session, email="scopepartner@test.com")

    household = make_household(session, user)
    member = HouseholdMember(household_id=household.id, user_id=partner.id, role="member")
    session.add(member)
    session.commit()

    make_transaction(session, user, merchant="My Store")
    make_transaction(session, partner, merchant="Partner Store")

    resp_personal = client.get("/api/v1/transactions", params={"scope": "personal"})
    assert len(resp_personal.json()) == 1

    resp_household = client.get("/api/v1/transactions", params={"scope": "household"})
    assert len(resp_household.json()) == 2

    resp_partner = client.get("/api/v1/transactions", params={"scope": "partner"})
    assert len(resp_partner.json()) == 1
    assert resp_partner.json()[0]["merchant_name"] == "Partner Store"


# -- Invitation email ------------------------------------------------------

def test_invite_sends_email(auth_client, session):
    client, user = auth_client
    with patch("app.routes.household.send_invitation_email") as mock_send:
        resp = client.post("/api/v1/household/invite", json={"email": "partner@test.com"})
        assert resp.status_code == 200
        mock_send.assert_called_once_with(
            to_email="partner@test.com",
            inviter_name=user.display_name or user.name,
            inviter_email=user.email,
            household_name="Our Household",
        )


def test_invite_email_not_sent_on_failure(auth_client, session):
    client, user = auth_client
    with patch("app.routes.household.send_invitation_email") as mock_send:
        resp = client.post("/api/v1/household/invite", json={"email": user.email})
        assert resp.status_code == 400
        mock_send.assert_not_called()


# -- Leave: clone shared budgets -------------------------------------------

def test_leave_clones_shared_budgets_to_both_members(auth_client, session):
    """When a member leaves, shared budgets become personal copies for both."""
    client, owner = auth_client
    partner = make_user(session, email="partner-budget@test.com")
    household = make_household(session, owner)
    add_household_member(session, household, partner)

    make_budget(session, owner, category="Groceries", amount=Decimal("600"),
                month="2026-03", household_id=household.id)
    make_budget(session, owner, category="Rent", amount=Decimal("2000"),
                month="2026-03", household_id=household.id)

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    shared_remaining = session.exec(
        select(Budget).where(Budget.household_id == household.id)
    ).all()
    assert len(shared_remaining) == 0

    owner_budgets = session.exec(
        select(Budget).where(Budget.user_id == owner.id, Budget.household_id == None)  # noqa: E711
    ).all()
    partner_budgets = session.exec(
        select(Budget).where(Budget.user_id == partner.id, Budget.household_id == None)  # noqa: E711
    ).all()

    assert len(owner_budgets) == 2
    assert len(partner_budgets) == 2

    owner_cats = {b.category for b in owner_budgets}
    partner_cats = {b.category for b in partner_budgets}
    assert owner_cats == {"Groceries", "Rent"}
    assert partner_cats == {"Groceries", "Rent"}


# -- Leave: clone shared goals with contributions --------------------------

def test_leave_clones_shared_goals_with_contributions(auth_client, session):
    """Shared goals are cloned per-member with current_amount from own contributions."""
    client, owner = auth_client
    partner = make_user(session, email="partner-goal@test.com")
    household = make_household(session, owner)
    add_household_member(session, household, partner)

    goal = make_goal(session, owner, name="Vacation", target=Decimal("5000"),
                     current=Decimal("1500"), household_id=household.id)
    make_contribution(session, goal, owner, amount=Decimal("1000"))
    make_contribution(session, goal, partner, amount=Decimal("500"))

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    shared_remaining = session.exec(
        select(Goal).where(Goal.household_id == household.id)
    ).all()
    assert len(shared_remaining) == 0

    owner_goals = session.exec(
        select(Goal).where(Goal.user_id == owner.id, Goal.household_id == None)  # noqa: E711
    ).all()
    partner_goals = session.exec(
        select(Goal).where(Goal.user_id == partner.id, Goal.household_id == None)  # noqa: E711
    ).all()

    assert len(owner_goals) == 1
    assert len(partner_goals) == 1
    assert owner_goals[0].name == "Vacation"
    assert owner_goals[0].target_amount == Decimal("5000")
    assert owner_goals[0].current_amount == Decimal("1000")
    assert partner_goals[0].current_amount == Decimal("500")


# -- Leave: account links assigned to correct copy -------------------------

def test_leave_assigns_account_links_to_correct_copy(auth_client, session):
    """GoalAccountLinks go to the copy whose owner matches the account owner."""
    client, owner = auth_client
    partner = make_user(session, email="partner-link@test.com")
    household = make_household(session, owner)
    add_household_member(session, household, partner)

    owner_acct = make_account(session, owner, name="Owner Savings")
    partner_acct = make_account(session, partner, name="Partner Savings")

    goal = make_goal(session, owner, name="House", target=Decimal("50000"),
                     household_id=household.id)
    link_goal_to_account(session, goal, owner_acct)
    link_goal_to_account(session, goal, partner_acct)

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    owner_goal = session.exec(
        select(Goal).where(Goal.user_id == owner.id, Goal.household_id == None)  # noqa: E711
    ).first()
    partner_goal = session.exec(
        select(Goal).where(Goal.user_id == partner.id, Goal.household_id == None)  # noqa: E711
    ).first()

    owner_links = session.exec(
        select(GoalAccountLink).where(GoalAccountLink.goal_id == owner_goal.id)
    ).all()
    partner_links = session.exec(
        select(GoalAccountLink).where(GoalAccountLink.goal_id == partner_goal.id)
    ).all()

    assert len(owner_links) == 1
    assert owner_links[0].account_id == owner_acct.id
    assert len(partner_links) == 1
    assert partner_links[0].account_id == partner_acct.id


# -- Leave: spending preferences reset ------------------------------------

def test_leave_resets_spending_preferences(auth_client, session):
    """Spending preferences set to 'shared' become 'personal' for both members."""
    client, owner = auth_client
    partner = make_user(session, email="partner-pref@test.com")
    household = make_household(session, owner)
    add_household_member(session, household, partner)

    make_spending_preference(session, owner, category="Groceries", target="shared")
    make_spending_preference(session, owner, category="Rent", target="personal")
    make_spending_preference(session, partner, category="Groceries", target="shared")

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    all_prefs = session.exec(select(SpendingPreference)).all()
    assert all(p.target == "personal" for p in all_prefs)


# -- Leave: pending invitations cancelled ----------------------------------

def test_leave_cancels_pending_invitations(auth_client, session):
    """All pending invitations for the household are cancelled on leave."""
    client, owner = auth_client
    partner = make_user(session, email="partner-inv@test.com")
    household = make_household(session, owner)
    add_household_member(session, household, partner)

    inv = make_invitation(session, household, owner, "newperson@test.com")
    assert inv.status == "pending"

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    session.refresh(inv)
    assert inv.status == "cancelled"


# -- Leave: household preserved for remaining member ----------------------

def test_leave_keeps_household_for_remaining_member(auth_client, session):
    """The household is not deleted when the other member stays."""
    client, owner = auth_client
    partner = make_user(session, email="partner-keep@test.com")
    household = make_household(session, owner)
    add_household_member(session, household, partner)

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    h = session.get(Household, household.id)
    assert h is not None

    remaining = session.exec(
        select(HouseholdMember).where(HouseholdMember.household_id == household.id)
    ).all()
    assert len(remaining) == 1
    assert remaining[0].user_id == partner.id


# -- Leave: last member deletes household ---------------------------------

def test_leave_last_member_deletes_household(auth_client, session):
    """When the last member leaves, the household and all data are deleted."""
    client, owner = auth_client
    household = make_household(session, owner)

    make_budget(session, owner, category="Food", household_id=household.id)
    goal = make_goal(session, owner, name="Trip", household_id=household.id)
    make_contribution(session, goal, owner, amount=Decimal("200"))
    owner_acct = make_account(session, owner, name="Savings")
    link_goal_to_account(session, goal, owner_acct)
    make_invitation(session, household, owner, "ghost@test.com")

    resp = client.delete("/api/v1/household/leave")
    assert resp.status_code == 200

    assert session.get(Household, household.id) is None
    assert len(session.exec(select(Budget).where(Budget.household_id == household.id)).all()) == 0
    assert len(session.exec(select(Goal).where(Goal.household_id == household.id)).all()) == 0
    assert len(session.exec(select(GoalAccountLink).where(GoalAccountLink.goal_id == goal.id)).all()) == 0
    assert len(session.exec(select(GoalContribution).where(GoalContribution.goal_id == goal.id)).all()) == 0
    assert len(session.exec(select(HouseholdInvitation).where(HouseholdInvitation.household_id == household.id)).all()) == 0
