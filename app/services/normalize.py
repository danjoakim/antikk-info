"""Deterministisk oversetting fra rå observasjoner til kanoniske verdier.

Ingen modell her: samme input gir alltid samme output, og alt kan testes.
"""

import re
import sqlite3

from app.models import ConfirmedFacts, MaterialMatch, NormalizedFacts, VisionFacts

MATERIAL_LABELS: dict[str, str] = {
    "gold_18k": "Gull 18 k",
    "gold_14k": "Gull 14 k",
    "gold_filled": "Forgylt / doublé",
    "silver_935": "Sølv 0.935",
    "silver_925": "Sølv 0.925",
    "silver_900": "Sølv 0.900",
    "silver_875": "Sølv 0.875",
    "silver_800": "Sølv 0.800",
    "steel": "Stål",
    "base_metal": "Uedelt metall (argentan, nikkel o.l.)",
}

ESCAPEMENT_LABELS: dict[str, str] = {
    "cylinder": "Sylindergang",
    "lever": "Ankergang",
    "verge": "Spindelgang",
    "unknown": "Ukjent",
}

# Merkenavn slik de kan stå på ur → kanonisk nøkkel i databasen.
BRAND_ALIASES: dict[str, str] = {
    "omega": "omega",
    "Ω": "omega",
    "longines": "longines",
    "zenith": "zenith",
    "tissot": "tissot",
    "iwc": "iwc",
    "international watch": "iwc",
    "doxa": "doxa",
    "cortebert": "cortebert",
    "tavannes": "tavannes",
    "cyma": "cyma",
    "moeris": "moeris",
    "roskopf": "roskopf",
}
UNSIGNED_WORDS = {"", "usignert", "unsigned", "ukjent", "unknown", "none", "null", "-", "ingen"}

PRECIOUS_PREFIXES = ("gold_18k", "gold_14k", "silver_")
NON_PRECIOUS = {"base_metal", "steel"}

_OCR_FIXES = str.maketrans({"o": "0", "O": "0", "D": "0", "l": "1", "I": "1", "|": "1",
                            "S": "5", "s": "5", "B": "8", "Z": "2", "z": "2"})
_SERIAL_PREFIX = re.compile(r"^\s*(n[o°º]\.?|nr\.?|no\.|#)\s*", re.IGNORECASE)
_SEPARATORS = re.compile(r"[\s.,'’_\-/]")


def normalize_brand(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if text.lower() in UNSIGNED_WORDS:
        return None
    lowered = text.lower()
    for alias, canonical in BRAND_ALIASES.items():
        if alias == "Ω" and alias in text:
            return canonical
        if re.search(rf"(^|[^a-z]){re.escape(alias)}([^a-z]|$)", lowered):
            return canonical
    return re.sub(r"\s+", " ", lowered)


def clean_serial(raw: str | None, label: str) -> tuple[int | None, list[str]]:
    """Renser et avlest nummer. Returnerer (tall, advarsler)."""
    if raw is None or not raw.strip():
        return None, []
    text = _SEPARATORS.sub("", _SERIAL_PREFIX.sub("", raw))
    if not text:
        return None, [f"{label}: kunne ikke tolkes («{raw}»)."]
    digit_share = sum(c.isdigit() for c in text) / len(text)
    if digit_share < 0.6:
        return None, [f"{label}: «{raw}» ser ikke ut som et nummer."]
    fixed = text.translate(_OCR_FIXES)
    warnings = []
    if fixed != text:
        warnings.append(f"{label}: tolket «{raw}» som {fixed}. Sjekk sifrene mot uret.")
    if not fixed.isdigit():
        return None, warnings + [f"{label}: «{raw}» inneholder tegn som ikke er siffer."]
    if not 3 <= len(fixed) <= 9:
        return None, warnings + [f"{label}: {fixed} har uvanlig antall siffer."]
    return int(fixed), warnings


def detect_material(conn: sqlite3.Connection, stamps: list[str]) -> tuple[str | None, list[MaterialMatch], list[str]]:
    """Finner kassematerialet fra stempler via hallmarks-tabellen."""
    rules = conn.execute("SELECT pattern, material, label, priority FROM hallmarks").fetchall()
    matches: list[tuple[int, MaterialMatch]] = []
    cuvette_base_metal = False
    for stamp in stamps:
        text = stamp.lower().replace(",", ".").strip()
        if not text:
            continue
        on_cuvette = "cuvette" in text
        for rule in rules:
            if re.search(rule["pattern"], text):
                # «Cuvette Métal» sier bare at det indre lokket er av metall, ikke hva kassen er laget av.
                if on_cuvette and rule["material"] in NON_PRECIOUS:
                    cuvette_base_metal = True
                    continue
                matches.append((rule["priority"], MaterialMatch(stamp=stamp, material=rule["material"], label=rule["label"])))
    if not matches:
        if cuvette_base_metal:
            return None, [], ["Bare cuvetten (det indre lokket) er merket metall. Det sier ikke hva kassen er laget av. "
                              "Se etter stempel i det ytre lokket, eller velg materiale manuelt."]
        warnings = ["Fant ikke noe kjent materialstempel. Velg materiale manuelt."] if stamps else []
        return None, [], warnings

    matches.sort(key=lambda m: m[0], reverse=True)
    chosen = matches[0][1].material
    found = {m.material for _, m in matches}
    warnings = []
    precious = {m for m in found if m.startswith(PRECIOUS_PREFIXES)}
    if precious and found & NON_PRECIOUS:
        warnings.append("Både edelt og uedelt metall er stemplet på kassen. Ofte er bare innerlokket (cuvetten) i metall. "
                        "Bekreft materialet for selve kassen.")
    if len(precious) > 1:
        warnings.append("Flere ulike edelmetallstempler er funnet. Bekreft materialet.")
    unique = list({m.stamp + m.material: m for _, m in matches}.values())
    return chosen, unique, warnings


def normalize(conn: sqlite3.Connection, facts: VisionFacts | ConfirmedFacts) -> NormalizedFacts:
    warnings: list[str] = []

    if isinstance(facts, VisionFacts):
        brand = normalize_brand(facts.brand_signed) or (
            normalize_brand(facts.dial_text) if facts.dial_text and _mentions_known_brand(facts.dial_text) else None)
        explicit_material = None
    else:
        brand = normalize_brand(facts.brand)
        explicit_material = facts.material or None

    movement, w = clean_serial(facts.movement_serial, "Verksnummer")
    warnings += w
    case, w = clean_serial(facts.case_number, "Kassenummer")
    warnings += w

    detected, matches, w = detect_material(conn, facts.case_stamps)
    if explicit_material:
        if explicit_material not in MATERIAL_LABELS:
            warnings.append(f"Ukjent materialkode «{explicit_material}».")
            material = detected
        else:
            material = explicit_material
    else:
        material = detected
        warnings += w

    return NormalizedFacts(brand=brand, movement_serial=movement, case_number=case,
                           escapement=facts.escapement, material=material,
                           material_matches=matches, warnings=warnings)


def _mentions_known_brand(text: str) -> bool:
    return normalize_brand(text) in set(BRAND_ALIASES.values())
