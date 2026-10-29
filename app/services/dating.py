"""Datering ved oppslag i serial_ranges. Ingen gjetting utover tabellene."""

import sqlite3

from app.models import DatingResult, NormalizedFacts

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


def date_item(conn: sqlite3.Connection, facts: NormalizedFacts) -> DatingResult:
    """Prøver verksnummer først, deretter kassenummer."""
    candidates = [(n, t) for n, t in ((facts.movement_serial, "movement"), (facts.case_number, "case")) if n]
    if not candidates:
        return DatingResult(status="no_serial", message="Ingen lesbare serienumre. Ta et nærbilde av urverket.")
    if not facts.brand:
        return DatingResult(status="unknown_brand",
                            message="Usignerte ur kan ikke dateres etter serienummer. "
                                    "Stempler og gangtype gir bare en grov periode.")

    has_table = conn.execute("SELECT 1 FROM serial_ranges WHERE brand = ? LIMIT 1", (facts.brand,)).fetchone()
    if not has_table:
        return DatingResult(status="unknown_brand",
                            message=f"Vi har ingen serienummertabell for «{facts.brand}» ennå.")

    for serial, number_type in candidates:
        result = date_by_serial(conn, facts.brand, serial, number_type)
        if result:
            return result

    tried = ", ".join(f"{s:,}".replace(",", " ") for s, _ in candidates)
    return DatingResult(status="out_of_range",
                        message=f"Nummeret ({tried}) ligger utenfor tabellene våre for {facts.brand}. "
                                "Sjekk sifrene, eller om det er et annet nummer (f.eks. kaliber eller kasse).")
