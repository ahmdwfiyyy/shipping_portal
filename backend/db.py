"""
Database models and session.

Locally this is an SQLite file (backend/data/portal.db). In production set DATABASE_URL to a
PostgreSQL database (e.g. Neon on Vercel) - serverless hosts do not keep files between requests.
"""
import os
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import NullPool

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _database_url() -> str:
    url = os.getenv("DATABASE_URL") or "sqlite:///" + os.path.join(BASE_DIR, "data", "portal.db")
    # Hosting providers hand out postgres:// or postgresql:// - SQLAlchemy needs the driver name
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")
if IS_SQLITE and ":memory:" not in DATABASE_URL:
    os.makedirs(os.path.dirname(DATABASE_URL.replace("sqlite:///", "")), exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    # Serverless instances come and go, so do not hold connections open between requests
    **({"poolclass": NullPool} if os.getenv("VERCEL") else {}),
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """SQLite gives back naive datetimes - they were stored as UTC, so label them as such."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def iso(value: Optional[datetime]) -> Optional[str]:
    value = as_utc(value)
    return value.isoformat() if value else None


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(10), default="staff")  # "admin" or "staff"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class RateCard(Base):
    """Every uploaded rate card is kept, so an admin can roll back. Only one is active."""

    __tablename__ = "rate_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    note: Mapped[str] = mapped_column(String(255), default="")
    effective_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    uploaded_by_name: Mapped[str] = mapped_column(String(100), default="System")
    content: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)  # loaded only when needed
    countries: Mapped[int] = mapped_column(Integer, default=0)
    mapping_rows: Mapped[int] = mapped_column(Integer, default=0)
    rate_rows: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class Quote(Base):
    """A rate comparison that staff submitted to the history (prices frozen at that moment)."""

    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_no: Mapped[Optional[str]] = mapped_column(String(30), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    staff_name: Mapped[str] = mapped_column(String(100))
    destination: Mapped[str] = mapped_column(String(150), index=True)
    pieces_json: Mapped[str] = mapped_column(Text)
    total_pieces: Mapped[int] = mapped_column(Integer)
    cbm: Mapped[float] = mapped_column(Float)
    actual_weight: Mapped[float] = mapped_column(Float)
    volumetric_weight: Mapped[float] = mapped_column(Float)
    chargeable_weight: Mapped[float] = mapped_column(Float)
    selected_service: Mapped[str] = mapped_column(String(100))
    selected_carrier: Mapped[str] = mapped_column(String(20), index=True)
    selected_total: Mapped[float] = mapped_column(Float)
    cheapest_total: Mapped[float] = mapped_column(Float)
    highest_total: Mapped[float] = mapped_column(Float)
    results_json: Mapped[str] = mapped_column(Text)  # the full comparison
    customer_ref: Mapped[str] = mapped_column(String(100), default="")
    remarks: Mapped[str] = mapped_column(Text, default="")
    rate_card_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rate_cards.id"), nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(255))


class Activity(Base):
    __tablename__ = "activity"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    username: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(50))
    detail: Mapped[str] = mapped_column(String(500), default="")


def get_db():
    """FastAPI dependency: one database session per request."""
    with SessionLocal() as db:
        yield db
