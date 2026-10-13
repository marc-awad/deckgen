# Images Docker

Chaque service a un Dockerfile multi-stage et un `.dockerignore` dans son dossier. Les images
finales ne contiennent que ce qui sert à l'exécution.

## Tailles : version naïve et version optimisée

La version naïve est un Dockerfile en une seule étape : image de base complète (Debian, non slim),
`COPY . .` de tout le service, installation de toutes les dépendances (dev comprises), compilation
sur place. Elle n'a servi qu'à la comparaison.

| Service   | Naïve (disque / compressée) | Optimisée (disque / compressée) | Gain       |
|-----------|-----------------------------|----------------------------------|------------|
| generator | 1,75 Go / 459 Mo            | **221 Mo / 53 Mo**               | -87 % / -88 % |
| api       | 2,2 Go / 570 Mo             | **279 Mo / 65 Mo**               | -87 % / -89 % |
| frontend  | 2,13 Go / 548 Mo            | **90,5 Mo / 25,7 Mo**            | -96 % / -95 % |

Mesures de `docker image ls` (Docker Desktop 29) : « disque » est la place occupée une fois
l'image décompressée, « compressée » est ce qui est téléchargé lors d'un `docker pull`.

## Ce qui fait la différence

1. **L'image de base.** Les images complètes embarquent une Debian entière avec des compilateurs
   (gcc, make) : `python:3.13.16-trixie` pèse 1,62 Go et `node:24.21.0-trixie` 1,78 Go, contre
   178 Mo pour `python:3.13.16-slim-trixie`, 242 Mo pour `node:24.21.0-alpine3.24` et 90 Mo pour
   `nginxinc/nginx-unprivileged:1.30.5-alpine3.24`. C'est la plus grosse part du gain.
2. **Le multi-stage.** Les outils de build restent dans les étapes intermédiaires : l'image finale
   de l'api n'a ni TypeScript ni les 227 Mo de `node_modules` de dev (32 Mo de dépendances de prod
   à la place). Celle du frontend n'a même plus Node : seulement nginx et 308 Ko de fichiers
   statiques, au lieu de 191 Mo de `node_modules`.
3. **Les dépendances de prod seulement.** `requirements.txt` sans pytest ni ruff pour le generator,
   `npm ci --omit=dev --omit=optional` pour l'api.
4. **Pas de fichiers inutiles.** Les `.dockerignore` excluent tests, caches, `.env`, README et
   fichiers d'éditeur, et les Dockerfiles copient des dossiers précis au lieu de `COPY . .`.

La sécurité suit le même mouvement : moins de paquets installés signifie moins de failles
potentielles, et les trois images finales tournent sous un utilisateur non-root (les naïves
tournent en root).

## Choix techniques communs

- **Tags précis** (`3.13.16-slim-trixie`, `24.21.0-alpine3.24`, `1.30.5-alpine3.24`) : le build
  donne la même image aujourd'hui et dans six mois. Un tag comme `latest` ou `24-alpine` change
  sans prévenir.
- **Cache** : les fichiers de dépendances sont copiés et installés avant le code. Modifier un
  fichier de code ne relance pas `pip install` ou `npm ci`, repris du cache : seules la copie du
  code et la compilation sont rejouées.
- **Non-root avec uid fixe** : un uid numérique (10001, 1000, 101) permet à Kubernetes de vérifier
  `runAsNonRoot`. Le code appartient à root : l'application peut le lire mais pas le modifier.
- **HEALTHCHECK** avec un outil déjà présent (python, node, wget), sur la route `/health` de chaque
  service. `--start-interval=2s` vérifie souvent pendant le démarrage : le conteneur passe
  `healthy` en quelques secondes au lieu de 30.
- **CMD en forme tableau** : le processus est lancé directement, sans shell intermédiaire, et
  reçoit les signaux d'arrêt.
- **Labels OCI** : titre, description et dépôt source, lus par les registres et les scanners.

## Choix propres à chaque image

### generator (`python:3.13.16-slim-trixie`)

- Étape `build` : un environnement virtuel `/opt/venv` reçoit les dépendances
  (`pip install --no-cache-dir`, sans le cache de pip). Étape finale : copie de `/opt/venv` et du
  dossier `app/` uniquement.
- slim plutôt qu'alpine : les paquets Python précompilés (wheels) visent la glibc de Debian ;
  sur alpine (musl), certains devraient être recompilés.
- `PYTHONDONTWRITEBYTECODE=1` et `PYTHONUNBUFFERED=1` : pas de fichiers `.pyc` écrits, logs
  envoyés immédiatement.
- Aucune valeur par défaut pour `OLLAMA_URL` et `OLLAMA_MODEL` : sans elles, le service refuse de
  démarrer avec un message clair.

### api (`node:24.21.0-alpine3.24`)

- Trois étapes : `build` (`npm ci` complet puis `tsc`), `prod-deps` (`npm ci --omit=dev
  --omit=optional`), et l'étape finale qui assemble `dist/`, `drizzle/`, `node_modules` de prod et
  `package.json`.
- `--omit=optional` : PGlite et `@types/pg` sont des dépendances de dev, mais aussi des
  dépendances optionnelles de drizzle-orm, que `--omit=dev` seul conserve (28 Mo de plus).
- npm, npx, yarn et corepack sont supprimés de l'image finale (environ 24 Mo) : ils ne servent pas
  à lancer `node dist/index.js`.
- `tini` en `ENTRYPOINT` : PID 1 transmet SIGTERM à node et récupère les processus zombies.
  Mesuré : `docker stop` se termine en moins d'une seconde avec le code de sortie 0, après les
  logs « Shutdown signal received » et « Shutdown complete ».
- `drizzle/` est copié dans `/app/drizzle`, le chemin que `dist/db/migrate.js` calcule
  (`../../drizzle`).

### frontend (`node:24.21.0-alpine3.24` puis `nginxinc/nginx-unprivileged:1.30.5-alpine3.24`)

- Étape `build` : `npm ci` puis `npm run build` produit `dist/`. Étape finale : nginx seul,
  version non-root (uid 101, port 8080) de l'image officielle.
- La configuration est un template (`nginx/default.conf.template`) : au démarrage, l'image
  remplace `${API_UPSTREAM}` (défaut `api:3000`) et `${NGINX_LOCAL_RESOLVERS}` (serveurs DNS du
  conteneur, activé par `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`).
- L'adresse de l'api est résolue **à chaque requête** (`resolver` + variable dans `proxy_pass`) :
  nginx démarre sans l'api (`/api/` répond alors 502), et suit un redémarrage de l'api qui change
  d'adresse IP, sans être redémarré lui-même.
- Fallback SPA (`try_files ... /index.html`), cache d'un an pour `/assets/` (noms avec hash),
  `no-cache` pour `index.html`, gzip, en-têtes de sécurité, `server_tokens off`, route `/health`
  servie par nginx.
