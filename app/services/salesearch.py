"""Søk etter solgte eksemplarer på eksterne prisarkiv (Auctionet, Barnebys, eBay).

Appen henter ingen priser derfra; den lager ferdige søkelenker ut fra de bekreftede faktaene,
slik at brukeren ser ekte salg med én gang. Ordlistene ligger i app/data/sale_search.json.
"""

import json
import re
from pathlib import Path
from urllib.parse import quote

from app.models import NormalizedFacts, SaleSearch

DATA = json.loads((Path(__file__).resolve().parent.parent / "data" / "sale_search.json").read_text(encoding="utf-8"))


def _terms(facts: NormalizedFacts, brand_name: str | None, item_type: str, lang: str,
           material_with_brand: bool) -> list[str]:
    terms = [DATA["item_types"][item_type][lang]]
    material = DATA["materials"].get(facts.material or "", {}).get(lang)
    if brand_name:
        terms.append(brand_name)
        if material and material_with_brand:
            terms.append(material)
    else:
        if material:
            terms.append(material)
        escapement = DATA["escapements"].get(facts.escapement or "", {}).get(lang)
        if escapement:
            terms.append(escapement)
    return terms


def _encode(terms: list[str], join: str) -> str:
    words = " ".join(terms).lower().split()
    if join == "_":   # Barnebys bruker ord med understrek i adressen
        return "_".join(w for w in (re.sub(r"[^\w]+", "", w) for w in words) if w)
    return "+".join(quote(w, safe="") for w in words)


def sale_search_links(facts: NormalizedFacts, brand_name: str | None = None,
                      item_type: str = "pocket_watch") -> list[SaleSearch]:
    if item_type not in DATA["item_types"]:
        return []
    links = []
    for site in DATA["sites"]:
        if site["brand_only"]:
            if not brand_name:
                continue
            terms = [brand_name]
        else:
            terms = _terms(facts, brand_name, item_type, site["lang"], site["material_with_brand"])
        terms = list(dict.fromkeys(t for t in terms if t and t.strip()))   # uten tomme og doble ord
        if not terms or (not brand_name and len(terms) < 2 and not site["brand_only"] and item_type == "other"):
            continue
        links.append(SaleSearch(site=site["id"], label=site["label"], note=site["note"], query=" ".join(terms),
                                url=site["url"].replace("{q}", _encode(terms, site["join"]))))
    return links
