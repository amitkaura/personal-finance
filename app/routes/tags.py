"""Tag endpoints – custom labels for transactions."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.household import get_scoped_user_ids
from app.models import Account, Tag, Transaction, TransactionTag, User

router = APIRouter(prefix="/tags", tags=["tags"])


def _check_txn_access(txn: Transaction, session: Session, user: User) -> None:
    """Raise 404 if the user cannot access this transaction (direct or household)."""
    allowed = set(get_scoped_user_ids(session, user, "household"))
    owner_id: int | None = None
    if txn.account_id:
        acct = session.get(Account, txn.account_id)
        if acct:
            owner_id = acct.user_id
    if owner_id is None:
        owner_id = txn.user_id
    if owner_id not in allowed:
        raise HTTPException(status_code=404, detail="Transaction not found")


class TagCreate(BaseModel):
    name: str
    color: str = "#6d28d9"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


def _tag_to_dict(t: Tag) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "color": t.color,
    }


@router.get("")
def list_tags(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tags = session.exec(
        select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)
    ).all()
    return [_tag_to_dict(t) for t in tags]


@router.post("", status_code=201)
def create_tag(
    body: TagCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    existing = session.exec(
        select(Tag).where(Tag.user_id == user.id, Tag.name == body.name)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag already exists")
    tag = Tag(user_id=user.id, name=body.name, color=body.color)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return _tag_to_dict(tag)


@router.patch("/{tag_id}")
def update_tag(
    tag_id: int,
    body: TagUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tag = session.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")
    if body.name is not None:
        tag.name = body.name
    if body.color is not None:
        tag.color = body.color
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return _tag_to_dict(tag)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tag = session.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")
    links = session.exec(
        select(TransactionTag).where(TransactionTag.tag_id == tag_id)
    ).all()
    for link in links:
        session.delete(link)
    session.delete(tag)
    session.commit()


@router.post("/transactions/{transaction_id}/tags/{tag_id}", status_code=201)
def add_tag_to_transaction(
    transaction_id: int,
    tag_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tag = session.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")

    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _check_txn_access(txn, session, user)

    existing = session.exec(
        select(TransactionTag).where(
            TransactionTag.transaction_id == transaction_id,
            TransactionTag.tag_id == tag_id,
        )
    ).first()
    if existing:
        return {"status": "already_tagged"}

    link = TransactionTag(transaction_id=transaction_id, tag_id=tag_id)
    session.add(link)
    session.commit()
    return {"status": "tagged"}


@router.delete("/transactions/{transaction_id}/tags/{tag_id}", status_code=204)
def remove_tag_from_transaction(
    transaction_id: int,
    tag_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tag = session.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(status_code=404, detail="Tag not found")

    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _check_txn_access(txn, session, user)

    link = session.exec(
        select(TransactionTag).where(
            TransactionTag.transaction_id == transaction_id,
            TransactionTag.tag_id == tag_id,
        )
    ).first()
    if link:
        session.delete(link)
        session.commit()


@router.get("/transactions/{transaction_id}")
def get_transaction_tags(
    transaction_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    txn = session.get(Transaction, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _check_txn_access(txn, session, user)

    links = session.exec(
        select(TransactionTag).where(TransactionTag.transaction_id == transaction_id)
    ).all()
    tags = []
    for link in links:
        tag = session.get(Tag, link.tag_id)
        if tag and tag.user_id == user.id:
            tags.append(_tag_to_dict(tag))
    return tags
