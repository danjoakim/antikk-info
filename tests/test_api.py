"""Ende-til-ende mot API-et i mock-modus."""

from dataclasses import replace

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from app.config import load_settings  # noqa: E402
from app.main import create_app  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100


@pytest.fixture()
def client(tmp_path):
    settings = replace(load_settings(), vision_mode="mock", db_path=tmp_path / "api.db", max_image_bytes=1000)
    with TestClient(create_app(settings)) as c:
        yield c


def test_meta(client):
    data = client.get("/api/meta").json()
    assert data["mode"] == "mock" and "omega_silver" in data["mock_scenarios"]
    assert any(m["code"] == "silver_800" for m in data["materials"])


def test_full_flow_omega(client):
    r = client.post("/api/analyze", files={"dial": ("d.jpg", JPEG, "image/jpeg")})
    assert r.status_code == 200
    norm = r.json()["normalized"]
    assert norm["brand"] == "omega" and norm["movement_serial"] == 2345678 and norm["material"] == "silver_800"

    r = client.post("/api/lookup", json={"brand": "omega", "movement_serial": "2345678",
                                          "escapement": "lever", "material": "silver_800"})
    body = r.json()
    assert body["dating"]["status"] == "dated" and body["dating"]["estimate"] == 1909
    assert body["valuation"]["median"] == 2300


def test_requires_image(client):
    assert client.post("/api/analyze", data={"mock_scenario": "omega_silver"}).status_code == 400


def test_rejects_wrong_type_and_size(client):
    assert client.post("/api/analyze", files={"dial": ("d.heic", b"x", "image/heic")}).status_code == 415
    assert client.post("/api/analyze", files={"dial": ("d.jpg", b"0" * 2000, "image/jpeg")}).status_code == 413


def test_lookup_without_sales(client):
    body = client.post("/api/lookup", json={"brand": "Zenith", "escapement": "lever"}).json()
    assert body["valuation"] is None and "Ingen sammenlignbare salg" in body["valuation_message"]


def test_frontend_is_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "<html" in r.text.lower()
