# syntax=docker/dockerfile:1

# ---- Build stage: install the Python dependencies in a virtual environment ----
FROM python:3.13.16-slim-trixie AS build

# Everything pip installs goes into /opt/venv, a single folder to copy into the final image
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Dependencies before the code: this layer stays cached while requirements.txt is unchanged
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ---- Final stage: Python runtime, installed dependencies and the app code only ----
FROM python:3.13.16-slim-trixie

LABEL org.opencontainers.image.title="deckgen-generator" \
      org.opencontainers.image.description="Generates flashcards from a course with a local LLM served by Ollama" \
      org.opencontainers.image.source="https://github.com/marc-awad/deckgen"

# No .pyc files written at runtime, logs sent immediately to stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Unprivileged user with a fixed uid (no home, no login shell)
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY app/ ./app/

# Files above belong to root: the app can read its code but not modify it
USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=2s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
