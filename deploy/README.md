# Déploiement Kubernetes

Ce dossier contient les manifestes Kubernetes de deckgen : un Deployment et un Service par
service, dans le namespace `deckgen`, un HorizontalPodAutoscaler pour l'api, le stockage
persistant de PostgreSQL et un Ingress (Traefik), seul point d'entrée de l'application :
**http://deckgen.local** (après modification du fichier hosts) ou **http://deckgen.localhost**.
Explications détaillées : [docs/kubernetes.md](../docs/kubernetes.md).

**Déploiement GitOps.** En fonctionnement normal, ce n'est plus `kubectl` qui déploie : Argo CD,
installé dans le cluster, applique le dossier `deploy/` de la branche `production`, que le
workflow de release écrit à chaque tag ([docs/cd.md](../docs/cd.md),
[docs/release.md](../docs/release.md)). Les commandes `kubectl apply -k deploy/` de ce fichier
servent à l'installation d'un cluster neuf et aux tests locaux, synchronisation suspendue
(section « Argo CD et commandes locales »).

| Fichier                      | Contenu                                                         |
|------------------------------|-----------------------------------------------------------------|
| `kustomization.yaml`         | Liste des manifestes de l'application, lue par `kubectl apply -k deploy/` et par Argo CD. Sur la branche `production`, elle reçoit en plus le bloc `images` (GHCR, version et digest) |
| `00-namespace.yaml`          | Namespace `deckgen`, protégé contre toute suppression par Argo CD (`Prune=false,Delete=false`) |
| `postgres-storage.yaml`      | PersistentVolume `deckgen-postgres` (1 Gi, ressource du cluster, sans namespace) et PersistentVolumeClaim `postgres-data`, protégés comme le namespace |
| `postgres.yaml`              | Deployment (1 pod, stratégie `Recreate`, volume `postgres-data`) et Service ClusterIP `postgres:5432` |
| `generator.yaml`             | ConfigMap `generator-config`, Deployment (2 pods) et Service ClusterIP `generator:8000` |
| `api.yaml`                   | ConfigMap `api-config`, Deployment (2 à 5 pods), Service ClusterIP `api:3000` et HPA |
| `frontend.yaml`              | ConfigMap `frontend-config`, Deployment (2 pods) et Service ClusterIP `frontend:8080` (cookie d'affinité pour Traefik) |
| `ingress.yaml`               | Middlewares Traefik (`api-strip-prefix`, `api-security-headers`) et Ingress `frontend` et `api` (`deckgen.local`, `deckgen.localhost`) |
| `postgres-credentials.yaml.example` | Modèle du Secret, valeurs factices, **jamais appliqué** (absent de `kustomization.yaml`) |
| `cluster/metrics-server.yaml`| metrics-server v0.9.0, composant du cluster (installé une fois) |
| `cluster/traefik-values.yaml`| Valeurs du chart Helm de Traefik (contrôleur Ingress, installé une fois) |
| `cluster/argocd-values.yaml` | Valeurs du chart Helm d'Argo CD (déploiement GitOps, installé une fois) |
| `cluster/argocd-application.yaml` | Application Argo CD `deckgen` : branche `production`, dossier `deploy`, namespace `deckgen` |

## Prérequis

- **Kubernetes de Docker Desktop**, mode kubeadm (1 node, Kubernetes v1.36.1) :
  Docker Desktop > Settings > Kubernetes > Enable Kubernetes > Kubeadm > Apply.
- **Ollama lancé sur Windows** avec le modèle `gemma3:4b` (`ollama pull gemma3:4b`). Le generator
  l'appelle sur `http://host.docker.internal:11434` : Ollama utilise ainsi directement le GPU.
- **Helm** (installation de Traefik et d'Argo CD) : `winget install --id Helm.Helm --exact`, puis ouvrir un
  nouveau terminal (le `PATH` est modifié). Vérification : `helm version` (v4.3.0 ici).
- **Port 80 libre** sur Windows (Traefik y est publié) :
  `Get-NetTCPConnection -LocalPort 80 -State Listen` ne doit rien afficher.
- Contexte kubectl sur le cluster local, à vérifier avant toute commande :

```powershell
kubectl config use-context docker-desktop
kubectl get nodes        # le node docker-desktop doit être Ready
```

## Images locales

En mode kubeadm, le cluster partage les images de Docker Desktop : une image construite avec
`docker build` est utilisable directement, sans registre ni commande de chargement.

Pour qu'une image locale soit utilisée, le pod ne doit pas chercher à la télécharger :

- avec le tag `latest`, la politique par défaut est `Always` : Kubernetes tente un téléchargement
  et échoue
- les manifestes utilisent donc un tag précis et `imagePullPolicy: IfNotPresent`

Construire les images, depuis la racine du dépôt :

```powershell
docker build -t deckgen-api:0.1.1 ./api
docker build -t deckgen-generator:0.1.0 ./generator
docker build --build-arg APP_VERSION=0.2.0 -t deckgen-frontend:0.2.0 ./frontend
```

`APP_VERSION` est la version affichée en pied de page et dans `/version.json`. Une image publiée
n'est jamais reconstruite avec le même tag : chaque modification reçoit un nouveau tag. C'est
pourquoi `deckgen-frontend:0.1.0`, construite avant l'ajout de la version, n'est pas reconstruite
(elle sert de version de départ pour la démonstration du rolling update).

## metrics-server (une seule fois par cluster)

metrics-server mesure la consommation CPU et mémoire des pods. Il est nécessaire au
HorizontalPodAutoscaler de l'api et à `kubectl top`. C'est un composant du cluster (namespace
`kube-system`), pas de l'application : il est dans `deploy/cluster/`, un sous-dossier que
`kubectl apply -k deploy/` ne lit pas (seuls les fichiers listés dans `kustomization.yaml` sont
appliqués).

```powershell
kubectl apply -f deploy/cluster/metrics-server.yaml
kubectl rollout status -n kube-system deployment/metrics-server
kubectl top nodes        # répond après environ une minute
```

Le fichier est le manifeste officiel de la v0.9.0, avec une seule option ajoutée,
`--kubelet-insecure-tls` : sur Docker Desktop, le certificat du kubelet est auto-signé et ne
contient pas l'adresse IP du node, metrics-server ne peut donc pas le vérifier (« x509: cannot
validate certificate for 192.168.65.3 because it doesn't contain any IP SANs »). Cette option est
réservée à un cluster local.

## Traefik, contrôleur Ingress (une seule fois par cluster)

L'Ingress de `deploy/ingress.yaml` ne fait rien seul : il faut un **contrôleur** qui lit les
Ingress et route le trafic. C'est Traefik, installé avec son chart Helm officiel dans le namespace
`traefik` (ingress-nginx, l'autre contrôleur courant, n'est plus maintenu depuis mars 2026).

```powershell
helm repo add traefik https://traefik.github.io/charts
helm repo update traefik
helm upgrade --install traefik traefik/traefik --version 41.7.1 `
  --namespace traefik --create-namespace -f deploy/cluster/traefik-values.yaml --wait
kubectl get pods -n traefik          # traefik-... Running, 1/1
kubectl get svc -n traefik           # LoadBalancer, EXTERNAL-IP localhost, port 80
kubectl get ingressclass             # traefik
```

- Chart **41.7.1**, Traefik **v3.7.14** (versions fixées dans la commande et dans les valeurs).
- `upgrade --install` sert aussi à modifier la configuration : relancer la même commande après
  avoir changé `traefik-values.yaml`. Attendre que l'ancien pod Traefik ait disparu
  (`kubectl get pods -n traefik`) avant de tester : pendant son arrêt, il peut encore servir des
  requêtes avec son ancienne configuration.
- Tableau de bord, non exposé : `kubectl port-forward -n traefik deployment/traefik 9000:8080`,
  puis http://localhost:9000/dashboard/.
- Retirer Traefik : `helm uninstall traefik -n traefik` (les CRD de Traefik restent installées).

## Argo CD (une seule fois par cluster)

Argo CD surveille la branche `production` du dépôt et applique son dossier `deploy/` au cluster.
Il est installé avec le chart Helm officiel dans le namespace `argocd` ; valeurs commentées dans
[cluster/argocd-values.yaml](cluster/argocd-values.yaml), explications dans
[docs/cd.md](../docs/cd.md).

```powershell
kubectl config current-context        # docker-desktop
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update argo
helm upgrade --install argocd argo/argo-cd --version 10.9.7 `
  --namespace argocd --create-namespace -f deploy/cluster/argocd-values.yaml --wait
kubectl get pods -n argocd            # 4 pods Running, argocd-redis-secret-init Completed
```

- Chart **10.9.7**, Argo CD **v3.5.4**, Redis **8.6.4-alpine** (versions fixées dans la commande et
  les valeurs). v3.5.4 est la première version qui corrige 4 failles critiques publiées le
  7 octobre 2026 : on n'installe pas une version plus ancienne.
- Désactivés : Dex (SSO) et les notifications ; ApplicationSet à 0 pod (non utilisé).
- Retirer Argo CD : supprimer d'abord l'Application (section « Supprimer »), puis
  `helm uninstall argocd -n argocd` (les CRD d'Argo CD restent installées, `crds.keep`).

### Interface

Par redirection de port, sans rien configurer :

```powershell
kubectl port-forward service/argocd-server -n argocd 8090:80
# http://localhost:8090
```

Par l'Ingress Traefik, comme l'application : **http://argocd.deckgen.localhost** fonctionne tout de
suite dans un navigateur ; **http://argocd.deckgen.local** après ajout au fichier hosts, en
PowerShell **administrateur** :

```powershell
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
if (-not (Select-String -Path $hosts -Pattern '^\s*127\.0\.0\.1\s+argocd\.deckgen\.local\s*$' -Quiet)) {
  Add-Content -Path $hosts -Value "`r`n127.0.0.1`targocd.deckgen.local" -Encoding ascii
}
ipconfig /flushdns
Resolve-DnsName argocd.deckgen.local -Type A        # 127.0.0.1
```

**HTTP et HTTPS.** Par défaut, le serveur d'Argo CD n'accepte que HTTPS (certificat auto-signé) et
redirige toute requête HTTP vers `https://`. Traefik n'a ici qu'une entrée HTTP (pas de TLS sur ce
cluster local) et parle HTTP aux services : la redirection renverrait le navigateur vers
`https://argocd.deckgen.local`, que personne ne sert. Réglage retenu :
`configs.params.server.insecure: true`, le serveur répond en HTTP, Traefik le relaie tel quel
(vérifié : 200 sur `/` et `ok` sur `/healthz`). Le mot de passe circule alors en clair, mais
seulement entre le navigateur et `127.0.0.1` : il ne quitte pas la machine. Sur un vrai cluster,
on terminerait TLS dans Traefik (certificat cert-manager) et on garderait ce réglage. La CLI
`argocd` passe par l'Ingress avec `--grpc-web --plaintext`.

### Mot de passe admin

À la première installation, Argo CD génère un mot de passe aléatoire pour le compte `admin`, dans
le Secret `argocd-initial-admin-secret`. Pour le récupérer **sans l'afficher** (copié dans le
presse-papiers) :

```powershell
$b64 = kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}'
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | Set-Clipboard
Remove-Variable b64
```

1. Se connecter à l'interface : utilisateur `admin`, coller le mot de passe.
2. Le changer : **User Info** (menu de gauche) > **Update Password**, mot de passe actuel puis le
   nouveau (à garder dans un gestionnaire de mots de passe).
3. Supprimer le Secret initial, qui ne sert plus (Argo CD stocke le hash du nouveau mot de passe
   dans `argocd-secret`) :

```powershell
kubectl delete secret argocd-initial-admin-secret -n argocd
```

Mot de passe perdu : retirer les clés `admin.password` et `admin.passwordMtime` de
`argocd-secret`, puis redémarrer le serveur ; un nouveau `argocd-initial-admin-secret` est
généré :

```powershell
kubectl patch secret argocd-secret -n argocd --type json -p '[{\"op\":\"remove\",\"path\":\"/data/admin.password\"},{\"op\":\"remove\",\"path\":\"/data/admin.passwordMtime\"}]'
kubectl rollout restart deployment/argocd-server -n argocd
```

### Application

```powershell
kubectl apply -f deploy/cluster/argocd-application.yaml
kubectl get applications -n argocd            # NAME deckgen, SYNC STATUS, HEALTH STATUS
```

Tant que la branche `production` n'existe pas (avant la première release), l'Application reste
en `Unknown`, avec la condition `ComparisonError: unable to resolve 'production' to a commit SHA`
(`kubectl describe application deckgen -n argocd`). Argo CD n'applique rien et ne supprime rien :
l'application déjà déployée continue de tourner. Dès que le workflow de release crée la branche,
Argo CD la lit au tour suivant (2 à 3 minutes) et synchronise.

## Déployer

Ordre d'installation complet sur un cluster neuf :

1. metrics-server (section précédente, une seule fois par cluster) ;
2. Traefik (section précédente) : **avant** l'application, car `ingress.yaml` contient des
   `Middleware`, des ressources définies par les CRD de Traefik. Sans elles, l'apply échoue
   (« no matches for kind "Middleware" ») ;
3. Argo CD (section précédente), puis le changement du mot de passe admin ;
4. le namespace et le Secret (étape 1 ci-dessous) : le Secret n'est pas dans Git, Argo CD ne le
   crée pas. Sans lui, les pods postgres et api restent en `CreateContainerConfigError` ;
5. l'Application (`kubectl apply -f deploy/cluster/argocd-application.yaml`) : Argo CD déploie la
   dernière release (branche `production`, images de GHCR). Les packages GHCR doivent être
   publics ([docs/release.md](../docs/release.md)) ;
6. le fichier hosts pour `deckgen.local` et `argocd.deckgen.local`.

Sans release (cluster de test, branche `production` absente), on peut déployer les images
locales à la main : images (section « Images locales »), étapes 1 et 2 ci-dessous, avec
`kubectl apply -k deploy/` à la place de l'étape 5.

### 1. Namespace et Secret (avant le premier déploiement)

Le mot de passe de PostgreSQL n'est écrit dans aucun fichier : le Secret est créé à la main,
avec un mot de passe aléatoire. Le Secret vit dans le namespace `deckgen`, qui doit donc exister
avant lui :

```powershell
kubectl apply -f deploy/00-namespace.yaml

# Mot de passe aléatoire (compatible Windows PowerShell 5.1 et PowerShell 7)
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''

kubectl create secret generic postgres-credentials --namespace deckgen `
  --from-literal=POSTGRES_USER=deckgen `
  --from-literal=POSTGRES_PASSWORD=$password `
  --from-literal=POSTGRES_DB=deckgen
Remove-Variable password, bytes
```

Pour fixer soi-même le mot de passe, remplacer `$password` par la valeur voulue
(`--from-literal=POSTGRES_PASSWORD=<mot-de-passe>`). Vérification sans afficher les valeurs :
`kubectl describe secret postgres-credentials -n deckgen`.

#### Modèle du Secret

`postgres-credentials.yaml.example` montre la forme du Secret (trois clés, valeurs factices). Il
n'est pas listé dans `kustomization.yaml` : ni `kubectl apply -k deploy/` ni Argo CD ne
l'appliquent (vérifié : aucun Secret dans le dry-run). Son extension `.example` l'exclut aussi
d'un `kubectl apply -f`. L'ajouter à la liste remplacerait le vrai mot de passe par `change-me`.

Pour créer le Secret à partir d'un fichier plutôt que de la commande ci-dessus :

```powershell
Copy-Item deploy\postgres-credentials.yaml.example postgres-credentials.local.yaml
# Remplacer les valeurs factices dans postgres-credentials.local.yaml, puis :
kubectl create -f postgres-credentials.local.yaml
Remove-Item postgres-credentials.local.yaml
```

- Le fichier est à la racine du dépôt, hors de `deploy/` : ni kustomize ni Argo CD ne le lisent.
  Le motif `*.local.yaml` du `.gitignore` l'exclut de Git.
- `kubectl create` et non `apply` : `apply` recopie tout le fichier, mot de passe compris **en
  clair**, dans l'annotation `kubectl.kubernetes.io/last-applied-configuration` du Secret
  (vérifié en dry-run). `create` n'ajoute aucune annotation.

#### Quand une base existe déjà : les mêmes identifiants

PostgreSQL ne lit `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_DB` qu'au **premier**
démarrage, quand son dossier de données est vide : il crée alors le compte et la base. Ensuite,
ces variables sont ignorées. Depuis que les données sont sur un volume persistant, la base
survit à la suppression du namespace, et donc du Secret.

Piège : recréer le Secret avec un **nouveau** mot de passe aléatoire. PostgreSQL garde l'ancien,
l'api envoie le nouveau, et sa connexion est refusée (« password authentication failed »).

Avant un `kubectl delete namespace deckgen`, garder les identifiants (dans un gestionnaire de mots
de passe, jamais dans Git) :

```powershell
function Read-SecretKey($key) {
  [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(
    (kubectl get secret postgres-credentials -n deckgen -o jsonpath="{.data.$key}")))
}
$password = Read-SecretKey 'POSTGRES_PASSWORD'
```

puis recréer le Secret avec cette valeur (`--from-literal=POSTGRES_PASSWORD=$password`) au lieu
d'un mot de passe aléatoire.

Si le mot de passe est perdu : les connexions locales au pod postgres n'en demandent pas (règle
`local ... trust` de l'image officielle). On redéfinit le mot de passe dans la base, puis on crée le
Secret avec la même valeur :

```powershell
kubectl exec -n deckgen deploy/postgres -- psql -U deckgen -d deckgen -c "ALTER USER deckgen PASSWORD '<nouveau-mot-de-passe>'"
```

Pour remplacer le Secret dans un namespace existant : `kubectl delete secret postgres-credentials
-n deckgen`, la commande `kubectl create secret` ci-dessus, puis
`kubectl rollout restart deployment -n deckgen` pour que les pods relisent les valeurs.

### 2. Appliquer les manifestes

En fonctionnement normal, c'est Argo CD qui fait cette étape. À la main (cluster de test, ou
synchronisation suspendue, voir « Argo CD et commandes locales ») :

```powershell
kubectl kustomize deploy/                   # les objets qui seront appliqués, sans rien envoyer
kubectl apply -k deploy/ --dry-run=server   # validation par le cluster, sans rien créer
kubectl apply -k deploy/
```

`-k` (Kustomize) applique les fichiers listés dans `kustomization.yaml`. `kubectl apply -f
deploy/` ne fonctionne plus : il essaierait d'appliquer `kustomization.yaml` lui-même comme une
ressource (« no matches for kind "Kustomization" »). Kustomize trie les objets par type : le
namespace d'abord, puis les ConfigMaps, les Services, le volume et sa claim, et seulement ensuite
les Deployments. La claim existe donc avant le pod qui l'utilise (un pod dont la claim n'est pas
encore liée resterait simplement `Pending`). L'ordre de démarrage n'a pas d'importance :
l'initContainer de l'api attend que PostgreSQL accepte les connexions avant de lancer l'api.
Relancer la commande ne change rien si les fichiers n'ont pas changé (`unchanged`). Vérifié :
la sortie de `kubectl kustomize deploy/` est identique, objet par objet, aux 7 fichiers (19
objets).

Le Deployment de l'api n'a pas de champ `replicas` : c'est le HPA qui fixe le nombre de pods. Au
premier déploiement, l'api démarre donc avec 1 pod, puis le HPA passe à 2 (le minimum) en moins
d'une minute.

## Vérifier

```powershell
kubectl get pods -n deckgen                 # tous Ready (1/1), RESTARTS 0
kubectl get pv,pvc -n deckgen               # PVC postgres-data Bound sur le PV deckgen-postgres
kubectl get hpa -n deckgen                  # CPU actuel / cible, nombre de pods de l'api
kubectl top pods -n deckgen                 # consommation réelle (metrics-server)
kubectl get endpointslices -n deckgen       # les pods derrière chaque Service
kubectl logs -n deckgen deploy/api -c api   # logs de l'api (un pod au hasard)
kubectl logs -n deckgen <pod-api> -c wait-for-postgres   # attente de PostgreSQL au démarrage
kubectl describe pod -n deckgen <pod>       # événements : probes en échec, redémarrages
kubectl get pods -n deckgen -o custom-columns=POD:.metadata.name,QOS:.status.qosClass
kubectl get configmap -n deckgen            # api-config, frontend-config, generator-config
kubectl describe pod -n deckgen <pod>       # "Environment Variables from" : références, pas de valeurs
kubectl get pods -n traefik                 # contrôleur Ingress Running
kubectl get ingressclass                    # traefik
kubectl get ingress,middleware -n deckgen   # Ingress api et frontend, ADDRESS localhost
kubectl get pods -n argocd                  # Argo CD : 4 pods Running
kubectl get applications -n argocd          # deckgen : Synced, Healthy (après la première release)
kubectl describe application deckgen -n argocd   # révision déployée, conditions, dernière synchro
```

Avec curl.exe, sans fichier hosts (curl résout `*.localhost` lui-même) :

```powershell
curl.exe http://deckgen.localhost/api/health                       # {"status":"ok"}
curl.exe http://deckgen.localhost/api/route-inconnue               # 404 de l'api : préfixe /api retiré
curl.exe -I http://deckgen.localhost/                              # en-têtes de sécurité, cookie deckgen_frontend
curl.exe --resolve deckgen.local:80:127.0.0.1 http://deckgen.local/api/health   # simule le fichier hosts
```

## Accéder à l'application

| URL                         | Fonctionne                                                       |
|-----------------------------|------------------------------------------------------------------|
| http://deckgen.local        | après l'ajout de la ligne au fichier hosts (ci-dessous)          |
| http://deckgen.localhost    | tout de suite dans un navigateur et avec curl.exe : ils envoient eux-mêmes `*.localhost` vers 127.0.0.1. Pas avec `Invoke-RestMethod`, Windows ne résolvant pas ce nom |

L'ancien accès par le NodePort (http://localhost:30080) n'existe plus : le Service frontend est en
ClusterIP, et l'Ingress est le seul point d'entrée.

### Fichier hosts (PowerShell en administrateur)

Clic droit sur PowerShell > « Exécuter en tant qu'administrateur », puis :

```powershell
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
if (-not (Select-String -Path $hosts -Pattern '^\s*127\.0\.0\.1\s+deckgen\.local\s*$' -Quiet)) {
  Add-Content -Path $hosts -Value "`r`n127.0.0.1`tdeckgen.local" -Encoding ascii
}
ipconfig /flushdns
Resolve-DnsName deckgen.local -Type A        # 127.0.0.1, lu dans le fichier hosts
```

Le test `Select-String` évite d'ajouter la ligne deux fois si la commande est relancée. Pour la
retirer plus tard : supprimer la ligne `127.0.0.1 deckgen.local` du fichier (Bloc-notes lancé en
administrateur), puis `ipconfig /flushdns`.

`.local` est réservé au **mDNS** (RFC 6762, découverte d'appareils sur le réseau local, comme
Bonjour ou Avahi). Sur certains systèmes (macOS, Linux avec Avahi), un nom en `.local` est d'abord
cherché par mDNS, ce qui peut ajouter plusieurs secondes avant de lire le fichier hosts. Deux
alternatives sans ce défaut : `.localhost` (RFC 6761, toujours la machine locale, résolu par les
navigateurs sans configuration) et `.test` (RFC 6761, réservé aux tests, jamais utilisé sur
Internet, mais à déclarer dans le fichier hosts comme `.local`). Le nom `deckgen.local` est gardé
car demandé, `deckgen.localhost` est déclaré en secours dans le même Ingress.

Les données de PostgreSQL sont sur le node, dans `/var/lib/deckgen/postgres` (le seul dossier du
node Docker Desktop qui survit à un redémarrage). Pour les voir :

```powershell
kubectl debug node/docker-desktop -n default --image=postgres:18.6-alpine3.24 --profile=general -- ls -l /host/var/lib/deckgen/postgres/18/docker
kubectl logs -n default <pod node-debugger-...>
kubectl delete pod -n default <pod node-debugger-...>
```

Ce dossier est lui-même dans le disque virtuel de Docker Desktop,
`%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`. Il survit aux redémarrages du PC et de
Docker Desktop (vérifié). En revanche :

- « Reset Kubernetes Cluster » ou la désactivation de Kubernetes recréent le cluster : le
  PersistentVolume n'existe plus, et Docker Desktop nettoie les données de Kubernetes. Le dossier
  n'est pas garanti : il faut le considérer comme perdu (non testé, pour ne pas détruire le
  cluster) ;
- « Clean / Purge data », « Reset to factory defaults » ou la désinstallation de Docker Desktop
  suppriment `docker_data.vhdx`, donc les données à coup sûr.

Une vraie sauvegarde passe par `pg_dump` (copie logique de la base, hors du cluster).

## Configuration

La configuration non sensible est dans un ConfigMap par service, en tête du fichier du service.
Chaque clé devient une variable d'environnement du conteneur (`envFrom`). Le mot de passe n'est
dans aucun ConfigMap : il est dans le Secret `postgres-credentials`.

| ConfigMap          | Clé                                         | Valeur                                  |
|--------------------|---------------------------------------------|-----------------------------------------|
| `generator-config` | `OLLAMA_URL`                                | `http://host.docker.internal:11434`     |
|                    | `OLLAMA_MODEL`                              | `gemma3:4b`                             |
|                    | `OLLAMA_TIMEOUT`                            | `120` (secondes, par appel à Ollama)    |
|                    | `OLLAMA_NUM_CTX`                            | `12288` (tokens)                        |
| `api-config`       | `DB_HOST`                                   | `postgres`                              |
|                    | `DB_PORT`                                   | `5432`                                  |
|                    | `GENERATOR_URL`                             | `http://generator:8000`                 |
|                    | `GENERATOR_TIMEOUT_MS`                      | `300000`                                |
|                    | `LOG_LEVEL`                                 | `info`                                  |
| `frontend-config`  | `API_UPSTREAM`                              | `api.deckgen.svc.cluster.local:3000`    |
|                    | `NGINX_ENTRYPOINT_WORKER_PROCESSES_AUTOTUNE`| `1`                                     |

`api-config` sert aussi à l'initContainer `wait-for-postgres` (`DB_HOST`, `DB_PORT`).

| Secret                 | Clés                                          | Lu par          |
|------------------------|-----------------------------------------------|-----------------|
| `postgres-credentials` | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | postgres, api |

### Changer une configuration

Les variables d'environnement sont lues **au démarrage** du conteneur : modifier un ConfigMap ne
change rien aux pods en cours. Il faut les recréer.

En production, une modification de configuration suit le chemin du code : commit sur une
branche, PR vers `develop`, puis vers `main`, et une nouvelle release ([docs/release.md](../docs/release.md)).
Argo CD applique le ConfigMap ; les pods doivent ensuite être recréés
(`kubectl rollout restart`, qui ne modifie que l'annotation du template et n'est pas annulé par
Argo CD). Pour un essai rapide, synchronisation suspendue (section suivante) :

```powershell
# 1. Modifier la valeur dans le fichier (ex. OLLAMA_MODEL dans deploy/generator.yaml), puis :
kubectl apply -f deploy/generator.yaml        # configmap configured, deployment unchanged
# 2. Recréer les pods (rolling update, sans interruption) pour qu'ils lisent la nouvelle valeur
kubectl rollout restart deployment/generator -n deckgen
kubectl rollout status deployment/generator -n deckgen
# 3. Vérifier
kubectl exec -n deckgen deploy/generator -- printenv OLLAMA_MODEL
```

Pour le Secret, même principe : le recréer (voir étape 1, avec les mêmes identifiants si une base
existe), puis `kubectl rollout restart deployment/api deployment/postgres -n deckgen`.

## Argo CD et commandes locales

L'Application a `selfHeal` : Argo CD compare en permanence le cluster à la branche `production`,
et remet en place toute différence quelques secondes après l'avoir détectée. Conséquences :

- `kubectl apply -k deploy/` depuis `develop` (images locales `deckgen-api:0.1.1`...) est
  **annulé** : Argo CD remet les images de GHCR et la configuration de `production` ;
- de même pour `kubectl edit`, `kubectl scale` (sauf le nombre de pods de l'api, laissé au HPA),
  `kubectl set image` et `kubectl rollout undo` ;
- les objets créés hors de Git (le Secret `postgres-credentials`) ne sont pas concernés.

Pour tester en local sans conflit :

1. **docker compose** (le plus simple) : l'application complète hors du cluster
   ([README racine](../README.md)), aucun lien avec Argo CD ;
2. **suspendre la synchronisation automatique**, tester, puis la rétablir :

```powershell
kubectl config current-context        # docker-desktop
kubectl patch application deckgen -n argocd --type merge -p '{\"spec\":{\"syncPolicy\":{\"automated\":null}}}'
kubectl apply -k deploy/              # n'est plus annulé ; Argo CD affiche OutOfSync
# ... tests ...
kubectl apply -f deploy/cluster/argocd-application.yaml   # rétablit prune et selfHeal
# Argo CD remet aussitôt la branche production en place (images GHCR)
```

Vérifié : après le `patch`, `spec.syncPolicy.automated` est vide ; après le nouvel `apply` du
fichier, il revient à `{"prune":true,"selfHeal":true}`. Pendant la suspension, l'interface montre
les différences (bouton **App Diff**).

**Piège : l'api repasse à 1 pod.** Argo CD (option `RespectIgnoreDifferences`) a écrit
`replicas: 2` dans l'annotation `last-applied-configuration` de l'api, alors que le manifeste n'a
pas ce champ. Pour kubectl, le champ a donc été retiré du fichier : `kubectl apply -k deploy/` le
remet à sa valeur par défaut, 1 pod, jusqu'à ce que le HPA remonte à 2 (en moins d'une minute).
Pour l'éviter, aligner d'abord l'annotation sur les fichiers, sans modifier les objets :

```powershell
kubectl kustomize deploy/ | kubectl apply set-last-applied -f - --dry-run=server -o name   # contrôle
kubectl kustomize deploy/ | kubectl apply set-last-applied -f -
kubectl apply -k deploy/              # l'api garde son nombre de pods
```

`kubectl apply edit-last-applied deployment/api -n deckgen` fait la même chose à la main (supprimer
la ligne `replicas` dans l'éditeur qui s'ouvre), mais n'a pas d'option `--dry-run`. Vérifié : en
dry-run serveur sur le cluster, `set-last-applied` retire `replicas` de l'annotation de l'api sans
toucher à son nombre de pods ; dans un namespace de test reproduisant cette annotation, un
`kubectl apply` sans le champ passe de 2 pods à 1, et reste à 2 après `set-last-applied` ;

3. **un autre namespace** : déconseillé ici. Les manifestes fixent le namespace `deckgen`, le
   PersistentVolume `deckgen-postgres` (ressource du cluster) ne peut être lié qu'à une seule
   claim, et les deux Ingress revendiquent déjà `deckgen.local`. Il faudrait un overlay Kustomize
   qui change le namespace, le volume et les noms d'hôte.

## Mettre à jour et revenir en arrière

Frontend, api et generator sont mis à jour par rolling update (un pod de plus à la fois, jamais
moins de pods prêts) ; détails et démonstration : [docs/rolling-update.md](../docs/rolling-update.md).

**Avec Argo CD**, une mise à jour est une release (tag Git), et le retour arrière un `git revert`
sur la branche `production` : [docs/release.md](../docs/release.md). Les commandes ci-dessous
restent utiles pour **observer** un déploiement (`rollout status`, `rollout history`) ; celles qui
modifient le cluster (`apply`, `rollout undo`) ne servent plus qu'avec la synchronisation
suspendue, sinon Argo CD les annule.

```powershell
# Modifier l'image (et kubernetes.io/change-cause) dans le manifeste, puis :
kubectl apply -f deploy/frontend.yaml
kubectl rollout status deployment/frontend -n deckgen      # suit le remplacement des pods

kubectl rollout history deployment/frontend -n deckgen     # révisions et change-cause
kubectl rollout history deployment/frontend -n deckgen --revision=<n>   # détail d'une révision

kubectl rollout undo deployment/frontend -n deckgen        # retour à la révision précédente
kubectl rollout undo deployment/frontend -n deckgen --to-revision=<n>
kubectl rollout status deployment/frontend -n deckgen

kubectl diff -f deploy/frontend.yaml                       # écart entre le fichier et le cluster
curl.exe http://deckgen.localhost/version.json             # version servie (0.2.0 et suivantes)
```

Après un `rollout undo`, le cluster ne correspond plus au fichier : le prochain
`kubectl apply -k deploy/` redéploierait la version retirée. Il faut remettre la bonne image dans
le manifeste (commit) avant tout nouvel `apply`.

## Supprimer

**D'abord l'Application**, sinon Argo CD recrée aussitôt ce qui est supprimé (`selfHeal`).
L'Application n'a pas de finalizer : la supprimer laisse l'application en place, elle n'est
simplement plus gérée.

```powershell
kubectl config current-context        # docker-desktop
kubectl delete application deckgen -n argocd
kubectl delete namespace deckgen
```

`kubectl delete namespace` supprime toutes les ressources du namespace, Secret et
PersistentVolumeClaim compris, mais **pas les données** : le PersistentVolume n'appartient à aucun
namespace, et sa politique `Retain` le conserve, avec son dossier sur le node. Il passe à l'état
`Released`. metrics-server (`kube-system`), Traefik (`traefik`) et Argo CD (`argocd`) ne sont pas
concernés non plus (`kubectl delete -f deploy/cluster/metrics-server.yaml`,
`helm uninstall traefik -n traefik` et `helm uninstall argocd -n argocd` pour les retirer).

Argo CD, lui, ne supprime jamais le namespace, le PersistentVolume ni sa claim : ils portent
l'annotation `argocd.argoproj.io/sync-options: Prune=false,Delete=false`, même s'ils
disparaissaient de Git ([docs/cd.md](../docs/cd.md#self-heal-et-prune)).

### Redéployer sur les données existantes (PV `Released`)

Un PV `Released` garde dans `spec.claimRef` l'identifiant (uid) de l'ancienne claim. La nouvelle
claim porte le même nom mais un autre uid : Kubernetes refuse de la lier (« volume
"deckgen-postgres" already bound to a different claim »), pour ne pas donner les données d'une
claim à une autre. Elle reste `Pending`, et le pod postgres aussi. Il faut libérer le PV
explicitement :

```powershell
kubectl get pv deckgen-postgres             # STATUS Released
# 1. Recréer le namespace et le Secret avec les MÊMES identifiants (voir étape 1)
# 2. Libérer le PV : il passe à Available, puis se lie à la nouvelle claim
kubectl patch pv deckgen-postgres --type json -p '[{\"op\":\"remove\",\"path\":\"/spec/claimRef\"}]'
# 3. Déployer (ou rien à faire si c'était déjà fait : le pod postgres démarre dès la liaison)
kubectl apply -f deploy/cluster/argocd-application.yaml   # ou, sans Argo CD : kubectl apply -k deploy/
kubectl get pv,pvc -n deckgen               # Bound
```

Les guillemets échappés (`\"`) sont nécessaires avec Windows PowerShell 5.1.

### Tout supprimer, données comprises

```powershell
kubectl delete namespace deckgen
kubectl delete pv deckgen-postgres
# Le dossier reste sur le node (Retain) : l'effacer
kubectl debug node/docker-desktop -n default --image=postgres:18.6-alpine3.24 --profile=general -- rm -rf /host/var/lib/deckgen/postgres
kubectl delete pod -n default <pod node-debugger-...>
```

## Test rapide du cluster

```powershell
kubectl run test-frontend --image=deckgen-frontend:0.1.0 --image-pull-policy=Never
kubectl get pods
kubectl port-forward pod/test-frontend 8081:8080
# http://localhost:8081/health doit répondre "ok"
kubectl delete pod test-frontend
```
