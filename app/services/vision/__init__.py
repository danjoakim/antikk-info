"""Bildeanalyse. Resten av appen ser bare extract_facts() og VisionFacts.

Leverandør velges i .env (VISION_PROVIDER). Hver leverandør ligger i providers/ og
returnerer en rå dict som valideres likt for alle i core.to_facts().
"""

from collections.abc import Callable
from importlib import import_module

from app.config import Settings
from app.models import VisionFacts
from app.services.vision.core import ImageInput, VisionError, to_facts
from app.services.vision.mock import MOCK_SCENARIOS, mock_facts

__all__ = ["ImageInput", "VisionError", "MOCK_SCENARIOS", "extract_facts"]

# openai_compatible bruker samme kode som openai, med egen base_url.
_PROVIDER_MODULES = {
    "anthropic": "anthropic",
    "openai": "openai",
    "openai_compatible": "openai",
    "gemini": "gemini",
}


def _provider(name: str) -> Callable[[list[ImageInput], Settings], dict]:
    return import_module(f"app.services.vision.providers.{_PROVIDER_MODULES[name]}").extract


def extract_facts(images: list[ImageInput], settings: Settings, mock_scenario: str | None = None) -> VisionFacts:
    if settings.vision_mode == "mock":
        return mock_facts(mock_scenario)
    if not images:
        raise VisionError("Ingen bilder å analysere.")
    if not settings.vision_provider:
        raise VisionError("Ingen leverandør for bildeanalyse er satt opp. Se .env.example.")
    if not settings.api_key and settings.vision_provider != "openai_compatible":
        raise VisionError(f"Mangler API-nøkkel for {settings.provider_label}. Se .env.example.")
    return to_facts(_provider(settings.vision_provider)(images, settings))
