"""Samlet konfigurasjon. Alle verdier kan overstyres med miljøvariabler eller en .env-fil."""

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv er valgfritt
    pass

BASE_DIR = Path(__file__).resolve().parent.parent

# Leverandør → (miljøvariabler for nøkkel, standardmodell, visningsnavn).
# Modellnavn endres ofte; overstyr med VISION_MODEL ved behov.
PROVIDERS: dict[str, tuple[tuple[str, ...], str, str]] = {
    "anthropic": (("ANTHROPIC_API_KEY",), "claude-sonnet-5-5", "Anthropic Claude"),
    "openai": (("OPENAI_API_KEY",), "gpt-6-astra", "OpenAI"),
    "gemini": (("GEMINI_API_KEY", "GOOGLE_API_KEY"), "gemini-3.8-flash", "Google Gemini"),
    # OpenRouter, Ollama, LM Studio og andre med OpenAI-kompatibelt API.
    "openai_compatible": (("OPENAI_COMPATIBLE_API_KEY",), "", "OpenAI-kompatibel"),
}
AUTO_ORDER = ("anthropic", "openai", "gemini")


@dataclass(frozen=True)
class Settings:
    vision_mode: str              # "mock" eller "live"
    vision_provider: str | None   # nøkkel i PROVIDERS, None i mock-modus
    vision_model: str
    api_key: str | None
    base_url: str | None          # bare for openai_compatible
    db_path: Path
    max_image_bytes: int
    max_images: int
    min_sales: int

    @property
    def provider_label(self) -> str:
        return PROVIDERS[self.vision_provider][2] if self.vision_provider else "Demo (mock)"


def _key_for(provider: str) -> str | None:
    for var in PROVIDERS[provider][0]:
        if os.getenv(var):
            return os.getenv(var)
    return None


def _resolve_provider() -> str | None:
    """VISION_PROVIDER vinner; ellers den første leverandøren som har nøkkel."""
    chosen = os.getenv("VISION_PROVIDER", "").strip().lower()
    if chosen:
        if chosen not in PROVIDERS:
            raise ValueError(f"Ukjent VISION_PROVIDER «{chosen}». Gyldige: {', '.join(PROVIDERS)}")
        return chosen
    return next((p for p in AUTO_ORDER if _key_for(p)), None)


def _is_configured(provider: str | None, base_url: str | None) -> bool:
    if provider is None:
        return False
    if provider == "openai_compatible":
        return bool(base_url)  # lokale servere (Ollama, LM Studio) trenger ingen nøkkel
    return bool(_key_for(provider))


def load_settings() -> Settings:
    provider = _resolve_provider()
    base_url = os.getenv("OPENAI_BASE_URL") or None
    mode = os.getenv("VISION_MODE", "").strip().lower()
    if mode not in {"mock", "live"}:
        # Uten oppsett faller vi trygt tilbake til mock, så appen alltid kan startes.
        mode = "live" if _is_configured(provider, base_url) else "mock"

    default_model = PROVIDERS[provider][1] if provider else ""
    return Settings(
        vision_mode=mode,
        vision_provider=provider if mode == "live" else None,
        vision_model=os.getenv("VISION_MODEL") or default_model,
        api_key=_key_for(provider) if provider else None,
        base_url=base_url,
        db_path=Path(os.getenv("DB_PATH", BASE_DIR / "data" / "lommeur.db")),
        # Strengeste leverandørgrense er Claude API: 10 MB base64 per bilde (~7,5 MB rådata).
        max_image_bytes=int(os.getenv("MAX_IMAGE_BYTES", 7 * 1024 * 1024)),
        max_images=int(os.getenv("MAX_IMAGES", 6)),
        min_sales=int(os.getenv("MIN_SALES", 5)),
    )


settings = load_settings()
