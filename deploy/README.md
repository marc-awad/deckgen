# Déploiement Kubernetes

Ce dossier contient les manifestes Kubernetes de deckgen : un Deployment et un Service par
service, dans le namespace `deckgen`, et un HorizontalPodAutoscaler pour l'api. Explications
détaillées : [docs/kubernetes.md](../docs/kubernetes.md).

| Fichier                      | Contenu                                                         |
|------------------------------|-----------------------------------------------------------------|
| `00-namespace.yaml`          | Namespace `deckgen` (préfixe `00-` : appliqué en premier)        |
| `postgres.yaml`              | Deployment (1 pod, stratégie `Recreate`) et Service ClusterIP `postgres:5432` |
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

Ces commandes sont à **relancer après chaque `kubectl delete namespace deckgen`**, qui supprime
aussi le Secret. Pour remplacer le Secret dans un namespace existant :
`kubectl delete secret postgres-credentials -n deckgen`, puis la commande `kubectl create secret`
ci-dessus, puis `kubectl rollout restart deployment -n deckgen` pour que les pods relisent les
valeurs (avec `emptyDir`, la base est alors recréée avec le nouveau mot de passe).

### 2. Appliquer les manifestes

```powershell
kubectl apply -f deploy/ --dry-run=server   # validation par le cluster, sans rien créer
kubectl apply -f deploy/
```

`kubectl apply` traite les fichiers par ordre alphabétique, d'où le préfixe `00-` du namespace.
L'ordre de démarrage n'a pas d'importance : l'initContainer de l'api attend que PostgreSQL
accepte les connexions avant de lancer l'api. Relancer la commande ne change rien si les
fichiers n'ont pas changé (`unchanged`).

Le Deployment de l'api n'a pas de champ `replicas` : c'est le HPA qui fixe le nombre de pods. Au
premier déploiement, l'api démarre donc avec 1 pod, puis le HPA passe à 2 (le minimum) en moins
d'une minute.

## Vérifier

```powershell
kubectl get pods -n deckgen                 # tous Ready (1/1), RESTARTS 0
kubectl get hpa -n deckgen                  # CPU actuel / cible, nombre de pods de l'api
kubectl top pods -n deckgen                 # consommation réelle (metrics-server)
kubectl get endpointslices -n deckgen       # les pods derrière chaque Service
kubectl logs -n deckgen deploy/api -c api   # logs de l'api (un pod au hasard)
kubectl logs -n deckgen <pod-api> -c wait-for-postgres   # attente de PostgreSQL au démarrage
kubectl describe pod -n deckgen <pod>       # événements : probes en échec, redémarrages
kubectl get pods -n deckgen -o custom-columns=POD:.metadata.name,QOS:.status.qosClass
```

Puis ouvrir **http://localhost:30080**.

Si PostgreSQL a été recréé (pod supprimé, `Recreate` après une modification), sa base est vide
(stockage `emptyDir`) : relancer l'api pour réappliquer les migrations,
`kubectl rollout restart deployment api -n deckgen`. Ce sera inutile avec le volume persistant
de l'issue 16.

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

Cette commande supprime toutes les ressources du namespace, Secret compris : il faudra le recréer
(étape 1) avant un nouveau déploiement. Les données de PostgreSQL sont perdues. metrics-server,
dans `kube-system`, n'est pas concerné (`kubectl delete -f deploy/cluster/metrics-server.yaml`
pour le retirer).

## Test rapide du cluster

```powershell
kubectl run test-frontend --image=deckgen-frontend:0.1.0 --image-pull-policy=Never
kubectl get pods
kubectl port-forward pod/test-frontend 8081:8080
# http://localhost:8081/health doit répondre "ok"
kubectl delete pod test-frontend
```
