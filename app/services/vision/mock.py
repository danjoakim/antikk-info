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
        unreadable=["dial", "outer_lid_inside", "cuvette_outside", "movement"],
        retake_hints=["Bildene er for uskarpe. Hold telefonen stødig og gå nærmere.",
                      "Unngå refleks: vipp uret litt bort fra lyskilden."],
    ),
}


def mock_facts(scenario: str | None) -> VisionFacts:
    default = "monard_key_wind"
    return MOCK_SCENARIOS.get(scenario or default, MOCK_SCENARIOS[default]).model_copy(deep=True)
