# Processus de release

Une release publie les trois images sur GHCR et les déploie sur le cluster : on pose un tag
`vX.Y.Z` sur `main`, le workflow [release.yml](../.github/workflows/release.yml) fait le reste, et
Argo CD applique la nouvelle version. Fonctionnement détaillé : [cd.md](cd.md).

## Versionnement sémantique

Format `MAJEUR.MINEUR.CORRECTIF` ([semver.org](https://semver.org/lang/fr/)), précédé de `v` dans
le tag Git (`v1.4.2`), sans le `v` dans les tags d'image (`1.4.2`).

| On incrémente | Quand | Exemples pour deckgen | Remise à zéro |
|---------------|-------|------------------------|---------------|
| **MAJEUR** | Changement incompatible : un client ou un déploiement existant doit s'adapter | Route de l'api supprimée ou renommée, format de l'export Anki changé, migration de base sans retour possible, variable de configuration obligatoire ajoutée | MINEUR et CORRECTIF à 0 : `1.4.2` → `2.0.0` |
| **MINEUR** | Nouvelle fonctionnalité, compatible avec l'existant | Nouvelle route, nouveau format d'export en plus de l'ancien, nouvelle page du frontend | CORRECTIF à 0 : `1.4.2` → `1.5.0` |
| **CORRECTIF** | Correction de bug, sans changement de comportement attendu | Bug du generator corrigé, dépendance mise à jour pour une faille | `1.4.2` → `1.4.3` |

Une **pré-version** ajoute un suffixe après un tiret : `1.0.0-rc.1` (release candidate),
`1.0.0-beta.2`. Elle **précède** la version finale (`1.0.0-rc.1` < `1.0.0-rc.2` < `1.0.0`) et
signale une version à valider, pas encore stable. Pour deckgen :

- le workflow l'accepte et la déploie comme une version finale (un seul cluster) ;
- son image n'a que les tags `1.0.0-rc.1` et `sha-…` : le tag `1.0` reste réservé aux versions
  finales ;
- une fois validée, on publie la version finale (`v1.0.0`) sur le même commit ou un suivant.

Pas de métadonnées de build (`v1.0.0+build.5`) : le `+` est interdit dans un tag Docker, et le
job `verify` refuse un tel tag.

## Réglages GitHub (une fois)

### Méthode de fusion de develop vers main

**Pas de squash, pas de rebase de `develop` vers `main` : uniquement un merge commit.**

Un squash (ou un rebase) crée sur `main` des commits **nouveaux**, avec d'autres SHA que ceux de
`develop`. Les deux branches divergent alors :

- les commits de `develop` ne sont pas ancêtres de `main` : la PR suivante de `develop` vers `main`
  les propose de nouveau, avec des conflits sur les fichiers déjà fusionnés ;
- un tag posé sur `main` désigne un commit qui n'existe pas dans `develop`, et l'historique ne
  permet plus de savoir quels commits de `develop` sont en production.

Un **merge commit** garde tous les commits de `develop` tels quels (mêmes SHA) et ajoute un commit
de fusion : `develop` est entièrement contenu dans `main`, la PR suivante ne montre que les
nouveaux commits. Le squash reste adapté aux PR de `feature/…` vers `develop` (un commit propre
par fonctionnalité), d'où les règles différentes sur les deux branches.

Réglage, dans **Settings > Rules > Rulesets > protect-main** :

1. section **Require a pull request before merging** > **Allowed merge methods** ;
2. ne garder que **Merge** (décocher **Squash** et **Rebase**) ;
3. **Save changes**.

Aujourd'hui, `protect-main` autorise les trois méthodes (`allowed_merge_methods: merge, squash,
rebase`, lu par l'API) : ce réglage est à faire avant la première release. Le bouton de fusion de
la PR ne proposera plus que « Create a merge commit ».

### Bonus : ruleset des tags de version

Empêche de déplacer ou de supprimer un tag publié (le tag est l'identité d'une release, et le
déclencheur du déploiement). **Settings > Rules > Rulesets > New ruleset > New tag ruleset** :

| Réglage | Valeur |
|---------|--------|
| Ruleset name | `protect-version-tags` |
| Enforcement status | **Active** |
| Bypass list | vide (ou **Repository admin**, pour pouvoir corriger une erreur) |
| Target tags > **Add target** > **Include by pattern** | `v*` |
| Rules | cocher **Restrict updates** et **Restrict deletions** ; laisser **Restrict creations** décoché (créer un tag doit rester possible) |

**Create**. Vérification : `git push origin :refs/tags/v1.0.0-rc.1` (suppression) est refusé.

### Bonus : ruleset de la branche production

Empêche de supprimer la branche ou de réécrire son historique (c'est l'historique des
déploiements). **Settings > Rules > Rulesets > New ruleset > New branch ruleset** :

| Réglage | Valeur |
|---------|--------|
| Ruleset name | `protect-production` |
| Enforcement status | **Active** |
| Bypass list | vide |
| Target branches > **Add target** > **Include by pattern** | `production` |
| Rules | cocher **Restrict deletions** et **Block force pushes** ; **ne pas** cocher **Require a pull request before merging** ni **Restrict updates** : le job de déploiement fait un push normal, avec le `GITHUB_TOKEN`, qui serait refusé |

Le ruleset peut être créé avant la branche : il s'appliquera dès sa création par le workflow. Un
`git revert` suivi d'un `git push` normal (retour arrière) reste autorisé.

### Optionnel : validation manuelle avant déploiement

Le job de déploiement utilise l'environnement GitHub `production`, créé automatiquement à la
première exécution. **Settings > Environments > production > Required reviewers** ajoute une
validation manuelle : le job attend un clic sur **Review deployments > Approve** avant d'écrire
la branche.

## Étapes d'une release

Exemple pour `v1.0.0`, en PowerShell, depuis la racine du dépôt. Remplacer la version partout.

### 1. PR de develop vers main

```powershell
git switch develop
git pull --ff-only origin develop
gh pr create --base main --head develop --title "Release v1.0.0" --body "Release v1.0.0"
gh pr checks --watch                     # attend les 9 status checks de la CI
gh pr merge --merge                      # merge commit (seule méthode autorisée)
```

### 2. Mettre à jour main en local

```powershell
git switch main
git pull --ff-only origin main
git log --oneline -3                     # le commit de fusion de la PR est en tête
```

### 3. Tag annoté et push du tag

```powershell
git tag -a v1.0.0 -m "deckgen v1.0.0"
git show v1.0.0 --stat                   # tag annoté : auteur, date, message, puis le commit
git push origin v1.0.0
```

Tag **annoté** (`-a`) et non léger : il enregistre qui a fait la release, quand et pourquoi.

### 4. Suivre le workflow

```powershell
$run = gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $run --exit-status          # verify, publish ×3, scan ×3, déploiement, summary
gh run view $run --web                   # résumé : version, images, digests, commit de déploiement
```

### 5. Vérifier le déploiement

```powershell
kubectl config current-context           # docker-desktop
kubectl get applications -n argocd       # deckgen  Synced  Healthy (au plus 3 min après le push)
kubectl get pods -n deckgen              # nouveaux pods, tous Ready
kubectl get deploy -n deckgen -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image
curl.exe http://deckgen.localhost/version.json   # {"version":"1.0.0"}
```

Dans l'interface d'Argo CD (http://argocd.deckgen.localhost), l'application `deckgen` affiche la
révision de `production` déployée (le commit `deploy: v1.0.0`). Le pied de page de
http://deckgen.local affiche `deckgen v1.0.0`.

## Après la première publication : packages publics

Les images publiées par le workflow sont des **packages** GHCR liés au dépôt. Un package créé par
un compte personnel est en général **privé** à sa création : le cluster ne pourrait pas le
télécharger sans `imagePullSecret` (pods en `ImagePullBackOff`, erreur 401 ou 403). Pour chacun
des trois packages (`deckgen-api`, `deckgen-frontend`, `deckgen-generator`) :

1. https://github.com/marc-awad?tab=packages (profil > onglet **Packages**) ;
2. cliquer sur le package, puis **Package settings** (colonne de droite, en bas) ;
3. **Danger Zone** > **Change visibility** > **Public**, taper le nom du package pour confirmer,
   **I understand the consequences, change package visibility**.

Le changement est définitif pour ce package (un package public ne peut plus redevenir privé).
Vérification, sans être connecté : `docker logout ghcr.io`, puis
`docker manifest inspect ghcr.io/marc-awad/deckgen-api:1.0.0` doit répondre.

À faire **dès la fin des jobs `publish`** de la première release (pendant `scan`) : Argo CD
appliquera la nouvelle version quelques minutes plus tard. Si c'est fait trop tard, les nouveaux
pods restent en `ImagePullBackOff`, mais les anciens continuent de servir (`maxUnavailable: 0`) ;
le kubelet réessaie de lui-même (attente croissante, jusqu'à 5 minutes), ou plus vite en
supprimant les pods bloqués (`kubectl delete pod -n deckgen <pod>`).

## Retour arrière

En GitOps, le cluster est l'image de la branche `production` : revenir en arrière, c'est remettre
une version précédente **dans Git**. Deux méthodes :

### 1. git revert sur production (la plus directe)

```powershell
git fetch origin production
git switch production                    # crée la branche locale qui suit origin/production
git log --oneline -5                     # deploy: v1.0.1, deploy: v1.0.0...
git revert --no-edit HEAD                # nouveau commit qui remet les digests de v1.0.0
git push origin production
git switch develop
```

Le revert est un **nouveau** commit : l'historique avance, pas de force push (interdit par le
ruleset). Argo CD l'applique au tour suivant (ou tout de suite avec **Refresh**), par rolling
update. Ce push est fait par vous, pas par le `GITHUB_TOKEN`, mais il ne déclenche pas non plus la
CI (`ci.yml` ne surveille pas `production`).

### 2. Relancer le déploiement d'un ancien tag

**Actions** > workflow **Release** > l'exécution du tag voulu (par exemple `v1.0.0`) > dans la
liste des jobs, survoler **Déploiement sur Kubernetes** et cliquer sur son icône de relance
(**Re-run this job**). Seul ce job est relancé (puis `summary`, qui en dépend) : il réécrit
`production` avec le `deploy/` et les digests de ce tag (artefacts de l'exécution, gardés
90 jours), dans un nouveau commit `deploy: v1.0.0`.

Ne pas utiliser **Re-run all jobs** : `publish` reconstruirait les images et republierait les
tags `1.0.0`… avec de **nouveaux** digests (un build n'est pas identique à l'octet près).

### Pourquoi plus de kubectl rollout undo

`kubectl rollout undo` modifie le Deployment dans le cluster seulement. Avec `selfHeal`, Argo CD
voit la différence avec la branche `production` et la remet en place en quelques secondes :
l'undo est annulé. Et même sans Argo CD, il laissait Git décrire une autre version que celle qui
tourne ([rolling-update.md](rolling-update.md#dérive-entre-git-et-le-cluster-après-un-rollback)).
Le retour arrière doit donc passer par Git, qui garde la trace de qui a fait quoi et quand.

Après un retour arrière, la correction suit le chemin normal : correctif sur une branche
`feature/…`, PR vers `develop`, puis une nouvelle release CORRECTIF (`v1.0.2`).
