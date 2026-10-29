"""Anthropic Claude: tvunget verktøykall med det felles skjemaet."""

import base64
from typing import Any

from app.config import Settings
from app.services.vision.core import OBSERVATION_SCHEMA, SYSTEM_PROMPT, USER_INSTRUCTION, ImageInput, VisionError

TOOL_NAME = "record_observations"
TOOL = {
    "name": TOOL_NAME,
    "description": "Registrer bare det som faktisk kan ses på bildene. Ingen datering eller verdivurdering.",
    "input_schema": OBSERVATION_SCHEMA,
}


def build_content(images: list[ImageInput]) -> list[dict[str, Any]]:
    """Merket bilde for bilde (bilder før tekst), deretter instruksjonen."""
    content: list[dict[str, Any]] = []
    for i, img in enumerate(images, start=1):
        content.append({"type": "text", "text": f"Bilde {i}: {img.label}" if img.label else f"Bilde {i}"})
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": img.media_type,
            "data": base64.standard_b64encode(img.data).decode("ascii")}})
    content.append({"type": "text", "text": f"{USER_INSTRUCTION} Svar med verktøyet {TOOL_NAME}."})
    return content


def parse_response(response: Any) -> dict:
    for block in getattr(response, "content", []):
        if getattr(block, "type", None) == "tool_use" and block.name == TOOL_NAME:
            return block.input
    raise VisionError("Bildeanalysen ga ikke noe strukturert svar. Prøv igjen.")


def extract(images: list[ImageInput], settings: Settings) -> dict:
    try:
        import anthropic
    except ImportError as exc:
        raise VisionError("Pakken 'anthropic' mangler (pip install -r requirements.txt).") from exc

    client = anthropic.Anthropic(api_key=settings.api_key)
    try:
        response = client.messages.create(
            model=settings.vision_model,
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            tools=[TOOL],
            tool_choice={"type": "tool", "name": TOOL_NAME},
            messages=[{"role": "user", "content": build_content(images)}],
        )
    except anthropic.APIStatusError as exc:
        raise VisionError(f"Bildeanalysen hos Anthropic feilet (HTTP {exc.status_code}).") from exc
    except anthropic.APIConnectionError as exc:
        raise VisionError("Fikk ikke kontakt med Anthropic. Sjekk nettforbindelsen.") from exc
    return parse_response(response)
