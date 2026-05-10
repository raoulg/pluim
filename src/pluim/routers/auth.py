import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pluim.config import settings
from pluim.database import get_db
from pluim.deps import get_current_user
from pluim.models import User
from pluim.schemas import UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


def create_jwt(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


@router.get("/login")
async def login(response: Response):
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": f"{settings.frontend_url.rstrip('/')}/api/auth/callback",
        "scope": "read:user user:email",
        "state": state,
    }
    url = GITHUB_AUTHORIZE_URL + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    redirect = RedirectResponse(url=url)
    redirect.set_cookie("oauth_state", state, httponly=True, max_age=600, samesite="lax")
    return redirect


@router.get("/callback")
async def callback(
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not oauth_state or oauth_state != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get GitHub token")

        user_resp = await client.get(
            GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        gh_user = user_resp.json()

    github_id = gh_user.get("id")
    github_username = gh_user.get("login")
    github_avatar_url = gh_user.get("avatar_url", "")
    github_email = gh_user.get("email")

    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    is_initial_admin = github_username in settings.initial_admins

    if not user:
        user = User(
            github_id=github_id,
            github_username=github_username,
            github_avatar_url=github_avatar_url,
            github_email=github_email,
            is_admin=is_initial_admin,
        )
        db.add(user)
    else:
        user.github_username = github_username
        user.github_avatar_url = github_avatar_url
        user.github_email = github_email
        if is_initial_admin and not user.is_admin:
            user.is_admin = True

    await db.commit()
    await db.refresh(user)

    token = create_jwt(user.id)
    redirect = RedirectResponse(url=f"{settings.frontend_url}/auth/callback?token={token}")
    redirect.delete_cookie("oauth_state")
    return redirect


@router.get("/config")
async def config():
    return {"dev_mode": settings.dev_mode}


@router.post("/dev-login")
async def dev_login(db: AsyncSession = Depends(get_db)):
    if not settings.dev_mode:
        raise HTTPException(status_code=404, detail="Not found")

    username = settings.dev_admin_username
    result = await db.execute(select(User).where(User.github_username == username))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            github_id=-1,
            github_username=username,
            github_avatar_url=f"https://avatars.githubusercontent.com/u/0?v=4",
            github_email=None,
            is_admin=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_jwt(user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/dev-login-user")
async def dev_login_user(db: AsyncSession = Depends(get_db)):
    if not settings.dev_mode:
        raise HTTPException(status_code=404, detail="Not found")

    username = settings.dev_user_username
    result = await db.execute(select(User).where(User.github_username == username))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            github_id=-2,
            github_username=username,
            github_avatar_url=f"https://avatars.githubusercontent.com/u/0?v=4",
            github_email=None,
            is_admin=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_jwt(user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
