import json
import logging

import httpx
import pytest

from app.ollama_client import (
    InvalidModelResponseError,
    OllamaClient,
    build_format,
    clean_cards,
    min_cards_for,
)
from app.schemas import Card, GenerateResponse

COURSE = "x" * 120
VALID_OUTPUT = json.dumps(
    {"cards": [{"front": "Q1 ?", "back": "R1"}, {"front": "Q2 ?", "back": "R2"}]}
)


# --- min_cards_for ---


def test_min_cards_is_one_for_a_short_text() -> None:
    assert min_cards_for("x" * 150, count=10) == 1


def test_min_cards_grows_with_the_course_length() -> None:
    # 10 000 characters = 5 blocks of 2 000 characters
    assert min_cards_for("x" * 10_000, count=10) == 5


def test_min_cards_counts_a_started_block() -> None:
    assert min_cards_for("x" * 10_427, count=10) == 6


def test_min_cards_never_exceeds_count() -> None:
    assert min_cards_for("x" * 20_000, count=3) == 3


# --- build_format ---


def test_format_adds_min_and_max_items_to_the_cards_array() -> None:
    cards_schema = build_format(2, 8)["properties"]["cards"]

    assert cards_schema["minItems"] == 2
    assert cards_schema["maxItems"] == 8


def test_format_does_not_change_the_generate_response_schema() -> None:
    build_format(2, 8)

    cards_schema = GenerateResponse.model_json_schema()["properties"]["cards"]
    assert "minItems" not in cards_schema
    assert "maxItems" not in cards_schema


# --- clean_cards ---


def test_clean_cards_collapses_extra_whitespace() -> None:
    cards = [Card(front="  Qu'est-ce   qu'un\nconteneur ?  ", back=" Un\tprocessus isolé. ")]

    assert clean_cards(cards, 10) == [
        Card(front="Qu'est-ce qu'un conteneur ?", back="Un processus isolé.")
    ]


def test_clean_cards_removes_duplicates_ignoring_case() -> None:
    cards = [
        Card(front="Qu'est-ce que Java ?", back="A"),
        Card(front="QU'EST-CE QUE JAVA ?", back="B"),
    ]

    assert clean_cards(cards, 10) == [Card(front="Qu'est-ce que Java ?", back="A")]


def test_clean_cards_removes_cards_with_a_blank_side() -> None:
    cards = [Card(front="   ", back="R"), Card(front="Q", back="  "), Card(front="Q2", back="R2")]

    assert clean_cards(cards, 10) == [Card(front="Q2", back="R2")]


def test_clean_cards_keeps_at_most_count_cards() -> None:
    cards = [Card(front=f"Q{i}", back=f"R{i}") for i in range(5)]

    assert [card.front for card in clean_cards(cards, 3)] == ["Q0", "Q1", "Q2"]


# --- OllamaClient, with httpx.MockTransport: no network call ---


def ollama_reply(output: str, done_reason: str = "stop") -> httpx.Response:
    """Response of Ollama's /api/generate with the given model output."""
    body = {
        "response": output,
        "done_reason": done_reason,
        "prompt_eval_count": 10,
        "eval_count": 5,
    }
    return httpx.Response(200, json=body)


def make_client(replies: list[httpx.Response], requests: list[httpx.Request]) -> OllamaClient:
    """OllamaClient whose HTTP calls get the given replies in order."""

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return replies[len(requests) - 1]

    http_client = httpx.AsyncClient(
        base_url="http://ollama.invalid:11434", transport=httpx.MockTransport(handler)
    )
    return OllamaClient(http_client, model="test-model", num_ctx=4096)


async def test_generate_cards_returns_the_model_cards() -> None:
    client = make_client([ollama_reply(VALID_OUTPUT)], [])

    cards = await client.generate_cards(COURSE, 5)

    assert cards == [Card(front="Q1 ?", back="R1"), Card(front="Q2 ?", back="R2")]


async def test_generate_cards_retries_once_after_invalid_json() -> None:
    requests: list[httpx.Request] = []
    client = make_client([ollama_reply("not json"), ollama_reply(VALID_OUTPUT)], requests)

    cards = await client.generate_cards(COURSE, 5)

    assert len(requests) == 2
    assert len(cards) == 2


async def test_generate_cards_fails_after_two_invalid_outputs() -> None:
    requests: list[httpx.Request] = []
    client = make_client([ollama_reply("not json"), ollama_reply('{"cards": []}')], requests)

    with pytest.raises(InvalidModelResponseError):
        await client.generate_cards(COURSE, 5)
    assert len(requests) == 2


async def test_generate_cards_warns_when_the_output_is_cut(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = make_client([ollama_reply('{"cards": [{"front": "Q', "length")] * 2, [])

    with caplog.at_level(logging.WARNING), pytest.raises(InvalidModelResponseError):
        await client.generate_cards(COURSE, 5)

    assert "done_reason=length" in caplog.text


async def test_generate_cards_sends_model_format_and_options_to_ollama() -> None:
    requests: list[httpx.Request] = []
    client = make_client([ollama_reply(VALID_OUTPUT)], requests)

    await client.generate_cards(COURSE, 5)

    assert requests[0].url.path == "/api/generate"
    body = json.loads(requests[0].content)
    assert body["model"] == "test-model"
    assert body["stream"] is False
    assert body["format"] == build_format(1, 5)
    assert body["options"] == {"temperature": 0.3, "num_ctx": 4096}
    assert COURSE in body["prompt"]


async def test_generate_cards_never_logs_the_course(caplog: pytest.LogCaptureFixture) -> None:
    course = "Texte secret du cours. " * 10
    client = make_client([ollama_reply("not json"), ollama_reply("not json")], [])

    with caplog.at_level(logging.DEBUG), pytest.raises(InvalidModelResponseError):
        await client.generate_cards(course, 5)

    assert "Texte secret" not in caplog.text
