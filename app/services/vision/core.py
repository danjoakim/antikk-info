"""Leverandøruavhengig kjerne: felles instruks, felles skjema og validering av svaret.

Alle leverandører får samme instruks og samme JSON-skjema. Skjemaet har ingen felt for
årstall eller pris, så modellen har ingen plass å gjette dem.
"""

from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.models import ImageRole, VisionFacts

ROLE_LABELS: dict[str, str] = {
    "dial": "Urskiven (forsiden)",
    "caseback": "Ytre baklokk, innsiden (stempler og kassenummer)",
    "cuvette": "Cuvetten, det indre støvlokket (gravert tekst på utsiden)",
    "movement": "Urverket (begge lokk åpnet)",
    "caseback_closeup": "Nærbilde av stempler i det ytre lokket",
    "movement_closeup": "Nærbilde av urverket",
}

SYSTEM_PROMPT = """You are a careful horological observer. You only REPORT what is visible in the photos of an antique pocket watch. You never estimate age, production year, value or price, and you never guess.

Rules:
- Copy text, numbers and stamps verbatim as they appear (keep commas, dots and spacing).
- If a digit or character is not clearly legible, set the field to null and list the field name in `unreadable`. A wrong digit is worse than a missing one.
- Pocket watches usually have two back covers: an outer case back and an inner dust cover (cuvette). Report marks from both in case_stamps, and prefix marks from the inner cover with "Cuvette: " (e.g. "Cuvette: Métal"). Engravings on the cuvette often name the brand, jewels and escapement; use them as evidence.
- Keep the MOVEMENT serial (engraved on a bridge or plate of the movement) separate from the CASE number (stamped inside the case or lid). Never copy one into the other. Caliber or reference numbers are neither; ignore them.
- Escapement: report "lever" only if a pallet fork/anchor is visible or the movement is marked e.g. "Ancre", "Anker", "Lever"; "cylinder" only if marked e.g. "Cylindre", "Cylinder", "Zylinder" or the cylinder escapement is clearly visible; "verge" for a fusee/verge with crown wheel. Otherwise "unknown". Describe what you saw in `escapement_evidence`.
- case_stamps: every mark inside the case/lids verbatim, e.g. "0,800", "Argentan", "Métal", "Cuvette métal". Describe pictorial hallmarks in words (e.g. "bear hallmark", "grouse hallmark", "Helvetia head").
- confidence: a number 0–1 for each field you filled in, null for fields you left empty.
- retake_hints: short, practical photo advice in Norwegian for anything you could not read (e.g. "Ta et nærbilde av verket i skrått lys").
- Every key in the schema must be present; use null or an empty list when you have nothing."""

USER_INSTRUCTION = "Registrer observasjonene fra bildene over i henhold til skjemaet."

CONFIDENCE_FIELDS = ("dial_text", "brand_signed", "movement_serial", "case_number", "escapement", "case_stamps")


def _nullable(type_: str, **extra: Any) -> dict[str, Any]:
    return {"type": [type_, "null"], **extra}


# Strengt skjema som fungerer hos alle leverandørene: alle felt påkrevd, ingen ekstra felt,
# null uttrykt som typeliste. (OpenAI strict mode krever dette; de andre godtar det.)
OBSERVATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "dial_text": _nullable("string", description="Text on the dial, verbatim"),
        "brand_signed": _nullable("string", description="Brand name as written on dial or movement"),
        "movement_serial": _nullable("string", description="Serial engraved on the movement, verbatim"),
        "case_number": _nullable("string", description="Number stamped inside the case, verbatim"),
        "escapement": {"type": "string", "enum": ["cylinder", "lever", "verge", "unknown"]},
        "escapement_evidence": _nullable("string", description="What in the photo shows the escapement"),
        "case_stamps": {"type": "array", "items": {"type": "string"}, "description": "All case marks, verbatim"},
        "jewels": _nullable("integer", description="Jewel count only if marked, e.g. '15 Rubis'"),
        "confidence": {
            "type": "object",
            "properties": {f: _nullable("number", minimum=0, maximum=1) for f in CONFIDENCE_FIELDS},
            "required": list(CONFIDENCE_FIELDS),
            "additionalProperties": False,
        },
        "unreadable": {"type": "array", "items": {"type": "string"}},
        "retake_hints": {"type": "array", "items": {"type": "string"}},
    },
    "additionalProperties": False,
}
OBSERVATION_SCHEMA["required"] = list(OBSERVATION_SCHEMA["properties"])


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


def to_facts(raw: Any) -> VisionFacts:
    """Validerer leverandørens svar mot modellen vår. Ugyldig svar gir en tydelig feil."""
    if not isinstance(raw, dict):
        raise VisionError("Bildeanalysen ga ikke noe strukturert svar. Prøv igjen.")
    data = dict(raw)
    conf = data.get("confidence") or {}
    data["confidence"] = {k: float(v) for k, v in conf.items() if isinstance(v, (int, float))}
    data["case_stamps"] = data.get("case_stamps") or []
    data["unreadable"] = data.get("unreadable") or []
    data["retake_hints"] = data.get("retake_hints") or []
    data["escapement"] = data.get("escapement") or "unknown"
    try:
        return VisionFacts.model_validate(data)
    except ValidationError as exc:
        raise VisionError("Bildeanalysen ga et ugyldig svar. Prøv igjen.") from exc
