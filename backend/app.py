"""
Logistics Rate & Shipping Portal - FastAPI backend (international export rates from Malaysia).

Run locally:   uvicorn app:app --reload --port 8000
API docs:      http://localhost:8000/docs
"""
import io
import math
import os
import shutil
from typing import Optional
from datetime import datetime, timedelta, timezone

import jwt
import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel, Field

# ----------------------------------------------------------------- config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# The rate card is confidential, so it is git-ignored and must be placed next to app.py by hand
SEED_FILE = os.path.join(BASE_DIR, "DATA EXTRACT Rev1.xlsx")
# In production you can point RATES_FILE at a persistent disk, e.g. /data/rates.xlsx
RATES_FILE = os.getenv("RATES_FILE", SEED_FILE)
if not os.path.exists(RATES_FILE) and os.path.exists(SEED_FILE):  # fresh disk: copy the local rate card
    os.makedirs(os.path.dirname(RATES_FILE), exist_ok=True)
    shutil.copy(SEED_FILE, RATES_FILE)
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")  # set a real one via env var
ALGORITHM = "HS256"
TOKEN_HOURS = 8
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
SITE_PASSWORD = os.getenv("SITE_PASSWORD", "staff123")  # shared password for everyone allowed to use the site

MAPPING_SHEET = "COUNTRY MAPPING"
RATES_SHEET = "MASTER RATE"
REQUIRED_SHEETS = {
    MAPPING_SHEET: ["CountryOption", "Carrier", "ServiceKey", "ServiceName", "RateZone", "RateScope"],
    RATES_SHEET: ["ServiceKey", "ZoneCode", "RateScope", "Container", "RateType", "WeightFrom", "WeightTo", "RateMYR"],
}
PER_SHIPMENT = "per shipment"  # RateType values are compared in lower case
PER_KG = "per kg"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ADMIN_HASH = pwd_context.hash(ADMIN_PASSWORD)  # we only keep the hashes in memory
SITE_HASH = pwd_context.hash(SITE_PASSWORD)
bearer = HTTPBearer(auto_error=False)

app = FastAPI(title="Logistics Rate & Shipping Portal")

# 1. CORS - all headers and methods allowed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------- models
class LoginRequest(BaseModel):
    password: str


class CalculateRequest(BaseModel):
    destination: str
    length: float = Field(gt=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    actual_weight: float = Field(gt=0)


# ----------------------------------------------------------------- auth
def create_token(role: str) -> str:
    """role is 'user' (site password) or 'admin' (admin password)."""
    payload = {"sub": role, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    """Dependency: any logged-in person (staff or admin)."""
    if creds is None:
        raise HTTPException(status_code=401, detail="Please log in")
    try:
        return jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def verify_token(user: dict = Depends(verify_user)) -> dict:
    """Dependency that protects admin endpoints."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@app.post("/api/login")
def login(body: LoginRequest):
    # The admin password also works at the front door and gives admin rights
    if pwd_context.verify(body.password, ADMIN_HASH):
        role = "admin"
    elif pwd_context.verify(body.password, SITE_HASH):
        role = "user"
    else:
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": create_token(role), "role": role, "expires_in_hours": TOKEN_HOURS}


# ----------------------------------------------------------------- data helpers
def clean_code(value) -> str:
    """Zone codes can come out of Excel as 1, 1.0 or "1 " - make them all "1"."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


_cache: dict = {"mtime": None, "data": None}


def load_rates():
    """Read the rate card, re-reading it only when the file has changed."""
    try:
        mtime = os.path.getmtime(RATES_FILE)
    except OSError:
        raise HTTPException(status_code=500, detail="Rate card not found on server")
    if _cache["mtime"] == mtime:
        return _cache["data"]

    sheets = pd.read_excel(RATES_FILE, sheet_name=[MAPPING_SHEET, RATES_SHEET])
    zones, rates = sheets[MAPPING_SHEET], sheets[RATES_SHEET]
    for col in ["CountryOption", "Carrier", "ServiceKey", "ServiceName", "RateScope"]:
        zones[col] = zones[col].astype(str).str.strip()
    zones["RateZone"] = zones["RateZone"].map(clean_code)
    for col in ["ServiceKey", "RateScope", "Container"]:
        rates[col] = rates[col].astype(str).str.strip()
    rates["ZoneCode"] = rates["ZoneCode"].map(clean_code)
    rates["RateType"] = rates["RateType"].astype(str).str.strip().str.lower()
    rates = rates.dropna(subset=["WeightFrom", "WeightTo", "RateMYR"])

    _cache.update(mtime=mtime, data=(zones, rates))
    return zones, rates


def price_service(table: pd.DataFrame, chargeable: float):
    """Price one service/zone. Returns (billed_weight, rate_type, rate_per_kg, total) or None.

    - Up to the heaviest per-shipment row: use the first weight break at or above the
      chargeable weight (e.g. 7.2 kg is billed at the 7.5 kg price).
    - Above that: round up to a whole kg and multiply by the per-kg rate of the band it falls in.
    """
    w = round(chargeable, 6)  # avoid float noise such as 7.2000000001
    flat = table[table["RateType"] == PER_SHIPMENT]
    breaks = flat[flat["WeightTo"] >= w]
    if not breaks.empty:
        row = breaks.sort_values("WeightTo").iloc[0]
        return float(row["WeightTo"]), "per_shipment", None, round(float(row["RateMYR"]), 2)

    billed = float(math.ceil(w))
    bands = table[(table["RateType"] == PER_KG) & (table["WeightFrom"] <= billed)]
    if bands.empty:
        return None
    row = bands.sort_values("WeightFrom").iloc[-1]
    if billed > float(row["WeightTo"]):
        return None  # heavier than this service accepts
    per_kg = float(row["RateMYR"])
    return billed, "per_kg", per_kg, round(billed * per_kg, 2)


# ----------------------------------------------------------------- endpoints (login required)
@app.get("/api/destinations")
def destinations(_: dict = Depends(verify_user)):
    """Destinations for the search box, with how many services deliver there."""
    zones, _ = load_rates()
    counts = zones.groupby("CountryOption")["ServiceKey"].nunique()
    return {"destinations": [{"name": name, "services": int(n)} for name, n in sorted(counts.items())]}


@app.get("/api/rates-info")
def rates_info(_: dict = Depends(verify_user)):
    """Rate card summary shown in the page header and hero (last change + counts)."""
    zones, _ = load_rates()
    modified = datetime.fromtimestamp(os.path.getmtime(RATES_FILE), tz=timezone.utc)
    return {
        "last_updated": modified.isoformat(),
        "couriers": int(zones["Carrier"].nunique()),
        "services": int(zones["ServiceKey"].nunique()),
        "destinations": int(zones["CountryOption"].nunique()),
    }


@app.post("/api/calculate")
def calculate(body: CalculateRequest, _: dict = Depends(verify_user)):
    zones, rates = load_rates()

    # Sizes arrive in metres: m³ x 200 is the same as cm³ / 5000
    volumetric = body.length * body.width * body.height * 200
    chargeable = max(body.actual_weight, volumetric)

    matches = zones[zones["CountryOption"].str.lower() == body.destination.strip().lower()]
    if matches.empty:
        raise HTTPException(status_code=404, detail=f"No courier serves '{body.destination}'")

    results = []
    for _, m in matches.iterrows():
        table = rates[
            (rates["ServiceKey"] == m["ServiceKey"])
            & (rates["ZoneCode"] == m["RateZone"])
            & (rates["RateScope"] == m["RateScope"])
        ]
        priced = price_service(table, chargeable)
        if priced is None:
            continue
        billed, rate_type, per_kg, total = priced
        results.append({
            "courier": m["ServiceName"],
            "carrier": m["Carrier"],
            "service_key": m["ServiceKey"],
            "zone_code": m["RateZone"],
            "container": str(table["Container"].iloc[0]),
            "volumetric_weight": round(volumetric, 2),
            "chargeable_weight": round(chargeable, 2),
            "billed_weight": billed,
            "rate_type": rate_type,
            "rate_per_kg": per_kg,
            "total_cost": total,
            "is_cheapest": False,
        })

    if not results:
        raise HTTPException(status_code=404, detail="No rates found for this destination and weight")

    results.sort(key=lambda x: x["total_cost"])
    results[0]["is_cheapest"] = True
    return {"destination": body.destination, "results": results}


# ----------------------------------------------------------------- admin endpoint
@app.post("/api/upload-rates")
async def upload_rates(file: UploadFile = File(...), _: dict = Depends(verify_token)):
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx or .xls file")

    content = await file.read()
    try:
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the Excel file")

    # Validate BEFORE touching the existing rate card
    for sheet, columns in REQUIRED_SHEETS.items():
        if sheet not in sheets:
            raise HTTPException(status_code=400, detail=f"Missing required sheet: '{sheet}'")
        missing = [c for c in columns if c not in sheets[sheet].columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Sheet '{sheet}' is missing columns: {', '.join(missing)}")

    # Write in place (a Docker single-file bind mount can't be swapped out with rename)
    os.makedirs(os.path.dirname(RATES_FILE), exist_ok=True)
    with pd.ExcelWriter(RATES_FILE, engine="openpyxl") as writer:
        for sheet in REQUIRED_SHEETS:
            sheets[sheet].to_excel(writer, sheet_name=sheet, index=False)
    _cache["mtime"] = None  # make the next request re-read the new file

    return {"message": "Rate card updated successfully", "rows": {s: len(sheets[s]) for s in REQUIRED_SHEETS}}
