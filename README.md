# deckgen

[![CI](https://github.com/marc-awad/deckgen/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/marc-awad/deckgen/actions/workflows/ci.yml?query=branch%3Adevelop)

Générateur de flashcards par IA : collez un cours, obtenez des cartes prêtes à importer dans Anki.

L'application est composée de trois services (frontend React servi par nginx, api Node.js,
generator Python) et de deux dépendances (PostgreSQL, Ollama pour le modèle de langage local).

## Démarrage rapide

### Prérequis

- **Docker Desktop** (Windows ou macOS) ou Docker Engine avec le plugin Compose (Linux).
  Rien d'autre à installer : ni Node, ni Python, ni PostgreSQL, ni Ollama.
- Environ 15 Go d'espace disque (images, dont celle d'Ollama, et modèle).

### Lancer l'application

Depuis la racine du dépôt, en PowerShell :

```powershell
Copy-Item .env.example .env      # puis changez POSTGRES_PASSWORD dans .env
docker compose up --build
```

Puis ouvrez **http://localhost:8080** (le port se change avec `FRONTEND_PORT` dans `.env`).

Ajoutez `-d` (`docker compose up --build -d`) pour lancer l'application en arrière-plan.

**Premier lancement long** : le service `ollama-pull` télécharge le modèle `gemma3:4b`
(environ 3 Go) et le generator ne démarre qu'ensuite. Les lancements suivants prennent quelques
secondes : le modèle est conservé dans un volume. La toute première génération est aussi plus
lente, le temps de charger le modèle en mémoire.

### Option GPU NVIDIA

Par défaut, Ollama tourne sur le processeur : l'application fonctionne sur toute machine, mais
la génération est plus lente. Avec une carte NVIDIA (pilote installé, et WSL 2 sous Windows),
décommentez cette ligne dans `.env` :

```dotenv
COMPOSE_FILE=docker-compose.yml;docker-compose.gpu.yml
```

`docker compose up` charge alors aussi `docker-compose.gpu.yml`, qui donne le GPU à Ollama. Sous
Linux et macOS, le séparateur est `:` au lieu de `;`. Pour vérifier pendant une génération :
`docker compose exec ollama ollama ps` doit afficher `100% GPU`.

### Commandes utiles

| Commande                              | Rôle                                                    |
|---------------------------------------|---------------------------------------------------------|
| `docker compose ps -a`                | État des services (`healthy`, et `ollama-pull` en `Exited (0)`) |
| `docker compose logs -f api`          | Suivre les logs d'un service                            |
| `docker compose up --build -d`        | Reconstruire les images après une modification du code  |
| `docker compose down`                 | Arrêter et supprimer les conteneurs (les données sont conservées) |

> **Attention** : `docker compose down -v` supprime aussi les **volumes**, c'est-à-dire la base de
> données (tous vos decks) et le modèle téléchargé, qu'il faudra télécharger de nouveau.

## Documentation

- [docs/docker-compose.md](docs/docker-compose.md) : architecture des services, réseaux, volumes
- [docs/docker-images.md](docs/docker-images.md) : Dockerfiles et tailles des images
- [docs/model-choice.md](docs/model-choice.md) : choix du modèle de langage
- [docs/ci.md](docs/ci.md) : intégration continue (GitHub Actions), scan Trivy, Dependabot
- README de chaque service : [api](api/README.md), [generator](generator/README.md),
  [frontend](frontend/README.md) (développement local sans Docker, tests)
