import logging

import httpx
from pydantic import ValidationError

from app.prompt import build_prompt
from app.schemas import Card, GenerateResponse

logger = logging.getLogger(__name__)

# First try plus one retry
MAX_ATTEMPTS = 2


class InvalidModelResponseError(Exception):
    """The model output could not be turned into valid flashcards."""


class OllamaClient:
    def __init__(self, http_client: httpx.AsyncClient, model: str, num_ctx: int) -> None:
        self.http_client = http_client
        self.model = model
        self.num_ctx = num_ctx

    async def generate_cards(self, text: str, count: int) -> list[Card]:
        """Ask the model for flashcards, retrying once if its output is invalid."""
        payload = {
            "model": self.model,
            "prompt": build_prompt(text, count),
            "stream": False,
            # Structured outputs: Ollama forces the answer to match this JSON schema
            "format": GenerateResponse.model_json_schema(),
            "options": {"temperature": 0.3, "num_ctx": self.num_ctx},
        }

        for attempt in range(1, MAX_ATTEMPTS + 1):
            response = await self.http_client.post("/api/generate", json=payload)
            response.raise_for_status()
            raw_output = response.json().get("response", "")

            try:
                result = GenerateResponse.model_validate_json(raw_output)
            except ValidationError as exc:
                logger.warning(
                    "Invalid model output (attempt %d/%d): %s", attempt, MAX_ATTEMPTS, exc
                )
                continue

            cards = clean_cards(result.cards, count)
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
