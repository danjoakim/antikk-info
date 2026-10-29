"""Leverandøruavhengig kjerne: felles instruks, felles skjema og validering av svaret.

Alle leverandører får samme instruks og samme JSON-skjema. Skjemaet har ingen felt for
årstall eller pris, så modellen har ingen plass å gjette dem. Modellen rapporterer hvert
nummer og merke med plassering; reglene i normalize.py avgjør hva de betyr.
"""

from dataclasses import dataclass
from typing import Any, get_args

from pydantic import ValidationError

from app.models import (ImageRole, Location, MarkType, MovementLayout, NumberMethod, VisionFacts,
                        Winding)

ROLE_LABELS: dict[str, str] = {
    "photo": "",
    "dial": "Urskiven (forsiden)",
    "caseback": "Ytre baklokk, innsiden",
    "caseback_closeup": "Nærbilde fra det ytre lokket",
    "cuvette": "Cuvetten (det indre lokket), utsiden",
    "cuvette_inside": "Cuvetten (det indre lokket), innsiden",
    "movement": "Urverket (begge lokk åpnet)",
    "movement_closeup": "Nærbilde av urverket",
}

SYSTEM_PROMPT = """You are a careful horological observer. You only REPORT what is visible in the photos of an antique pocket watch. You never estimate age, production year, value or price, and you never guess.

The photos come in any order, and the user sends whatever they have: one photo or several, of any part. Some photos may carry a label saying what they show. For each photo, first decide which part of the watch it shows and record it in `photos` (index from 1). Use that as the `location` of what you find in it. If several photos show the same part, combine what you read in them.

Numbers (`numbers`):
- Report EVERY number you can read, each as its own entry, with where it is (`location`), how it was made (`method`) and any text right before it (`prefix`, e.g. "No", "N°").
- method "stamped" = struck with a punch (even, sharp digits); "engraved" = cut with a graver as part of the decoration or lettering; "scratched" = thin, uneven, hand-scratched marks. Watchmakers scratched repair codes and dates inside lids and on movement bridges; those are "scratched".
- The same number often appears on several parts (outer lid, cuvette, movement). Report each occurrence separately.
- Do not report hour or minute numerals on the dial, jewel counts, or fineness marks (0.800 etc.) as numbers.
- If a digit is not clearly legible, leave that number out and add its location to `unreadable`. A wrong digit is worse than a missing one.

Marks (`marks`), each with `location` and `type`:
- "fineness": silver/gold fineness, verbatim (e.g. "0.800", "0,935", "14K").
- "hallmark_symbol": pictorial control marks, described in words (e.g. "bear hallmark", "grouse hallmark", "squirrel hallmark", "Helvetia head").
- "maker_mark": small punched initials or symbols of the case maker.
- "inscription": stamped or engraved text such as "Echappement à cylindre", "8 Rubis", "Ancre", "Métal", "Argentan", maker or retailer names, "Genève", "Aiguilles".
- "owner_engraving": monograms, initials or dedications engraved for an owner.
- "repair_mark": scratched watchmaker marks that are not numbers.

Pocket watches usually have an outer case back and an inner dust cover (cuvette). Text may be on both sides of the cuvette. The movement may carry no name or number at all; that is normal.

Other fields:
- brand_signed: the maker or retailer name as written anywhere on the watch (dial, cuvette or movement), or null.
- escapement: "lever" if a pallet fork is visible or text says e.g. "Ancre", "Anker", "Lever"; "cylinder" if text says e.g. "Cylindre", "Cylinder", "Zylinder" or the cylinder escapement is clearly visible; "verge" for a verge/fusee. Otherwise "unknown". Explain in `escapement_evidence`.
- winding: "key" if there are winding holes for a key in the cuvette or dial, square winding arbors on the movement, or no winding crown on the pendant; "stem" if there is a winding crown; otherwise "unknown". Explain in `winding_evidence`.
- movement_layout: "bar" for separate parallel bridges (Lépine/bar calibre), "three_quarter_plate", "full_plate", or "unknown".
- jewels: only if marked (e.g. "8 Rubis" → 8).
- confidence: a number 0–1 for each field you filled in, null for fields you left empty.
- retake_hints: short, practical photo advice in Norwegian for anything you could not read.
- Every key in the schema must be present; use null or an empty list when you have nothing."""

USER_INSTRUCTION = "Registrer observasjonene fra bildene over i henhold til skjemaet."

CONFIDENCE_FIELDS = ("brand_signed", "numbers", "marks", "escapement", "winding")


def _nullable(type_: str, **extra: Any) -> dict[str, Any]:
    return {"type": [type_, "null"], **extra}


def _enum(literal: Any) -> dict[str, Any]:
    return {"type": "string", "enum": list(get_args(literal))}


def _strict_object(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


# Strengt skjema som fungerer hos alle leverandørene: alle felt påkrevd, ingen ekstra felt,
# null uttrykt som typeliste. (OpenAI strict mode krever dette; de andre godtar det.)
OBSERVATION_SCHEMA: dict[str, Any] = _strict_object({
    "photos": {"type": "array", "items": _strict_object({
        "index": {"type": "integer", "description": "Photo number, starting at 1"},
        "shows": _enum(Location),
    })},
    "dial_text": _nullable("string", description="Text on the dial, verbatim"),
    "brand_signed": _nullable("string", description="Maker or retailer name as written on the watch"),
    "numbers": {"type": "array", "items": _strict_object({
        "value": {"type": "string", "description": "The number, verbatim"},
        "location": _enum(Location),
        "method": _enum(NumberMethod),
        "prefix": _nullable("string", description="Text right before the number, e.g. 'No'"),
    })},
    "marks": {"type": "array", "items": _strict_object({
        "text": {"type": "string", "description": "The mark verbatim, or a symbol described in words"},
        "location": _enum(Location),
        "type": _enum(MarkType),
    })},
    "escapement": {"type": "string", "enum": ["cylinder", "lever", "verge", "unknown"]},
    "escapement_evidence": _nullable("string"),
    "winding": _enum(Winding),
    "winding_evidence": _nullable("string"),
    "movement_layout": _enum(MovementLayout),
    "jewels": _nullable("integer", description="Jewel count only if marked, e.g. '8 Rubis'"),
    "confidence": _strict_object({f: _nullable("number", minimum=0, maximum=1) for f in CONFIDENCE_FIELDS}),
    "unreadable": {"type": "array", "items": {"type": "string"}},
    "retake_hints": {"type": "array", "items": {"type": "string"}},
})


class VisionError(RuntimeError):
    """Feil fra vision-steget, med en melding som kan vises til brukeren."""


@dataclass(frozen=True)
class ImageInput:
    role: ImageRole
    data: bytes
    media_type: str

    @property
    def label(self) -> str:
        return ROLE_LABELS.get(self.role, self.role)


def _clean_list(items: Any, keys: tuple[str, ...]) -> list[dict]:
    """Fjerner tomme oppføringer og ukjente enum-verdier settes til standard av modellen."""
    out = []
    for item in items or []:
        if isinstance(item, dict) and str(item.get(keys[0]) or "").strip():
            out.append({k: item.get(k) for k in keys if item.get(k) is not None})
    return out


def to_facts(raw: Any) -> VisionFacts:
    """Validerer leverandørens svar mot modellen vår. Ugyldig svar gir en tydelig feil."""
    if not isinstance(raw, dict):
        raise VisionError("Bildeanalysen ga ikke noe strukturert svar. Prøv igjen.")
    data = dict(raw)
    conf = data.get("confidence") or {}
    data["confidence"] = {k: float(v) for k, v in conf.items() if isinstance(v, (int, float))}
    data["photos"] = [p for p in (data.get("photos") or []) if isinstance(p, dict) and isinstance(p.get("index"), int)]
    data["numbers"] = _clean_list(data.get("numbers"), ("value", "location", "method", "prefix"))
    data["marks"] = _clean_list(data.get("marks"), ("text", "location", "type"))
    for key in ("unreadable", "retake_hints"):
        data[key] = data.get(key) or []
    for key in ("escapement", "winding", "movement_layout"):
        data[key] = data.get(key) or "unknown"
    try:
        return VisionFacts.model_validate(data)
    except ValidationError as exc:
        raise VisionError("Bildeanalysen ga et ugyldig svar. Prøv igjen.") from exc
