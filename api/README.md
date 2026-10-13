# api

API REST de deckgen (Node.js, Express, TypeScript). Elle stocke les paquets de cartes (`decks`)
et les cartes (`cards`) dans PostgreSQL, appelle le service `generator` pour créer des cartes à
partir d'un texte de cours, et exporte un deck au format texte importable dans Anki.

## Versions de Node

| Contexte          | Version     |
|-------------------|-------------|
| Poste local       | Node 20.19  |
| Image Docker et CI | Node 24 LTS |

`package.json` déclare `"engines": { "node": ">=20" }` : c'est la version minimale réellement
supportée. Le code n'utilise aucune fonctionnalité réservée à Node 22 ou plus, et
`@types/node` est en version 20, ce qui fait échouer `npm run typecheck` si on utilise une API
plus récente par erreur. La même base de code tourne donc en local (Node 20) et dans l'image
(Node 24).

## Routes

| Méthode | Chemin                | Corps                    | Réponses possibles                       |
|---------|-----------------------|--------------------------|------------------------------------------|
| GET     | `/health`             |                          | 200 `{"status": "ok"}` (sonde de vie, sans interroger la base) |
| GET     | `/ready`              |                          | 200 `{"status": "ready"}`, 503 `{"status": "unavailable"}` (sonde de disponibilité) |
| GET     | `/decks`              |                          | 200 liste `[{id, name, createdAt, cardCount}]`, du plus récent au plus ancien |
| POST    | `/decks`              | `{name}`                 | 201 deck créé, 422                       |
| GET     | `/decks/:id`          |                          | 200 `{id, name, createdAt, cards: [...]}` (cartes triées par id), 404, 422 |
| PUT     | `/decks/:id`          | `{name}`                 | 200 deck modifié, 404, 422               |
| DELETE  | `/decks/:id`          |                          | 204 (les cartes sont supprimées avec le deck), 404, 422 |
| POST    | `/decks/:id/generate` | `{text, count}`          | 201 `{cards: [...]}` (cartes **ajoutées** au deck), 404, 422, 502, 503, 504 |
| GET     | `/decks/:id/export`   |                          | 200 fichier texte Anki, 404, 422         |
| PUT     | `/cards/:id`          | `{front, back}`          | 200 carte modifiée, 404, 422             |
| DELETE  | `/cards/:id`          |                          | 204, 404, 422                            |

Une carte renvoyée a la forme `{id, deckId, front, back, createdAt}`.

### Règles de validation

| Champ   | Règle                                                                  |
|---------|------------------------------------------------------------------------|
| `:id`   | Entier de 1 à 2 147 483 647 (limite d'une colonne `integer`)           |
| `name`  | Texte, espaces de début et fin retirés, 1 à 100 caractères             |
| `front`, `back` | Texte, espaces de début et fin retirés, 1 à 500 caractères     |
| `text`  | Texte, espaces de début et fin retirés, 50 à 20 000 caractères         |
| `count` | Entier de 1 à 30, 5 par défaut (nombre **maximal** de cartes)          |

Les règles de `text` et `count` sont celles du generator : l'API les vérifie avant de l'appeler.

### Erreurs

Toutes les erreurs ont la forme `{"detail": "..."}`, en français :

| Code | Cause                                                                     |
|------|---------------------------------------------------------------------------|
| 400  | Corps JSON mal formé                                                      |
| 404  | Deck, carte ou route introuvable                                          |
| 413  | Corps de plus de 100 ko                                                   |
| 422  | Données invalides, avec le détail : `{"detail": "Données invalides", "errors": [{"field": "name", "message": "..."}]}` |
| 500  | Erreur inattendue (le détail est uniquement dans les logs)                |
| 502  | Le generator ou le modèle a renvoyé une réponse invalide                  |
| 503  | Le generator est injoignable                                              |
| 504  | La génération a dépassé `GENERATOR_TIMEOUT_MS`                            |

### Export Anki

`GET /decks/:id/export` renvoie un fichier `deckgen-<id>-<nom-simplifié>.txt` (UTF-8) :

```text
#separator:Pipe
#html:false
#deck:Docker
Qu'est-ce qu'un conteneur ?|Un processus isolé du reste du système.
```

Dans Anki : **Fichier > Importer**, choisir le fichier. Les en-têtes `#` indiquent à Anki le
séparateur, l'absence de HTML et le deck de destination. Dans chaque champ, `|` est remplacé par
`/` et les retours à la ligne par des espaces.

Exemple en PowerShell :

```powershell
Invoke-WebRequest http://localhost:3000/decks/1/export -OutFile deck.txt
```

## Variables d'environnement

En local, elles sont lues depuis `api/.env` s'il existe. Une variable déjà définie dans
l'environnement est prioritaire sur le fichier. En conteneur, il n'y a pas de fichier `.env`.

| Variable            | Obligatoire | Défaut | Rôle                                         |
|---------------------|-------------|--------|----------------------------------------------|
| `PORT`              | Non         | `3000` | Port HTTP de l'API                           |
| `DB_HOST`           | Oui         |        | Hôte PostgreSQL (`localhost` en local)       |
| `DB_PORT`           | Non         | `5432` | Port PostgreSQL                              |
| `POSTGRES_USER`     | Oui         |        | Utilisateur PostgreSQL                       |
| `POSTGRES_PASSWORD` | Oui         |        | Mot de passe PostgreSQL (jamais écrit dans les logs) |
| `POSTGRES_DB`       | Oui         |        | Nom de la base                               |
| `LOG_LEVEL`         | Non         | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent` |
| `GENERATOR_URL`     | Oui         |        | URL du service generator : `http://localhost:8000` en local, `http://generator:8000` avec docker-compose |
| `GENERATOR_TIMEOUT_MS` | Non      | `300000` | Délai maximal d'une génération, en millisecondes. Plus long que celui du generator (2 tentatives de 120 s) |

Si une variable obligatoire manque ou est invalide, le service refuse de démarrer et liste les
variables en cause. Les variables sont séparées (pas de `DATABASE_URL`) pour pouvoir placer
l'hôte dans un ConfigMap Kubernetes et le mot de passe dans un Secret.

## PostgreSQL en local

```powershell
docker run -d --name deckgen-postgres `
  -e POSTGRES_USER=deckgen -e POSTGRES_PASSWORD=deckgen -e POSTGRES_DB=deckgen `
  -p 5432:5432 -v deckgen-pgdata:/var/lib/postgresql `
  postgres:18-alpine
```

Le volume `deckgen-pgdata` conserve les données si le conteneur est supprimé. Ensuite :
`docker stop deckgen-postgres` et `docker start deckgen-postgres`.

## Installation et lancement (PowerShell)

Depuis le dossier `api/` :

```powershell
npm install
Copy-Item .env.example .env
```

| Commande              | Rôle                                                           |
|-----------------------|----------------------------------------------------------------|
| `npm run dev`         | Lance l'API avec tsx, redémarre à chaque modification          |
| `npm run build`       | Compile TypeScript vers `dist/`                                |
| `npm start`           | Lance la version compilée (`node dist/index.js`)               |
| `npm run lint`        | Vérifie le code avec ESLint                                    |
| `npm run typecheck`   | Vérifie les types sans compiler                                |
| `npm run db:generate` | Génère une migration SQL après une modification du schéma      |

Vérifier que l'API tourne :

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/ready
```

## Base de données et migrations

- Le schéma est décrit en TypeScript dans `src/db/schema.ts` (Drizzle ORM).
- `npm run db:generate` compare le schéma au dernier état connu (`drizzle/meta/`) et écrit un
  fichier SQL dans `drizzle/`. Ce dossier est versionné : relire le SQL avant de le commiter.
- Au démarrage, l'API vérifie la connexion à la base, applique les migrations manquantes, puis
  seulement ensuite accepte des requêtes. Si la base est injoignable, elle s'arrête avec le
  code 1 (l'orchestrateur la relancera).

Pour ajouter une colonne : modifier `src/db/schema.ts`, lancer `npm run db:generate`, relire le
fichier SQL créé, puis redémarrer l'API.

## Arrêt propre

Sur `SIGTERM` (envoyé par `docker stop` et par Kubernetes) ou `SIGINT` (Ctrl+C), l'API arrête
d'accepter de nouvelles connexions, termine les requêtes en cours, ferme le pool PostgreSQL puis
quitte. Au-delà de 10 secondes, l'arrêt est forcé.
