# frontend

Interface web de deckgen (React, TypeScript, Vite, Tailwind CSS). Elle permet de créer un deck,
de coller un cours, de choisir le nombre maximum de cartes, de lancer la génération et d'afficher
les cartes produites.

Le frontend ne contient aucune logique métier : il appelle l'api, qui enregistre le deck dans
PostgreSQL et demande les cartes au service `generator`.

## Versions de Node

Vite 8 demande Node `^20.19.0 || >=22.12.0`, ce qui est déclaré dans `engines` de `package.json`.
Le projet fonctionne donc avec Node 20.19 en local et avec Node 24 pour le build de l'image Docker.
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
    types.ts        # types Deck, Card, FieldError, conformes aux réponses de l'api
    client.ts       # fetch vers /api, classe ApiError, une fonction par route
  components/
    GenerateForm.tsx      # formulaire (nom, cours, nombre de cartes)
    GenerationStatus.tsx  # chargement avec compteur, erreurs et bouton Réessayer
    CardList.tsx          # affichage des cartes générées
  validation.ts     # règles de validation, identiques à celles de l'api
  App.tsx           # état de la page et enchaînement création puis génération
  main.tsx          # point d'entrée React
  index.css         # Tailwind et style du focus clavier
```
