"""Faste eksempler som gjør hele flyten kjørbar uten API-nøkkel."""

import json
from pathlib import Path

from app.models import VisionFacts

EXAMPLES = Path(__file__).resolve().parent / "examples"


def _example(name: str) -> VisionFacts:
    data = json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))
    return VisionFacts.model_validate({k: v for k, v in data.items() if not k.startswith("_")})


MOCK_SCENARIOS: dict[str, VisionFacts] = {
    # Ekte ur, avlest manuelt fra brukerens bilder.
    "monard_key_wind": _example("monard_101954"),
    "omega_silver": VisionFacts(
        category="pocket_watch", object_type="lommeur",
        photos=[{"index": 1, "shows": "dial"}, {"index": 2, "shows": "outer_lid_inside"}],
        dial_text="OMEGA", brand_signed="Omega",
        numbers=[{"value": "2 345 678", "location": "movement", "method": "engraved"},
                 {"value": "6 012 345", "location": "outer_lid_inside", "method": "stamped"},
                 {"value": "6 012 345", "location": "cuvette_inside", "method": "stamped"}],
        marks=[{"text": "0,800", "location": "outer_lid_inside", "type": "fineness"},
               {"text": "grouse hallmark", "location": "outer_lid_inside", "type": "hallmark_symbol"},
               {"text": "Métal", "location": "cuvette_outside", "type": "inscription"},
               {"text": "Ancre 15 Rubis", "location": "cuvette_outside", "type": "inscription"}],
        escapement="lever", escapement_evidence="Cuvetten er gravert «Ancre 15 Rubis», og ankergaffelen er synlig.",
        winding="stem", winding_evidence="Krone på pendanten.", movement_layout="three_quarter_plate", jewels=15,
        confidence={"brand_signed": 0.97, "numbers": 0.8, "marks": 0.88, "escapement": 0.9, "winding": 0.9},
    ),
    "cylinder_metal": VisionFacts(
        category="pocket_watch", object_type="lommeur",
        photos=[{"index": 1, "shows": "dial"}, {"index": 2, "shows": "outer_lid_inside"}],
        dial_text="Remontoir Cylindre 10 Rubis",
        numbers=[{"value": "48213", "location": "outer_lid_inside", "method": "stamped"}],
        marks=[{"text": "ARGENTAN", "location": "outer_lid_inside", "type": "inscription"}],
        escapement="cylinder", escapement_evidence="Urskiven er merket «Cylindre».",
        winding="stem", winding_evidence="Urskiven er merket «Remontoir», og pendanten har krone.",
        movement_layout="bar", jewels=10,
        confidence={"numbers": 0.8, "marks": 0.95, "escapement": 0.92, "winding": 0.85},
        unreadable=["movement"],
        retake_hints=["Fant ingen tekst på verket. Det er vanlig, men ta gjerne et nærbilde i skrått lys."],
    ),
    "unreadable": VisionFacts(
        category="pocket_watch", object_type="lommeur",
        unreadable=["dial", "outer_lid_inside", "cuvette_outside", "movement"],
        retake_hints=["Bildene er for uskarpe. Hold telefonen stødig og gå nærmere.",
                      "Unngå refleks: vipp uret litt bort fra lyskilden."],
    ),
    # Demo av andre kategorier (oppdiktede eksempler, ikke ekte gjenstander).
    "porcelain_demo": VisionFacts(
        category="porcelain_ceramics", object_type="kaffekanne",
        description="Kaffekanne i hvitt porselen med blå blomsterdekor og forgylt kant.",
        materials=["porselen"], style_cues=["trykt dekor", "forgylt kant"],
        photos=[{"index": 1, "shows": "front"}, {"index": 2, "shows": "base"}],
        brand_signed="Porsgrund",
        numbers=[{"value": "2511", "location": "base", "method": "unknown", "prefix": None}],
        marks=[{"text": "Porsgrund Made in Norway, trykt fabrikkstempel med anker", "location": "base", "type": "factory_mark"}],
        confidence={"category": 0.95, "brand_signed": 0.9, "numbers": 0.7, "marks": 0.85},
    ),
    "silver_spoon_demo": VisionFacts(
        category="silver_metal", object_type="spiseskje",
        description="Spiseskje med blomsterornamentikk på skaftet.",
        materials=["sølv"], style_cues=["støpt ornamentikk"],
        photos=[{"index": 1, "shows": "front"}, {"index": 2, "shows": "back"}],
        brand_signed=None,
        marks=[{"text": "830S", "location": "back", "type": "fineness"},
               {"text": "TH.M", "location": "back", "type": "maker_mark"}],
        confidence={"category": 0.9, "marks": 0.8},
        retake_hints=["Ta et nærbilde av stemplene på baksiden av skaftet, med lyset fra siden."],
    ),
}


def mock_facts(scenario: str | None) -> VisionFacts:
    default = "monard_key_wind"
    return MOCK_SCENARIOS.get(scenario or default, MOCK_SCENARIOS[default]).model_copy(deep=True)
