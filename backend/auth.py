"""Accounts, login tokens and role checks."""
import os
import time
from datetime import timedelta
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from db import Activity, User, get_db, utcnow

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")  # set a real one via env var
ALGORITHM = "HS256"
TOKEN_HOURS = 8
MIN_PASSWORD_LENGTH = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def check_password_rules(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "name": user.full_name,
        "exp": utcnow() + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: any signed-in, active account. Checked against the database on every request,
    so a deactivated account loses access straight away."""
    if creds is None:
        raise HTTPException(status_code=401, detail="Please log in")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.get(User, int(payload.get("sub", 0)))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="This account is no longer active")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def log_activity(db: Session, username: str, action: str, detail: str = "") -> None:
    """Add an entry to the activity log (committed together with the caller's changes)."""
    db.add(Activity(username=username, action=action, detail=detail[:500]))


# ----------------------------------------------------------------- brute-force protection
# Kept in memory: good enough for one server; on serverless each instance counts separately.
MAX_FAILURES = 5
LOCK_SECONDS = 5 * 60
_failures: dict[str, list[float]] = {}


def check_not_locked(username: str) -> None:
    recent = [t for t in _failures.get(username, []) if time.time() - t < LOCK_SECONDS]
    _failures[username] = recent
    if len(recent) >= MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please wait 5 minutes and try again.")


def record_failure(username: str) -> None:
    _failures.setdefault(username, []).append(time.time())


def clear_failures(username: str) -> None:
    _failures.pop(username, None)
