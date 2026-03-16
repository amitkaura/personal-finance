"""Authentication routes – Google OAuth login, session check, logout."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from sqlmodel import Session, select

logger = logging.getLogger(__name__)

from app.auth import create_jwt, get_current_user
from app.config import get_settings
from app.database import get_session
from app.models import Household, HouseholdMember, HouseholdSyncConfig, User, UserSettings

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "session"


class GoogleLoginBody(BaseModel):
    id_token: str


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.display_name or u.name,
        "picture": u.avatar_url or u.picture,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
        "bio": u.bio,
        "google_name": u.google_name or u.name,
        "google_picture": u.google_picture or u.picture,
    }


@router.post("/google")
def google_login(body: GoogleLoginBody, db: Session = Depends(get_session)):
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            body.id_token,
            GoogleRequest(),
            settings.google_client_id,
        )
    except Exception:
        logger.exception("Google token verification failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    google_id = idinfo["sub"]
    email = idinfo.get("email", "")
    name = idinfo.get("name", "")
    picture = idinfo.get("picture")

    user = db.exec(select(User).where(User.google_id == google_id)).first()
    if user:
        user.email = email
        user.google_name = name
        user.google_picture = picture
        if not user.display_name:
            user.name = name
        if not user.avatar_url:
            user.picture = picture
        db.add(user)
    else:
        # #region agent log
        import json as _json, time as _time
        _lp = "/Users/fds45740/dev/personal-finance/.cursor/debug-711b60.log"
        def _d(m, d=None, h=""):
            print(f"[DEBUG-711b60] {m} | {d}")
            try:
                with open(_lp,"a") as f: f.write(_json.dumps({"sessionId":"711b60","location":"auth.py:google_login","message":m,"data":d or {},"timestamp":int(_time.time()*1000),"hypothesisId":h})+"\n")
            except Exception: pass
        _d("new user: creating User", {"email": email}, h="H6")
        # #endregion
        user = User(
            google_id=google_id, email=email, name=name, picture=picture,
            google_name=name, google_picture=picture,
        )
        db.add(user)
        db.flush()
        # #region agent log
        _d("new user: User flushed, creating Household", {"user_id": user.id}, h="H6")
        # #endregion
        db.add(UserSettings(user_id=user.id))
        household = Household(name=f"{name}'s Household")
        db.add(household)
        # #region agent log
        _d("new user: about to flush Household", h="H6")
        # #endregion
        try:
            db.flush()
        except Exception as e:
            # #region agent log
            _d("new user: Household flush FAILED", {"error": str(e), "type": type(e).__name__}, h="H6")
            # #endregion
            raise
        # #region agent log
        _d("new user: Household flushed OK", {"household_id": household.id}, h="H6")
        # #endregion
        db.add(HouseholdMember(household_id=household.id, user_id=user.id, role="owner"))
        db.add(HouseholdSyncConfig(household_id=household.id))
    # #region agent log
    try:
        import json as _json2, time as _time2
        print(f"[DEBUG-711b60] about to commit | None")
    except Exception: pass
    # #endregion
    db.commit()
    # #region agent log
    try:
        print(f"[DEBUG-711b60] commit done, refreshing user | None")
    except Exception: pass
    # #endregion
    db.refresh(user)

    token = create_jwt(user.id)
    secure_cookie = settings.secure_cookies and not settings.debug
    resp = JSONResponse(content=_user_dict(user))
    resp.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=secure_cookie,
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    return resp


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    settings = get_settings()
    data = _user_dict(user)
    data["is_admin"] = bool(settings.admin_email and user.email == settings.admin_email)
    return data


@router.post("/logout")
def logout(_user: User = Depends(get_current_user)):
    settings = get_settings()
    secure_cookie = settings.secure_cookies and not settings.debug
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(
        key=_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
    )
    return resp
