"""Oppslag i kunnskapen om produsent- og forhandlernavn."""

import json
import sqlite3

from app.models import MakerInfo, NormalizedFacts


def maker_info(conn: sqlite3.Connection, facts: NormalizedFacts) -> MakerInfo | None:
    if not facts.brand:
        return None
    row = conn.execute("SELECT * FROM makers WHERE brand = ?", (facts.brand,)).fetchone()
    if row is None:
        return None
    return MakerInfo(display_name=row["display_name"], summary=row["summary"], interpretation=row["interpretation"],
                     number_note=row["number_note"], sources=json.loads(row["sources"]),
                     is_verified=bool(row["is_verified"]))
