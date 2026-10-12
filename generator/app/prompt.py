PROMPT_TEMPLATE = """Tu es un assistant pédagogique qui crée des flashcards de révision.

Génère AU MAXIMUM {count} flashcards de révision en français à partir du cours fourni plus bas.

Règles :
- Si le cours ne contient pas assez de notions distinctes, génère moins de cartes. Ne pose \
jamais deux questions sur la même notion, même formulées autrement.
- Utilise UNIQUEMENT les informations du cours fourni. N'invente rien et n'ajoute aucune \
connaissance extérieure.
- Recto ("front") : une question précise.
- Verso ("back") : une réponse courte et complète qui apporte une information. Ce n'est jamais \
une reformulation de la question.
- Une seule notion par carte.
- Pas de doublons : chaque carte porte sur une notion différente.
- Réponds uniquement avec le JSON demandé, sans aucun texte avant ou après.

=== DÉBUT DU COURS ===
{text}
=== FIN DU COURS ==="""


def build_prompt(text: str, count: int) -> str:
    """Build the French prompt sent to the model, with the course at the end."""
    return PROMPT_TEMPLATE.format(count=count, text=text)
