"""Google Gemini via google-genai: JSON-svar låst til det felles skjemaet."""

import json
from typing import Any

from app.config import Settings
from app.services.vision.core import OBSERVATION_SCHEMA, SYSTEM_PROMPT, USER_INSTRUCTION, ImageInput, VisionError


def build_contents(images: list[ImageInput], types: Any) -> list[Any]:
    parts: list[Any] = []
    for i, img in enumerate(images, start=1):
        parts.append(f"Bilde {i}: {img.label}" if img.label else f"Bilde {i}")
        parts.append(types.Part.from_bytes(data=img.data, mime_type=img.media_type))
    parts.append(USER_INSTRUCTION)
    return parts


def parse_response(response: Any) -> dict:
    text = getattr(response, "text", None)
    if not text:
        raise VisionError("Bildeanalysen hos Gemini ga ikke noe svar. Prøv igjen.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise VisionError("Bildeanalysen hos Gemini ga ikke gyldig JSON. Prøv igjen.") from exc


def extract(images: list[ImageInput], settings: Settings) -> dict:
    try:
        from google import genai
        from google.genai import errors, types
    except ImportError as exc:
        raise VisionError("Pakken 'google-genai' mangler (pip install -r requirements.txt).") from exc

    client = genai.Client(api_key=settings.api_key)
    try:
        response = client.models.generate_content(
            model=settings.vision_model,
            contents=build_contents(images, types),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_json_schema=OBSERVATION_SCHEMA,
                temperature=0,
                # Gemini 3 tenker før svaret; «low» gir kortest ventetid.
                **({"thinking_config": types.ThinkingConfig(thinking_level="low")}
                   if settings.vision_model.startswith("gemini-3") else {}),
            ),
        )
    except errors.APIError as exc:
        raise VisionError(f"Bildeanalysen hos Gemini feilet (HTTP {getattr(exc, 'code', '?')}).") from exc
    return parse_response(response)
