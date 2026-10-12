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