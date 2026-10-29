"""Faste eksempler som gjør hele flyten kjørbar uten API-nøkkel."""

from app.models import VisionFacts

MOCK_SCENARIOS: dict[str, VisionFacts] = {
    "omega_silver": VisionFacts(
        dial_text="OMEGA", brand_signed="Omega", movement_serial="2 345 678", case_number="6 012 345",
        escapement="lever", escapement_evidence="Cuvetten er gravert «Ancre 15 Rubis», og ankergaffelen er synlig i verket.",
        case_stamps=["0,800", "Tiur-stempel (grouse hallmark)", "Cuvette: Métal"], jewels=15,
        confidence={"brand_signed": 0.97, "movement_serial": 0.86, "case_number": 0.74,
                    "escapement": 0.9, "case_stamps": 0.88},
    ),
    "cylinder_metal": VisionFacts(
        dial_text="Remontoir Cylindre 10 Rubis", brand_signed=None, movement_serial=None, case_number="48213",
        escapement="cylinder", escapement_evidence="Urskiven og verket er merket «Cylindre».",
        case_stamps=["ARGENTAN"], jewels=10,
        confidence={"case_number": 0.8, "escapement": 0.92, "case_stamps": 0.95},
        unreadable=["movement_serial"],
        retake_hints=["Fant ikke verksnummer. Ta et nærbilde av broene på verket i skrått lys."],
    ),
    "unreadable": VisionFacts(
        escapement="unknown", case_stamps=[], confidence={},
        unreadable=["dial_text", "movement_serial", "case_number", "case_stamps", "escapement"],
        retake_hints=["Bildene er for uskarpe. Hold telefonen stødig og gå nærmere.",
                      "Unngå refleks: vipp uret litt bort fra lyskilden."],
    ),
}


def mock_facts(scenario: str | None) -> VisionFacts:
    return MOCK_SCENARIOS.get(scenario or "omega_silver", MOCK_SCENARIOS["omega_silver"]).model_copy(deep=True)
