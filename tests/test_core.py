"""Tester for kjernen: normalisering, datering og verdivurdering mot demodataene."""

from app.db.database import init_db
from app.models import ConfirmedFacts, NormalizedFacts, VisionFacts
from app.services.dating import date_item
from app.services.normalize import clean_serial, detect_material, normalize, normalize_brand
from app.services.valuation import value_item


# --- Normalisering -----------------------------------------------------------

def test_clean_serial_handles_separators_and_prefix():
    assert clean_serial("No 2.345.678", "x") == (2345678, [])
    assert clean_serial("1 234 567", "x")[0] == 1234567


def test_clean_serial_fixes_ocr_confusions_with_warning():
    value, warnings = clean_serial("2O45l78", "Verksnummer")
    assert value == 2045178
    assert warnings and "Sjekk sifrene" in warnings[0]


def test_clean_serial_rejects_text():
    value, warnings = clean_serial("Swiss Made", "Kassenummer")
    assert value is None and warnings


def test_brand_normalization():
    assert normalize_brand("OMEGA Watch Co.") == "omega"
    assert normalize_brand("Ω") == "omega"
    assert normalize_brand("usignert") is None
    assert normalize_brand(None) is None


def test_material_from_stamps(conn):
    assert detect_material(conn, ["0,800"])[0] == "silver_800"
    assert detect_material(conn, ["ARGENTAN"])[0] == "base_metal"
    assert detect_material(conn, ["Métal"])[0] == "base_metal"
    assert detect_material(conn, ["0.935", "Swiss"])[0] == "silver_935"


def test_cuvette_metal_does_not_decide_case_material(conn):
    # «Cuvette Métal» gjelder bare det indre lokket: sølvstempelet på kassen avgjør, uten advarsel.
    material, _, warnings = detect_material(conn, ["0.800", "Cuvette: Métal"])
    assert material == "silver_800" and warnings == []
    # Er bare cuvetten merket, vet vi ikke hva kassen er laget av.
    material, _, warnings = detect_material(conn, ["Cuvette Métal"])
    assert material is None and "Bare cuvetten" in warnings[0]


def test_material_conflict_on_case_prefers_precious_and_warns(conn):
    material, _, warnings = detect_material(conn, ["0.800", "Métal"])
    assert material == "silver_800"
    assert any("cuvetten" in w for w in warnings)


def test_case_numbers_are_not_mistaken_for_silver(conn):
    # 1800 og 8001 skal ikke gi treff på 800
    assert detect_material(conn, ["1800"])[0] is None
    assert detect_material(conn, ["8001"])[0] is None


def test_brand_found_in_dial_text(conn):
    facts = VisionFacts(dial_text="OMEGA", movement_serial="2 345 678", escapement="lever")
    assert normalize(conn, facts).brand == "omega"


def test_confirmed_material_overrides_stamps(conn):
    facts = ConfirmedFacts(brand="Omega", material="silver_875", case_stamps=["0.800"], escapement="lever")
    assert normalize(conn, facts).material == "silver_875"


# --- Datering ----------------------------------------------------------------

def test_dating_interpolates_within_range(conn):
    result = date_item(conn, NormalizedFacts(brand="omega", movement_serial=2500000))
    assert result.status == "dated"
    assert (result.year_from, result.year_to) == (1908, 1911)
    assert result.estimate == 1910
    assert result.is_demo and result.number_used == "movement"


def test_dating_at_range_boundaries(conn):
    assert date_item(conn, NormalizedFacts(brand="omega", movement_serial=1000000)).estimate == 1895
    assert date_item(conn, NormalizedFacts(brand="omega", movement_serial=4999999)).estimate == 1922


def test_dating_falls_back_to_case_number_type(conn):
    # Ingen kassetabell i demodata: verksnummer utenfor, kassenummer gir heller ikke treff
    result = date_item(conn, NormalizedFacts(brand="omega", movement_serial=99999999, case_number=12345))
    assert result.status == "out_of_range"


def test_dating_requires_brand_and_serial(conn):
    assert date_item(conn, NormalizedFacts(brand=None, movement_serial=123456)).status == "unknown_brand"
    assert date_item(conn, NormalizedFacts(brand="omega")).status == "no_serial"
    assert date_item(conn, NormalizedFacts(brand="zenith", movement_serial=123456)).status == "unknown_brand"


# --- Verdivurdering ----------------------------------------------------------

def test_valuation_exact_match_omega_silver(conn):
    v = value_item(conn, NormalizedFacts(brand="omega", material="silver_800", escapement="lever"))
    assert v.match_level == "brand+material+escapement"
    assert (v.min, v.median, v.max, v.n_sales) == (1500, 2300, 3800, 8)
    assert v.sufficient_data and v.is_demo
    assert v.period == "2019–2025"


def test_valuation_unsigned_cylinder_metal(conn):
    v = value_item(conn, NormalizedFacts(brand=None, material="base_metal", escapement="cylinder"))
    assert (v.min, v.median, v.max, v.n_sales) == (150, 265, 450, 10)
    assert v.match_label.startswith("Usignerte ur")


def test_valuation_widens_when_too_few_sales(conn):
    v = value_item(conn, NormalizedFacts(brand="omega", material="silver_875", escapement="lever"))
    assert v.match_level == "brand+escapement"
    assert v.criteria_dropped == ["materiale"]
    assert any("ser bort fra materiale" in c for c in v.caveats)


def test_valuation_marks_insufficient_data(conn):
    v = value_item(conn, NormalizedFacts(brand="omega", material="base_metal", escapement="lever"), min_sales=50)
    assert not v.sufficient_data
    assert v.match_level == "brand+material+escapement"


def test_valuation_never_mixes_signed_with_unsigned(conn):
    assert value_item(conn, NormalizedFacts(brand="zenith", material="silver_800", escapement="lever")) is None


def test_valuation_skips_unknown_criteria(conn):
    v = value_item(conn, NormalizedFacts(brand="omega", material="silver_800", escapement="unknown"))
    assert v.match_level == "brand+material"
    assert any("ukjent" in c for c in v.caveats)


def test_init_db_does_not_duplicate_seed(db_path, conn):
    init_db(db_path)
    assert conn.execute("SELECT COUNT(*) FROM serial_ranges").fetchone()[0] == 5
