import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { asApiError, deleteDeck, errorText, exportUrl, getDeck } from "../api/client";
import type { Card, DeckWithCards } from "../api/types";
import { CardList } from "../components/CardList";
import { LoadStatus } from "../components/LoadStatus";
import { PageTitle } from "../components/PageTitle";
import { cardCountLabel, formatDate } from "../format";
import { useLoad } from "../hooks/useLoad";
import { dangerButton, primaryButton, secondaryButton } from "../styles";

interface Message {
  text: string;
  isError: boolean;
}

// Sentence of the delete confirmation, so the user knows what will be lost
function cardsLostSentence(count: number): string {
  if (count === 0) return "Il ne contient aucune carte.";
  if (count === 1) return "Sa carte sera aussi supprimée.";
  return `Ses ${count} cartes seront aussi supprimées.`;
}

export function DeckPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const load = useCallback(() => getDeck(id), [id]);
  const { state, reload, update } = useLoad(load);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);

  // 422 means the id in the URL is not a valid id: same answer as an unknown deck
  const notFound =
    state.status === "error" && (state.error.status === 404 || state.error.status === 422);
  const deck = state.status === "success" ? state.data : null;

  let title = "Chargement du deck…";
  if (deck) title = deck.name;
  else if (notFound) title = "Deck introuvable";
  else if (state.status === "error") title = "Erreur de chargement";

  function handleCardSaved(card: Card) {
    update((data) => ({ ...data, cards: data.cards.map((c) => (c.id === card.id ? card : c)) }));
    setEditingId(null);
    setMessage({ text: "Carte enregistrée.", isError: false });
  }

  function handleCardDeleted(cardId: number) {
    const remaining = (deck?.cards.length ?? 1) - 1;
    update((data) => ({ ...data, cards: data.cards.filter((c) => c.id !== cardId) }));
    setMessage({ text: `Carte supprimée. Il reste ${cardCountLabel(remaining)}.`, isError: false });
    // The deleted card's buttons disappear: put the focus back on the page title
    document.querySelector<HTMLElement>("main h1")?.focus();
  }

  async function handleDeleteDeck(target: DeckWithCards) {
    const question = `Supprimer le deck « ${target.name} » ? ${cardsLostSentence(target.cards.length)} Cette action est définitive.`;
    if (!window.confirm(question)) return;
    setIsDeletingDeck(true);
    setMessage(null);
    try {
      await deleteDeck(target.id);
      navigate("/", { state: { notice: `Le deck « ${target.name} » a été supprimé.` } });
    } catch (err) {
      setMessage({ text: `La suppression du deck a échoué. ${errorText(asApiError(err))}`, isError: true });
      setIsDeletingDeck(false);
    }
  }

  return (
    <>
      <PageTitle title={title} />

      {notFound && (
        <div className="mt-4">
          <p className="text-slate-600">Ce deck n'existe pas ou a été supprimé.</p>
          <Link to="/" className={`${secondaryButton} mt-4`}>
            Retour à mes decks
          </Link>
        </div>
      )}
      {!notFound && <LoadStatus state={state} onRetry={reload} />}

      {deck && (
        <>
          <p className="mt-1 text-slate-600">
            {cardCountLabel(deck.cards.length)} · créé le {formatDate(deck.createdAt)}
          </p>

          <div className="mt-4 flex flex-wrap items-start gap-2">
            {deck.cards.length > 0 ? (
              <a href={exportUrl(deck.id)} download className={primaryButton}>
                Exporter pour Anki
              </a>
            ) : (
              // A link without href cannot be clicked nor reached with Tab
              <a
                aria-disabled="true"
                aria-describedby="export-hint"
                className={`${primaryButton} cursor-not-allowed opacity-50`}
              >
                Exporter pour Anki
              </a>
            )}
            <button
              type="button"
              onClick={() => void handleDeleteDeck(deck)}
              disabled={isDeletingDeck}
              className={dangerButton}
            >
              {isDeletingDeck ? "Suppression…" : "Supprimer le deck"}
            </button>
          </div>
          {deck.cards.length === 0 && (
            <p id="export-hint" className="mt-2 text-sm text-slate-600">
              Ce deck ne contient aucune carte : il n'y a rien à exporter.
            </p>
          )}
        </>
      )}

      {/* Always rendered, so screen readers announce each action result */}
      <div aria-live="polite">
        {message && (
          <p
            className={`mt-4 rounded-lg border p-3 ${
              message.isError
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {deck && (
        <CardList
          cards={deck.cards}
          editingId={editingId}
          onEditingChange={setEditingId}
          onCardSaved={handleCardSaved}
          onCardDeleted={handleCardDeleted}
        />
      )}
    </>
  );
}
