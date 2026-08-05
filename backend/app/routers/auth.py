import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth import COOKIE_NAME, SESSION_DAYS, create_session, find_login, hash_password, require_user, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class LoginBody(BaseModel):
    login: str
    password: str


class RegisterBody(BaseModel):
    email: str
    password: str


def public_user(user: User) -> dict:
    return {"id": user.id, "username": user.username, "email": user.email}


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_DAYS * 86400,
        httponly=True, samesite="strict", secure=False, path="/connect-hub",
    )


@router.post("/register")
async def register(body: RegisterBody, response: Response, db: AsyncSession = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "некорректный email")
    if len(body.password) < 6:
        raise HTTPException(400, "пароль должен содержать минимум 6 символов")
    exists = await db.execute(select(User).where(User.email == email))
    if exists.scalar_one_or_none():
        raise HTTPException(409, "пользователь уже существует")
    user = User(username=email, email=email, password_hash=hash_password(body.password))
    db.add(user)
    await db.flush()
    token = create_session(user)
    await db.commit()
    set_session_cookie(response, token)
    return public_user(user)


@router.post("/login")
async def login(body: LoginBody, response: Response, db: AsyncSession = Depends(get_db)):
    user = await find_login(db, body.login)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "неверный логин или пароль")
    token = create_session(user)
    await db.commit()
    set_session_cookie(response, token)
    return public_user(user)


@router.post("/logout")
async def logout(response: Response, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    user.session_hash = None
    user.session_expires_at = None
    await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/connect-hub")
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(require_user)):
    return public_user(user)
