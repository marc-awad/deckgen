import logging
import math
from typing import Any

import httpx
from pydantic import ValidationError

from app.prompt import build_prompt
from app.schemas import Card, GenerateResponse

logger = logging.getLogger(__name__)

# First try plus one retry
MAX_ATTEMPTS = 2

# At least one card per started block of 2 000 characters of course (issue #27)
CHARS_PER_REQUIRED_CARD = 2000


class InvalidModelResponseError(Exception):
    """The model output could not be turned into valid flashcards."""


def min_cards_for(text: str, count: int) -> int:
    """Minimum number of cards: grows with the course length, never above count."""
    return min(count, max(1, math.ceil(len(text) / CHARS_PER_REQUIRED_CARD)))


def build_format(min_cards: int, max_cards: int) -> dict[str, Any]:
    """JSON schema of GenerateResponse, with bounds on the number of cards."""
    # model_json_schema() returns a new dict: the schema shown in /docs is not changed
    schema = GenerateResponse.model_json_schema()
    schema["properties"]["cards"]["minItems"] = min_cards
    schema["properties"]["cards"]["maxItems"] = max_cards
    return schema


def parse_cards(raw_output: str) -> list[Card] | None:
    """Cards of the model output, or None if it does not match the schema."""
    try:
        return GenerateResponse.model_validate_json(raw_output).cards
    except ValidationError as exc:
        # include_input=False: the model output may quote the course
        logger.warning(
            "Invalid model output: %s", exc.errors(include_url=False, include_input=False)
        )
        return None


class OllamaClient:
    def __init__(self, http_client: httpx.AsyncClient, model: str, num_ctx: int) -> None:
        self.http_client = http_client
        self.model = model
        self.num_ctx = num_ctx

    async def generate_cards(self, text: str, count: int) -> list[Card]:
        """Ask the model for flashcards, retrying once if its output is invalid."""
        min_cards = min_cards_for(text, count)
        payload = {
            "model": self.model,
            "prompt": build_prompt(text, min_cards, count),
            "stream": False,
            # Structured outputs: Ollama forces the answer to match this JSON schema
            "format": build_format(min_cards, count),
            "options": {"temperature": 0.3, "num_ctx": self.num_ctx},
        }

        for attempt in range(1, MAX_ATTEMPTS + 1):
            response = await self.http_client.post("/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()

            if data.get("done_reason") == "length":
                logger.warning(
                    "Model output cut at num_ctx=%d tokens (done_reason=length): "
                    "increase OLLAMA_NUM_CTX or shorten the course",
                    self.num_ctx,
                )

            raw_cards = parse_cards(data.get("response", ""))
            cards = clean_cards(raw_cards, count) if raw_cards is not None else []
            logger.info(
                "Ollama call: model=%s attempt=%d/%d prompt_eval_count=%s eval_count=%s "
                "done_reason=%s duration=%.1fs min_cards=%d raw_cards=%s clean_cards=%d",
                self.model,
                attempt,
                MAX_ATTEMPTS,
                data.get("prompt_eval_count"),
                data.get("eval_count"),
                data.get("done_reason"),
                data.get("total_duration", 0) / 1e9,
                min_cards,
                len(raw_cards) if raw_cards is not None else "invalid",
                len(cards),
            )

            if cards:
                return cards
            logger.warning("No usable card in model output (attempt %d/%d)", attempt, MAX_ATTEMPTS)

        raise InvalidModelResponseError(f"No valid output after {MAX_ATTEMPTS} attempts")


def clean_cards(cards: list[Card], count: int) -> list[Card]:
    """Collapse extra whitespace, drop empty or duplicate cards and keep at most `count`."""
    cleaned: list[Card] = []
    seen_fronts: set[str] = set()

    for card in cards:
        front = " ".join(card.front.split())
        back = " ".join(card.back.split())
        key = front.casefold()
        if not front or not back or key in seen_fronts:
            continue
        seen_fronts.add(key)
        cleaned.append(Card(front=front, back=back))

    return cleaned[:count]
