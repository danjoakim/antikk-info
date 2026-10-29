"""OpenAI og alle OpenAI-kompatible API-er (OpenRouter, Ollama, LM Studio m.fl.).

Bruker Chat Completions, som de kompatible tjenestene støtter bredest, med strukturert
utdata (json_schema, strict) og bildene som data-URL-er.
"""

import base64
import json
from typing import Any

from app.config import Settings
from app.services.vision.core import OBSERVATION_SCHEMA, SYSTEM_PROMPT, USER_INSTRUCTION, ImageInput, VisionError

RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {"name": "watch_observations", "schema": OBSERVATION_SCHEMA, "strict": True},
}


def build_messages(images: list[ImageInput]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    for i, img in enumerate(images, start=1):
        data_url = f"data:{img.media_type};base64,{base64.standard_b64encode(img.data).decode('ascii')}"
        content.append({"type": "text", "text": f"Bilde {i}: {img.label}"})
        content.append({"type": "image_url", "image_url": {"url": data_url, "detail": "high"}})
    content.append({"type": "text", "text": USER_INSTRUCTION})
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}]


def parse_response(response: Any) -> dict:
    try:
        message = response.choices[0].message
    except (AttributeError, IndexError) as exc:
        raise VisionError("Bildeanalysen ga ikke noe svar. Prøv igjen.") from exc
    if getattr(message, "refusal", None):
        raise VisionError("Modellen avviste å analysere bildene.")
    text = (message.content or "").strip()
    if text.startswith("```"):  # enkelte lokale modeller pakker JSON i kodeblokk
        text = text.strip("`").removeprefix("json").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise VisionError("Bildeanalysen ga ikke gyldig JSON. Prøv igjen eller bytt modell.") from exc


def extract(images: list[ImageInput], settings: Settings) -> dict:
    try:
        import openai
    except ImportError as exc:
        raise VisionError("Pakken 'openai' mangler (pip install -r requirements.txt).") from exc

    compatible = settings.vision_provider == "openai_compatible"
    if compatible and not settings.vision_model:
        raise VisionError("Sett VISION_MODEL til modellen den kompatible tjenesten skal bruke.")
    client = openai.OpenAI(
        api_key=settings.api_key or ("not-needed" if compatible else None),
        base_url=settings.base_url if compatible else None,
    )
    name = "den kompatible tjenesten" if compatible else "OpenAI"
    try:
        response = client.chat.completions.create(
            model=settings.vision_model,
            messages=build_messages(images),
            response_format=RESPONSE_FORMAT,
        )
    except openai.APIStatusError as exc:
        raise VisionError(f"Bildeanalysen hos {name} feilet (HTTP {exc.status_code}).") from exc
    except openai.APIConnectionError as exc:
        raise VisionError(f"Fikk ikke kontakt med {name}. Sjekk nettforbindelsen og adressen.") from exc
    return parse_response(response)
