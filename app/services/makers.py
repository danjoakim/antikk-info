"""Kunnskap om urmakere og forhandlernavn (app/data/makers.json).

JSON-filen er kilde til sannhet for navnevarianter, nivå og omtale, og deles med nettversjonen.
"""

import json
from pathlib import Path

from app.models import MakerInfo, NormalizedFacts

DATA = json.loads((Path(__file__).resolve().parent.parent / "data" / "makers.json").read_text(encoding="utf-8"))
TIERS: dict[str, str] = DATA["tiers"]
MAKERS: dict[str, dict] = {m["brand"]: m for m in DATA["makers"]}

# Navnevariant → kanonisk nøkkel. Lengste varianter først, så «a. lange & söhne» slår «lange».
ALIASES: dict[str, str] = {}
for _m in DATA["makers"]:
    for _a in [_m["brand"], *_m["aliases"]]:
        ALIASES[_a] = _m["brand"]
ALIASES = dict(sorted(ALIASES.items(), key=lambda kv: len(kv[0]), reverse=True))

# Navn som kan sammenlignes med usignerte ur når det mangler egne salg.
COMPARABLE_WITH_UNSIGNED = {"trade_name", "mass"}

HAUTE_NOTE = ("Ur fra dette merket kan være svært verdifulle, og navnet ble også forfalsket på enklere ur. "
              "Få uret vurdert av en urmaker eller et auksjonshus før du kjøper eller selger.")


def tier_of(brand: str | None) -> str | None:
    return MAKERS.get(brand, {}).get("tier") if brand else None


def maker_info(facts: NormalizedFacts) -> MakerInfo | None:
    m = MAKERS.get(facts.brand) if facts.brand else None
    if m is None:
        return None
    return MakerInfo(display_name=m["display_name"], summary=m["summary"], interpretation=m.get("interpretation"),
                     number_note=m.get("number_note"), sources=m["sources"], is_verified=m["is_verified"],
                     country=m.get("country"), place=m.get("place"), founded=m.get("founded"),
                     tier=m["tier"], tier_label=TIERS.get(m["tier"]),
                     advice=HAUTE_NOTE if m["tier"] == "haute" else None)
