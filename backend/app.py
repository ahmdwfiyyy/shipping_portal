"""
Logistics Rate & Shipping Portal - FastAPI backend (international export rates from Malaysia).

Run locally:   uvicorn app:app --reload --port 8000
API docs:      http://localhost:8000/docs

Staff: compare rates and submit a comparison to the history.
Admin: everything staff can do, plus the dashboard, history, rate cards, users and settings (admin.py).
"""
import json
from contextlib import asynccontextmanager
from typing import Annotated, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import pricing
import store
from admin import router as admin_router
from auth import (
    TOKEN_HOURS,
    check_not_locked,
    check_password_rules,
    clear_failures,
    create_token,
    current_user,
    hash_password,
    log_activity,
    record_failure,
    verify_password,
)
from db import Quote, User, get_db, iso, utcnow


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.bootstrap()
    yield


app = FastAPI(title="Logistics Rate & Shipping Portal", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(admin_router)


# ----------------------------------------------------------------- request bodies
class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class Piece(BaseModel):
    length: float = Field(gt=0, le=20)  # metres
    width: float = Field(gt=0, le=20)
    height: float = Field(gt=0, le=20)
    weight: float = Field(gt=0, le=20000)  # kg, per piece
    quantity: int = Field(default=1, ge=1, le=999)


FuelPercent = Annotated[float, Field(ge=0, le=100)]


class CalculateRequest(BaseModel):
    destination: str = Field(min_length=1, max_length=150)
    pieces: list[Piece] = Field(min_length=1, max_length=50)
    # Fuel surcharge % per carrier chosen in the calculator; carriers left out use the admin's default
    fuel: Optional[dict[Literal["DHL", "FDX", "UPS"], FuelPercent]] = None


class SubmitQuoteRequest(CalculateRequest):
    service_key: str
    customer_ref: str = Field(default="", max_length=100)
    remarks: str = Field(default="", max_length=1000)


# ----------------------------------------------------------------- account
def user_to_dict(user: User) -> dict:
    return {"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role}


@app.post("/api/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    check_not_locked(username)
    user = db.scalar(select(User).where(func.lower(User.username) == username))
    if user is None or not verify_password(body.password, user.password_hash):
        record_failure(username)
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated. Please contact your administrator.")

    clear_failures(username)
    user.last_login_at = utcnow()
    log_activity(db, user.username, "login")
    db.commit()
    return {"token": create_token(user), "user": user_to_dict(user), "expires_in_hours": TOKEN_HOURS}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user_to_dict(user)


@app.post("/api/me/password")
def change_password(body: ChangePasswordRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is incorrect")
    check_password_rules(body.new_password)
    user.password_hash = hash_password(body.new_password)
    log_activity(db, user.username, "password_changed")
    db.commit()
    return {"message": "Password updated"}


# ----------------------------------------------------------------- rates (any signed-in user)
@app.get("/api/destinations")
def destinations(_: User = Depends(current_user), db: Session = Depends(get_db)):
    """Destinations for the search box, with how many services deliver there."""
    _, card = store.active_card(db)
    return {"destinations": pricing.destinations(card)}


@app.get("/api/rates-info")
def rates_info(_: User = Depends(current_user), db: Session = Depends(get_db)):
    """Rate card summary shown in the page header and hero."""
    meta, card = store.active_card(db)
    return {
        "last_updated": iso(meta.effective_date),
        "couriers": int(card.zones["Carrier"].nunique()),
        "services": int(card.zones["ServiceKey"].nunique()),
        "destinations": int(card.zones["CountryOption"].nunique()),
        "fuel": store.fuel_rates(db),
    }


def run_comparison(db: Session, body: CalculateRequest):
    meta, card = store.active_card(db)
    pieces = [p.model_dump() for p in body.pieces]
    summary = pricing.shipment_weights(pieces)
    zones = card.zones
    if zones[zones["CountryOption"].str.lower() == body.destination.strip().lower()].empty:
        raise HTTPException(status_code=404, detail=f"No courier serves '{body.destination}'")
    fuel = {**store.fuel_rates(db), **(body.fuel or {})}
    results = pricing.compare(card, body.destination, summary["chargeable_weight"], fuel)
    if not results:
        raise HTTPException(status_code=404, detail="No service can carry this weight to the destination")
    return meta, pieces, summary, results


@app.post("/api/calculate")
def calculate(body: CalculateRequest, _: User = Depends(current_user), db: Session = Depends(get_db)):
    _, _, summary, results = run_comparison(db, body)
    return {"destination": body.destination, "summary": summary, "results": results}


@app.post("/api/quotes")
def submit_quote(body: SubmitQuoteRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Save a comparison to the history. Prices are worked out again here, so they cannot be edited
    in the browser, and they are frozen - later rate card changes do not alter saved quotes."""
    meta, pieces, summary, results = run_comparison(db, body)
    chosen = next((r for r in results if r["service_key"] == body.service_key), None)
    if chosen is None:
        raise HTTPException(status_code=400, detail="The selected service is not available for this shipment")

    quote = Quote(
        user_id=user.id,
        staff_name=user.full_name,
        destination=body.destination.strip(),
        pieces_json=json.dumps(pieces),
        total_pieces=summary["pieces"],
        cbm=summary["cbm"],
        actual_weight=summary["actual_weight"],
        volumetric_weight=summary["volumetric_weight"],
        chargeable_weight=summary["chargeable_weight"],
        selected_service=chosen["courier"],
        selected_carrier=chosen["carrier"],
        selected_total=chosen["total_cost"],
        cheapest_total=results[0]["total_cost"],
        highest_total=results[-1]["total_cost"],
        results_json=json.dumps(results),
        customer_ref=body.customer_ref.strip(),
        remarks=body.remarks.strip(),
        rate_card_id=meta.id,
    )
    db.add(quote)
    db.flush()  # gives the quote its id
    quote.reference_no = f"QT-{quote.created_at:%Y%m%d}-{quote.id:05d}"
    log_activity(db, user.username, "quote_submitted",
                 f"{quote.reference_no}: {quote.destination}, {chosen['courier']} RM {chosen['total_cost']:.2f}")
    db.commit()
    return store.quote_to_dict(quote)
