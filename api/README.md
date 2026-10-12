# api

API REST de deckgen (Node.js, Express, TypeScript). Elle stocke les paquets de cartes (`decks`)
et les cartes (`cards`) dans PostgreSQL. Elle appellera plus tard le service `generator` pour
créer des cartes et proposera l'export vers Anki.

Pour l'instant, le service contient le socle : configuration validée, connexion à PostgreSQL,
migrations appliquées au démarrage, sondes de santé et arrêt propre.

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

| Méthode | Route     | Rôle                                                                     |
|---------|-----------|--------------------------------------------------------------------------|
| GET     | `/health` | Sonde de vie : `{"status": "ok"}`, sans interroger la base               |
| GET     | `/ready`  | Sonde de disponibilité : `{"status": "ready"}` si la base répond, sinon 503 `{"status": "unavailable"}` |

Une route inconnue renvoie 404 `{"detail": "Route introuvable"}`, une erreur inattendue renvoie
500 `{"detail": "Erreur interne du serveur"}` (le détail est uniquement dans les logs).

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
