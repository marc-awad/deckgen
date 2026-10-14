# Déploiement Kubernetes

Ce dossier contient les manifestes Kubernetes de deckgen : un Deployment et un Service par
service, dans le namespace `deckgen`. Explications détaillées : [docs/kubernetes.md](../docs/kubernetes.md).

| Fichier             | Contenu                                                         |
|---------------------|-----------------------------------------------------------------|
| `00-namespace.yaml` | Namespace `deckgen` (préfixe `00-` : appliqué en premier)        |
| `postgres.yaml`     | Deployment (stratégie `Recreate`) et Service ClusterIP `postgres:5432` |
| `generator.yaml`    | Deployment et Service ClusterIP `generator:8000`                |
| `api.yaml`          | Deployment et Service ClusterIP `api:3000`                      |
| `frontend.yaml`     | Deployment et Service NodePort `30080`                          |

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
- les manifestes utilisent donc un tag précis (`0.1.0`) et `imagePullPolicy: IfNotPresent`

Construire les images, depuis la racine du dépôt :

```powershell
docker build -t deckgen-api:0.1.0 ./api
docker build -t deckgen-generator:0.1.0 ./generator
docker build -t deckgen-frontend:0.1.0 ./frontend
```

## Déployer

### 1. Namespace et Secret (une seule fois, avant le premier déploiement)

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

### 2. Appliquer les manifestes

```powershell
kubectl apply -f deploy/ --dry-run=server   # validation par le cluster, sans rien créer
kubectl apply -f deploy/
```

`kubectl apply` traite les fichiers par ordre alphabétique, d'où le préfixe `00-` du namespace.
Relancer la commande ne change rien si les fichiers n'ont pas changé (`unchanged`).

Au premier démarrage, l'api peut redémarrer une fois : elle démarre avant que PostgreSQL accepte
les connexions, s'arrête (code 1) et Kubernetes la relance.

## Vérifier

```powershell
kubectl get all -n deckgen                  # 4 pods Running, 4 Services, 4 Deployments
kubectl get endpointslices -n deckgen       # l'adresse du pod derrière chaque Service
kubectl logs -n deckgen deploy/api          # logs d'un service
```

Puis ouvrir **http://localhost:30080**.

## Supprimer

```powershell
kubectl delete namespace deckgen
```

Cette commande supprime toutes les ressources du namespace, Secret compris : il faudra le recréer
(étape 1) avant un nouveau déploiement. Les données de PostgreSQL sont perdues (stockage
provisoire `emptyDir`, remplacé par un PersistentVolumeClaim à l'issue 16).

## Test rapide du cluster

```powershell
kubectl run test-frontend --image=deckgen-frontend:0.1.0 --image-pull-policy=Never
kubectl get pods
kubectl port-forward pod/test-frontend 8081:8080
# http://localhost:8081/health doit répondre "ok"
kubectl delete pod test-frontend
```
