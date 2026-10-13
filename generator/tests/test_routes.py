from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_ollama_client
from app.ollama_client import InvalidModelResponseError, OllamaClient
from app.schemas import Card

VALID_TEXT = "Un conteneur est un processus isolé grâce aux namespaces du noyau Linux."


class FakeOllamaClient:
    """Replaces OllamaClient: returns fixed cards, or raises the given error."""

    def __init__(self, cards: list[Card] | None = None, error: Exception | None = None) -> None:
        self.cards = cards or []
        self.error = error
        self.calls: list[tuple[str, int]] = []

    async def generate_cards(self, text: str, count: int) -> list[Card]:
        self.calls.append((text, count))
        if self.error:
            raise self.error
        return self.cards


@pytest.fixture
def fake() -> Iterator[FakeOllamaClient]:
    """Fake Ollama client injected into the routes through dependency_overrides."""
    fake_client = FakeOllamaClient(cards=[Card(front="Q ?", back="R.")])
    app.dependency_overrides[get_ollama_client] = lambda: fake_client
    yield fake_client
    app.dependency_overrides.clear()


# Without "with TestClient(app)", the lifespan does not run: no real HTTP client is created
client = TestClient(app)


def test_lifespan_creates_the_ollama_client_from_the_environment() -> None:
    # Creating an httpx client sends no request: no network access here
    with TestClient(app):
        ollama_client = app.state.ollama_client
        assert isinstance(ollama_client, OllamaClient)
        assert ollama_client.model == "test-model"
        assert ollama_client.num_ctx == 4096


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_generate_returns_the_cards(fake: FakeOllamaClient) -> None:
    response = client.post("/generate", json={"text": VALID_TEXT, "count": 3})

    assert response.status_code == 200
    assert response.json() == {"cards": [{"front": "Q ?", "back": "R."}]}


def test_generate_strips_the_text_and_uses_default_count(fake: FakeOllamaClient) -> None:
    client.post("/generate", json={"text": f"   {VALID_TEXT}   "})

    assert fake.calls == [(VALID_TEXT, 5)]


def test_generate_rejects_a_too_short_text(fake: FakeOllamaClient) -> None:
    response = client.post("/generate", json={"text": "Trop court"})

    assert response.status_code == 422
    assert fake.calls == []


@pytest.mark.parametrize("count", [0, 31])
def test_generate_rejects_a_count_out_of_range(fake: FakeOllamaClient, count: int) -> None:
    response = client.post("/generate", json={"text": VALID_TEXT, "count": count})

    assert response.status_code == 422
    assert fake.calls == []


@pytest.mark.parametrize(
    ("error", "status", "detail"),
    [
        (
            InvalidModelResponseError("invalid"),
            502,
            "Le modèle a renvoyé une réponse invalide",
        ),
        (
            httpx.ConnectError("connection refused"),
            503,
            "Le service de génération est indisponible",
        ),
        (httpx.ReadTimeout("timed out"), 504, "La génération a pris trop de temps"),
    ],
    ids=["invalid-output-502", "unreachable-503", "timeout-504"],
)
def test_generate_maps_ollama_errors_to_http_statuses(
    fake: FakeOllamaClient, error: Exception, status: int, detail: str
) -> None:
    fake.error = error

    response = client.post("/generate", json={"text": VALID_TEXT})

    assert response.status_code == status
    assert response.json() == {"detail": detail}
