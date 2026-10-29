"""Vision uten nettverk: valg av leverandør, felles skjema, meldingsoppbygging og tolkning av svar."""

import json
from dataclasses import replace
from types import SimpleNamespace

import pytest

from app import config
from app.services.vision import ImageInput, VisionError, extract_facts
from app.services.vision.core import OBSERVATION_SCHEMA, to_facts
from app.services.vision.providers import anthropic as anthropic_p
from app.services.vision.providers import gemini as gemini_p
from app.services.vision.providers import openai as openai_p

IMAGES = [ImageInput("dial", b"a", "image/jpeg"), ImageInput("movement", b"b", "image/png")]
RAW = {"dial_text": "OMEGA", "brand_signed": "Omega",
       "numbers": [{"value": "1234567", "location": "movement", "method": "engraved", "prefix": None},
                   {"value": "", "location": "dial", "method": "unknown", "prefix": None}],
       "marks": [{"text": "0,800", "location": "outer_lid_inside", "type": "fineness"}],
       "escapement": "lever", "escapement_evidence": None, "winding": "stem", "winding_evidence": None,
       "movement_layout": "unknown", "jewels": 15,
       "confidence": {"brand_signed": 0.95, "numbers": 0.8, "marks": 0.9, "escapement": 0.7, "winding": None},
       "unreadable": ["cuvette_inside"], "retake_hints": []}

PROVIDER_ENV = ("VISION_PROVIDER", "VISION_MODE", "VISION_MODEL", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY",
                "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_COMPATIBLE_API_KEY")


@pytest.fixture()
def env(monkeypatch):
    for var in PROVIDER_ENV:
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


# --- Felles skjema -------------------------------------------------------------

def test_schema_has_no_year_or_price_fields():
    fields = set(OBSERVATION_SCHEMA["properties"])
    assert not {f for f in fields if any(w in f for w in ("year", "date", "price", "value", "age"))}


def test_schema_is_strict_everywhere():
    """OpenAI strict mode: alle objekter må ha alle felt påkrevd og additionalProperties false."""
    def check(node):
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert set(node["required"]) == set(node["properties"])
            for child in node["properties"].values():
                check(child)
    check(OBSERVATION_SCHEMA)


def test_to_facts_drops_null_confidence_and_validates():
    facts = to_facts(RAW)
    assert [n.value for n in facts.numbers] == ["1234567"]  # tomme oppføringer fjernes
    assert facts.numbers[0].location == "movement" and "winding" not in facts.confidence
    with pytest.raises(VisionError):
        to_facts({**RAW, "escapement": "quartz"})
    with pytest.raises(VisionError):
        to_facts("ikke en dict")


# --- Valg av leverandør ----------------------------------------------------------

def test_no_keys_means_mock(env):
    s = config.load_settings()
    assert s.vision_mode == "mock" and s.vision_provider is None


@pytest.mark.parametrize("var, provider, model", [
    ("ANTHROPIC_API_KEY", "anthropic", "claude-sonnet-5-5"),
    ("OPENAI_API_KEY", "openai", "gpt-6-astra"),
    ("GOOGLE_API_KEY", "gemini", "gemini-3.8-flash"),
    ("GEMINI_API_KEY", "gemini", "gemini-3.8-flash"),
])
def test_provider_detected_from_key(env, var, provider, model):
    env.setenv(var, "k")
    s = config.load_settings()
    assert (s.vision_mode, s.vision_provider, s.vision_model, s.api_key) == ("live", provider, model, "k")


def test_explicit_provider_wins_and_model_override(env):
    env.setenv("ANTHROPIC_API_KEY", "a")
    env.setenv("GEMINI_API_KEY", "g")
    env.setenv("VISION_PROVIDER", "gemini")
    env.setenv("VISION_MODEL", "gemini-3.5-flash-lite")
    s = config.load_settings()
    assert (s.vision_provider, s.api_key, s.vision_model) == ("gemini", "g", "gemini-3.5-flash-lite")


def test_openai_compatible_without_key(env):
    env.setenv("VISION_PROVIDER", "openai_compatible")
    env.setenv("OPENAI_BASE_URL", "http://localhost:11434/v1")
    env.setenv("VISION_MODEL", "llava")
    s = config.load_settings()
    assert s.vision_mode == "live" and s.api_key is None and s.base_url.endswith("/v1")


def test_unknown_provider_is_rejected(env):
    env.setenv("VISION_PROVIDER", "nope")
    with pytest.raises(ValueError):
        config.load_settings()


def test_mock_scenarios(env):
    s = config.load_settings()
    assert extract_facts([], s).brand_signed == "G. Monard, Genève"
    assert extract_facts([], s, "omega_silver").brand_signed == "Omega"
    assert extract_facts([], s, "cylinder_metal").escapement == "cylinder"
    extract_facts([], s).retake_hints.append("endret")
    assert "endret" not in extract_facts([], s).retake_hints


def test_live_without_key_fails_clearly(env):
    s = replace(config.load_settings(), vision_mode="live", vision_provider="openai", api_key=None)
    with pytest.raises(VisionError, match="API-nøkkel"):
        extract_facts(IMAGES, s)


def test_dispatch_uses_provider_and_validates(env, monkeypatch):
    monkeypatch.setattr(gemini_p, "extract", lambda images, settings: RAW)
    s = replace(config.load_settings(), vision_mode="live", vision_provider="gemini", api_key="k")
    assert extract_facts(IMAGES, s).brand_signed == "Omega"


# --- Anthropic -------------------------------------------------------------------

def test_anthropic_content_and_parse():
    content = anthropic_p.build_content(IMAGES)
    assert [c["type"] for c in content] == ["text", "image", "text", "image", "text"]
    assert content[0]["text"].startswith("Bilde 1: Urskiven")
    block = SimpleNamespace(type="tool_use", name="record_observations", input=RAW)
    assert anthropic_p.parse_response(SimpleNamespace(content=[SimpleNamespace(type="text"), block])) == RAW
    with pytest.raises(VisionError):
        anthropic_p.parse_response(SimpleNamespace(content=[]))


# --- OpenAI / kompatibel -----------------------------------------------------------

def _chat(content, refusal=None):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, refusal=refusal))])


def test_openai_messages_and_parse():
    messages = openai_p.build_messages(IMAGES)
    assert messages[0]["role"] == "system"
    parts = messages[1]["content"]
    assert parts[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert openai_p.RESPONSE_FORMAT["json_schema"]["strict"] is True
    assert openai_p.parse_response(_chat(json.dumps(RAW))) == RAW
    assert openai_p.parse_response(_chat("```json\n" + json.dumps(RAW) + "\n```")) == RAW
    with pytest.raises(VisionError, match="avviste"):
        openai_p.parse_response(_chat(None, refusal="nei"))
    with pytest.raises(VisionError):
        openai_p.parse_response(_chat("ikke json"))


# --- Gemini ----------------------------------------------------------------------

def test_gemini_contents_and_parse():
    fake_types = SimpleNamespace(Part=SimpleNamespace(from_bytes=lambda data, mime_type: ("part", mime_type)))
    contents = gemini_p.build_contents(IMAGES, fake_types)
    assert contents[0] == "Bilde 1: Urskiven (forsiden)" and contents[3] == ("part", "image/png")
    assert gemini_p.parse_response(SimpleNamespace(text=json.dumps(RAW))) == RAW
    with pytest.raises(VisionError):
        gemini_p.parse_response(SimpleNamespace(text=None))
