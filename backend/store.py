"""Shared helpers: settings, the active rate card and first-run setup."""
import json
import os

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import pricing
from auth import hash_password, log_activity
from db import BASE_DIR, Base, Quote, RateCard, SessionLocal, Setting, User, engine, iso

CARRIERS = ["DHL", "FDX", "UPS"]
CARRIER_NAMES = {"DHL": "DHL", "FDX": "FedEx", "UPS": "UPS"}
DEFAULT_SETTINGS = {
    "fuel_DHL": "0",
    "fuel_FDX": "0",
    "fuel_UPS": "0",
    "card_max_age_months": "12",
}
# Local copy of the confidential rate card, imported once into an empty database
SEED_FILE = os.getenv("SEED_RATE_CARD", os.path.join(BASE_DIR, "DATA EXTRACT Rev1.xlsx"))


# ----------------------------------------------------------------- settings
def get_settings(db: Session) -> dict[str, str]:
    values = dict(DEFAULT_SETTINGS)
    values.update({s.key: s.value for s in db.scalars(select(Setting))})
    return values


def fuel_rates(db: Session) -> dict[str, float]:
    s = get_settings(db)
    return {c: float(s[f"fuel_{c}"]) for c in CARRIERS}


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


# ----------------------------------------------------------------- active rate card
_cache: dict = {"id": None, "card": None}


def active_card(db: Session) -> tuple[RateCard, pricing.Card]:
    """The rate card in use. Parsed once and kept in memory until a different one is activated."""
    meta = db.scalar(select(RateCard).where(RateCard.is_active))
    if meta is None:
        raise HTTPException(status_code=503, detail="No rate card has been uploaded yet. Please ask an administrator.")
    if _cache["id"] != meta.id:
        _cache.update(id=meta.id, card=pricing.read_card(meta.content))
    return meta, _cache["card"]


def card_by_id(db: Session, card_id: int) -> pricing.Card:
    if _cache["id"] == card_id:
        return _cache["card"]
    row = db.get(RateCard, card_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Rate card not found")
    return pricing.read_card(row.content)


# ----------------------------------------------------------------- first run
def bootstrap() -> None:
    """Create tables, the first admin account and the first rate card. Safe to run every start."""
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)) is None:
            username = os.getenv("ADMIN_USERNAME", "admin").strip().lower()
            db.add(User(
                username=username,
                full_name=os.getenv("ADMIN_FULL_NAME", "Administrator"),
                password_hash=hash_password(os.getenv("ADMIN_PASSWORD", "admin123")),
                role="admin",
            ))
            log_activity(db, "system", "user_created", f"First admin account '{username}' created")

        if db.scalar(select(RateCard.id).limit(1)) is None and os.path.exists(SEED_FILE):
            with open(SEED_FILE, "rb") as f:
                content = f.read()
            card = pricing.read_card(content)
            db.add(RateCard(
                filename=os.path.basename(SEED_FILE),
                note="Initial import",
                content=content,
                countries=int(card.zones["CountryOption"].nunique()),
                mapping_rows=len(card.zones),
                rate_rows=len(card.rates),
                is_active=True,
            ))
            log_activity(db, "system", "rate_card_uploaded", f"Imported {os.path.basename(SEED_FILE)}")
        db.commit()


# ----------------------------------------------------------------- quotes
def quote_to_dict(q: Quote, full: bool = True) -> dict:
    """A saved quote as JSON. full=False leaves out the pieces and the full comparison."""
    data = {
        "id": q.id,
        "reference_no": q.reference_no,
        "created_at": iso(q.created_at),
        "staff_name": q.staff_name,
        "destination": q.destination,
        "total_pieces": q.total_pieces,
        "cbm": q.cbm,
        "actual_weight": q.actual_weight,
        "volumetric_weight": q.volumetric_weight,
        "chargeable_weight": q.chargeable_weight,
        "selected_service": q.selected_service,
        "selected_carrier": q.selected_carrier,
        "selected_total": q.selected_total,
        "cheapest_total": q.cheapest_total,
        "highest_total": q.highest_total,
        "customer_ref": q.customer_ref,
        "remarks": q.remarks,
    }
    if full:
        data["pieces"] = json.loads(q.pieces_json)
        data["results"] = json.loads(q.results_json)
    return data
