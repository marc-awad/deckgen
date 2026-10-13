import { Link } from "react-router";
import { listDecks } from "../api/client";
import { LoadStatus } from "../components/LoadStatus";
import { PageTitle } from "../components/PageTitle";
import { cardCountLabel, formatDate } from "../format";
import { useLoad } from "../hooks/useLoad";
import { primaryButton } from "../styles";

export function DeckListPage() {
  const { state, reload } = useLoad(listDecks);

  return (
    <>
      <PageTitle title="Mes decks" />
      <LoadStatus state={state} onRetry={reload} />

      {state.status === "success" && state.data.length === 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="font-medium">Bienvenue sur deckgen !</p>
          <p className="mt-1 text-slate-600">
            Collez un cours et obtenez des flashcards de révision en quelques secondes.
          </p>
          <Link to="/new" className={`${primaryButton} mt-4`}>
            Créer mon premier deck
          </Link>
        </div>
      )}

      {state.status === "success" && state.data.length > 0 && (
        <ul className="mt-6 space-y-3">
          {state.data.map((deck) => (
            <li key={deck.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <Link
                to={`/decks/${deck.id}`}
                className="text-lg font-semibold break-words text-blue-700 hover:underline"
              >
                {deck.name}
              </Link>
              <p className="mt-1 text-sm text-slate-600">
                {cardCountLabel(deck.cardCount)} · créé le {formatDate(deck.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
