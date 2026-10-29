"""Deterministisk oversetting fra rå observasjoner til kanoniske verdier.

Ingen modell her: samme input gir alltid samme output, og alt kan testes.
"""

import re
import sqlite3

from app.models import (LOCATION_LABELS, ConfirmedFacts, MarkObservation, MaterialMatch, NormalizedFacts, NumberGroup,
                        NumberObservation, VisionFacts)

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
KNOWN_BRANDS = set(BRAND_ALIASES.values())

WINDING_LABELS: dict[str, str] = {"key": "Nøkkeloppstrekk", "stem": "Krone (remontoir)", "unknown": "Ukjent"}
LAYOUT_LABELS: dict[str, str] = {
    "bar": "Broer (Lépine)", "three_quarter_plate": "Trekvart plate", "full_plate": "Hel plate", "unknown": "Ukjent",
}
# Merketyper som kan si noe om kassematerialet. Eiergravering, reparasjoner og kassemakermerker gjør ikke det.
MATERIAL_MARK_TYPES = {"fineness", "hallmark_symbol", "inscription", "other"}
_CITY_SUFFIX = re.compile(r"[,\s]*(à\s+|a\s+)?(gen[eèé]ve|geneva|genf|la chaux-de-fonds|le locle|bienne|biel|"
                          r"suisse|switzerland|swiss made|schweiz)\s*$", re.IGNORECASE)
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


def _strip_city(text: str) -> str:
    return _CITY_SUFFIX.sub("", text).strip(" ,")


def brand_info(raw: str | None) -> tuple[str | None, str | None, bool]:
    """(kanonisk nøkkel, visningsnavn, kjent merke). Bynavn som «Genève» tas ikke med i nøkkelen."""
    display = (raw or "").strip()
    if display.lower() in UNSIGNED_WORDS:
        return None, None, False
    canonical = normalize_brand(_strip_city(display) or display)
    return canonical, display, canonical in KNOWN_BRANDS


def _stamp_text(mark: MarkObservation) -> str:
    """Merker fra cuvetten får prefikset «Cuvette:», slik at metallmerket der ikke avgjør kassematerialet."""
    return f"Cuvette: {mark.text}" if mark.location.startswith("cuvette") else mark.text


def _analyse_numbers(numbers: list[NumberObservation]) -> tuple[list[NumberGroup], list[str], list[str]]:
    """Grupperer like nummer på tvers av deler. Innrissede nummer regnes som reparasjonsmerker."""
    groups: dict[int, list[str]] = {}
    repairs: list[str] = []
    warnings: list[str] = []
    for n in numbers:
        where = LOCATION_LABELS.get(n.location, n.location)
        if n.method == "scratched":
            repairs.append(f"{n.value} ({where})")
            continue
        value, _ = clean_serial(n.value, "Nummer")
        if value is None:
            warnings.append(f"Så bort fra «{n.value}» ({where}): ikke et rent nummer, kanskje et reparasjonsmerke.")
            continue
        locations = groups.setdefault(value, [])
        if n.location not in locations:
            locations.append(n.location)
    result = [NumberGroup(value=v, locations=locs, role="movement" if "movement" in locs else "case")
              for v, locs in groups.items()]
    result.sort(key=lambda g: len(g.locations), reverse=True)
    case_groups = [g for g in result if g.role == "case"]
    if len(case_groups) > 1:
        values = ", ".join(str(g.value) for g in case_groups)
        warnings.append(f"Ulike nummer i kassen ({values}). Lokkene kan være satt sammen av forskjellige ur, "
                        "eller ett av numrene betyr noe annet.")
    return result, repairs, warnings


def normalize(conn: sqlite3.Connection, facts: VisionFacts | ConfirmedFacts) -> NormalizedFacts:
    warnings: list[str] = []
    groups: list[NumberGroup] = []
    repairs: list[str] = []
    owner: list[str] = []

    if isinstance(facts, VisionFacts):
        candidates = [facts.brand_signed] + [m.text for m in facts.marks if m.type == "inscription"] + [facts.dial_text]
        brand, display, known = brand_info(facts.brand_signed)
        if not known:  # et kjent merke et annet sted på uret slår et ukjent navn
            for text in candidates[1:]:
                b, d, k = brand_info(text)
                if k:
                    brand, display, known = b, d, k
                    break
        groups, repairs, w = _analyse_numbers(facts.numbers)
        warnings += w
        repairs += [f"{m.text} ({LOCATION_LABELS.get(m.location, m.location)})"
                    for m in facts.marks if m.type == "repair_mark"]
        owner = [f"{m.text} ({LOCATION_LABELS.get(m.location, m.location)})"
                 for m in facts.marks if m.type == "owner_engraving"]
        stamps = [_stamp_text(m) for m in facts.marks if m.type in MATERIAL_MARK_TYPES]
        movement = next((g.value for g in groups if g.role == "movement"), None)
        case = next((g.value for g in groups if g.role == "case"), None)
        explicit_material = None
    else:
        brand, display, known = brand_info(facts.brand)
        movement, w = clean_serial(facts.movement_serial, "Verksnummer")
        warnings += w
        case, w = clean_serial(facts.case_number, "Kassenummer")
        warnings += w
        stamps = list(facts.case_stamps)
        explicit_material = facts.material or None

    detected, matches, w = detect_material(conn, stamps)
    if explicit_material:
        if explicit_material not in MATERIAL_LABELS:
            warnings.append(f"Ukjent materialkode «{explicit_material}».")
            material = detected
        else:
            material = explicit_material
    else:
        material = detected
        warnings += w

    case_group = next((g for g in groups if g.role == "case"), None)
    return NormalizedFacts(
        brand=brand, brand_display=display, known_brand=known,
        movement_serial=movement, case_number=case,
        number_groups=groups, numbers_match=bool(case_group and len(case_group.locations) > 1),
        repair_marks=repairs, owner_engravings=owner,
        escapement=facts.escapement, winding=facts.winding, movement_layout=facts.movement_layout,
        material=material, material_matches=matches, case_stamps=stamps, warnings=warnings,
    )
