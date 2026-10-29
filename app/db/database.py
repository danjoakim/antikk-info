"""Tilkobling og initialisering av SQLite. Ingen forretningslogikk her."""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent
SCHEMA_FILE = DB_DIR / "schema.sql"
SEED_FILE = DB_DIR / "seed.sql"


def connect(db_path: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path | str, seed: bool = True) -> None:
    """Oppretter tabellene og legger inn demodata hvis databasen er tom."""
    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as conn:
        conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))
        if seed and _is_empty(conn):
            conn.executescript(SEED_FILE.read_text(encoding="utf-8"))


def _is_empty(conn: sqlite3.Connection) -> bool:
    tables = ("serial_ranges", "hallmarks", "auction_results", "period_rules", "makers")
    return all(conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == 0 for t in tables)


def connection_dependency(db_path: Path | str) -> Iterator[sqlite3.Connection]:
    """Én tilkobling per forespørsel; lukkes alltid."""
    conn = connect(db_path)
    try:
        yield conn
    finally:
        conn.close()
