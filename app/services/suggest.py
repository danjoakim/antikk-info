"""Hvilket bilde vil hjelpe mest? Regler ut fra hva som mangler og hva som allerede er fotografert.

Ingen modell her. Ett godt kjennetegn kan være nok, så appen foreslår høyst to bilder,
og ingenting når det den vet holder til en vurdering.
"""

import sqlite3

from app.models import LOCATION_LABELS, NormalizedFacts, Suggestion, VisionFacts

MAX_SUGGESTIONS = 2


def _seen(facts: VisionFacts) -> set[str]:
    """Deler som er fotografert og faktisk lest (ikke oppført som uleselige)."""
    shown = {p.shows for p in facts.photos}
    shown |= {n.location for n in facts.numbers} | {m.location for m in facts.marks}
    return shown - set(facts.unreadable) - {"unknown"}


def suggest_photos(conn: sqlite3.Connection, facts: VisionFacts, n: NormalizedFacts) -> list[Suggestion]:
    seen = _seen(facts)
    wanted: list[tuple[str, str]] = []

    def want(location: str, reason: str) -> None:
        if location not in seen and all(loc != location for loc, _ in wanted):
            wanted.append((location, reason))

    if not seen:
        want("outer_lid_inside", "Innsiden av lokkene har oftest mest: sølvstempel, nummer og ofte navn.")
        want("cuvette_outside", "Cuvetten har ofte gravert navn, gangtype og antall steiner.")
    has_table = bool(n.brand) and conn.execute(
        "SELECT 1 FROM serial_ranges WHERE brand = ? LIMIT 1", (n.brand,)).fetchone() is not None
    if has_table and n.movement_serial is None:
        want("movement", f"Vi har serienummertabell for {n.brand_display or n.brand}. Et verksnummer kan datere uret.")
    if n.material is None:
        want("outer_lid_inside", "Sølv- og gullstempler står vanligvis på innsiden av det ytre lokket.")
        want("cuvette_inside", "Stempelet kan også stå inni cuvetten.")
    if not n.brand and not any(m.type == "inscription" for m in facts.marks):
        want("cuvette_outside", "Navnet på urmaker eller forhandler står ofte gravert på cuvetten.")
        want("dial", "Urskiven kan være signert.")
    if n.escapement == "unknown":
        want("cuvette_outside", "Gangtypen («Ancre», «Cylindre») står ofte på cuvetten.")
        want("movement", "Urverket viser gangtypen.")
    if n.winding == "unknown":
        want("movement", "Firkantede tapper på verket betyr nøkkeloppstrekk.")
    if n.case_number and not n.numbers_match:
        want("cuvette_inside", "Står samme nummer i cuvetten, hører lokkene trolig sammen.")

    return [Suggestion(location=loc, label=LOCATION_LABELS.get(loc, loc), reason=why)
            for loc, why in wanted[:MAX_SUGGESTIONS]]
