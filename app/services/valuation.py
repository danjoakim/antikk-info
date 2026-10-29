"""Prisintervall fra realiserte salg. Aldri én enkelt «fasitpris»."""

import sqlite3
import statistics

from app.models import ComparableSale, NormalizedFacts, Valuation

# Fra mest til minst spesifikt. Merke slippes aldri: et signert ur sammenlignes ikke med usignerte.
LEVELS: list[tuple[str, tuple[str, ...], str]] = [
    ("brand+material+escapement", ("material", "escapement"), "{who}, samme materiale og gangtype"),
    ("brand+material", ("material",), "{who}, samme materiale (gangtype ikke vektlagt)"),
    ("brand+escapement", ("escapement",), "{who}, samme gangtype (materiale ikke vektlagt)"),
    ("brand", (), "{who} (materiale og gangtype ikke vektlagt)"),
]
CRITERIA_LABELS = {"material": "materiale", "escapement": "gangtype"}
BASE_CAVEATS = [
    "Tilstand er ikke vurdert fra bildene, og den påvirker prisen mest.",
    "Prisene er hammerpriser uten salær med mindre annet er oppgitt.",
]


def _fetch(conn: sqlite3.Connection, facts: NormalizedFacts, item_type: str, use: tuple[str, ...]) -> list[sqlite3.Row]:
    clauses, params = ["item_type = ?"], [item_type]
    if facts.brand is None:
        clauses.append("brand IS NULL")
    else:
        clauses.append("brand = ?")
        params.append(facts.brand)
    for field in use:
        clauses.append(f"{field} = ?")
        params.append(getattr(facts, field))
    sql = f"SELECT * FROM auction_results WHERE {' AND '.join(clauses)} ORDER BY sale_date DESC"
    return conn.execute(sql, params).fetchall()


def value_item(conn: sqlite3.Connection, facts: NormalizedFacts, item_type: str = "pocket_watch",
               min_sales: int = 5) -> Valuation | None:
    usable_levels = [lvl for lvl in LEVELS if all(_known(facts, f) for f in lvl[1])]

    fallback: tuple[tuple, list] | None = None
    for level in usable_levels:
        rows = _fetch(conn, facts, item_type, level[1])
        if len(rows) >= min_sales:
            return _build(level, rows, facts, sufficient=True, min_sales=min_sales)
        if rows and fallback is None:
            fallback = (level, rows)
    if fallback:
        return _build(*fallback, facts, sufficient=False, min_sales=min_sales)
    return None


def _known(facts: NormalizedFacts, field: str) -> bool:
    value = getattr(facts, field)
    return value is not None and value != "unknown"


def _build(level: tuple, rows: list[sqlite3.Row], facts: NormalizedFacts, sufficient: bool,
           min_sales: int) -> Valuation:
    key, used, label = level
    label = label.format(who="Samme merke" if facts.brand else "Usignerte ur")
    prices = [r["price_nok"] for r in rows]
    years = sorted(r["sale_date"][:4] for r in rows)
    dropped = [CRITERIA_LABELS[f] for f in ("material", "escapement") if f not in used]

    unknown = [CRITERIA_LABELS[f] for f in ("material", "escapement") if not _known(facts, f)]
    widened = [d for d in dropped if d not in unknown]

    caveats = list(BASE_CAVEATS)
    if widened:
        caveats.insert(0, f"For få salg med nøyaktig samme egenskaper. Intervallet ser bort fra {' og '.join(widened)}.")
    if unknown:
        caveats.insert(0, f"{' og '.join(unknown).capitalize()} er ukjent, så intervallet blander ulike typer.")
    if not sufficient:
        caveats.insert(0, f"Bare {len(rows)} sammenlignbare salg (minimum {min_sales}). Intervallet er svært usikkert.")
    is_demo = any(r["is_demo"] for r in rows)
    if is_demo:
        caveats.insert(0, "DEMODATA: salgene er fiktive eksempler og gir ingen reell markedsverdi.")

    period = years[0] if years[0] == years[-1] else f"{years[0]}–{years[-1]}"
    return Valuation(
        min=min(prices), median=round(statistics.median(prices)), max=max(prices),
        n_sales=len(rows), period=period, match_level=key, match_label=label,
        sufficient_data=sufficient, criteria_dropped=dropped, caveats=caveats,
        comparables=[ComparableSale(price_nok=r["price_nok"], sale_date=r["sale_date"], condition=r["condition"],
                                    auction_house=r["auction_house"], source_url=r["source_url"],
                                    is_demo=bool(r["is_demo"])) for r in rows[:12]],
        is_demo=is_demo,
    )
