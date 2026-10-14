# Déploiement Kubernetes

Ce dossier contient les manifestes Kubernetes de deckgen : un Deployment et un Service par
service, dans le namespace `deckgen`, un HorizontalPodAutoscaler pour l'api, et le stockage
persistant de PostgreSQL. Explications détaillées : [docs/kubernetes.md](../docs/kubernetes.md).

| Fichier                      | Contenu                                                         |
|------------------------------|-----------------------------------------------------------------|
| `00-namespace.yaml`          | Namespace `deckgen` (préfixe `00-` : appliqué en premier)        |
| `postgres-storage.yaml`      | PersistentVolume `deckgen-postgres` (1 Gi, ressource du cluster, sans namespace) et PersistentVolumeClaim `postgres-data` |
| `postgres.yaml`              | Deployment (1 pod, stratégie `Recreate`, volume `postgres-data`) et Service ClusterIP `postgres:5432` |
| `generator.yaml`             | Deployment (2 pods) et Service ClusterIP `generator:8000`       |
| `api.yaml`                   | Deployment (2 à 5 pods), Service ClusterIP `api:3000` et HPA    |
| `frontend.yaml`              | Deployment (2 pods) et Service NodePort `30080`                 |
| `cluster/metrics-server.yaml`| metrics-server v0.9.0, composant du cluster (installé une fois) |

## Prérequis

- **Kubernetes de Docker Desktop**, mode kubeadm (1 node, Kubernetes v1.36.1) :
  Docker Desktop > Settings > Kubernetes > Enable Kubernetes > Kubeadm > Apply.
- **Ollama lancé sur Windows** avec le modèle `gemma3:4b` (`ollama pull gemma3:4b`). Le generator
  l'appelle sur `http://host.docker.internal:11434` : Ollama utilise ainsi directement le GPU.
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
`kubectl apply -f deploy/` ne lit pas (la commande n'est pas récursive).

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

## Déployer

Ordre d'installation sur un cluster neuf :

1. metrics-server (section précédente, une seule fois par cluster) ;
2. les images (section « Images locales ») ;
3. le namespace et le Secret (étape 1 ci-dessous) ;
4. `kubectl apply -f deploy/` (étape 2), qui crée aussi le PersistentVolume et sa claim.

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

```powershell
kubectl apply -f deploy/ --dry-run=server   # validation par le cluster, sans rien créer
kubectl apply -f deploy/
```

`kubectl apply` traite les fichiers par ordre alphabétique, d'où le préfixe `00-` du namespace.
`postgres-storage.yaml` passe avant `postgres.yaml` (`-` vient avant `.`) : la claim existe avant
le pod qui l'utilise. Un pod dont la claim n'est pas encore liée reste simplement `Pending`.
L'ordre de démarrage n'a pas d'importance : l'initContainer de l'api attend que PostgreSQL
accepte les connexions avant de lancer l'api. Relancer la commande ne change rien si les
fichiers n'ont pas changé (`unchanged`).

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
```

Puis ouvrir **http://localhost:30080**.

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

## Mettre à jour et revenir en arrière

Frontend, api et generator sont mis à jour par rolling update (un pod de plus à la fois, jamais
moins de pods prêts) ; détails et démonstration : [docs/rolling-update.md](../docs/rolling-update.md).

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
curl.exe http://localhost:30080/version.json               # version servie (0.2.0 et suivantes)
```

Après un `rollout undo`, le cluster ne correspond plus au fichier : le prochain
`kubectl apply -f deploy/` redéploierait la version retirée. Il faut remettre la bonne image dans
le manifeste (commit) avant tout nouvel `apply`.

## Supprimer

```powershell
kubectl delete namespace deckgen
```

Cette commande supprime toutes les ressources du namespace, Secret et PersistentVolumeClaim
compris, mais **pas les données** : le PersistentVolume n'appartient à aucun namespace, et sa
politique `Retain` le conserve, avec son dossier sur le node. Il passe à l'état `Released`.
metrics-server, dans `kube-system`, n'est pas concerné non plus
(`kubectl delete -f deploy/cluster/metrics-server.yaml` pour le retirer).

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
kubectl apply -f deploy/
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
