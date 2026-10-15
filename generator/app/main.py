import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request

from app.config import load_settings
from app.ollama_client import InvalidModelResponseError, OllamaClient
from app.schemas import GenerateRequest, GenerateResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One shared HTTP client for the whole app, closed when the service stops
    timeout = httpx.Timeout(settings.ollama_timeout, connect=5.0)
    async with httpx.AsyncClient(base_url=settings.ollama_url, timeout=timeout) as http_client:
        app.state.ollama_client = OllamaClient(
            http_client, settings.ollama_model, settings.ollama_num_ctx
        )
        yield


app = FastAPI(
    title="deckgen generator",
    description="Génère des flashcards de révision à partir d'un texte de cours, "
    "grâce à un LLM local servi par Ollama.",
    version="0.1.0",
    lifespan=lifespan,
)


# Error responses of POST /generate, shown in /docs
GENERATE_ERRORS: dict[int | str, dict[str, Any]] = {
    502: {
        "description": "Le modèle a renvoyé une réponse invalide",
        "content": {
            "application/json": {"example": {"detail": "Le modèle a renvoyé une réponse invalide"}}
        },
    },
    503: {
        "description": "Le service de génération est indisponible",
        "content": {
            "application/json": {"example": {"detail": "Le service de génération est indisponible"}}
        },
    },
    504: {
        "description": "La génération a pris trop de temps",
        "content": {
            "application/json": {"example": {"detail": "La génération a pris trop de temps"}}
        },
    },
}


def get_ollama_client(request: Request) -> OllamaClient:
    """Dependency giving the routes the shared Ollama client (easy to override in tests)."""
    return request.app.state.ollama_client


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", responses=GENERATE_ERRORS)
async def generate(
    body: GenerateRequest,
    client: Annotated[OllamaClient, Depends(get_ollama_client)],
) -> GenerateResponse:
    try:
        cards = await client.generate_cards(body.text, body.count)
    except httpx.TimeoutException:
        logger.error("Ollama request timed out")
        raise HTTPException(504, "La génération a pris trop de temps") from None
    except httpx.HTTPError as exc:
        logger.error("Ollama request failed: %r", exc)
        raise HTTPException(503, "Le service de génération est indisponible") from None
    except InvalidModelResponseError as exc:
        logger.error("Invalid model response: %s", exc)
        raise HTTPException(502, "Le modèle a renvoyé une réponse invalide") from None

    return GenerateResponse(cards=cards)
