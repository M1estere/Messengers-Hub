import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User

COOKIE_NAME = "connect_hub_session"
SESSION_DAYS = 30
PBKDF2_ITERATIONS = 310_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(actual.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def session_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user: User) -> str:
    token = secrets.token_urlsafe(48)
    user.session_hash = session_hash(token)
    user.session_expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    return token


async def require_user(
    connect_hub_session: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not connect_hub_session:
        raise HTTPException(401, "требуется авторизация")
    result = await db.execute(
        select(User).where(User.session_hash == session_hash(connect_hub_session))
    )
    user = result.scalar_one_or_none()
    if not user or not user.session_expires_at or user.session_expires_at < datetime.utcnow():
        raise HTTPException(401, "сессия истекла")
    return user


async def find_login(db: AsyncSession, login: str) -> User | None:
    normalized = login.strip().lower()
    result = await db.execute(
        select(User).where(or_(User.username == normalized, User.email == normalized))
    )
    return result.scalar_one_or_none()
