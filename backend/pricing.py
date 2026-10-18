"""
Rate card reading and price calculation. No web code here, so it is easy to test.

Rate card = Excel workbook with two sheets:
  COUNTRY MAPPING - which service delivers to which country, and in which zone
  MASTER RATE     - prices per service / zone, as weight breaks ("Per Shipment") or bands ("Per KG")
"""
import io
import math
import re
from dataclasses import dataclass

import pandas as pd

MAPPING_SHEET = "COUNTRY MAPPING"
RATES_SHEET = "MASTER RATE"
REQUIRED_SHEETS = {
    MAPPING_SHEET: ["CountryOption", "Carrier", "ServiceKey", "ServiceName", "RateZone", "RateScope"],
    RATES_SHEET: ["ServiceKey", "ZoneCode", "RateScope", "Container", "RateType", "WeightFrom", "WeightTo", "RateMYR"],
}
PER_SHIPMENT = "per shipment"  # RateType values are compared in lower case
PER_KG = "per kg"
VOLUMETRIC_FACTOR = 200  # kg per m³ - the same as the usual cm³ / 5000
RATE_KEY = ["ServiceKey", "ZoneCode", "RateScope"]


class RateCardError(ValueError):
    """The uploaded workbook cannot be used (message is shown to the admin)."""


@dataclass
class Card:
    zones: pd.DataFrame
    rates: pd.DataFrame


# ----------------------------------------------------------------- reading
def clean_code(value) -> str:
    """Zone codes can come out of Excel as 1, 1.0 or "1 " - make them all "1"."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def read_card(content: bytes) -> Card:
    """Read and validate a rate card workbook. Raises RateCardError with a readable message."""
    try:
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
    except Exception:
        raise RateCardError("Could not read the Excel file")

    for sheet, columns in REQUIRED_SHEETS.items():
        if sheet not in sheets:
            raise RateCardError(f"Missing required sheet: '{sheet}'")
        missing = [c for c in columns if c not in sheets[sheet].columns]
        if missing:
            raise RateCardError(f"Sheet '{sheet}' is missing columns: {', '.join(missing)}")

    zones = sheets[MAPPING_SHEET].dropna(subset=["CountryOption", "ServiceKey", "RateZone"]).copy()
    for col in ["CountryOption", "Carrier", "ServiceKey", "ServiceName", "RateScope"]:
        zones[col] = zones[col].astype(str).str.strip()
    zones["RateZone"] = zones["RateZone"].map(clean_code)

    rates = sheets[RATES_SHEET].copy()
    for col in ["WeightFrom", "WeightTo", "RateMYR"]:
        rates[col] = pd.to_numeric(rates[col], errors="coerce")
    rates = rates.dropna(subset=["ServiceKey", "WeightFrom", "WeightTo", "RateMYR"])
    for col in ["ServiceKey", "RateScope", "Container"]:
        rates[col] = rates[col].astype(str).str.strip()
    rates["ZoneCode"] = rates["ZoneCode"].map(clean_code)
    rates["RateType"] = rates["RateType"].astype(str).str.strip().str.lower()

    if zones.empty or rates.empty:
        raise RateCardError("The rate card has no usable rows")
    return Card(zones=zones.reset_index(drop=True), rates=rates.reset_index(drop=True))


# ----------------------------------------------------------------- weights
def shipment_weights(pieces: list[dict]) -> dict:
    """Pieces have length/width/height in metres, weight in kg and a quantity.

    Like the express carriers, each piece is charged on whichever is higher - its actual or its
    volumetric weight - and the shipment's chargeable weight is the sum of those.
    """
    cbm = actual = volumetric = chargeable = 0.0
    count = 0
    for p in pieces:
        qty = int(p.get("quantity", 1))
        piece_cbm = p["length"] * p["width"] * p["height"]
        piece_vol = piece_cbm * VOLUMETRIC_FACTOR
        count += qty
        cbm += piece_cbm * qty
        actual += p["weight"] * qty
        volumetric += piece_vol * qty
        chargeable += max(p["weight"], piece_vol) * qty
    return {
        "pieces": count,
        "cbm": round(cbm, 4),
        "actual_weight": round(actual, 2),
        "volumetric_weight": round(volumetric, 2),
        "chargeable_weight": round(chargeable, 2),
    }


# ----------------------------------------------------------------- pricing
def price_service(table: pd.DataFrame, chargeable: float):
    """Price one service/zone. Returns (billed_weight, rate_type, rate_per_kg, base_cost) or None.

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


def compare(card: Card, destination: str, chargeable: float, fuel: dict[str, float]) -> list[dict]:
    """Price every service that delivers to the destination, cheapest first.

    fuel maps carrier code (DHL, FDX, UPS) to a fuel surcharge in percent.
    Returns [] if the destination is unknown or nothing can carry this weight.
    """
    zones, rates = card.zones, card.rates
    matches = zones[zones["CountryOption"].str.lower() == destination.strip().lower()]

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
        billed, rate_type, per_kg, base = priced
        pct = float(fuel.get(m["Carrier"], 0) or 0)
        surcharge = round(base * pct / 100, 2)
        results.append({
            "courier": m["ServiceName"],
            "carrier": m["Carrier"],
            "service_key": m["ServiceKey"],
            "zone_code": m["RateZone"],
            "container": str(table["Container"].iloc[0]),
            "billed_weight": billed,
            "rate_type": rate_type,
            "rate_per_kg": per_kg,
            "base_cost": base,
            "fuel_pct": pct,
            "fuel_surcharge": surcharge,
            "total_cost": round(base + surcharge, 2),
            "is_cheapest": False,
        })

    results.sort(key=lambda x: x["total_cost"])
    if results:
        results[0]["is_cheapest"] = True
    return results


# ----------------------------------------------------------------- summaries for the admin pages
def destinations(card: Card) -> list[dict]:
    counts = card.zones.groupby("CountryOption")["ServiceKey"].nunique()
    return [{"name": name, "services": int(n)} for name, n in sorted(counts.items())]


def country_detail(card: Card, country: str) -> list[dict]:
    """Every service serving a country, with its full price table (for the rate card viewer)."""
    zones, rates = card.zones, card.rates
    out = []
    for _, m in zones[zones["CountryOption"].str.lower() == country.strip().lower()].iterrows():
        table = rates[
            (rates["ServiceKey"] == m["ServiceKey"])
            & (rates["ZoneCode"] == m["RateZone"])
            & (rates["RateScope"] == m["RateScope"])
        ].sort_values(["RateType", "WeightFrom"], ascending=[False, True])
        out.append({
            "service": m["ServiceName"],
            "service_key": m["ServiceKey"],
            "carrier": m["Carrier"],
            "zone": m["RateZone"],
            "scope": m["RateScope"],
            "rows": [
                {
                    "type": "per_kg" if r["RateType"] == PER_KG else "per_shipment",
                    "from": float(r["WeightFrom"]),
                    "to": float(r["WeightTo"]),
                    "rate": float(r["RateMYR"]),
                }
                for _, r in table.iterrows()
            ],
        })
    return out


def _base_name(country: str) -> str:
    return re.split(r" - |,|\(", country)[0].strip().lower()


def check_card(card: Card) -> list[dict]:
    """Spot problems an admin should know about. Nothing here stops an upload."""
    zones, rates = card.zones, card.rates
    warnings: list[dict] = []

    # Mapping rows that point at prices which do not exist
    have = set(map(tuple, rates[RATE_KEY].drop_duplicates().values.tolist()))
    for _, m in zones.iterrows():
        if (m["ServiceKey"], m["RateZone"], m["RateScope"]) not in have:
            warnings.append({
                "level": "error",
                "message": f"{m['CountryOption']}: {m['ServiceName']} zone {m['RateZone']} has no prices, so it is never quoted.",
            })

    # The same country split over several names with different services (staff may miss a carrier)
    services = zones.groupby("CountryOption")["ServiceKey"].apply(lambda s: frozenset(s))
    groups: dict[str, list[str]] = {}
    for name in services.index:
        groups.setdefault(_base_name(name), []).append(name)
    for names in groups.values():
        if len(names) > 1 and len({services[n] for n in names}) > 1:
            listed = "; ".join(f"{n}: {', '.join(sorted(services[n]))}" for n in sorted(names)[:4])
            more = f" (and {len(names) - 4} more)" if len(names) > 4 else ""
            warnings.append({
                "level": "warning",
                "message": f"Similar destination names offer different services, so staff may miss a carrier - {listed}{more}.",
            })

    # Heavier weight costing less than a lighter one (often a typo)
    flat = rates[rates["RateType"] == PER_SHIPMENT].sort_values("WeightTo")
    for key, g in flat.groupby(RATE_KEY):
        prices, weights = g["RateMYR"].tolist(), g["WeightTo"].tolist()
        for i in range(1, len(prices)):
            if prices[i] < prices[i - 1]:
                warnings.append({
                    "level": "warning",
                    "message": f"{key[0]} zone {key[1]} ({key[2]}): {weights[i]} kg costs less than {weights[i - 1]} kg "
                               f"(RM {prices[i]:.2f} vs RM {prices[i - 1]:.2f}).",
                })

    order = {"error": 0, "warning": 1}
    return sorted(warnings, key=lambda w: order[w["level"]])


def diff_cards(old: Card, new: Card) -> dict:
    """What changes if the new card replaces the old one."""
    old_c, new_c = set(old.zones["CountryOption"]), set(new.zones["CountryOption"])
    key = RATE_KEY + ["RateType", "WeightFrom", "WeightTo"]
    merged = old.rates[key + ["RateMYR"]].merge(
        new.rates[key + ["RateMYR"]], on=key, how="outer", suffixes=("_old", "_new"), indicator=True
    )
    both = merged[merged["_merge"] == "both"]
    changed = both[(both["RateMYR_old"] - both["RateMYR_new"]).abs() > 0.004]
    pct = ((changed["RateMYR_new"] - changed["RateMYR_old"]) / changed["RateMYR_old"] * 100).replace(
        [float("inf"), float("-inf")], float("nan")
    ).dropna()
    return {
        "countries_added": sorted(new_c - old_c),
        "countries_removed": sorted(old_c - new_c),
        "prices_changed": int(len(changed)),
        "prices_up": int((changed["RateMYR_new"] > changed["RateMYR_old"]).sum()),
        "prices_down": int((changed["RateMYR_new"] < changed["RateMYR_old"]).sum()),
        "average_change_pct": round(float(pct.mean()), 2) if len(pct) else 0.0,
        "rows_added": int((merged["_merge"] == "right_only").sum()),
        "rows_removed": int((merged["_merge"] == "left_only").sum()),
    }
