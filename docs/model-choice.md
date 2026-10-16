# Choix du modèle LLM

## Contexte
Le service generator utilise Ollama pour générer des flashcards en local, sans coût ni envoi de données à l'extérieur.

## Machine de test
- GPU : NVIDIA RTX 1000 Ada (6 Go de VRAM)
- Ollama 0.40.3

## Méthode
Même extrait de cours (namespaces, cgroups, capabilities), même prompt, format JSON forcé, 5 cartes demandées.

## Résultats

| Modèle | Taille disque | Temps | JSON valide | Qualité |
|---|---|---|---|---|
| gemma3:4b | 3,4 Go | 14,7 s | Oui | Correcte, fidèle au cours, mais certaines réponses reformulent la question |
| gemma4:latest | 9,6 Go | 36,6 s (chargement inclus) | Oui | Très bonne, réponses précises avec exemples |

## Décision
- Modèle par défaut : `gemma3:4b`, léger et utilisable sans GPU
- Option qualité : `gemma4:latest`, via la variable `OLLAMA_MODEL`

## Points d'attention
- Un prompt non cadré fait inventer le modèle : le prompt impose de n'utiliser que le cours fourni
- Le contexte par défaut est de 4096 tokens : à augmenter ou découper le cours pour les textes longs
- Avec peu de notions dans le cours, gemma3:4b peut encore répéter une notion ou ajouter un détail absent du texte, malgré les consignes du prompt. Le modèle gemma4:latest réduit ce problème.

## Diagnostic de l'issue #27

### Constat
Avec un cours Java de 10 427 caractères et `count=10`, `POST /generate` renvoyait parfois une seule carte, avec un statut 200. Un autre essai avait produit 19 cartes.

### Méthode
Un script temporaire appelait directement l'API Ollama avec exactement le prompt, le JSON schema et les options du generator (gemma3:4b, température 0,3, `num_ctx` 8192). 4 configurations ont été comparées, 3 essais chacune car le modèle n'est pas déterministe. Pour chaque essai : nombre de cartes avant et après nettoyage, `done_reason`, tokens du prompt et de la réponse.

| Configuration | Cartes (3 essais) | `done_reason` |
|---|---|---|
| a. Prompt actuel, gemma3:4b + JSON schema | 10, 10, **1** | stop |
| b. Sans la consigne « génère moins de cartes » | **1**, 10, **1** | stop |
| c. Format `"json"` au lieu du JSON schema | 0, 0, 0 (`{}`) | stop |
| d. gemma4:latest | 10, 10, 10 (58 à 87 s) | stop |

- Prompt de 3 328 tokens sur 8 192 : le cours n'est pas tronqué.
- Le nettoyage ne retire aucune carte : le modèle produit lui-même une seule carte.
- Les réponses à une carte sont toutes écrites en JSON compact sur une ligne.

Durées mesurées pendant le diagnostic (cours Java, `count=10`, `num_ctx` 8192) :

| Configuration | Essai 1 | Essai 2 | Essai 3 |
|---|---|---|---|
| a. gemma3:4b, prompt actuel | 13,5 s (10 cartes) | 16,7 s (10 cartes) | 1,9 s (1 carte) |
| b. gemma3:4b, sans la consigne « génère moins de cartes » | 3,5 s (1 carte) | 16,8 s (10 cartes) | 2,0 s (1 carte) |
| d. gemma4:latest | 86,7 s (10 cartes, dont 24,6 s de chargement du modèle) | 63,5 s (10 cartes) | 58,4 s (10 cartes) |

Pour une comparaison juste, seuls les essais à 10 cartes sont comparables : 13,5 à 16,8 s pour gemma3:4b, contre 58,4 à 86,7 s pour gemma4:latest.

### Cause
Le JSON schema n'imposait ni minimum ni maximum de cartes. La grammaire d'Ollama autorisait donc à fermer le tableau `cards` dès la première carte, et gemma3:4b le faisait dans 3 essais sur 6 (configurations a et b). Sans maximum, il pouvait aussi dépasser `count` (19 cartes).

### Correction
- **Bornes dans le JSON schema**, construit pour chaque requête : `maxItems = count` et `minItems = min(count, max(1, ceil(caractères / 2000)))`, soit une carte minimum par tranche de 2 000 caractères. Ollama 0.40.3 applique bien ces contraintes : avec `minItems = maxItems = 6`, 6 cartes dans 4 essais sur 4 ; avec `maxItems = 2`, jamais plus de 2 cartes.
- **Prompt cohérent** : « entre {min} et {count} cartes, une par notion importante, peu de cartes si le cours contient peu de notions ». Une première version sans cette dernière consigne produisait 9 à 10 cartes répétitives sur un texte court.
- **`num_ctx` porté à 12 288** : 20 000 caractères font environ 6 200 tokens, et avec 8 192 il ne restait qu'environ 2 000 tokens pour la réponse. gemma3:4b reste à 100 % sur le GPU (3,9 Go utilisés sur 6 Go).
- **Observabilité** : un log INFO par appel (tokens, `done_reason`, durée, cartes brutes et nettoyées) et un warning si la réponse est coupée (`done_reason=length`).

### Effet mesuré

| Test | Avant | Après |
|---|---|---|
| Cours Java (10 427 car.), `count=10`, 6 essais | 1 carte dans 3 essais sur 6 | 10, 6, 10, 10, 8, 10 : minimum de 6 toujours respecté |
| Texte court (150 car.), `count=10`, 3 essais | | 2, 2, 2 : aucune notion répétée, rien d'inventé |
| 20 000 car., `count=30`, 1 essai | Risque de réponse coupée | `done_reason=stop`, 6 220 tokens de prompt, 100 % GPU |