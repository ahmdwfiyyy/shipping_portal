"""Test setup: a throw-away database and a small made-up rate card (never the real, confidential one)."""
import io
import os
import sys
import tempfile

import pandas as pd
import pytest

TMP = tempfile.mkdtemp(prefix="portal-tests-")


def make_card(dhl_half_kg: float = 50.0) -> bytes:
    mapping = pd.DataFrame([
        # CountryOption, Carrier, ServiceKey, ServiceName, RateZone, RateScope
        ["Singapore", "DHL", "DHL-EXPRESS", "DHL Express", 1, "GENERIC"],
        ["Singapore", "FDX", "FDX-IP", "FedEx International Priority", "Y", "GENERIC"],
        ["Japan", "DHL", "DHL-EXPRESS", "DHL Express", 4, "GENERIC"],
    ], columns=["CountryOption", "Carrier", "ServiceKey", "ServiceName", "RateZone", "RateScope"])

    def row(service, zone, rtype, w_from, w_to, rate):
        return [service, zone, "GENERIC", "Pkg", rtype, w_from, w_to, rate]

    rates = pd.DataFrame([
        row("DHL-EXPRESS", 1, "Per Shipment", 0.5, 0.5, dhl_half_kg),
        row("DHL-EXPRESS", 1, "Per Shipment", 1.0, 1.0, 60),
        row("DHL-EXPRESS", 1, "Per Shipment", 1.5, 1.5, 70),
        row("DHL-EXPRESS", 1, "Per Shipment", 2.0, 2.0, 80),
        row("DHL-EXPRESS", 1, "Per KG", 2.1, 10, 30),
        row("DHL-EXPRESS", 1, "Per KG", 10.1, 99999, 25),
        row("FDX-IP", "Y", "Per Shipment", 0.5, 0.5, 55),
        row("FDX-IP", "Y", "Per Shipment", 1.0, 1.0, 58),
        row("FDX-IP", "Y", "Per Shipment", 1.5, 1.5, 61),
        row("FDX-IP", "Y", "Per Shipment", 2.0, 2.0, 64),
        row("FDX-IP", "Y", "Per KG", 3, 44, 28),
        row("DHL-EXPRESS", 4, "Per Shipment", 0.5, 0.5, 90),
    ], columns=["ServiceKey", "ZoneCode", "RateScope", "Container", "RateType", "WeightFrom", "WeightTo", "RateMYR"])

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        mapping.to_excel(writer, sheet_name="COUNTRY MAPPING", index=False)
        rates.to_excel(writer, sheet_name="MASTER RATE", index=False)
    return buffer.getvalue()


SEED = os.path.join(TMP, "seed.xlsx")
with open(SEED, "wb") as f:
    f.write(make_card())

# Must be set before the app (and its database engine) is imported
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(TMP, "test.db").replace("\\", "/")
os.environ["SEED_RATE_CARD"] = SEED
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-pass-123"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app import app

    with TestClient(app) as c:  # runs the start-up (tables, first admin, seed rate card)
        yield c


def login(client, username: str, password: str) -> dict:
    res = client.post("/api/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return login(client, "admin", "admin-pass-123")


@pytest.fixture(scope="session")
def staff_headers(client, admin_headers):
    res = client.post("/api/admin/users", headers=admin_headers,
                      json={"username": "aina", "full_name": "Aina Staff", "password": "staff-pass-1", "role": "staff"})
    assert res.status_code == 200, res.text
    return login(client, "aina", "staff-pass-1")
