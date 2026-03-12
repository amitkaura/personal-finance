"""JWT helpers and FastAPI authentication dependency."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlmodel import Session, select

from app.config import get_settings
from app.database import get_session
from app.models import User

_ALGORITHM = "HS256"
_COOKIE_NAME = "session"
_EXPIRY_DAYS = 7


def create_jwt(user_id: int) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=_EXPIRY_DAYS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def _decode_jwt(token: str) -> int:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
        return int(payload["sub"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")


def get_current_user(
    session_token: Optional[str] = Cookie(None, alias=_COOKIE_NAME),
    db: Session = Depends(get_session),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = _decode_jwt(session_token)
    user = db.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
