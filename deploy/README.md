# Déploiement Kubernetes

Ce dossier contient les manifestes Kubernetes de deckgen.

## Cluster local

- Outil : Kubernetes intégré à Docker Desktop, mode kubeadm (1 node, Kubernetes v1.36.1)
- Activation : Docker Desktop > Settings > Kubernetes > Enable Kubernetes > Kubeadm > Apply

Vérification (PowerShell) :

```powershell
kubectl config use-context docker-desktop
kubectl get nodes
```

Le node `docker-desktop` doit être `Ready`.

## Images locales

En mode kubeadm, le cluster partage les images de Docker Desktop : une image construite avec `docker build` est utilisable directement, sans registre ni commande de chargement.

Pour qu'une image locale soit utilisée, le pod ne doit pas chercher à la télécharger :

- avec le tag `latest`, la politique par défaut est `Always` : Kubernetes tente un téléchargement et échoue
- les manifestes utilisent donc un tag précis et `imagePullPolicy: IfNotPresent`

## Test rapide du cluster

```powershell
kubectl run test-frontend --image=deckgen-frontend:dev --image-pull-policy=Never
kubectl get pods
kubectl port-forward pod/test-frontend 8081:8080
# http://localhost:8081/health doit répondre "ok"
kubectl delete pod test-frontend
```