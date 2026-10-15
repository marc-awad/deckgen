# generator

Service Python (FastAPI) de deckgen qui transforme un texte de cours en flashcards de révision.
Il envoie le cours à un LLM local servi par [Ollama](https://ollama.com) et renvoie des cartes
recto/verso au format JSON.

## Routes

| Méthode | Route       | Rôle                                                         |
|---------|-------------|--------------------------------------------------------------|
| GET     | `/health`   | Vérifie que le service tourne (n'appelle pas Ollama)         |
| POST    | `/generate` | Génère des flashcards à partir d'un texte de cours           |
| GET     | `/docs`     | Documentation interactive générée par FastAPI                |

Exemple de corps pour `POST /generate` :

```json
{ "text": "Texte du cours, entre 50 et 20 000 caractères...", "count": 10 }
```

Réponse :

```json
{ "cards": [{ "front": "Question ?", "back": "Réponse." }] }
```

Nombre de cartes : `count` est un maximum. Un minimum est aussi imposé au modèle, à raison d'une
carte par tranche de 2 000 caractères de cours (plafonné à `count`) : 1 carte minimum pour un
texte court, 6 pour 10 400 caractères. Les deux bornes sont envoyées à Ollama dans le JSON schema
(`minItems`, `maxItems`), qui contraint la génération.

Codes d'erreur :

| Code | Cause                                                        |
|------|--------------------------------------------------------------|
| 422  | Texte trop court ou trop long, `count` hors de 1 à 30        |
| 502  | Le modèle a renvoyé une réponse invalide (après une nouvelle tentative) |
| 503  | Ollama est injoignable                                       |
| 504  | La génération a dépassé `OLLAMA_TIMEOUT`                     |

## Variables d'environnement

Elles sont lues depuis l'environnement, puis depuis `generator/.env` s'il existe.

| Variable         | Obligatoire | Défaut | Rôle                                         |
|------------------|-------------|--------|----------------------------------------------|
| `OLLAMA_URL`     | Oui         |        | URL d'Ollama, ex. `http://localhost:11434`   |
| `OLLAMA_MODEL`   | Oui         |        | Modèle utilisé, ex. `gemma3:4b`              |
| `OLLAMA_TIMEOUT` | Non         | `120`  | Délai maximal d'une génération, en secondes  |
| `OLLAMA_NUM_CTX` | Non         | `12288` | Taille du contexte du modèle, en tokens (prompt + réponse) |

Si une variable obligatoire manque, le service refuse de démarrer.

## Installation (PowerShell)

Depuis le dossier `generator/` :

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

`requirements.txt` contient les dépendances de production, `requirements-dev.txt` y ajoute Ruff.

## Lancer le service

Ollama doit tourner avec le modèle téléchargé (`ollama pull gemma3:4b`).

```powershell
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Puis ouvrir http://localhost:8000/docs, ou tester en ligne de commande :

```powershell
Invoke-RestMethod http://localhost:8000/health

$text = "Un conteneur est un processus isolé grâce aux namespaces du noyau Linux. Les cgroups limitent ses ressources."
$body = @{ text = $text; count = 3 } | ConvertTo-Json
Invoke-RestMethod http://localhost:8000/generate -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

## Linter et formatage (Ruff)

```powershell
.venv\Scripts\python -m ruff check .
.venv\Scripts\python -m ruff format --check .
```

Pour corriger automatiquement : `ruff check --fix .` et `ruff format .`.

## Tests

Les tests sont dans `tests/` et utilisent pytest. Ils ne demandent ni Ollama ni accès réseau.

| Fichier                 | Ce qui est testé                                                       |
|-------------------------|------------------------------------------------------------------------|
| `test_prompt.py`        | `build_prompt` : bornes min/max, cours délimité à la fin du prompt     |
| `test_ollama_client.py` | `min_cards_for`, `build_format`, `clean_cards`, et le client Ollama : réponse valide, nouvelle tentative, échec après deux réponses invalides, warning `done_reason=length`, corps envoyé à Ollama |
| `test_routes.py`        | `/health`, `/generate` en succès, erreurs 422, 502, 503 et 504          |

```powershell
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest
```

Le rapport de couverture s'affiche à la fin (`--cov`, configuré dans `pyproject.toml`).

Pourquoi aucun service externe n'est nécessaire :

- `tests/conftest.py` définit des variables factices (`OLLAMA_URL=http://ollama.invalid:11434`)
  avant l'import de l'application. Elles remplacent celles de `generator/.env`, et un nom en
  `.invalid` ne peut jamais être résolu : un appel réseau oublié ferait échouer le test.
- Le client Ollama est testé avec `httpx.MockTransport` : les requêtes sont reçues par une
  fonction Python qui renvoie une réponse préparée, rien ne sort de la machine.
- Les routes sont testées avec `TestClient`, qui appelle l'application en mémoire. Le vrai client
  Ollama est remplacé par un faux grâce à `app.dependency_overrides`.
- Les tests async (`async def test_...`) tournent grâce à `pytest-asyncio` en mode `auto`.

## Docker

Image multi-stage basée sur `python:3.13.16-slim-trixie`, utilisateur non-root (uid 10001),
port 8000. Détails et tailles : [docs/docker-images.md](../docs/docker-images.md).

Depuis la racine du dépôt (Ollama tourne sur l'hôte) :

```powershell
docker build -t deckgen-generator:dev ./generator
docker run --rm -p 8000:8000 `
  -e OLLAMA_URL=http://host.docker.internal:11434 `
  -e OLLAMA_MODEL=gemma3:4b `
  deckgen-generator:dev
```

`host.docker.internal` désigne la machine hôte depuis un conteneur Docker Desktop.
`docker ps` affiche `(healthy)` quand `/health` répond.
