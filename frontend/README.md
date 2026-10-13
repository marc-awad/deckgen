# frontend

Interface web de deckgen (React, TypeScript, Vite, Tailwind CSS, React Router). Elle permet de
créer un deck à partir d'un cours, de consulter ses decks, de modifier ou supprimer les cartes
générées et d'exporter un deck pour Anki.

Le frontend ne contient aucune logique métier : il appelle l'api, qui enregistre le deck dans
PostgreSQL et demande les cartes au service `generator`.

## Pages

| Route         | Page                                                                          |
|---------------|-------------------------------------------------------------------------------|
| `/`           | Mes decks : liste des decks avec leur nombre de cartes et leur date de création |
| `/new`        | Nouveau deck : formulaire (nom, cours, nombre de cartes) et génération, puis redirection vers le deck |
| `/decks/:id`  | Un deck : ses cartes (modifier, supprimer), export Anki, suppression du deck  |
| autre adresse | Page introuvable, avec un lien vers la liste                                  |

Le routage est fait dans le navigateur par React Router (`src/App.tsx`) : changer de page ne
recharge pas le site, seul le contenu change. L'en-tête est commun à toutes les pages.

### Fallback SPA en production

Le site est une application monopage (SPA) : il n'existe qu'un fichier `index.html`, et c'est
React Router qui affiche la bonne page selon l'adresse. Si l'utilisateur recharge
`/decks/3` ou ouvre ce lien directement, le navigateur demande `/decks/3` au serveur web.
Ce fichier n'existe pas : le serveur doit donc renvoyer `index.html` pour toute adresse qui ne
correspond pas à un fichier (et qui ne commence pas par `/api`), sinon il répond 404.

En développement, le serveur de Vite le fait déjà. En production, nginx devra être configuré
avec `try_files $uri /index.html;`.

## Versions de Node

Vite 8 demande Node `^20.19.0 || >=22.12.0`, ce qui est déclaré dans `engines` de `package.json`.
Le projet fonctionne donc avec Node 20.19 en local et avec Node 24 pour le build de l'image Docker.
React Router est en version 7 (`^7.18.4`) : la version 8 exige Node 22.22 ou plus.
Une fois compilé, le frontend n'est plus qu'un ensemble de fichiers statiques (HTML, CSS, JS) :
Node n'est pas nécessaire pour le servir.

## Appels à l'api : le préfixe `/api`

Le code appelle toujours des chemins relatifs commençant par `/api` (par exemple `/api/decks`),
jamais une URL complète. Le navigateur envoie donc toutes les requêtes à l'adresse qui a servi la
page, et c'est cette adresse qui les redirige vers l'api en retirant le préfixe :

| Contexte      | Qui sert la page              | Qui redirige `/api/...` vers l'api |
|---------------|-------------------------------|------------------------------------|
| Développement | Serveur de Vite (port 5173)   | Proxy de Vite (`vite.config.ts`)   |
| Production    | nginx                         | nginx (`location /api/`)           |

Exemple : `/api/decks/3/generate` devient `/decks/3/generate` sur l'api.

Avantages : aucune URL d'api n'est compilée dans le code (la même image fonctionne partout), et
le navigateur ne voit qu'une seule origine, donc il n'y a pas de CORS à configurer.

Le proxy de développement laisse 300 secondes à une requête, car une génération peut être longue.

### Variable d'environnement

| Variable           | Défaut                  | Rôle                                                  |
|--------------------|-------------------------|-------------------------------------------------------|
| `API_PROXY_TARGET` | `http://localhost:3000` | Adresse de l'api vers laquelle le proxy de Vite redirige `/api` |

Elle ne sert qu'en développement (`npm run dev` et `npm run preview`). Exemple en PowerShell :

```powershell
$env:API_PROXY_TARGET = "http://localhost:3001"; npm run dev
```

## Installation et commandes (PowerShell)

Depuis le dossier `frontend/` :

```powershell
npm install
```

| Commande            | Rôle                                                              |
|---------------------|-------------------------------------------------------------------|
| `npm run dev`       | Lance le serveur de développement sur http://localhost:5173       |
| `npm run build`     | Vérifie les types puis compile le site dans `dist/`               |
| `npm run preview`   | Sert le contenu de `dist/` en local, avec le même proxy `/api`    |
| `npm run lint`      | Vérifie le code avec ESLint                                       |
| `npm run typecheck` | Vérifie les types TypeScript sans compiler                        |
| `npm test`          | Lance les tests des fonctions pures (voir la section Tests)       |

## Lancer l'application complète en local

Chaque commande dans son propre terminal PowerShell, ouvert à la racine du dépôt :

```powershell
docker start deckgen-postgres                                              # base de données
cd api;       npm run dev                                                  # api sur le port 3000
cd generator; .venv\Scripts\python -m uvicorn app.main:app --port 8000     # generator (Ollama doit tourner)
cd frontend;  npm run dev                                                  # frontend sur le port 5173
```

Puis ouvrir http://localhost:5173. Pour vérifier le proxy :
`Invoke-RestMethod http://localhost:5173/api/health` doit répondre `status: ok`.

## Organisation du code

```text
src/
  api/
    types.ts        # types conformes aux réponses de l'api (Deck, DeckSummary, DeckWithCards, Card)
    client.ts       # fetch vers /api, classe ApiError, une fonction par route, exportUrl
  pages/
    DeckListPage.tsx      # /           liste des decks
    NewDeckPage.tsx       # /new        création et génération
    DeckPage.tsx          # /decks/:id  vue d'un deck
    NotFoundPage.tsx      # *           page introuvable
  components/
    Layout.tsx            # en-tête, navigation, focus sur le titre à chaque page
    PageTitle.tsx         # titre h1 de la page et titre de l'onglet
    LoadStatus.tsx        # chargement ou erreur avec bouton Réessayer
    Spinner.tsx           # indicateur de chargement
    GenerateForm.tsx      # formulaire de création (nom, cours, nombre de cartes)
    GenerationStatus.tsx  # suivi de la génération, erreurs, Réessayer
    CardList.tsx          # liste des cartes d'un deck
    CardItem.tsx          # une carte : affichage, boutons Modifier et Supprimer
    CardEditForm.tsx      # formulaire de modification d'une carte
  hooks/
    useLoad.ts      # chargement d'une donnée de l'api (chargement, erreur, réessayer)
  validation.ts     # règles de validation, identiques à celles de l'api
  format.ts         # nombres, dates et « 1 carte / 2 cartes » en français
  styles.ts         # classes Tailwind partagées (boutons, champs)
  App.tsx           # déclaration des routes
  main.tsx          # point d'entrée React
  index.css         # Tailwind et style du focus clavier
```

## Tests

Les tests utilisent Vitest et portent uniquement sur les fonctions pures, placées à côté du code
testé :

| Fichier                  | Ce qui est testé                                                      |
|--------------------------|-----------------------------------------------------------------------|
| `src/validation.test.ts` | Règles du formulaire de génération et des cartes : `trim`, bornes exactes (100, 50, 20 000, 1, 30, 500) |
| `src/format.test.ts`     | Nombres (`20 000`), dates en français, « 0 carte », « 1 carte », « 2 cartes » |

```powershell
npm test
```

Ces fonctions ne font aucun appel réseau : les tests n'ont besoin ni de l'api ni d'un navigateur.
Les fichiers `*.test.ts` sont vérifiés par `npm run typecheck`, mais n'entrent pas dans le build :
aucun fichier de l'application ne les importe.
