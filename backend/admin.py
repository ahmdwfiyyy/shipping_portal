"""Admin-only endpoints: dashboard, history, rate cards, users, settings and the activity log."""
import io
import math
import os
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

import pricing
import store
from auth import check_password_rules, hash_password, log_activity, require_admin
from db import Activity, Quote, RateCard, User, as_utc, get_db, iso, utcnow

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Dates typed by the admin and the dashboard's days are in local time (Malaysia has no daylight saving)
LOCAL_TZ = timezone(timedelta(hours=float(os.getenv("TZ_OFFSET_HOURS", "8"))))
MAX_UPLOAD_BYTES = 4 * 1024 * 1024  # Vercel functions accept request bodies up to 4.5 MB
PRICE_RANGES = [(0, 100), (100, 250), (250, 500), (500, 1000), (1000, 2500), (2500, None)]


# ----------------------------------------------------------------- helpers
def local_day_start(d: date) -> datetime:
    """Midnight local time on day d, expressed in UTC (how times are stored)."""
    return datetime.combine(d, time.min, tzinfo=LOCAL_TZ).astimezone(timezone.utc)


def to_local(dt: datetime) -> datetime:
    return as_utc(dt).astimezone(LOCAL_TZ)


def quote_filters(stmt, q: Optional[str], date_from: Optional[date], date_to: Optional[date],
                  carrier: Optional[str], staff: Optional[str]):
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            func.lower(Quote.reference_no).like(like),
            func.lower(Quote.destination).like(like),
            func.lower(Quote.staff_name).like(like),
            func.lower(Quote.customer_ref).like(like),
            func.lower(Quote.remarks).like(like),
        ))
    if date_from:
        stmt = stmt.where(Quote.created_at >= local_day_start(date_from))
    if date_to:
        stmt = stmt.where(Quote.created_at < local_day_start(date_to + timedelta(days=1)))
    if carrier:
        stmt = stmt.where(Quote.selected_carrier == carrier)
    if staff:
        stmt = stmt.where(Quote.staff_name == staff)
    return stmt


# ----------------------------------------------------------------- history
@router.get("/quotes")
def list_quotes(
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    carrier: Optional[str] = None,
    staff: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    base = quote_filters(select(Quote), q, date_from, date_to, carrier, staff)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(Quote.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    staff_names = db.scalars(select(Quote.staff_name).distinct().order_by(Quote.staff_name)).all()
    return {
        "items": [store.quote_to_dict(r, full=False) for r in rows],
        "total": total,
        "page": page,
        "pages": max(1, math.ceil(total / page_size)),
        "staff_options": staff_names,
    }


@router.get("/quotes/export")
def export_quotes(
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    carrier: Optional[str] = None,
    staff: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """The filtered history as an Excel file."""
    rows = db.scalars(quote_filters(select(Quote), q, date_from, date_to, carrier, staff).order_by(Quote.created_at.desc()))
    wb = Workbook()
    ws = wb.active
    ws.title = "Quote history"
    headers = ["Reference", "Date", "Staff", "Destination", "Customer ref", "Pieces", "CBM (m³)", "Actual (kg)",
               "Volumetric (kg)", "Chargeable (kg)", "Selected service", "Carrier", "Selected (RM)",
               "Cheapest (RM)", "Highest (RM)", "Remarks"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="071B55")
    count = 0
    for r in rows:
        count += 1
        ws.append([
            r.reference_no, to_local(r.created_at).strftime("%Y-%m-%d %H:%M"), r.staff_name, r.destination,
            r.customer_ref, r.total_pieces, r.cbm, r.actual_weight, r.volumetric_weight, r.chargeable_weight,
            r.selected_service, store.CARRIER_NAMES.get(r.selected_carrier, r.selected_carrier),
            r.selected_total, r.cheapest_total, r.highest_total, r.remarks,
        ])
    for col, width in zip("ABCDEFGHIJKLMNOP", [20, 17, 20, 30, 18, 8, 10, 11, 14, 14, 30, 9, 13, 13, 12, 40]):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    log_activity(db, admin.username, "history_exported", f"{count} quotes")
    db.commit()
    filename = f"quote-history-{datetime.now(LOCAL_TZ):%Y%m%d-%H%M}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/quotes/{quote_id}")
def get_quote(quote_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    quote = db.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    return store.quote_to_dict(quote)


# ----------------------------------------------------------------- dashboard
@router.get("/stats")
def stats(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    today = datetime.now(LOCAL_TZ).date()
    date_to = date_to or today
    date_from = date_from or date_to - timedelta(days=29)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="The start date must be before the end date")

    quotes = db.execute(
        quote_filters(
            select(Quote.created_at, Quote.destination, Quote.selected_carrier, Quote.selected_service,
                   Quote.selected_total, Quote.cheapest_total, Quote.highest_total, Quote.chargeable_weight,
                   Quote.staff_name),
            None, date_from, date_to, None, None,
        )
    ).all()

    n = len(quotes)
    spend = sum(q.selected_total for q in quotes)
    kg = sum(q.chargeable_weight for q in quotes)
    savings = sum(q.highest_total - q.selected_total for q in quotes)
    cheapest_picks = sum(1 for q in quotes if q.selected_total <= q.cheapest_total + 0.005)

    # Quotes over time: by day for ranges up to ~2 months, otherwise by month
    by_month = (date_to - date_from).days > 62
    buckets: dict[str, dict] = {}
    d = date_from
    while d <= date_to:
        key = d.strftime("%Y-%m") if by_month else d.isoformat()
        buckets.setdefault(key, {"period": key, "quotes": 0, "spend": 0.0})
        d += timedelta(days=1)
    for q in quotes:
        local = to_local(q.created_at).date()
        key = local.strftime("%Y-%m") if by_month else local.isoformat()
        if key in buckets:
            buckets[key]["quotes"] += 1
            buckets[key]["spend"] += q.selected_total

    def group(key_fn):
        out: dict[str, dict] = defaultdict(lambda: {"quotes": 0, "spend": 0.0, "kg": 0.0})
        for q in quotes:
            g = out[key_fn(q)]
            g["quotes"] += 1
            g["spend"] += q.selected_total
            g["kg"] += q.chargeable_weight
        return out

    countries = sorted(group(lambda q: q.destination).items(), key=lambda kv: (-kv[1]["quotes"], -kv[1]["spend"]))
    carriers = group(lambda q: q.selected_carrier)
    staff = sorted(group(lambda q: q.staff_name).items(), key=lambda kv: -kv[1]["quotes"])
    services = sorted(group(lambda q: q.selected_service).items(), key=lambda kv: -kv[1]["quotes"])

    ranges = []
    for low, high in PRICE_RANGES:
        label = f"RM {low:,}+" if high is None else f"RM {low:,}–{high:,}"
        count = sum(1 for q in quotes if q.selected_total >= low and (high is None or q.selected_total < high))
        ranges.append({"label": label, "quotes": count})

    # Rate card age, for the "rates may be out of date" warning
    meta = db.scalar(select(RateCard).where(RateCard.is_active))
    max_age = int(store.get_settings(db)["card_max_age_months"])
    rate_card = None
    if meta is not None:
        age_days = (utcnow() - as_utc(meta.effective_date)).days
        rate_card = {
            "filename": meta.filename,
            "effective_date": iso(meta.effective_date),
            "age_months": round(age_days / 30.44, 1),
            "max_age_months": max_age,
            "is_stale": age_days > max_age * 30.44,
        }

    r2 = lambda x: round(x, 2)  # noqa: E731
    return {
        "range": {"from": date_from.isoformat(), "to": date_to.isoformat(), "grouping": "month" if by_month else "day"},
        "totals": {
            "quotes": n,
            "spend": r2(spend),
            "avg_cost": r2(spend / n) if n else 0,
            "avg_per_kg": r2(spend / kg) if kg else 0,
            "savings": r2(savings),
            "cheapest_pick_rate": round(cheapest_picks / n * 100, 1) if n else 0,
            "destinations": len(countries),
        },
        "over_time": [{**b, "spend": r2(b["spend"])} for b in buckets.values()],
        "by_country": [{"name": k, "quotes": v["quotes"], "spend": r2(v["spend"])} for k, v in countries[:10]],
        "by_carrier": [
            {
                "carrier": c,
                "name": store.CARRIER_NAMES.get(c, c),
                "quotes": carriers[c]["quotes"],
                "spend": r2(carriers[c]["spend"]),
                "avg_per_kg": r2(carriers[c]["spend"] / carriers[c]["kg"]) if carriers[c]["kg"] else 0,
            }
            for c in sorted(carriers, key=lambda c: -carriers[c]["quotes"])
        ],
        "by_service": [{"name": k, "quotes": v["quotes"]} for k, v in services],
        "by_staff": [{"name": k, "quotes": v["quotes"], "spend": r2(v["spend"])} for k, v in staff[:10]],
        "price_ranges": ranges,
        "rate_card": rate_card,
    }


# ----------------------------------------------------------------- users
class NewUser(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=100)
    password: str
    role: Literal["admin", "staff"] = "staff"


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    role: Optional[Literal["admin", "staff"]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


def user_row(u: User, quotes: int = 0) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": iso(u.created_at),
        "last_login_at": iso(u.last_login_at),
        "quotes": quotes,
    }


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Quote.user_id, func.count()).group_by(Quote.user_id)).all())
    users = db.scalars(select(User).order_by(User.role, User.full_name))
    return {"users": [user_row(u, counts.get(u.id, 0)) for u in users]}


@router.post("/users")
def create_user(body: NewUser, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    if db.scalar(select(User).where(func.lower(User.username) == username)):
        raise HTTPException(status_code=400, detail=f"The username '{username}' is already taken")
    check_password_rules(body.password)
    user = User(username=username, full_name=body.full_name.strip(), password_hash=hash_password(body.password),
                role=body.role)
    db.add(user)
    log_activity(db, admin.username, "user_created", f"{username} ({body.role})")
    db.commit()
    return user_row(user)


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    removing_admin = user.role == "admin" and (body.role == "staff" or body.is_active is False)
    if removing_admin:
        if user.id == admin.id:
            raise HTTPException(status_code=400, detail="You cannot remove your own admin access or deactivate yourself")
        admins = db.scalar(select(func.count()).where(User.role == "admin", User.is_active))
        if admins <= 1:
            raise HTTPException(status_code=400, detail="There must always be at least one active admin")

    changes = []
    if body.full_name is not None and body.full_name.strip() != user.full_name:
        user.full_name = body.full_name.strip()
        changes.append("name")
    if body.role is not None and body.role != user.role:
        user.role = body.role
        changes.append(f"role → {body.role}")
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        changes.append("activated" if body.is_active else "deactivated")
    if body.password:
        check_password_rules(body.password)
        user.password_hash = hash_password(body.password)
        changes.append("password reset")

    if changes:
        log_activity(db, admin.username, "user_updated", f"{user.username}: {', '.join(changes)}")
        db.commit()
    return user_row(user)


# ----------------------------------------------------------------- rate cards
def card_row(c: RateCard) -> dict:
    return {
        "id": c.id,
        "filename": c.filename,
        "note": c.note,
        "effective_date": iso(c.effective_date),
        "uploaded_at": iso(c.uploaded_at),
        "uploaded_by": c.uploaded_by_name,
        "countries": c.countries,
        "mapping_rows": c.mapping_rows,
        "rate_rows": c.rate_rows,
        "is_active": c.is_active,
    }


async def read_upload(file: UploadFile) -> tuple[bytes, pricing.Card]:
    if not (file.filename or "").lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx or .xls file")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="The file is larger than 4 MB")
    try:
        return content, pricing.read_card(content)
    except pricing.RateCardError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/rate-cards")
def list_rate_cards(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    cards = db.scalars(select(RateCard).order_by(RateCard.uploaded_at.desc()))
    return {"rate_cards": [card_row(c) for c in cards]}


@router.post("/rate-cards/preview")
async def preview_rate_card(file: UploadFile = File(...), _: User = Depends(require_admin),
                            db: Session = Depends(get_db)):
    """Check an upload and show what would change - nothing is saved."""
    _, card = await read_upload(file)
    active = db.scalar(select(RateCard).where(RateCard.is_active))
    return {
        "filename": file.filename,
        "countries": int(card.zones["CountryOption"].nunique()),
        "services": sorted(card.zones["ServiceName"].unique().tolist()),
        "mapping_rows": len(card.zones),
        "rate_rows": len(card.rates),
        "warnings": pricing.check_card(card),
        "changes": pricing.diff_cards(store.card_by_id(db, active.id), card) if active else None,
    }


@router.post("/rate-cards")
async def upload_rate_card(
    file: UploadFile = File(...),
    note: str = Form(""),
    effective_date: Optional[date] = Form(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    content, card = await read_upload(file)
    effective = local_day_start(effective_date) if effective_date else utcnow()
    db.execute(update(RateCard).values(is_active=False))
    row = RateCard(
        filename=file.filename or "rate-card.xlsx",
        note=note.strip()[:255],
        effective_date=effective,
        uploaded_by_name=admin.full_name,
        content=content,
        countries=int(card.zones["CountryOption"].nunique()),
        mapping_rows=len(card.zones),
        rate_rows=len(card.rates),
        is_active=True,
    )
    db.add(row)
    log_activity(db, admin.username, "rate_card_uploaded", f"{row.filename} ({row.rate_rows} prices)")
    db.commit()
    return {"message": "Rate card uploaded and now in use", "rate_card": card_row(row)}


@router.post("/rate-cards/{card_id}/activate")
def activate_rate_card(card_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(RateCard, card_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Rate card not found")
    db.execute(update(RateCard).values(is_active=False))
    row.is_active = True
    log_activity(db, admin.username, "rate_card_activated", f"{row.filename} (uploaded {to_local(row.uploaded_at):%d %b %Y})")
    db.commit()
    return {"message": f"{row.filename} is now in use", "rate_card": card_row(row)}


@router.get("/rate-cards/{card_id}/download")
def download_rate_card(card_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(RateCard, card_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Rate card not found")
    return Response(
        row.content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{row.filename}"'},
    )


@router.get("/rate-card/country")
def rate_card_country(name: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Price tables of every service serving one country (rate card viewer)."""
    _, card = store.active_card(db)
    services = pricing.country_detail(card, name)
    if not services:
        raise HTTPException(status_code=404, detail=f"'{name}' is not in the rate card")
    return {"country": name, "services": services}


@router.get("/rate-card/health")
def rate_card_health(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    meta, card = store.active_card(db)
    return {"rate_card": card_row(meta), "warnings": pricing.check_card(card)}


# ----------------------------------------------------------------- settings
class SettingsBody(BaseModel):
    fuel: dict[Literal["DHL", "FDX", "UPS"], float]
    card_max_age_months: int = Field(ge=1, le=60)


@router.get("/settings")
def read_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = store.get_settings(db)
    return {"fuel": store.fuel_rates(db), "card_max_age_months": int(s["card_max_age_months"])}


@router.put("/settings")
def save_settings(body: SettingsBody, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    for carrier, pct in body.fuel.items():
        if not 0 <= pct <= 100:
            raise HTTPException(status_code=400, detail="Fuel surcharge must be between 0 and 100%")
        store.set_setting(db, f"fuel_{carrier}", str(round(pct, 2)))
    store.set_setting(db, "card_max_age_months", str(body.card_max_age_months))
    summary = ", ".join(f"{store.CARRIER_NAMES[c]} {p:g}%" for c, p in body.fuel.items())
    log_activity(db, admin.username, "settings_updated", f"Fuel: {summary}; rate card max age {body.card_max_age_months} months")
    db.commit()
    return read_settings(admin, db)


# ----------------------------------------------------------------- activity log
@router.get("/activity")
def activity(page: int = Query(1, ge=1), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    size = 50
    total = db.scalar(select(func.count()).select_from(Activity))
    rows = db.scalars(select(Activity).order_by(Activity.at.desc(), Activity.id.desc()).offset((page - 1) * size).limit(size))
    return {
        "items": [{"id": a.id, "at": iso(a.at), "username": a.username, "action": a.action, "detail": a.detail} for a in rows],
        "page": page,
        "pages": max(1, math.ceil(total / size)),
    }
