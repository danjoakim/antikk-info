import pytest
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
    facts = VisionFacts(dial_text="OMEGA", numbers=[{"value": "2 345 678", "location": "movement"}], escapement="lever")
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
    assert v.match_label.startswith("Usignerte og mindre kjente ur")


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


# --- Ekte ur: G. Monard, Genève (fasit i app/services/vision/examples) -------------

from app.services.vision.mock import MOCK_SCENARIOS  # noqa: E402

MONARD = MOCK_SCENARIOS["monard_key_wind"]


def test_monard_numbers_and_marks(conn):
    n = normalize(conn, MONARD)
    assert n.brand == "g. monard" and n.brand_display == "G. Monard, Genève" and n.known_brand
    assert n.case_number == 101954 and n.movement_serial is None
    assert n.numbers_match
    assert n.number_groups[0].locations == ["outer_lid_inside", "cuvette_outside", "cuvette_inside"]
    assert any("K9341" in r for r in n.repair_marks)          # innrisset, ikke serienummer
    assert any("balansebroen" in r for r in n.repair_marks)
    assert len(n.owner_engravings) == 2                       # monogram og initialer er ikke stempler
    assert n.material == "silver_800" and n.warnings == []     # sølvcuvette gir ingen konflikt
    assert (n.escapement, n.winding, n.movement_layout) == ("cylinder", "key", "bar")


def test_monard_dating_gives_rough_period_only(conn):
    d = date_item(conn, normalize(conn, MONARD))
    assert d.status == "unknown_brand" and d.estimate is None
    assert (d.period.year_from, d.period.year_to) == (1830, 1890)
    assert d.period.basis == ["nøkkeloppstrekk", "sylindergang", "verk med broer"]


def test_monard_valued_against_unsigned(conn):
    v = value_item(conn, normalize(conn, MONARD))
    assert v.match_level == "brand+material+escapement"
    assert (v.min, v.median, v.max, v.n_sales) == (450, 625, 900, 6)
    assert any("G. Monard" in c and "ingen salg av" in c for c in v.caveats)


def test_scratched_or_lettered_numbers_never_become_serials(conn):
    facts = VisionFacts(numbers=[{"value": "K9341", "location": "outer_lid_inside", "method": "stamped"},
                                 {"value": "4512", "location": "movement", "method": "scratched"}])
    n = normalize(conn, facts)
    assert n.case_number is None and n.movement_serial is None
    assert any("K9341" in w for w in n.warnings) and any("4512" in r for r in n.repair_marks)


def test_mismatched_case_numbers_warn(conn):
    facts = VisionFacts(numbers=[{"value": "101954", "location": "outer_lid_inside", "method": "stamped"},
                                 {"value": "55321", "location": "cuvette_inside", "method": "stamped"}])
    n = normalize(conn, facts)
    assert not n.numbers_match and any("satt sammen" in w for w in n.warnings)


def test_contradictory_features_give_no_period(conn):
    from app.models import NormalizedFacts as NF
    assert date_item(conn, NF(winding="key", escapement="unknown", movement_layout="unknown")).period.year_to == 1890
    # spindelgang (–1870) og kroneoppstrekk (1860–) overlapper; nøkkel + hel plate gir bredt intervall
    assert date_item(conn, NF(escapement="verge", winding="stem")).period.display == "ca. 1860–1870"


# --- Forslag til neste bilde -------------------------------------------------------

from app.services.suggest import suggest_photos  # noqa: E402


def _suggest(conn, facts):
    return [s.location for s in suggest_photos(conn, facts, normalize(conn, facts))]


def test_monard_needs_no_more_photos(conn):
    assert _suggest(conn, MONARD) == []


def test_known_brand_without_serial_asks_for_movement(conn):
    facts = VisionFacts(photos=[{"index": 1, "shows": "dial"}], dial_text="OMEGA", brand_signed="Omega",
                        marks=[{"text": "0.800", "location": "outer_lid_inside", "type": "fineness"}],
                        escapement="lever", winding="stem")
    assert _suggest(conn, facts)[0] == "movement"


def test_nothing_readable_suggests_lids_first(conn):
    facts = VisionFacts(photos=[{"index": 1, "shows": "dial"}], unreadable=["dial"])
    assert _suggest(conn, facts) == ["outer_lid_inside", "cuvette_outside"]


def test_missing_material_points_to_lid_but_not_if_already_seen(conn):
    facts = VisionFacts(photos=[{"index": 1, "shows": "outer_lid_inside"}], escapement="cylinder", winding="key",
                        marks=[{"text": "G. Monard", "location": "cuvette_outside", "type": "inscription"}])
    assert "outer_lid_inside" not in _suggest(conn, facts)
    assert _suggest(conn, facts)[0] == "cuvette_inside"
    assert len(_suggest(conn, facts)) <= 2


# --- Om navnet ------------------------------------------------------------------------

from app.services.makers import maker_info  # noqa: E402


def test_maker_info_for_monard(conn):
    m = maker_info(normalize(conn, MONARD))
    assert m.display_name == "G. Monard, Genève" and not m.is_verified
    assert "tolkning" in m.interpretation.lower() and m.sources
    assert maker_info(normalize(conn, VisionFacts())) is None


# --- Merkelisten: kjente merker, navnevarianter og ukjente navn ---------------------------

from app.services.normalize import brand_info  # noqa: E402
from app.services.valuation import no_sales_message  # noqa: E402


@pytest.mark.parametrize("written", ["Vacheron Constantin", "VACHERON & CONSTANTIN GENÈVE", "Vacheron et Constantin, Genève"])
def test_vacheron_variants_are_recognised(written):
    brand, display, known = brand_info(written)
    assert brand == "vacheron constantin" and known and display == written


def test_famous_brand_is_never_priced_as_unsigned(conn):
    facts = normalize(conn, ConfirmedFacts(brand="Vacheron Constantin", material="silver_800", escapement="cylinder"))
    assert value_item(conn, facts) is None
    assert "Vacheron Constantin" in no_sales_message(facts)
    m = maker_info(facts)
    assert m.tier == "haute" and m.founded == 1755 and "forfalsket" in m.advice


def test_unknown_name_is_not_priced_and_says_why(conn):
    facts = normalize(conn, ConfirmedFacts(brand="Hans Hansen, Bergen", material="silver_800", escapement="cylinder"))
    assert not facts.known_brand and value_item(conn, facts) is None
    assert "kjenner ikke navnet" in no_sales_message(facts) and maker_info(facts) is None


def test_mass_brand_compared_with_unsigned(conn):
    facts = normalize(conn, ConfirmedFacts(brand="Roskopf", material="base_metal", escapement="cylinder"))
    v = value_item(conn, facts)
    assert v is not None and v.match_label.startswith("Usignerte og mindre kjente ur")


def test_maker_on_cuvette_wins_over_retailer_on_dial(conn):
    facts = VisionFacts(brand_signed="J. Tostrup", marks=[{"text": "Vacheron & Constantin Genève", "location": "cuvette_outside", "type": "inscription"}])
    n = normalize(conn, facts)
    assert n.brand == "vacheron constantin" and n.retailer == "J. Tostrup"
