"""Price calculation rules."""
import pytest

import pricing
from conftest import make_card


@pytest.fixture(scope="module")
def card():
    return pricing.read_card(make_card())


def piece(l, w, h, kg, qty=1):
    return {"length": l, "width": w, "height": h, "weight": kg, "quantity": qty}


def test_volumetric_weight_is_cbm_times_200():
    s = pricing.shipment_weights([piece(0.4, 0.3, 0.3, 1.2)])
    assert s["cbm"] == 0.036
    assert s["volumetric_weight"] == 7.2
    assert s["chargeable_weight"] == 7.2


def test_quantity_multiplies_every_total():
    # each box: 0.2 x 0.2 x 0.2 m = 0.008 m³ -> volumetric 1.6 kg, actual 1 kg
    s = pricing.shipment_weights([piece(0.2, 0.2, 0.2, 1, qty=3)])
    assert s["pieces"] == 3
    assert s["cbm"] == 0.024
    assert s["actual_weight"] == 3
    assert s["volumetric_weight"] == 4.8
    assert s["chargeable_weight"] == 4.8


def test_chargeable_weight_sums_per_piece_maximum():
    s = pricing.shipment_weights([piece(0.1, 0.1, 0.1, 5), piece(0.5, 0.5, 0.5, 1)])
    # piece 1: max(5, 0.2) = 5 ; piece 2: max(1, 25) = 25
    assert s["chargeable_weight"] == 30
    assert s["actual_weight"] == 6
    assert s["volumetric_weight"] == 25.2


def test_weight_is_rounded_up_to_the_next_break(card):
    results = pricing.compare(card, "Singapore", 1.2, {})
    dhl = next(r for r in results if r["carrier"] == "DHL")
    assert dhl["billed_weight"] == 1.5
    assert dhl["total_cost"] == 70
    assert dhl["rate_type"] == "per_shipment"


def test_above_the_breaks_uses_whole_kg_times_band_rate(card):
    results = pricing.compare(card, "Singapore", 2.3, {})
    dhl = next(r for r in results if r["carrier"] == "DHL")
    assert dhl["rate_type"] == "per_kg"
    assert dhl["billed_weight"] == 3
    assert dhl["total_cost"] == 90  # 3 kg x RM 30


def test_service_dropped_when_too_heavy(card):
    results = pricing.compare(card, "Singapore", 50, {})
    assert [r["carrier"] for r in results] == ["DHL"]  # FedEx band stops at 44 kg


def test_cheapest_first_and_flagged(card):
    results = pricing.compare(card, "Singapore", 0.5, {})
    assert [r["total_cost"] for r in results] == [50, 55]
    assert results[0]["is_cheapest"] and not results[1]["is_cheapest"]


def test_fuel_surcharge_added_per_carrier(card):
    results = pricing.compare(card, "Singapore", 0.5, {"DHL": 20, "FDX": 0})
    by_carrier = {r["carrier"]: r for r in results}
    assert by_carrier["DHL"]["fuel_surcharge"] == 10
    assert by_carrier["DHL"]["total_cost"] == 60
    assert results[0]["carrier"] == "FDX"  # surcharge changes which one is cheapest


def test_destination_match_ignores_case(card):
    assert len(pricing.compare(card, "  singapore ", 1, {})) == 2
    assert pricing.compare(card, "Atlantis", 1, {}) == []


def test_numeric_zone_codes_match(card):
    # Zone 4 is stored as a number in Excel; it must still match the mapping
    assert pricing.compare(card, "Japan", 0.5, {})[0]["total_cost"] == 90


def test_missing_sheet_is_rejected():
    with pytest.raises(pricing.RateCardError, match="Missing required sheet"):
        import io

        import pandas as pd

        buf = io.BytesIO()
        pd.DataFrame({"a": [1]}).to_excel(buf, sheet_name="Rates", index=False)
        pricing.read_card(buf.getvalue())


def test_garbage_file_is_rejected():
    with pytest.raises(pricing.RateCardError, match="Could not read"):
        pricing.read_card(b"not an excel file")


def test_health_check_finds_price_drop():
    card = pricing.read_card(make_card(dhl_half_kg=65))  # 0.5 kg now dearer than 1 kg
    messages = [w["message"] for w in pricing.check_card(card)]
    assert any("1.0 kg costs less than 0.5 kg" in m for m in messages)


def test_diff_counts_changed_prices(card):
    new = pricing.read_card(make_card(dhl_half_kg=55))
    diff = pricing.diff_cards(card, new)
    assert diff["prices_changed"] == 1
    assert diff["prices_up"] == 1
    assert diff["average_change_pct"] == 10.0
