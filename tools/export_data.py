"""Eksporterer data til nettversjonen (docs/data/): oppslagstabellene fra seed.sql og
vision-kontrakten (instruks, skjema, demoeksempler) fra app/services/vision/.

Python-koden er eneste kilde til sannhet. Kjør dette etter hver endring i dataene:

    python tools/export_data.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.db.database import connect, init_db  # noqa: E402
from app.services.vision.core import (OBSERVATION_SCHEMA, ROLE_LABELS, SYSTEM_PROMPT,  # noqa: E402
                                      USER_INSTRUCTION)
from app.models import LOCATION_LABELS  # noqa: E402
from app.services.normalize import LAYOUT_LABELS, WINDING_LABELS  # noqa: E402
from app.services.vision.mock import MOCK_SCENARIOS  # noqa: E402

OUT = ROOT / "docs" / "data"
TABLES = {
    "serial_ranges": "SELECT brand, number_type, serial_start, serial_end, year_from, year_to, source, is_demo "
                     "FROM serial_ranges ORDER BY brand, number_type, serial_start",
    "hallmarks": "SELECT pattern, material, label, region, priority, is_demo FROM hallmarks ORDER BY priority DESC",
    "auction_results": "SELECT item_type, brand, material, escapement, condition, price_nok, price_basis, sale_date, "
                       "auction_house, source_url, notes, is_demo FROM auction_results ORDER BY sale_date DESC",
    "period_rules": "SELECT feature, value, year_from, year_to, note, source, is_demo FROM period_rules ORDER BY feature, value",
}


def main() -> None:
    db = ROOT / "data" / "_export.db"
    db.unlink(missing_ok=True)
    init_db(db)
    OUT.mkdir(parents=True, exist_ok=True)
    with connect(db) as conn:
        for name, sql in TABLES.items():
            rows = [dict(r) for r in conn.execute(sql)]
            for r in rows:
                if "is_demo" in r:
                    r["is_demo"] = bool(r["is_demo"])
                if "is_verified" in r:
                    r["is_verified"] = bool(r["is_verified"])
                if name == "makers":
                    r["sources"] = json.loads(r["sources"])
            (OUT / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"{name}: {len(rows)} rader")
    db.unlink(missing_ok=True)

    # Merkekunnskapen deles som den er.
    (OUT / "makers.json").write_text((ROOT / "app" / "data" / "makers.json").read_text(encoding="utf-8"), encoding="utf-8")
    print("makers:", len(json.loads((OUT / "makers.json").read_text(encoding="utf-8"))["makers"]), "navn")

    # Samme instruks, skjema og demoeksempler som Python-versjonen bruker.
    contract = {"system_prompt": SYSTEM_PROMPT, "user_instruction": USER_INSTRUCTION,
                "schema": OBSERVATION_SCHEMA, "role_labels": ROLE_LABELS,
                "labels": {"locations": LOCATION_LABELS, "windings": WINDING_LABELS, "layouts": LAYOUT_LABELS},
                "mock_scenarios": {k: v.model_dump() for k, v in MOCK_SCENARIOS.items()}}
    (OUT / "vision_contract.json").write_text(json.dumps(contract, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("vision_contract: instruks, skjema og", len(MOCK_SCENARIOS), "demoeksempler")


if __name__ == "__main__":
    main()
