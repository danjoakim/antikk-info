"""Leverandøruavhengig kjerne: felles instruks, felles skjema og validering av svaret.

Alle leverandører får samme instruks og samme JSON-skjema. Skjemaet har ingen felt for
årstall eller pris, så modellen har ingen plass å gjette dem. Modellen rapporterer hvert
nummer og merke med plassering; reglene i normalize.py avgjør hva de betyr.
"""

from dataclasses import dataclass
from typing import Any, get_args

from pydantic import ValidationError

from app.models import (Category, ImageRole, Location, MarkType, MovementLayout, NumberMethod, VisionFacts,
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

SYSTEM_PROMPT = """You are a careful observer of antiques, vintage and second-hand objects (flea markets, antique and charity shops). You only REPORT what is visible in the photos. You never estimate age, production year, value or price, and you never guess.

The photos come in any order, and the user sends whatever they have: one photo or several, of any part of ONE object (or a set that belongs together).

What the object is:
- category: the closest category. Use "other" if none fits.
- object_type: what it is, in Norwegian, as specific as you can: include the product, model, series or pattern name when it is written on the object or the design is unmistakable (e.g. "PS5-kontroller (DualSense)", "kaffekanne", "spiseskje", "lommeur", "Kubus lysestake"). Never guess a model you cannot see.
- title: the title of the work when it is printed on the object (book, magazine, comic, record, film, game, poster, print), verbatim, including any subtitle or volume. Otherwise null.
- creator: the author, artist, composer, band or illustrator named on the object, verbatim (e.g. "Knut Hamsun", "Theodor Kittelsen"). Otherwise null. Factories and designers of objects go in brand_signed.
- description: one or two neutral sentences in Norwegian about what is visible: shape, decoration, colours, technique. No age, value or praise.
- materials: visible materials in Norwegian (e.g. "porselen", "steintøy", "sølv", "forsølvet metall", "messing", "tinn", "glass", "eik", "teak"). Only what you can see or read; when unsure, leave it out.
- style_cues: observable style or manufacturing features in Norwegian (e.g. "håndmalt underglasurdekor", "trykt dekor", "maskinsydd", "svalehalesammenføyning"). Never years or periods.

For each photo, decide which part it shows and record it in `photos` (index from 1). Use that as the `location` of what you find in it. Generic locations: front, back, base (underside/bottom), inside, lid, side, handle, label (paper label or sticker). Pocket watches use their own locations (dial, outer lid, cuvette, movement, case rim).

Numbers (`numbers`):
- Report EVERY number you can read (serial, model, pattern, decor, shape or design numbers), each as its own entry with `location`, `method` and any text right before it (`prefix`, e.g. "No", "N°", "Mod.").
- method "stamped" = struck or impressed; "engraved" = cut or engraved; "scratched" = thin, uneven, hand-scratched; "unknown" for printed or painted numbers.
- Do not report dial numerals, prices on shop stickers, or fineness marks (0.800 etc.) as numbers.
- If a digit is not clearly legible, leave that number out and add its location to `unreadable`. A wrong digit is worse than a missing one.

Marks (`marks`), each with `location` and `type`:
- "fineness": silver/gold fineness, verbatim (e.g. "0.800", "830S", "925", "14K").
- "hallmark_symbol": pictorial assay or control marks. Name the figure ONLY if it is clearly visible; otherwise write "unidentified hallmark in a frame" and describe the frame.
- "maker_mark": small punched initials or symbols of a maker (silversmith, case maker).
- "factory_mark": printed, impressed or painted factory marks and backstamps (porcelain, glass, metalware), verbatim with a short description of any logo.
- "signature": an artist's or designer's signature or monogram, verbatim as far as legible.
- "label": text on a paper label or sticker (not shop price tags).
- "inscription": other text on the object, e.g. "Echappement à cylindre", "Made in Norway", "Handmalt", maker or retailer names, place names.
- "owner_engraving": monograms, initials or dedications for an owner.
- "repair_mark": scratched repair marks that are not numbers.

brand_signed: the maker, factory, designer or retailer name as written anywhere on the object; for books and records the publisher or record label. Otherwise null.

Music and film (records, CDs, cassettes, DVDs, Blu-ray, VHS): title = album or film title, creator = artist, band or director, brand_signed = record label or film studio/distributor. object_type names the format in Norwegian (e.g. "LP-plate", "singel (7\")", "CD", "kassett", "DVD", "Blu-ray", "VHS"). Report the catalogue number in `numbers` with prefix "Cat. no" and the barcode digits with prefix "EAN" or "UPC"; both are usually on the spine, the back or the record label.

Books and printed matter: report ISBN and catalogue numbers in `numbers` (prefix "ISBN" etc.), and printed edition, printing, place and year exactly as printed (e.g. "2. opplag", "Oslo 1952", "Første utgave") as "inscription" marks. These are facts printed on the item, not estimates.

Only for pocket watches and wristwatches (otherwise use "unknown", null and empty values):
- Pocket watches usually have an outer case back and an inner dust cover (cuvette). Text may be on both sides of the cuvette. The movement may carry no name or number at all; that is normal.
- dial_text: text on the dial, verbatim.
- escapement: "lever" if a pallet fork is visible or text says e.g. "Ancre", "Anker", "Lever"; "cylinder" if text says e.g. "Cylindre", "Cylinder", "Zylinder" or the cylinder escapement is clearly visible; "verge" for a verge/fusee. Otherwise "unknown". Explain in `escapement_evidence`.
- winding: "key" if there are winding holes for a key, square winding arbors on the movement, or no winding crown; "stem" if there is a winding crown; otherwise "unknown". Explain in `winding_evidence`.
- movement_layout: "bar", "three_quarter_plate", "full_plate", or "unknown".
- jewels: only if marked (e.g. "8 Rubis" → 8).

Always:
- confidence: a number 0–1 for each field you filled in, null for fields you left empty.
- retake_hints: short, practical photo advice in Norwegian for anything you could not read (e.g. "Ta et skarpt bilde av stempelet under bunnen, med lyset fra siden").
- Every key in the schema must be present; use null or an empty list when you have nothing."""

USER_INSTRUCTION = "Registrer observasjonene fra bildene over i henhold til skjemaet."

CONFIDENCE_FIELDS = ("category", "title", "brand_signed", "numbers", "marks", "escapement", "winding")


def _nullable(type_: str, **extra: Any) -> dict[str, Any]:
    return {"type": [type_, "null"], **extra}


def _enum(literal: Any) -> dict[str, Any]:
    return {"type": "string", "enum": list(get_args(literal))}


def _strict_object(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


# Strengt skjema som fungerer hos alle leverandørene: alle felt påkrevd, ingen ekstra felt,
# null uttrykt som typeliste. (OpenAI strict mode krever dette; de andre godtar det.)
OBSERVATION_SCHEMA: dict[str, Any] = _strict_object({
    "category": _enum(Category),
    "object_type": _nullable("string", description="What the object is, in Norwegian"),
    "title": _nullable("string", description="Title of a book, record, film, game or print as printed"),
    "creator": _nullable("string", description="Author, artist, composer or band as printed"),
    "description": _nullable("string", description="One or two neutral sentences in Norwegian"),
    "materials": {"type": "array", "items": {"type": "string"}},
    "style_cues": {"type": "array", "items": {"type": "string"}},
    "photos": {"type": "array", "items": _strict_object({
        "index": {"type": "integer", "description": "Photo number, starting at 1"},
        "shows": _enum(Location),
    })},
    "dial_text": _nullable("string", description="Text on a watch dial, verbatim"),
    "brand_signed": _nullable("string", description="Maker, factory, designer or retailer name as written on the object"),
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
    for key in ("unreadable", "retake_hints", "materials", "style_cues"):
        data[key] = [str(x) for x in (data.get(key) or []) if str(x).strip()]
    if data.get("category") not in get_args(Category):
        data["category"] = "other"
    for key in ("escapement", "winding", "movement_layout"):
        data[key] = data.get(key) or "unknown"
    try:
        return VisionFacts.model_validate(data)
    except ValidationError as exc:
        raise VisionError("Bildeanalysen ga et ugyldig svar. Prøv igjen.") from exc
