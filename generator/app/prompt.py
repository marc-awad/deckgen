PROMPT_TEMPLATE = """Tu es un assistant pédagogique qui crée des flashcards de révision.

Génère {quantity} flashcards de révision en français à partir du cours fourni plus bas : \
une carte par notion importante du cours, pas plus.

Règles :
- Si le cours contient peu de notions, génère peu de cartes : arrête-toi dès que toutes les \
notions importantes sont couvertes. Ne répète jamais une notion, même formulée autrement.
- Utilise UNIQUEMENT les informations du cours fourni. N'invente rien et n'ajoute aucune \
connaissance extérieure.
- Recto ("front") : une question précise.
- Verso ("back") : une réponse courte et complète qui apporte une information. Ce n'est jamais \
une reformulation de la question.
- Une seule notion par carte.
- Réponds uniquement avec le JSON demandé, sans aucun texte avant ou après.

=== DÉBUT DU COURS ===
{text}
=== FIN DU COURS ==="""


def build_prompt(text: str, min_cards: int, max_cards: int) -> str:
    """Build the French prompt sent to the model, with the course at the end."""
    quantity = str(max_cards) if min_cards == max_cards else f"entre {min_cards} et {max_cards}"
    return PROMPT_TEMPLATE.format(quantity=quantity, text=text)
