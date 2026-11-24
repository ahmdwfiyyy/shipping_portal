"""End-to-end checks of the API: accounts, roles, quotes, rate cards and the dashboard."""
from conftest import login, make_card

SHIPMENT = {"destination": "Singapore", "pieces": [{"length": 0.4, "width": 0.3, "height": 0.3, "weight": 1.2}]}


# ----------------------------------------------------------------- accounts and roles
def test_wrong_password_rejected(client):
    res = client.post("/api/login", json={"username": "admin", "password": "nope"})
    assert res.status_code == 401


def test_login_locks_after_repeated_failures(client):
    for _ in range(5):
        client.post("/api/login", json={"username": "ghost", "password": "x"})
    assert client.post("/api/login", json={"username": "ghost", "password": "x"}).status_code == 429


def test_requests_need_login(client):
    assert client.get("/api/destinations").status_code == 401


def test_staff_cannot_use_admin_endpoints(client, staff_headers):
    for path in ["/api/admin/quotes", "/api/admin/stats", "/api/admin/users", "/api/admin/rate-cards"]:
        assert client.get(path, headers=staff_headers).status_code == 403, path


def test_me_returns_the_account(client, staff_headers):
    me = client.get("/api/me", headers=staff_headers).json()
    assert me["username"] == "aina" and me["role"] == "staff"


def test_short_password_rejected(client, admin_headers):
    res = client.post("/api/admin/users", headers=admin_headers,
                      json={"username": "bob", "full_name": "Bob", "password": "short", "role": "staff"})
    assert res.status_code == 400


def test_deactivated_user_loses_access_immediately(client, admin_headers):
    client.post("/api/admin/users", headers=admin_headers,
                json={"username": "temp", "full_name": "Temp", "password": "temp-pass-1", "role": "staff"})
    headers = login(client, "temp", "temp-pass-1")
    uid = next(u["id"] for u in client.get("/api/admin/users", headers=admin_headers).json()["users"] if u["username"] == "temp")
    client.patch(f"/api/admin/users/{uid}", headers=admin_headers, json={"is_active": False})
    assert client.get("/api/me", headers=headers).status_code == 401


def test_last_admin_cannot_be_removed(client, admin_headers):
    me = client.get("/api/me", headers=admin_headers).json()
    res = client.patch(f"/api/admin/users/{me['id']}", headers=admin_headers, json={"role": "staff"})
    assert res.status_code == 400


def test_change_own_password(client, admin_headers):
    client.post("/api/admin/users", headers=admin_headers,
                json={"username": "pwuser", "full_name": "Pw User", "password": "first-pass-1", "role": "staff"})
    headers = login(client, "pwuser", "first-pass-1")
    bad = client.post("/api/me/password", headers=headers, json={"current_password": "wrong", "new_password": "second-pass-2"})
    assert bad.status_code == 400
    ok = client.post("/api/me/password", headers=headers, json={"current_password": "first-pass-1", "new_password": "second-pass-2"})
    assert ok.status_code == 200
    login(client, "pwuser", "second-pass-2")


# ----------------------------------------------------------------- calculator and history
def test_calculate(client, staff_headers):
    data = client.post("/api/calculate", headers=staff_headers, json=SHIPMENT).json()
    assert data["summary"]["chargeable_weight"] == 7.2
    assert data["results"][0]["is_cheapest"]


def test_unknown_destination(client, staff_headers):
    res = client.post("/api/calculate", headers=staff_headers, json={**SHIPMENT, "destination": "Atlantis"})
    assert res.status_code == 404


def test_submit_quote_saves_full_comparison(client, staff_headers, admin_headers):
    res = client.post("/api/quotes", headers=staff_headers, json={
        **SHIPMENT, "service_key": "FDX-IP", "customer_ref": "PO-123", "remarks": "Urgent samples",
    })
    assert res.status_code == 200, res.text
    quote = res.json()
    assert quote["reference_no"].startswith("QT-")
    assert quote["staff_name"] == "Aina Staff"
    assert quote["selected_service"] == "FedEx International Priority"
    assert len(quote["results"]) == 2

    detail = client.get(f"/api/admin/quotes/{quote['id']}", headers=admin_headers).json()
    assert detail["customer_ref"] == "PO-123" and detail["remarks"] == "Urgent samples"


def test_unavailable_service_rejected(client, staff_headers):
    res = client.post("/api/quotes", headers=staff_headers, json={**SHIPMENT, "service_key": "UPS-NOPE"})
    assert res.status_code == 400


def test_history_search_and_export(client, admin_headers):
    found = client.get("/api/admin/quotes", headers=admin_headers, params={"q": "po-123"}).json()
    assert found["total"] >= 1
    none = client.get("/api/admin/quotes", headers=admin_headers, params={"q": "zzz-not-there"}).json()
    assert none["total"] == 0
    export = client.get("/api/admin/quotes/export", headers=admin_headers)
    assert export.status_code == 200
    assert export.content[:2] == b"PK"  # xlsx files are zip archives


def test_stats_count_submitted_quotes(client, admin_headers):
    s = client.get("/api/admin/stats", headers=admin_headers).json()
    assert s["totals"]["quotes"] >= 1
    assert s["by_country"][0]["name"] == "Singapore"
    assert sum(r["quotes"] for r in s["price_ranges"]) == s["totals"]["quotes"]
    assert len(s["over_time"]) == 30


def test_fuel_surcharge_setting_applies(client, admin_headers, staff_headers):
    res = client.put("/api/admin/settings", headers=admin_headers,
                     json={"fuel": {"DHL": 10, "FDX": 0, "UPS": 0}, "card_max_age_months": 12})
    assert res.status_code == 200
    dhl = next(r for r in client.post("/api/calculate", headers=staff_headers, json=SHIPMENT).json()["results"]
               if r["carrier"] == "DHL")
    assert dhl["fuel_pct"] == 10
    assert dhl["total_cost"] == round(dhl["base_cost"] * 1.1, 2)
    client.put("/api/admin/settings", headers=admin_headers,
               json={"fuel": {"DHL": 0, "FDX": 0, "UPS": 0}, "card_max_age_months": 12})


# ----------------------------------------------------------------- rate cards
def test_upload_preview_then_upload_then_roll_back(client, admin_headers, staff_headers):
    files = {"file": ("new.xlsx", make_card(dhl_half_kg=40), "application/octet-stream")}
    preview = client.post("/api/admin/rate-cards/preview", headers=admin_headers, files=files).json()
    assert preview["changes"]["prices_changed"] == 1
    assert preview["changes"]["prices_down"] == 1

    up = client.post("/api/admin/rate-cards", headers=admin_headers, files=files, data={"note": "cheaper DHL"})
    assert up.status_code == 200, up.text
    small = {**SHIPMENT, "pieces": [{"length": 0.1, "width": 0.1, "height": 0.1, "weight": 0.5}]}
    cheapest = client.post("/api/calculate", headers=staff_headers, json=small).json()["results"][0]
    assert cheapest["total_cost"] == 40

    cards = client.get("/api/admin/rate-cards", headers=admin_headers).json()["rate_cards"]
    previous = next(c for c in cards if not c["is_active"])
    client.post(f"/api/admin/rate-cards/{previous['id']}/activate", headers=admin_headers)
    cheapest = client.post("/api/calculate", headers=staff_headers, json=small).json()["results"][0]
    assert cheapest["total_cost"] == 50


def test_bad_upload_rejected(client, admin_headers):
    files = {"file": ("rates.xlsx", b"garbage", "application/octet-stream")}
    assert client.post("/api/admin/rate-cards", headers=admin_headers, files=files).status_code == 400
    files = {"file": ("rates.csv", b"a,b", "text/csv")}
    assert client.post("/api/admin/rate-cards", headers=admin_headers, files=files).status_code == 400


def test_rate_card_viewer(client, admin_headers):
    data = client.get("/api/admin/rate-card/country", headers=admin_headers, params={"name": "Singapore"}).json()
    assert {s["service_key"] for s in data["services"]} == {"DHL-EXPRESS", "FDX-IP"}


def test_activity_log_records_actions(client, admin_headers):
    actions = {a["action"] for a in client.get("/api/admin/activity", headers=admin_headers).json()["items"]}
    assert {"login", "quote_submitted", "rate_card_uploaded"} <= actions


# ----------------------------------------------------------------- fuel surcharge chosen in the calculator
def test_fuel_from_calculator_overrides_default(client, admin_headers, staff_headers):
    client.put("/api/admin/settings", headers=admin_headers,
               json={"fuel": {"DHL": 10, "FDX": 10, "UPS": 10}, "card_max_age_months": 12})
    body = {**SHIPMENT, "fuel": {"DHL": 25, "FDX": 0}}  # UPS left out -> default 10% (not in this card anyway)
    results = {r["carrier"]: r for r in client.post("/api/calculate", headers=staff_headers, json=body).json()["results"]}
    assert results["DHL"]["fuel_pct"] == 25
    assert results["DHL"]["total_cost"] == round(results["DHL"]["base_cost"] * 1.25, 2)
    assert results["FDX"]["fuel_pct"] == 0
    assert results["FDX"]["total_cost"] == results["FDX"]["base_cost"]

    # The submitted quote keeps the percentages that were used
    quote = client.post("/api/quotes", headers=staff_headers, json={**body, "service_key": "DHL-EXPRESS"}).json()
    dhl = next(r for r in quote["results"] if r["carrier"] == "DHL")
    assert dhl["fuel_pct"] == 25
    assert quote["selected_total"] == dhl["total_cost"]

    # Without a choice, the admin default still applies
    plain = {r["carrier"]: r for r in client.post("/api/calculate", headers=staff_headers, json=SHIPMENT).json()["results"]}
    assert plain["DHL"]["fuel_pct"] == 10
    client.put("/api/admin/settings", headers=admin_headers,
               json={"fuel": {"DHL": 0, "FDX": 0, "UPS": 0}, "card_max_age_months": 12})


def test_fuel_out_of_range_rejected(client, staff_headers):
    for bad in [{"DHL": -1}, {"DHL": 150}, {"XYZ": 5}]:
        res = client.post("/api/calculate", headers=staff_headers, json={**SHIPMENT, "fuel": bad})
        assert res.status_code == 422, bad
