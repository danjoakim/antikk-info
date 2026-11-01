"""HTTP-ruter. Tynne: validerer input, kaller tjenestene og setter sammen svaret."""

import sqlite3
from collections.abc import Iterator

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import Settings
from app.db.database import connection_dependency
from app.models import AnalyzeResponse, ConfirmedFacts, LookupResponse
from app.services.dating import date_item
from app.services.makers import maker_info
from app.services.salesearch import sale_search_links
from app.services.valuation import no_sales_message
from app.services.suggest import suggest_photos
from app.models import LOCATION_LABELS
from app.services.normalize import ESCAPEMENT_LABELS, LAYOUT_LABELS, MATERIAL_LABELS, WINDING_LABELS, normalize
from app.services.valuation import value_item
from app.services.vision import MOCK_SCENARIOS, ImageInput, VisionError, extract_facts

router = APIRouter(prefix="/api")

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    yield from connection_dependency(request.app.state.settings.db_path)


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/meta")
def meta(settings: Settings = Depends(get_settings)) -> dict:
    """Valglister til bekreftelsesskjemaet, så frontend ikke hardkoder kategorier."""
    return {
        "mode": settings.vision_mode,
        "provider": settings.provider_label,
        "model": settings.vision_model if settings.vision_mode == "live" else None,
        "min_sales": settings.min_sales,
        "materials": [{"code": c, "label": l} for c, l in MATERIAL_LABELS.items()],
        "escapements": [{"code": c, "label": l} for c, l in ESCAPEMENT_LABELS.items()],
        "windings": [{"code": c, "label": l} for c, l in WINDING_LABELS.items()],
        "layouts": [{"code": c, "label": l} for c, l in LAYOUT_LABELS.items()],
        "locations": LOCATION_LABELS,
        "mock_scenarios": list(MOCK_SCENARIOS) if settings.vision_mode == "mock" else [],
    }


async def _read_image(role: str, upload: UploadFile, settings: Settings) -> ImageInput:
    media_type = (upload.content_type or "").lower()
    if media_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"Bildet «{role}» har et format vi ikke støtter ({media_type or 'ukjent'}). "
                                 "Bruk JPEG, PNG eller WebP.")
    data = await upload.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise HTTPException(413, f"Bildet «{role}» er for stort (maks {settings.max_image_bytes // (1024 * 1024)} MB).")
    if not data:
        raise HTTPException(400, f"Bildet «{role}» er tomt.")
    return ImageInput(role=role, data=data, media_type=media_type)


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    photos: list[UploadFile] | None = File(None),
    dial: UploadFile | None = File(None),
    movement: UploadFile | None = File(None),
    caseback: UploadFile | None = File(None),
    cuvette: UploadFile | None = File(None),
    cuvette_inside: UploadFile | None = File(None),
    movement_closeup: UploadFile | None = File(None),
    caseback_closeup: UploadFile | None = File(None),
    mock_scenario: str | None = Form(None),
    settings: Settings = Depends(get_settings),
    conn: sqlite3.Connection = Depends(get_conn),
) -> AnalyzeResponse:
    """Steg 1: vision trekker ut fakta. Ingen datering eller pris her."""
    uploads = {"dial": dial, "caseback": caseback, "cuvette": cuvette, "cuvette_inside": cuvette_inside, "movement": movement,
               "movement_closeup": movement_closeup, "caseback_closeup": caseback_closeup}
    # Umerkede bilder («photos») er normalen; modellen avgjør hva hvert bilde viser.
    present = [("photo", up) for up in photos or [] if up.filename]
    present += [(role, up) for role, up in uploads.items() if up is not None and up.filename]
    if not present:
        raise HTTPException(400, "Last opp minst ett bilde.")
    if len(present) > settings.max_images:
        raise HTTPException(400, f"For mange bilder (maks {settings.max_images}).")

    images = [await _read_image(role, up, settings) for role, up in present]
    try:
        facts = await run_in_threadpool(extract_facts, images, settings, mock_scenario)
    except VisionError as exc:
        raise HTTPException(502, str(exc)) from exc

    normalized = normalize(conn, facts)
    return AnalyzeResponse(mode=settings.vision_mode, facts=facts, normalized=normalized,
                           suggestions=suggest_photos(conn, facts, normalized))


@router.post("/lookup", response_model=LookupResponse)
def lookup(
    body: ConfirmedFacts,
    settings: Settings = Depends(get_settings),
    conn: sqlite3.Connection = Depends(get_conn),
) -> LookupResponse:
    """Steg 2: brukerbekreftede verdier slås opp i databasen."""
    facts = normalize(conn, body)
    valuation = value_item(conn, facts, item_type=body.item_type, min_sales=settings.min_sales)
    message = None
    if valuation is None:
        message = no_sales_message(facts)
    maker = maker_info(facts)
    brand_name = maker.display_name if maker else facts.brand_display
    return LookupResponse(normalized=facts, dating=date_item(conn, facts), valuation=valuation,
                          valuation_message=message, maker=maker,
                          sale_searches=sale_search_links(facts, brand_name, body.item_type))
