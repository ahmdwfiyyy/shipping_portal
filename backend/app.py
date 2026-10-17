"""
Logistics Rate & Shipping Portal - FastAPI backend.

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
SEED_FILE = os.path.join(BASE_DIR, "rates.xlsx")  # the rate card shipped with the code
# In production you can point RATES_FILE at a persistent disk, e.g. /data/rates.xlsx
RATES_FILE = os.getenv("RATES_FILE", SEED_FILE)
if not os.path.exists(RATES_FILE):  # first start on a fresh disk: copy the shipped rate card
    os.makedirs(os.path.dirname(RATES_FILE), exist_ok=True)
    shutil.copy(SEED_FILE, RATES_FILE)
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")  # set a real one via env var
ALGORITHM = "HS256"
TOKEN_HOURS = 8
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
SITE_PASSWORD = os.getenv("SITE_PASSWORD", "staff123")  # shared password for everyone allowed to use the site

REQUIRED_SHEETS = {
    "Zone_Mapping": ["Courier", "Destination", "Zone Code"],
    "Rates": ["Courier", "Zone Code", "Base Weight (kg)", "Base Price (MYR)", "Incremental Price per 0.5kg"],
}

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
def load_rates():
    try:
        sheets = pd.read_excel(RATES_FILE, sheet_name=["Zone_Mapping", "Rates"])
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="rates.xlsx not found on server")
    zones, rates = sheets["Zone_Mapping"], sheets["Rates"]
    for df in (zones, rates):
        df["Courier"] = df["Courier"].astype(str).str.strip()
        df["Zone Code"] = df["Zone Code"].astype(str).str.strip()
    zones["Destination"] = zones["Destination"].astype(str).str.strip()
    return zones, rates


# ----------------------------------------------------------------- endpoints (login required)
@app.get("/api/destinations")
def destinations(_: dict = Depends(verify_user)):
    """List of destinations (for the dropdown on the calculator form)."""
    zones, _ = load_rates()
    return {"destinations": sorted(zones["Destination"].unique().tolist())}


@app.get("/api/rates-info")
def rates_info(_: dict = Depends(verify_user)):
    """Rate card summary shown in the page header and hero (last change + counts)."""
    zones, rates = load_rates()
    modified = datetime.fromtimestamp(os.path.getmtime(RATES_FILE), tz=timezone.utc)
    return {
        "last_updated": modified.isoformat(),
        "couriers": int(rates["Courier"].nunique()),
        "zones": int(rates["Zone Code"].nunique()),
        "destinations": int(zones["Destination"].nunique()),
    }


@app.post("/api/calculate")
def calculate(body: CalculateRequest, _: dict = Depends(verify_user)):
    zones, rates = load_rates()

    volumetric = (body.length * body.width * body.height) / 5000
    chargeable = max(body.actual_weight, volumetric)

    matches = zones[zones["Destination"].str.lower() == body.destination.strip().lower()]
    if matches.empty:
        raise HTTPException(status_code=404, detail=f"No courier serves '{body.destination}'")

    results = []
    for _, m in matches.iterrows():
        row = rates[(rates["Courier"] == m["Courier"]) & (rates["Zone Code"] == m["Zone Code"])]
        if row.empty:
            continue
        r = row.iloc[0]
        base_w = float(r["Base Weight (kg)"])
        base_p = float(r["Base Price (MYR)"])
        inc_p = float(r["Incremental Price per 0.5kg"])

        # round() avoids float noise such as 0.5000000001 creating an extra step
        steps = math.ceil(round(max(0.0, chargeable - base_w) / 0.5, 6))
        results.append({
            "courier": m["Courier"],
            "zone_code": m["Zone Code"],
            "volumetric_weight": round(volumetric, 2),
            "chargeable_weight": round(chargeable, 2),
            "incremental_steps": steps,
            "total_cost": round(base_p + steps * inc_p, 2),
            "is_cheapest": False,
        })

    if not results:
        raise HTTPException(status_code=404, detail="No rates found for this destination")

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

    # Validate BEFORE touching the existing rates.xlsx
    for sheet, columns in REQUIRED_SHEETS.items():
        if sheet not in sheets:
            raise HTTPException(status_code=400, detail=f"Missing required sheet: '{sheet}'")
        missing = [c for c in columns if c not in sheets[sheet].columns]
        if missing:
            raise HTTPException(status_code=400, detail=f"Sheet '{sheet}' is missing columns: {', '.join(missing)}")

    # Write in place (a Docker single-file bind mount can't be swapped out with rename)
    with pd.ExcelWriter(RATES_FILE, engine="openpyxl") as writer:
        for sheet in REQUIRED_SHEETS:
            sheets[sheet].to_excel(writer, sheet_name=sheet, index=False)

    return {"message": "Rate card updated successfully", "rows": {s: len(sheets[s]) for s in REQUIRED_SHEETS}}
