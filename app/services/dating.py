"""Datering ved oppslag i serial_ranges. Ingen gjetting utover tabellene."""

import sqlite3

from app.models import CATEGORY_LABELS, WATCH_CATEGORIES, DatingResult, NormalizedFacts, PeriodEstimate

# Verk kunne ligge på lager før de ble satt i kasse og solgt.
STOCK_NOTE = "Året gjelder produksjon av verket; uret kan være satt i kasse og solgt noe senere."


def date_by_serial(conn: sqlite3.Connection, brand: str, serial: int, number_type: str) -> DatingResult | None:
    row = conn.execute(
        """SELECT serial_start, serial_end, year_from, year_to, source, is_demo
           FROM serial_ranges
           WHERE brand = ? AND number_type = ? AND ? BETWEEN serial_start AND serial_end
           ORDER BY (serial_end - serial_start) ASC LIMIT 1""",
        (brand, number_type, serial),
    ).fetchone()
    if row is None:
        return None

    year_from, year_to = row["year_from"], row["year_to"]
    if year_from == year_to:
        estimate, method = year_from, "Direkte treff i tabellen."
        display = f"ca. {estimate} (±1 år)"
    else:
        # Tabellen angir bare grensene; plassering innenfor er en lineær tilnærming.
        span = row["serial_end"] - row["serial_start"] + 1
        fraction = (serial - row["serial_start"]) / span
        estimate = min(year_to, year_from + int(fraction * (year_to - year_from + 1)))
        method = (f"Tabellen dekker {year_from}–{year_to}. Året er anslått ved lineær plassering "
                  "innenfor intervallet og er usikkert.")
        display = f"ca. {estimate} (innenfor {year_from}–{year_to})"

    label = "verksnummer" if number_type == "movement" else "kassenummer"
    return DatingResult(
        status="dated",
        message=f"Datert etter {label}. {STOCK_NOTE}",
        number_used=number_type, serial=serial,
        year_from=year_from, year_to=year_to, estimate=estimate,
        display=display, method=method, source=row["source"], is_demo=bool(row["is_demo"]),
    )


FEATURE_LABELS = {
    ("winding", "key"): "nøkkeloppstrekk", ("winding", "stem"): "kroneoppstrekk",
    ("escapement", "verge"): "spindelgang", ("escapement", "cylinder"): "sylindergang", ("escapement", "lever"): "ankergang",
    ("movement_layout", "bar"): "verk med broer", ("movement_layout", "three_quarter_plate"): "trekvart plate",
    ("movement_layout", "full_plate"): "hel plate",
}


def estimate_period(conn: sqlite3.Connection, facts: NormalizedFacts) -> PeriodEstimate | None:
    """Snitter periodene for kjente kjennetegn. Gir et intervall, aldri et årstall."""
    rows = []
    for feature in ("winding", "escapement", "movement_layout"):
        value = getattr(facts, feature)
        if value and value != "unknown":
            row = conn.execute("SELECT * FROM period_rules WHERE feature = ? AND value = ?", (feature, value)).fetchone()
            if row:
                rows.append(row)
    if not rows:
        return None
    year_from = max(r["year_from"] for r in rows)
    year_to = min(r["year_to"] for r in rows)
    if year_from > year_to:
        return None
    basis = [FEATURE_LABELS.get((r["feature"], r["value"]), r["value"]) for r in rows]
    return PeriodEstimate(year_from=year_from, year_to=year_to, basis=basis,
                          display=f"ca. {year_from}–{year_to}", is_demo=any(r["is_demo"] for r in rows))


def date_item(conn: sqlite3.Connection, facts: NormalizedFacts) -> DatingResult:
    """Serienummer først; ellers en grov periode ut fra kjennetegn. Tabellene finnes foreløpig bare for ur."""
    if facts.category not in WATCH_CATEGORIES:
        label = CATEGORY_LABELS.get(facts.category, "denne typen ting").lower()
        return DatingResult(status="no_tables",
                            message=f"Vi har ingen dateringstabeller for {label} ennå. Se bakgrunnen fra nettet ovenfor.")
    result = _date_by_number(conn, facts)
    if result.status != "dated":
        result.period = estimate_period(conn, facts)
    return result


def _date_by_number(conn: sqlite3.Connection, facts: NormalizedFacts) -> DatingResult:
    """Prøver verksnummer først, deretter kassenummer."""
    candidates = [(n, t) for n, t in ((facts.movement_serial, "movement"), (facts.case_number, "case")) if n]
    if not candidates:
        return DatingResult(status="no_serial", message="Fant ikke noe nummer å datere etter.")
    if not facts.brand:
        return DatingResult(status="unknown_brand",
                            message="Usignerte ur kan ikke dateres etter serienummer.")

    has_table = conn.execute("SELECT 1 FROM serial_ranges WHERE brand = ? LIMIT 1", (facts.brand,)).fetchone()
    if not has_table:
        return DatingResult(status="unknown_brand",
                            message=f"Vi har ingen serienummertabell for «{facts.brand_display or facts.brand}».")

    for serial, number_type in candidates:
        result = date_by_serial(conn, facts.brand, serial, number_type)
        if result:
            return result

    tried = ", ".join(f"{s:,}".replace(",", " ") for s, _ in candidates)
    return DatingResult(status="out_of_range",
                        message=f"Nummeret ({tried}) ligger utenfor tabellene våre for {facts.brand}. "
                                "Sjekk sifrene, eller om det er et annet nummer (f.eks. kaliber eller kasse).")
